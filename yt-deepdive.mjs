// Quarry Long-form v2 — premium daily episode builder (1920x1080).
// Dedicated long-form script (NOT reel points): cold open + 8 documentary
// chapters + outro. Premium visuals: branded title card, chapter transitions,
// slow cinematic drift on 4K b-roll, lower-thirds, end card, music bed.
// Usage: node yt-deepdive.mjs <slug> [--force]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { loadAllStates, saveChannelState } from './lib/state.mjs';
import { isDocDay, docDaysOf } from './lib/doc-days.mjs';
import { cuesFromWords, toSrt } from './lib/srt.mjs';
import { nextCounter } from './lib/quota-ledger.mjs';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';
import { getTopicClip } from './youtube-clips.mjs';
import { pickApprovedTrack } from './music-engine.mjs';
const APPROVED_MUSIC = JSON.parse(fs.readFileSync(new URL('./yt-brands/approved-music.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'utf8'));
import { renderYouTubeThumbnail, callScriptBrain } from './youtube-engine.mjs';
import { bySlug } from './yt-brands/brands.mjs';
const { recentUploadTitles, findDup } = await import('./lib/dup-gate.mjs');
const { resolveBrand } = await import('./lib/brand-resolve.mjs');

import { resolveBinary } from './lib/ffmpeg.mjs';
import { applyChannelKeys } from './lib/channel-keys.mjs';
import { loadEnv } from './lib/env.mjs';
loadEnv();
const FF = resolveBinary('ffmpeg');
const FP = resolveBinary('ffprobe');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));



const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const b = (await resolveBrand(slug)) || bySlug[slug];
if (!b) { console.error('unknown slug (no legacy kit and no registry entry):', slug); process.exit(1); }
// #102 BYOK: this channel's own provider keys (encrypted yt-mcp/channel-keys.json)
// replace the shared keys so the doc chain burns per-channel quota, not one shared pool.
applyChannelKeys(slug);

// 09-20: per-channel state files are the source of truth (lib/state.mjs)
const loadState = () => loadAllStates();

// ---------- script brain: the capability registry (lib/ai-adapter.mjs) ----------
// #104 Task 6 (AC-P2-10): the hand-coded Gemini -> Groq -> Cloudflare chain is
// GONE — provider order/fallback belongs to routeAndCall('script-gen') now
// (channel routes -> workspace default -> catalog baseline; per-channel vault
// keys and usage_events are the adapter's job). Caller-owned and untouched:
// the LONG_PROMPT contract, validEpisode shape validation, and the 3-walk
// escalation (walk 2+ appends groq's old raw-JSON-only suffix chain-wide).
// Throws on total failure exactly as before — the run exits nonzero and the
// episode is picked up on the next doc day.
function validEpisode(p) {
  return p?.title && Array.isArray(p.chapters) && p.chapters.length >= 5 &&
    p.chapters.every(c => (c.text || '').split(/\s+/).length >= 70) && p.intro && p.outro;
}
async function llmScript(prompt) {
  const res = await callScriptBrain({
    slug,
    jobId: `deepdive:${slug}:${today()}`,
    prompt,
    isValidJson: validEpisode,
    maxAttempts: 3,
    suffix: '\nReply with the raw JSON object ONLY.',
  });
  if (res.ok) {
    console.log(`[long] ${res.provider} script OK (${res.parsed.chapters.length} chapters${res.walk > 1 ? `, attempt ${res.walk}` : ''})`);
    return { ...res.parsed, provider: res.provider };
  }
  console.log(`[long] script brain exhausted (${res.error})`);
  throw new Error('all script providers failed');
}

const LONG_PROMPT = (b, theme) => `You write premium long-form YouTube documentary episodes for "${b.label}" (Niche: ${b.niche}), in the style of top ${b.authority} channels for a US audience.
Episode theme: ${theme}.
STRICT RULES: every chapter delivers concrete, specific ${b.niches[0]} insight — stories, mechanisms, numbers, mistakes, consequences. NO generic motivation, NO repetition between chapters. Documentary storytelling: each chapter opens a tension and closes a payoff.
Return ONLY valid JSON:
{"title":"episode title <=60 chars, curiosity gap","intro":"2 sentence cold-open that sets stakes","chapters":[{"title":"<=40 chars","text":"120-150 words of spoken-style narration"}],"outro":"2 sentences with a natural subscribe push"}
Exactly 8 chapters. Every chapter text MUST be 120-150 words.`;

function sh(args, timeout = 900000) {
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'], timeout });
  } catch (e) {
    console.error('[long] FFMPEG FAILED: ' + args.join(' ').slice(0, 400));
    console.error('[long] stderr: ' + String(e.stderr || e.message).slice(0, 300));
    throw e;
  }
}
function probeDur(f) { return parseFloat(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()); }
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function wrapCenter(text, size, maxChars, startY, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/);
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim(); else { if (cur) lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l, i) => `<text x="960" y="${startY + i * lineHeight}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${size}" fill="#FFFFFF">${esc(l)}</text>`).join('\n  ');
}

// ---------- premium frames ----------
function frameSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs><style>${EMBEDDED_FONTS_CSS}</style>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${b.bg}"/><stop offset="1" stop-color="#000000"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="${b.accent}" stop-opacity="0.20"/><stop offset="100%" stop-color="${b.bg}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
  ${inner}
</svg>`;
}
async function introCard(title) {
  const inner = `
  <text x="960" y="360" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="38" letter-spacing="14" fill="${b.accent}">${esc(b.eyebrow)}</text>
  <rect x="810" y="400" width="300" height="6" fill="${b.accent}"/>
  ${wrapCenter(title, 92, 24, 545, 106, 3)}
  <text x="960" y="930" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="32" letter-spacing="6" fill="#FFFFFF" fill-opacity="0.65">${esc(b.label.toUpperCase())} • DAILY EPISODE</text>`;
  const f = `demos/deepdive-${slug}/card-intro.png`;
  await sharp(Buffer.from(frameSvg(inner))).png().toFile(f);
  return f;
}
async function chapterLowerThird(num, title) {
  const inner = `
  <rect x="0" y="872" width="1920" height="208" fill="#000000" fill-opacity="0.58"/>
  <rect x="0" y="872" width="14" height="208" fill="${b.accent}"/>
  <text x="70" y="948" font-family="Oswald" font-weight="600" font-size="30" letter-spacing="8" fill="${b.accent}">CHAPTER ${String(num).padStart(2, '0')} / 08</text>
  <text x="70" y="1028" font-family="Oswald" font-weight="700" font-size="56" fill="#FFFFFF">${esc(String(title).slice(0, 46).toUpperCase())}</text>`;
  // 2026-11-10 FIX: the lower-third MUST render on a transparent canvas.
  // Routing it through frameSvg() painted an opaque full-frame gradient that
  // covered the chapter b-roll completely (the "no content in chapters" bug).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  ${inner}
</svg>`;
  const f = `demos/deepdive-${slug}/lt-${num}.png`;
  await sharp(Buffer.from(svg)).png().toFile(f);
  return f;
}
async function endCard() {
  const inner = `
  <text x="960" y="420" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="36" letter-spacing="12" fill="${b.accent}">DAILY EPISODES</text>
  ${wrapCenter('Subscribe — tomorrow, same time.', 72, 24, 540, 86, 2)}
  <text x="960" y="880" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="52" letter-spacing="6" fill="${b.accent}">${esc(b.label.toUpperCase())}</text>
  <text x="960" y="960" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="30" letter-spacing="4" fill="#FFFFFF" fill-opacity="0.6">${esc(b.handle)} • ${esc(b.kwShort.toUpperCase())}</text>`;
  const f = `demos/deepdive-${slug}/card-end.png`;
  await sharp(Buffer.from(frameSvg(inner))).png().toFile(f);
  return f;
}
async function renderCard(cardPng, audioFile, outFile, dur) {
  sh(['-y', '-loop', '1', '-i', cardPng, '-i', audioFile,
    '-filter_complex', `[0:v]scale=1920:1080,fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, dur - 0.6).toFixed(2)}:d=0.6[v]`,
    '-map', '[v]', '-map', '1:a', '-t', String(dur), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', outFile]);
}
function narrate(text, num) {
  const base = `demos/deepdive-${slug}/narr-${num}`;
  fs.writeFileSync(`${base}.txt`, text, 'utf8');
  execFileSync('python', ['youtube-flow/narrate.py', `${base}.txt`, `${base}.mp3`, `${base}.words.json`],
    { stdio: ['ignore', 'ignore', 'pipe'], timeout: 240000, env: { ...process.env, YT_KOKORO_VOICE: b.voice || 'am_michael', YT_TTS_EDGE_VOICE: b.voice || 'en-US-ChristopherNeural', YT_KOKORO_SPEED: '0.92' } });
  fs.rmSync(`${base}.txt`, { force: true });
  fs.rmSync(`${base}.words.json`, { force: true });
  const metaPath = `${base}.mp3.meta.json`;
  let audio = `${base}.mp3`;
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    audio = meta.audio || audio;
  }
  return audio;
}
function segment(cardPng, clipFile, audioFile, outFile, dur, drift = false) {
  const pan = drift ? `crop=1920:1080:x='(in_w-1920)*min(t/${(dur / 2).toFixed(1)},1)':y=0,` : '';
  const filters = clipFile
    ? `[0:v]scale=2304:-2,${pan}fps=30,format=yuv420p[bg]`
    : `[0:v]fps=30,format=yuv420p[bg]`;
  const inputs = clipFile
    ? ['-stream_loop', '-1', '-i', clipFile, '-i', audioFile, '-i', cardPng]
    : ['-f', 'lavfi', '-i', `color=c=0x0c0c0e:s=1920x1080:r=30`, '-i', audioFile, '-i', cardPng];
  sh([...inputs,
    '-filter_complex', `${filters};[bg][2:v]overlay=0:0[v]`,
    '-map', '[v]', '-map', '1:a', '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', outFile]);
}

// ---------- main ----------
const state = loadState();
// 10-05 PAUSE GUARD — feed-collapse cooldown (same field yt-daily/sweeper use)
if ((state[slug]?.pausedUntil || '') >= today()) {
  console.log(`[${slug}] paused until ${state[slug].pausedUntil} — episode skipped`);
  process.exit(0);
}
// 10-05 CADENCE — docs are WEEKLY: each channel has a fixed docDay (brands).
// Daily 10-min docs got 0-37 views and read as mass-production; one weekly
// episode at a fixed slot is appointment viewing. --force overrides.
// #96: docDays ['Tue','Fri'] lists raise the cadence for the clips-first lane;
// the legacy single docDay keeps working. --force overrides.
const DOC_DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getUTCDay()];
if (!isDocDay(b) && !FORCE) {
  const days = docDaysOf(b);
  console.log(`[${slug}] doc day${days.length === 1 ? '' : 's'} ${days.join('/') || '(none configured)'} (today is ${DOC_DAY_NAME}) — episode skipped`);
  process.exit(0);
}
if (state[slug]?.deepdiveDate === today() && !FORCE) {
  console.log(`[${slug}] deep-dive already produced today — skipping (--force to override)`);
  process.exit(0);
}
function today() { return new Date().toISOString().slice(0, 10); }

console.log(`[long] ${b.label} — premium daily episode`);
// 2026-11-10 FIX: page() was never defined in this file — the ReferenceError
// was swallowed by an empty catch and every chapter rendered with the black
// fallback background instead of b-roll. getTopicClip needs { id, ytBrand }.
const clipPage = { id: slug, ytBrand: b };
// 09-30: episode topics are RESEARCH-LED too (static banks removed). The
// topic comes from the strongest current story in the niche; seeds already
// used are skipped so episodes never circle the same subject.
let theme = null;
let longSeed = null;
try {
  const { researchTrend } = await import('./trend-research.mjs');
  const tokLong = JSON.parse(process.env[`YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`] || fs.readFileSync(path.resolve(HERE, `yt-mcp/channels/${slug}/token.json`), 'utf8'));
  const oauthLong = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauthLong.setCredentials({ refresh_token: tokLong.refresh_token });
  const trend = await researchTrend(slug, oauthLong, [...b.niches, ...b.tags.slice(0, 2)]);
  const usedLong = Array.isArray(state[slug]?.usedLongSeeds) ? state[slug].usedLongSeeds : [];
  longSeed = trend.videos.find((v) => !usedLong.includes(v.title)) || trend.videos[0] || null;
  if (longSeed) {
    theme = `Build today's documentary around the THEME of this proven viral video in the niche: "${longSeed.title}" (${longSeed.views.toLocaleString('en-US')} views in the last 14 days). Reimagine it as a deep, original ${b.label} episode — do NOT copy its title or content; go much deeper with a fresh angle. What is working right now: ${trend.hotKeywords.slice(0, 8).join(', ')}.`;
  }
} catch (e) { console.log(`[long] trend research failed: ${String(e.message).slice(0, 70)} — using evergreen niche angle`); }
if (!theme) {
  // Last-resort evergreen angle (not a static list — derived from the niche).
  theme = `The most searched, most argued-about question in ${b.niche} right now, told as a story-driven documentary for ${b.label}.`;
}
const script = await llmScript(LONG_PROMPT(b, theme));

fs.mkdirSync(`demos/deepdive-${slug}`, { recursive: true });
const work = `demos/deepdive-${slug}`;
const segs = [];
let total = 0;

// intro: title card with cold-open narration
const introNarr = narrate(script.intro, 'intro');
const introDur = Math.max(6, probeDur(introNarr) + 0.8);
await renderCard(await introCard(script.title), introNarr, `${work}/seg-00.mp4`, introDur);
segs.push({ file: `${work}/seg-00.mp4`, dur: introDur });
total += introDur;

// chapters: b-roll + lower-third + narration
for (let i = 0; i < script.chapters.length; i++) {
  const ch = script.chapters[i];
  console.log(`[long] chapter ${i + 1}/${script.chapters.length}: ${ch.title}`);
  const narr = narrate(ch.text, i + 1);
  const dur = Math.max(14, probeDur(narr) + 1.4);
  const seg = `${work}/seg-${String(i + 1).padStart(2, '0')}.mp4`;
  let clip = null;
  try { clip = await getTopicClip(clipPage, { headline: ch.title }); }
  catch (e) { console.log(`  [broll] clip fetch failed: ${String(e?.message || e).slice(0, 90)} — dark fallback`); }
  const lt = await chapterLowerThird(i + 1, ch.title);
  segment(lt, clip?.file || null, narr, seg, dur, true);
  segs.push({ file: seg, dur });
  total += dur;
  console.log(`  ✓ ${dur.toFixed(0)}s`);
}

// end card with outro narration
const endNarr = narrate(script.outro, 'end');
const endDur = Math.max(6, probeDur(endNarr) + 1.0);
const endSeg = `${work}/seg-end.mp4`;
await renderCard(await endCard(), endNarr, endSeg, endDur);
segs.push({ file: endSeg, dur: endDur });
total += endDur;

// #96 EPISODE SRT — per-chapter word timestamps (narr-*.mp3.meta.json words
// [{w,s,d}]) mapped onto the episode timeline, so the clips-first lane (#97)
// can cut sentence-aligned Shorts without re-transcribing. Narration order is
// intro, chapters 1..n, end — same order as segs.
const narrNames = ['intro', ...script.chapters.map((_, i) => String(i + 1)), 'end'];
let srtCursor = 0;
const srtCues = [];
for (let i = 0; i < segs.length; i++) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(work, `narr-${narrNames[i]}.mp3.meta.json`), 'utf8'));
    srtCues.push(...cuesFromWords(meta.words || [], srtCursor));
  } catch { }
  srtCursor += segs[i].dur;
}
fs.writeFileSync(path.join(work, 'episode.srt'), toSrt(srtCues));
console.log(`[long] SRT: ${srtCues.length} cues -> ${work}/episode.srt`);

// concat + music bed
const list = `${work}/concat.txt`;
fs.writeFileSync(list, segs.map(s => `file '${path.resolve(s.file).replace(/\\/g, '/')}'`).join('\n'));
const joined = `${work}/joined.mp4`;
sh(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
let music = null;
// 10-03: channel's own approved pool only. The -stream_loop -1 below already
// restarts THIS track when it ends — never a second track (user rule).
try { music = await pickApprovedTrack(APPROVED_MUSIC[slug] || []); } catch { }
const final = `${work}/episode.mp4`;
if (music) {
  sh(['-y', '-i', joined, '-stream_loop', '-1', '-i', music.file, '-filter_complex',
    `[1:a]volume=0.09[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', final]);
} else { fs.copyFileSync(joined, final); }

// premium thumbnail from a mid-episode frame
sh(['-y', '-v', 'error', '-ss', String(Math.round(total * 0.35)), '-i', final, '-frames:v', '1', `${work}/frame.jpg`]);
const thumb = await renderYouTubeThumbnail(script.title, `${work}/frame.jpg`, { accent: b.accent, eyebrow: b.eyebrow });

console.log(`[long] ✅ episode rendered: ${final} (${(total / 60).toFixed(1)} min)`);

// ---------- upload scheduled ----------

const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID || '', process.env.YOUTUBE_CLIENT_SECRET || '');
const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
const tokRaw = process.env[envName] || fs.readFileSync(path.resolve(HERE, `yt-mcp/channels/${slug}/token.json`), 'utf8');
const tok = JSON.parse(tokRaw);
auth.setCredentials({ refresh_token: tok.refresh_token });
const yt = google.youtube({ version: 'v3', auth });

const [hh, mm] = b.longSlot.split(':').map(Number);
const now = new Date();
const pub = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0));
if (pub <= new Date(now.getTime() + 35 * 60 * 1000)) pub.setUTCDate(pub.getUTCDate() + 1);
const publishAt = pub.toISOString().replace(/\.\d+Z$/, 'Z');

let cum = 0;
const chapters = script.chapters.map((c, i) => {
  const t = cum; cum += segs[i + 1]?.dur || 0;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')} ${c.title}`;
});
const description = [`"${script.title}" — a daily ${b.kwShort} episode from ${b.label}.`, '', script.intro, '', ...chapters, '', script.outro, `New episodes every day. ${b.hashtags || ''}`, ...(music ? [`🎵 ${music.credit}`] : [])].join('\n').slice(0, 4900);

// 10-05 DUPLICATE TITLE GATE — the "Musonius Rufus" doc went out twice in two
// days; a near-dup episode must never upload. Skip WITHOUT marking
// deepdiveDate so tomorrow's fresh topic can go out cleanly.
const docDup = findDup(script.title, await recentUploadTitles(yt));
if (docDup) {
  console.log(`GATE: duplicate episode title "${script.title}" ≈ "${docDup}" — upload skipped`);
  process.exit(0);
}

const res = await yt.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: { title: `${script.title} | ${b.authority}`.slice(0, 95), description, tags: b.tags.slice(0, 12), categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
    status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false }
  },
  media: { body: Readable.from(fs.readFileSync(final)) }
});
await yt.thumbnails.set({ videoId: res.data.id, media: { body: Readable.from(thumb) } }).catch(() => { });

const st = loadState();
st[slug] = st[slug] || {};
st[slug].deepdiveDate = today();
if (longSeed) {
  st[slug].usedLongSeeds = [...(st[slug].usedLongSeeds || []), longSeed.title].slice(-40);
  st[slug].todayTopic = { at: today(), topic: longSeed.title };
}
st[slug].deepdiveVideo = { videoId: res.data.id, publishAt, title: `${script.title} | ${b.authority}` };
// #99 shared-pool ledger: count this successful upload against the daily budget
st[slug].uploadsToday = nextCounter(st[slug].uploadsToday);
saveChannelState(slug, st[slug]);

// FB/IG outbox — episode cross-post (fb-crosspost posts it as scheduled video,
// ig-crosspost posts it as feed VIDEO; long content is not a Reel)
fs.mkdirSync(`fb-outbox/${slug}`, { recursive: true });
const stamp = `ep-${Date.now()}`;
fs.copyFileSync(final, `fb-outbox/${slug}/${stamp}.mp4`);
fs.writeFileSync(`fb-outbox/${slug}/${stamp}.json`, JSON.stringify({ videoFile: `fb-outbox/${slug}/${stamp}.mp4`, publishAt, title: `${script.title} | ${b.authority}`, description, slug, kind: 'episode' }, null, 2));

fs.rmSync(`${work}/joined.mp4`, { force: true });
for (const s of segs) fs.rmSync(s.file, { force: true });
console.log(`\n✅ ${b.label} EPISODE scheduled: https://youtube.com/watch?v=${res.data.id} → public ${publishAt} (${(total / 60).toFixed(1)} min) + FB/IG outbox`);
