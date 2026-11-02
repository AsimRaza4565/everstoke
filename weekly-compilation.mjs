// Weekly long-form compilation — the 4,000-watch-hours monetization path.
// Pulls the week's top-viewed Shorts from the channel, renders a horizontal
// 1080p video: intro card → one narrated chapter per quote (4K background,
// big typography, Hormozi captions) → outro → uploads PUBLIC with chapters.
//
// Usage:
//   node weekly-compilation.mjs           # full run: render + upload
//   node weekly-compilation.mjs --test    # render top 3 only, save locally, NO upload
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { ensurePoolClip } from './cinematic-engine.mjs';
import { spokenScript, buildAssCaptions, renderYouTubeThumbnail } from './youtube-engine.mjs';
import { pickMusicTrack } from './music-engine.mjs';
import { logPost, pktDate } from './reporting/collect.mjs';

import { resolveBinary } from './lib/ffmpeg.mjs';
const FF = resolveBinary('ffmpeg');
const POOL_DIR = 'pixabay-pool';
const ACCENT = '#F5E31C';
const TEST = process.argv.includes('--test');
const DAILY = process.argv.includes('daily') || process.env.LONGFORM_MODE === 'daily';
const FB_ONLY = process.argv.includes('fb-only');
const MAX_QUOTES = TEST ? 3 : 10;

import { loadEnv, envOf } from './lib/env.mjs';
loadEnv();

function ytClient() {
  const oauth2Client = new google.auth.OAuth2(
    envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
  oauth2Client.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// 1. Top-viewed Shorts of the last 7 days
// ---------------------------------------------------------------------------
async function fetchTopShorts(youtube) {
  const windowH = DAILY ? 48 : 168;
  const weekAgo = new Date(Date.now() - windowH * 3600000).toISOString();
  // Walk the channel's uploads playlist (search.list has parameter
  // combinations that 400 with forMine; playlistItems is reliable).
  const ch = await youtube.channels.list({ part: 'contentDetails', mine: true });
  const uploadsPlaylist = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) throw new Error('no uploads playlist');
  const pl = await youtube.playlistItems.list({ part: 'contentDetails', playlistId: uploadsPlaylist, maxResults: 50 });
  const ids = (pl.data.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) throw new Error('no uploads found');
  const v = await youtube.videos.list({ part: 'snippet,statistics,contentDetails', id: ids.join(',') });
  const durSec = (iso) => {
    const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
    return m ? (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0) : 999;
  };
  return (v.data.items || [])
    .filter((x) => x.snippet?.publishedAt > weekAgo)
    .filter((x) => durSec(x.contentDetails?.duration) <= 180) // Shorts-length only
    .sort((a, b) => (Number(b.statistics?.viewCount) || 0) - (Number(a.statistics?.viewCount) || 0))
    .slice(0, MAX_QUOTES)
    .map((x) => ({
      videoId: x.id,
      views: Number(x.statistics?.viewCount) || 0,
      headline: (x.snippet.title || '').replace(/#shorts/gi, '').split(/[—|:]/)[0].trim(),
      description: x.snippet.description || ''
    }));
}

// Parse the insight + takeaway back out of a Short's description
function parseQuote(desc) {
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);
  const insight = (lines.find((l) => l.startsWith('"')) || '').replace(/^"|"$/g, '')
    || lines.find((l) => l.length > 60 && !l.startsWith('#') && !l.startsWith('🎵')) || '';
  const takeaway = (lines.find((l) => /^rule|^the rule/i.test(l)) || '');
  return { insight, takeaway };
}

// ---------------------------------------------------------------------------
// 2. Rendering helpers (horizontal 1920x1080)
// ---------------------------------------------------------------------------
function wrapTextToLines(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur ? cur + ' ' + w : w).length <= maxChars) cur = cur ? cur + ' ' + w : w;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const titleCase = (s) => String(s || '').toLowerCase().replace(/(?<!['’])\b([a-z])/g, (m, p) => p.toUpperCase());

async function textCard(lines) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  ${lines.join('\n  ')}
</svg>`;
  const file = `${POOL_DIR}/comp-card-${Math.random().toString(36).slice(2, 8)}.png`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function introCard(weekLabel) {
  return textCard([
    `<text text-anchor="middle" x="960" y="420" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="120" fill="#FFFFFF">${escapeXml(weekLabel)}</text>`,
    `<text text-anchor="middle" x="960" y="520" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="44" letter-spacing="6" fill="${ACCENT}">THE WEEK'S BEST QUOTES • QUOTE QUARRY</text>`
  ]);
}

async function quoteCard(postData) {
  const headline = (postData.headline || '').toUpperCase();
  const hl = wrapTextToLines(headline, 20).slice(0, 2);
  const body = wrapTextToLines(postData.insight || '', 52).slice(0, 3);
  const y0 = 360;
  const els = hl.map((l, i) =>
    `<text text-anchor="middle" x="960" y="${y0 + i * 118}" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="96" fill="#FFFFFF">${escapeXml(l)}</text>`);
  els.push(`<line x1="860" y1="${y0 + hl.length * 118 - 60}" x2="1060" y2="${y0 + hl.length * 118 - 60}" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round"/>`);
  const bTop = y0 + hl.length * 118 + 70;
  body.forEach((l, i) => els.push(
    `<text text-anchor="middle" x="960" y="${bTop + i * 70}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-size="48" fill="#E8E8E8">${escapeXml(l)}</text>`));
  if (postData.takeaway) {
    els.push(`<text text-anchor="middle" x="960" y="${bTop + body.length * 70 + 110}" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="600" font-size="44" fill="${ACCENT}">${escapeXml(postData.takeaway.slice(0, 70))}</text>`);
  }
  return textCard(els);
}

async function outroCard() {
  return textCard([
    `<text text-anchor="middle" x="960" y="450" font-family="'Anton', 'Impact', 'Arial Black', sans-serif" font-size="110" fill="#FFFFFF">SUBSCRIBE FOR DAILY QUOTES</text>`,
    `<text text-anchor="middle" x="960" y="560" font-family="'Oswald', 'Arial Narrow', sans-serif" font-weight="500" font-size="46" letter-spacing="5" fill="${ACCENT}">@quotequarry302 • NEW SHORTS EVERY DAY</text>`
  ]);
}

async function renderSegment(quote, index, outDir) {
  const out = `${outDir}/seg-${String(index).padStart(3, '0')}.mp4`;
  const clip = await ensurePoolClip(['116157974886564', '108044922375174', '1077306835630491', '114550268199751', '106473735839651'][index % 5]);
  const postData = { headline: quote.headline, insight_body: quote.insight, takeaway: quote.takeaway };

  // narration (Edge TTS via the shared narrate.py chain)
  const tag = `comp-${index}`;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(`${outDir}/${tag}.txt`, spokenScript(postData), 'utf8');
  execFileSync(resolvePython(), ['youtube-flow/narrate.py', `${outDir}/${tag}.txt`, `${outDir}/${tag}.mp3`, `${outDir}/${tag}.words.json`],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
  const meta = JSON.parse(fs.readFileSync(`${outDir}/${tag}.mp3.meta.json`, 'utf8'));
  const words = meta.words || [];
  const narrationFile = meta.audio;
  // #66: Edge can return zero WordBoundary events — fall back to probing the audio
  const last = words[words.length - 1];
  const audioSec = (() => { try {
    const r = execFileSync(resolveBinary('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', narrationFile], { encoding: 'utf8' });
    return parseFloat(String(r || '').trim()) || 0;
  } catch { return 0; } })();
  const endSec = last ? last.s + last.d : audioSec;
  // tight pacing: only ~1.5s after narration ends — dead air kills retention
  const dur = Math.max(15, Math.min(75, Math.round((endSec + 1.5) * 10) / 10));

  const overlay = await quoteCard(postData);
  const scrimSvg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgba(8,8,10,0.55)"/><stop offset="0.5" stop-color="rgba(8,8,10,0.68)"/><stop offset="1" stop-color="rgba(8,8,10,0.85)"/>
  </linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/></svg>`;
  const scrimFile = `${POOL_DIR}/comp-scrim.png`;
  await sharp(Buffer.from(scrimSvg)).png().toFile(scrimFile);
  const assFile = `${outDir}/${tag}.ass`;
  fs.writeFileSync(assFile, buildAssCaptions(words, { w: 1920, h: 1080, x: 960, y: 930, size: 58 }), 'utf8');

  const chain = `[0:v]crop=ih*16/9:ih,scale=1920:1080,eq=saturation=1.04:contrast=1.05,fade=t=in:st=0:d=0.6,fade=t=out:st=${(dur - 0.8).toFixed(1)}:d=0.8[bv];` +
    `[1:v]scale=1920:1080[sc];[bv][sc]overlay=0:0[base];[base][3:v]overlay=0:0[ov];` +
    `[ov]ass=${assFile}:fontsdir=image-tools/fonts,fade=t=in:st=0:d=0.6:alpha=1,fade=t=out:st=${(dur - 0.8).toFixed(1)}:d=0.8:alpha=1[v]`;
  const audio = `[2:a]apad=pad_dur=3,atrim=0:${dur}[a]`;

  execFileSync(FF, ['-y', '-stream_loop', '-1', '-ss', String(clip.start), '-i', clip.file, '-i', scrimFile, '-i', narrationFile, '-i', overlay,
    '-filter_complex', chain + ';' + audio, '-map', '[v]', '-map', '[a]',
    '-t', String(dur), '-r', '30', '-pix_fmt', 'yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-video_track_timescale', '15360', out]);
  for (const f of [overlay, `${outDir}/${tag}.txt`, narrationFile, `${outDir}/${tag}.mp3.meta.json`, assFile]) fs.rmSync(f, { force: true });
  return dur;
}

let cachedPython = null;
function resolvePython() {
  if (cachedPython !== null) return cachedPython;
  for (const cmd of ['python', 'python3']) {
    try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); cachedPython = cmd; return cmd; } catch (e) { }
  }
  throw new Error('python not found');
}

// #43: DAILY double-post guard — the old check scanned fetchTopShorts output,
// which (a) maps away `snippet` entirely and (b) filters to Shorts-length
// (<= 180s) videos, so a published compilation could never be seen. Walk the
// uploads playlist directly instead.
async function compilationAlreadyLive(youtube, today) {
  const ch = await youtube.channels.list({ part: 'contentDetails', mine: true });
  const up = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!up) return null;
  const pl = await youtube.playlistItems.list({ part: 'snippet', playlistId: up, maxResults: 10 });
  return (pl.data.items || [])
    .map((i) => i.snippet)
    .find((s) => s?.title?.includes('Daily Compilation') && String(s.publishedAt || '').startsWith(today)) || null;
}

// ---------------------------------------------------------------------------
// 3. Main
// ---------------------------------------------------------------------------
console.log(`[Weekly Compilation] ${TEST ? '(TEST MODE — no upload)' : ''}`);
const youtube = ytClient();
const shorts = await fetchTopShorts(youtube);
// dedupe: if today's daily compilation is already on the channel, stop
if (DAILY && !TEST) {
  const today = pktDate();
  const dup = await compilationAlreadyLive(youtube, today);
  if (dup && !FB_ONLY) { console.log(`Daily compilation for ${today} already live ("${dup.title}") — skipping YouTube upload.`); process.exit(0); }
  if (dup && FB_ONLY) console.log('YT already live — fb-only: distributing to Facebook pages.');
}

console.log(`Found ${shorts.length} top Shorts this week: ${shorts.map((s) => s.views).join(', ')} views`);

// prefer Shorts that carry a real quote (v2 descriptions) over thin ones,
// most-viewed first within each group
const parsed = shorts.map((s) => ({ ...parseQuote(s.description), headline: s.headline, views: s.views }))
  .filter((q) => q.headline);
const rich = parsed.filter((q) => q.insight || q.takeaway);
const thin = parsed.filter((q) => !q.insight && !q.takeaway);
const quotes = [...rich, ...thin].slice(0, MAX_QUOTES);

const outDir = 'compilation-build';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// intro + chapters + outro
const weekNo = isoWeek();
const weekLabel = `${quotes.length} QUOTES THAT WILL CHANGE YOUR WEEK`;
const introPng = await introCard(weekLabel);
execFileSync(FF, ['-y', '-loop', '1', '-i', introPng, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-map', '0:v', '-map', '1:a', '-shortest', '-t', '5', '-r', '30', '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-video_track_timescale', '15360', `${outDir}/seg-intro.mp4`]);
fs.rmSync(introPng, { force: true });

const chapters = [{ t: '0:00', title: 'Start Here' }];
let cum = 5;
for (let i = 0; i < quotes.length; i++) {
  process.stdout.write(`Rendering chapter ${i + 1}/${quotes.length}: "${quotes[i].headline}" ... `);
  const dur = await renderSegment(quotes[i], i, outDir);
  cum += dur;
  chapters.push({ t: fmtTime(cum), title: titleCase(quotes[i].headline) });
  console.log(`${dur}s`);
}
const outroPng = await outroCard();
execFileSync(FF, ['-y', '-loop', '1', '-i', outroPng, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-map', '0:v', '-map', '1:a', '-shortest', '-t', '6', '-r', '30', '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-video_track_timescale', '15360', `${outDir}/seg-outro.mp4`]);
fs.rmSync(outroPng, { force: true });

// concat list + final render with music bed
const listFile = `${outDir}/list.txt`;
const segFiles = [`${outDir}/seg-intro.mp4`, ...quotes.map((_, i) => `${outDir}/seg-${String(i).padStart(3, '0')}.mp4`), `${outDir}/seg-outro.mp4`];
// concat demuxer resolves relative paths against the list file's dir — use absolute
fs.writeFileSync(listFile, segFiles.map((f) => `file '${path.resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n') + '\n');
const music = await pickMusicTrack(3);
const total = cum + 6;
const outFile = TEST ? 'yt-compilation-test.mp4' : `${POOL_DIR}/compilation-week.mp4`;

const musicArgs = music?.file ? ['-stream_loop', '-1', '-i', music.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
const musicChain = music?.file
  ? `[${segFiles.length}:a]volume=0.10,atrim=0:${total},afade=t=out:st=${(total - 2).toFixed(1)}:d=2[am];[ac][am]amix=inputs=2:duration=first:normalize=0[aout]`
  : `[${segFiles.length}:a]atrim=0:${total}[aout]`;

// concat FILTER (demuxer chokes on the mixed segment audio)
const ffArgs = ['-y', ...segFiles.flatMap((f) => ['-i', path.resolve(f)]), ...musicArgs,
  '-filter_complex', `${segFiles.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${segFiles.length}:v=1:a=1[vc][ac];[vc]format=yuv420p[v];${musicChain}`,
  '-map', '[v]', '-map', '[aout]', '-t', String(total), '-r', '30',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile];
execFileSync(FF, ffArgs, { timeout: 45 * 60 * 1000 });
console.log(`✓ Compilation rendered: ${outFile} (${Math.round(fs.statSync(outFile).size / 1048576)} MB, ${Math.round(total / 60)} min, ${quotes.length} chapters)`);

if (TEST) {
  console.log('TEST MODE — skipping upload. Chapters:\n' + chapters.map((c) => `${c.t} ${c.title}`).join('\n'));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 4. Upload PUBLIC with chaptered description
// ---------------------------------------------------------------------------
const title = DAILY ? `Today's Best Motivational Quotes — Daily Compilation (${pktDate()})`.replace('( Daily)', '') : `${quotes.length} Quotes That Will Change Your Week — Motivational Quotes Compilation`;
const description = [
  `The ${quotes.length} most powerful motivational quotes of the week — the Short versions you loved, expanded with narration and cinematic visuals.`,
  '',
  '⏱ CHAPTERS:',
  ...chapters.map((c) => `${c.t} ${c.title}`),
  '',
  'Subscribe to Quote Quarry for daily motivational Shorts.',
  `#${'motivation'} #mindset #quotes`,
  music ? `🎵 ${music.title} — ${music.credit}` : ''
].filter(Boolean).join('\n').slice(0, 4900);

// premium thumbnail from a CLEAN pool-clip frame (no on-screen text)
let thumbBuffer = null;
try {
  const thumbClip = await ensurePoolClip('114550268199751');
  const tFrame = `${POOL_DIR}/comp-thumb-frame.jpg`;
  execFileSync(FF, ['-y', '-v', 'error', '-ss', String(thumbClip.start + 3), '-i', thumbClip.file, '-frames:v', '1', tFrame]);
  thumbBuffer = await renderYouTubeThumbnail(`${quotes.length} QUOTES TO CHANGE YOUR WEEK`, tFrame, {});
  fs.writeFileSync('qa-comp-thumb.jpg', thumbBuffer);
  fs.rmSync(tFrame, { force: true });
  console.log('✓ Thumbnail rendered');
} catch (e) { console.log(`Thumbnail skipped (${String(e.message).slice(0, 100)})`); }

let res = null;
if (!FB_ONLY) {
const readable = new Readable();
readable._read = () => { };
readable.push(fs.readFileSync(outFile));
readable.push(null);
res = await youtube.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: {
      title: title.slice(0, 95),
      description,
      tags: ['motivational quotes', 'quotes compilation', 'stoic quotes', 'discipline', 'mindset', 'motivation'],
      categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en'
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
  },
  media: { body: readable }
});
console.log(`✓ Compilation LIVE 👉 https://youtube.com/watch?v=${res.data.id}`);

} else {
  console.log('fb-only: skipping YouTube upload, going straight to FB distribution.');
}

// ---------------------------------------------------------------------------
// DAILY MODE: distribute the same long video to all 5 Facebook pages as a
// native page video (IG can't take >3min content — IG gets its 3 Shorts/day).
// ---------------------------------------------------------------------------
if (DAILY) {
  const PAGES = ['116157974886564', '108044922375174', '1077306835630491', '114550268199751', '106473735839651'];
  const PAGE_NAMES = { '116157974886564': 'Silent Wealth', '108044922375174': 'Strategic Silence', '1077306835630491': 'Eon Ventures', '114550268199751': 'Reliq North', '106473735839651': 'The Boundaries Club' };
  const envOf2 = (k) => process.env[k] || '';
  const FB_TOKEN = envOf2('FB_PAGE_TOKEN');
  for (const pageId of PAGES) {
    try {
      const tr = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&access_token=${FB_TOKEN}`);
      const page = ((await tr.json()).data || []).find((x) => x.id === pageId);
      if (!page) throw new Error('no page token');
      const chunk = 4 * 1024 * 1024;
      const buf = fs.readFileSync(outFile);
      const start = await (await fetch(`https://graph.facebook.com/v21.0/${pageId}/videos?upload_phase=start&file_size=${buf.length}&access_token=${page.access_token}`, { method: 'POST' })).json();
      if (!start.upload_session_id) throw new Error('start phase failed');
      for (let o = 0; o < buf.length; o += chunk) {
        const fd = new FormData();
        fd.append('upload_phase', 'transfer');
        fd.append('upload_session_id', start.upload_session_id);
        fd.append('start_offset', String(o));
        fd.append('end_offset', String(Math.min(o + chunk, buf.length)));
        fd.append('video_file_chunk', new Blob([buf.subarray(o, Math.min(o + chunk, buf.length))]));
        const tr2 = await fetch(`https://graph.facebook.com/v21.0/${pageId}/videos?access_token=${page.access_token}`, { method: 'POST', body: fd });
        const j2 = await tr2.json();
        if (j2.error) throw new Error('transfer: ' + String(j2.error.message).slice(0, 60));
      }
      const fin = await (await fetch(`https://graph.facebook.com/v21.0/${pageId}/videos?access_token=${page.access_token}`, {
        method: 'POST',
        body: (() => { const fd = new FormData(); fd.append('upload_phase', 'finish'); fd.append('upload_session_id', start.upload_session_id); fd.append('description', description.slice(0, 4000)); return fd; })()
      })).json();
      if (fin.error) throw new Error('finish: ' + String(fin.error.message).slice(0, 60));
      logPost({ platform: 'Facebook', brand: PAGE_NAMES[pageId], kind: 'long video', id: fin.id || fin.video_id, title, status: 'published' });
      console.log(`✓ FB long video posted: ${PAGE_NAMES[pageId]}`);
    } catch (e) {
      console.log(`✗ FB long video failed for ${PAGE_NAMES[pageId]}: ${String(e.message).slice(0, 100)}`);
      logPost({ platform: 'Facebook', brand: PAGE_NAMES[pageId], kind: 'long video', id: null, title, status: 'failed' });
    }
  }
}
logPost({ platform: 'YouTube', brand: 'Compilation', kind: 'long-form', id: res?.data?.id || null, title, status: 'published' });
if (thumbBuffer) {
  try {
    const tStream = new Readable();
    tStream._read = () => { };
    tStream.push(thumbBuffer);
    tStream.push(null);
    if (res) await youtube.thumbnails.set({ videoId: res.data.id, media: { body: tStream } });
    console.log('✓ Custom premium thumbnail set');
  } catch (e) { console.log(`Thumbnail upload skipped (${String(e.message).slice(0, 80)})`); }
}
fs.rmSync(outDir, { recursive: true, force: true });

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function isoWeek() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
}
