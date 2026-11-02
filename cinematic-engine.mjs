// Cinematic Engine — Pixabay 4K backgrounds + brand typography (posters + reels).
// Mirrors the approved brand designs: same fonts/weights/sizes/colors as
// BRAND_POSTER_CONFIGS, with a brand-colored gradient scrim over a photo frame
// (posters) or a moving 4K clip (reels). Falls back gracefully — callers keep
// the legacy flat-design renderers as backup.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { EMBEDDED_FONTS_CSS } from './typography-poster-engine.mjs';

import { loadEnv, envOf } from './lib/env.mjs';
loadEnv();

import { resolveBinary } from './lib/ffmpeg.mjs';
const FF = resolveBinary('ffmpeg');
const POOL_DIR = 'pixabay-pool';
const KEY = envOf('PIXABAY_API_KEY');

// ----------------------------------------------------------------------------
// Brand cinematic configs — keyed by FB page id (same keys as BRAND_POSTER_CONFIGS)
// fonts: poster = CSS family (SVG/librsvg), reel = TTF file (ffmpeg drawtext)
// ----------------------------------------------------------------------------
const BRANDS = {
  '116157974886564': { // Silent Wealth — black / yellow, Anton centred
    label: 'Silent Wealth', align: 'center', ink: '#FFFFFF',
    scrim: ['rgba(13,13,13,0.40)', 'rgba(13,13,13,0.60)', 'rgba(13,13,13,0.80)'],
    hlFont: { css: `'Anton', 'Impact', 'Arial Black', sans-serif`, ttf: 'Anton-Regular.ttf', size: 110, lineSp: 108 },
    bodyFont: { css: `'Oswald', 'Arial Narrow', 'Franklin Gothic Medium', sans-serif`, ttf: 'Oswald-500.ttf', size: 52, sp: 74 },
    eyeColor: '#C9C9BD', footColor: '#C9C9BD',
    hlWrap: 14, bodyWrap: 32, accentRule: { x: 460, w: 160, color: '0xF5E31C@0.9' }
  },
  '108044922375174': { // Strategic Silence — cream / blue, Anton left
    label: 'Strategic Silence', align: 'start', ink: '#111111',
    scrim: ['rgba(247,243,236,0.55)', 'rgba(247,243,236,0.88)', 'rgba(247,243,236,0.96)'],
    hlFont: { css: `'Anton', 'Impact', 'Arial Black', sans-serif`, ttf: 'Anton-Regular.ttf', size: 120, lineSp: 118 },
    bodyFont: { css: `'Oswald', 'Arial Narrow', 'Franklin Gothic Medium', sans-serif`, ttf: 'Oswald-500.ttf', size: 52, sp: 74 },
    eyeColor: '#6B6B6B', footColor: '#6B6B6B',
    hlWrap: 14, bodyWrap: 32, accentRule: { x: 760, y: 180, w: 5, h: 520, color: '0x1A56E8@0.85' }
  },
  '106473735839651': { // Boundaries Club — midnight / orange, Oswald 700 left
    label: 'Boundaries Club', align: 'start', ink: '#FFFFFF',
    scrim: ['rgba(10,10,10,0.35)', 'rgba(10,10,10,0.60)', 'rgba(10,10,10,0.78)'],
    hlFont: { css: `'Oswald', 'Arial Narrow', 'Impact', sans-serif`, ttf: 'Oswald-700.ttf', size: 104, lineSp: 102 },
    bodyFont: { css: `'Oswald', 'Arial Narrow', 'Segoe UI', sans-serif`, ttf: 'Oswald-400.ttf', size: 56, sp: 80 },
    eyeColor: '#B8B8B8', footColor: '#B8B8B8',
    hlWrap: 15, bodyWrap: 30, underline: { w: 430, color: '0xFF8A1E@0.95' }
  },
  '1077306835630491': { // Eon Ventures — signal orange, Archivo Black left
    label: 'Eon Ventures', align: 'start', ink: '#FFFFFF',
    scrim: ['rgba(232,84,31,0.55)', 'rgba(232,84,31,0.84)', 'rgba(232,84,31,0.95)'],
    hlFont: { css: `'Archivo Black', 'Arial Black', 'Impact', sans-serif`, ttf: 'ArchivoBlack-Regular.ttf', size: 110, lineSp: 108 },
    bodyFont: { css: `'Inter', 'Segoe UI', -apple-system, Arial, sans-serif`, ttf: 'Inter-Regular.ttf', size: 52, sp: 74 },
    eyeColor: '#141414', footColor: '#FFD9C7',
    hlWrap: 13, bodyWrap: 32, firstLineInk: '#141414', accentRule: { x: 100, w: 280, color: '0x141414@0.9' }
  },
  '114550268199751': { // Reliq North — cream / red, Playfair left + highlighter
    label: 'Reliq North', align: 'start', ink: '#141414',
    scrim: ['rgba(245,241,232,0.48)', 'rgba(245,241,232,0.86)', 'rgba(245,241,232,0.95)'],
    hlFont: { css: `'Playfair Display', 'Bodoni MT', 'Didot', 'Georgia', serif`, ttf: 'PlayfairDisplay-ExtraBold.ttf', size: 120, lineSp: 118 },
    bodyFont: { css: `'Playfair Display', 'Georgia', serif`, ttf: 'PlayfairDisplay-Variable.ttf', size: 56, sp: 80 },
    eyeColor: '#C8202D', footColor: '#7A7A7A',
    hlWrap: 14, bodyWrap: 30, highlighter: true
  }
};

// Curated 4K clip pool per page id: [pixabay video id, safe start seconds]
// (all visually vetted; start chosen so >=13s remain and the frame is clean)
const POOL = {
  '116157974886564': [[336755, 8.8], [20170, 3]],
  '108044922375174': [[164360, 16.4], [313145, 11]],
  '106473735839651': [[19368, 18.4], [201766, 5]],
  '1077306835630491': [[203681, 0], [214394, 0]],
  '114550268199751': [[260397, 16], [179804, 10], [367684, 0]]
};

function wrapTextToLines(text, maxChars) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current ? current + ' ' + w : w).length <= maxChars) {
      current = current ? current + ' ' + w : w;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const spaced = (s) => String(s || '').split('').join(' ');

// ---------------------------------------------------------------------------
// Clip pool management (downloads once, cached by CI actions/cache)
// ---------------------------------------------------------------------------
export async function ensurePoolClip(pageId) {
  const entries = POOL[pageId] || Object.values(POOL)[0];
  const [clipId, start] = entries[Math.floor(Math.random() * entries.length)];
  const file = `${POOL_DIR}/${clipId}.mp4`;
  fs.mkdirSync(POOL_DIR, { recursive: true });
  if (!fs.existsSync(file) || fs.statSync(file).size < 500000) {
    if (!KEY) throw new Error('PIXABAY_API_KEY missing');
    console.log(`[Cinematic] Downloading pool clip ${clipId} ...`);
    const res = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&id=${clipId}`);
    const h = (await res.json()).hits?.[0];
    if (!h) throw new Error(`clip ${clipId} not found`);
    const url = h.videos.large.url; // 4K
    execFileSync('curl', ['-s', '--retry', '3', '--retry-delay', '2', '-L', '-o', file, url]);
    if (fs.statSync(file).size < 500000) throw new Error(`clip ${clipId} download failed`);
  }
  const dur = Math.floor(await (async () => {
    try {
      const res = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&id=${clipId}`);
      const got = (await res.json()).hits?.[0]?.duration;
      return Number.isFinite(got) && got > 0 ? got : 20; // #66: rate-limit/failure must not yield a negative window
    } catch { return 20; }
  })());
  // #66: start can exceed a short clip's duration -> negative -t crashed ffmpeg
  const maxDur = Math.max(1, Math.min(13, dur - start));
  return { file, start, maxDur };
}

async function extractFrame(clipFile, start, out, vertical = '4:5') {
  const crop = vertical === '4:5' ? 'crop=ih*4/5:ih' : 'crop=ih*9/16:ih,scale=1080:1920';
  execFileSync(FF, ['-y', '-v', 'error', '-ss', String(start + 5), '-i', clipFile, '-frames:v', '1', '-vf', crop, out]);
  return out;
}

// ---------------------------------------------------------------------------
// Cinematic POSTER (1080x1350) — brand scrim over 4K frame + brand typography
// ---------------------------------------------------------------------------
export async function renderCinematicPoster(page, postData, outFilename) {
  const brand = BRANDS[page?.id];
  if (!brand) throw new Error('no cinematic config for page ' + page?.id);
  console.log(`[Cinematic Poster] ${brand.label} ...`);
  const clip = await ensurePoolClip(page.id);

  const frameFile = `${POOL_DIR}/frame-${page.id}.jpg`;
  execFileSync(FF, ['-y', '-v', 'error', '-ss', String(clip.start + 5), '-i', clip.file, '-frames:v', '1', '-vf', 'crop=ih*4/5:ih', frameFile]);
  const b64 = (await sharp(frameFile).jpeg({ quality: 85 }).toBuffer()).toString('base64');
  fs.unlinkSync(frameFile);

  const headline = (postData?.headline || 'STAY SILENT AND BUILD').toUpperCase();
  const hlLines = wrapTextToLines(headline, brand.hlWrap).slice(0, 4);
  const insight = postData?.insight_body || postData?.takeaway || '';
  const bodyLines = wrapTextToLines(insight, brand.bodyWrap).slice(0, 4);

  const hSize = hlLines.some(l => l.length > 13) ? Math.round(brand.hlFont.size * 0.87) : brand.hlFont.size;
  const hSp = Math.round(hSize * (brand.hlFont.lineSp / brand.hlFont.size));
  const bSize = bodyLines.some(l => l.length > 26) ? Math.round(brand.bodyFont.size * 0.9) : brand.bodyFont.size;
  const bSp = Math.round(bSize * 1.42);

  const startY = 440, hlStart = 380;
  const useStart = brand.align === 'center' ? 440 : 380;
  const [c0, c1, c2] = brand.scrim;
  const anchor = brand.align === 'center' ? 'text-anchor="middle" x="540"' : 'x="100"';

  let hlEls = hlLines.map((line, i) => {
    let fill = brand.ink;
    if (page.id === '1077306835630491') fill = i === 0 ? '#141414' : '#FFFFFF';
    else if (page.id === '116157974886564') fill = (i === 1 || hlLines.length === 1) ? brand.scrimAccent || '#F5E31C' : brand.ink;
    else if (page.id === '108044922375174') fill = (i === 2 || (hlLines.length === 1 && i === 0)) ? '#1A56E8' : brand.ink;
    return `<text ${anchor} y="${useStart + i * hSp}" font-family="${brand.hlFont.css}" font-size="${hSize}" font-weight="${page.id === '106473735839651' ? 700 : page.id === '114550268199751' ? 900 : 400}"${page.id === '106473735839651' ? ' letter-spacing="2"' : ''} fill="${fill}">${escapeXml(line)}</text>`;
  }).join('\n  ');

  // brand accents over photo
  let extrasUnder = '';   // renders beneath the headline text (highlighter)
  let extrasOver = '';    // renders above it (underlines, rules)
  if (brand.underline) {
    const lastY = useStart + (hlLines.length - 1) * hSp;
    extrasOver += `<line x1="100" y1="${lastY + 18}" x2="560" y2="${lastY + 18}" stroke="#FF8A1E" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (brand.highlighter) {
    const lastY = useStart + (hlLines.length - 1) * hSp;
    const w = Math.min(700, Math.max(300, (hlLines[hlLines.length - 1] || '').length * hSize * 0.58 + 40));
    extrasUnder += `<rect x="86" y="${lastY - hSize * 0.74}" width="${w}" height="${hSize * 1.12}" fill="#F2E24B" opacity="0.95"/>`;
  }

  const bodyTop = (brand.align === 'center')
    ? useStart + hlLines.length * hSp + 150
    : Math.min(1140, useStart + hlLines.length * hSp + 140);
  const bodyEls = bodyLines.map((line, i) =>
    `<text ${anchor} y="${bodyTop + i * bSp}" font-family="${brand.bodyFont.css}" font-size="${bSize}" font-weight="400" fill="${brand.ink}">${escapeXml(line)}</text>`).join('\n  ');

  const eyebrowY = brand.align === 'center' ? 280 : 220;
  const footY = 1260;
  const accentColor = page.id === '116157974886564' ? '#F5E31C' : page.id === '114550268199751' ? '#C8202D' : brand.eyeColor;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <style>${EMBEDDED_FONTS_CSS}</style>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c0}"/>
      <stop offset="0.45" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <image href="data:image/jpeg;base64,${b64}" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1080" height="1350" fill="url(#scrim)"/>
  <text ${brand.align === 'center' ? 'text-anchor="middle" x="540"' : 'x="100"'} y="${eyebrowY}" font-family="${brand.bodyFont.css}" font-weight="700" font-size="30" letter-spacing="6" fill="${accentColor}">${escapeXml(page.id === '116157974886564' ? 'SIMPLE TRUTH // SILENT WEALTH' : page.id === '108044922375174' ? 'CORE RULE // STRATEGIC SILENCE' : page.id === '106473735839651' ? 'MINDSET TIP // THE BOUNDARIES CLUB' : page.id === '1077306835630491' ? 'TAKE ACTION // EON VENTURES' : 'DAILY LESSON // RELIQ NORTH')}</text>
  ${extrasUnder}
  ${hlEls}
  ${extrasOver}
  ${bodyEls}
  <text ${brand.align === 'center' ? 'text-anchor="middle" x="540"' : 'x="100"'} y="${footY}" font-family="${brand.bodyFont.css}" font-size="26" letter-spacing="3" fill="${brand.footColor}">${escapeXml(page.id === '116157974886564' ? 'silentwealth.co' : page.id === '108044922375174' ? 'strategicsilence.com' : page.id === '106473735839651' ? 'boundariesclub.com' : page.id === '1077306835630491' ? 'eonventures.co' : 'reliqnorth.com')}</text>
</svg>`;

  const jpgBuffer = await sharp(Buffer.from(svg), { density: 150 })
    .resize(1080, 1350)
    .jpeg({ quality: 95 })
    .toBuffer();
  if (outFilename) fs.writeFileSync(outFilename, jpgBuffer);
  console.log(`      ✓ Cinematic poster rendered (${Math.round(jpgBuffer.length / 1024)} KB)`);
  return jpgBuffer;
}

// ---------------------------------------------------------------------------
// Cinematic REEL (1080x1920, ~13s) — moving 4K clip + brand drawtext + music
// ---------------------------------------------------------------------------
export async function renderCinematicReel(page, postData, mood = 'awakening-dew', musicOverride = null) {
  const brand = BRANDS[page?.id];
  if (!brand) throw new Error('no cinematic config for page ' + page?.id);
  console.log(`[Cinematic Reel] ${brand.label} ...`);
  const clip = await ensurePoolClip(page.id);

  // ---- IDENTICAL typography to renderCinematicPoster (same engine, same
  // shrink rule, same 4 body lines, letter-spacing) laid out for 1080x1920,
  // rendered once as a transparent PNG and overlaid on the moving clip. ----
  const headline = (postData?.headline || 'STAY SILENT AND BUILD').toUpperCase();
  const hlLines = wrapTextToLines(headline, brand.hlWrap).slice(0, 4);
  const insight = postData?.insight_body || postData?.takeaway || '';
  const bodyLines = wrapTextToLines(insight, brand.bodyWrap).slice(0, 4);

  const hSize = hlLines.some(l => l.length > 13) ? Math.round(brand.hlFont.size * 0.87) : brand.hlFont.size;
  const hSp = Math.round(hSize * (brand.hlFont.lineSp / brand.hlFont.size));
  const bSize = bodyLines.some(l => l.length > 26) ? Math.round(brand.bodyFont.size * 0.9) : brand.bodyFont.size;
  const bSp = Math.round(bSize * 1.42);

  const useStart = brand.align === 'center' ? 440 : 380;
  const anchor = brand.align === 'center' ? 'text-anchor="middle" x="540"' : 'x="100"';
  const hlTop = 530;
  const bodyTop = Math.min(1290, hlTop + hlLines.length * hSp + 190);
  const eyebrowY = 330;
  const footTop = 1700;

  // scrim gradient png
  const [c0, c1, c2] = brand.scrim;
  const scrimSvg = `<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c0}"/><stop offset="0.4" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/></svg>`;
  const scrimFile = `${POOL_DIR}/scrim-${page.id}.png`;
  await sharp(Buffer.from(scrimSvg)).png().toFile(scrimFile);

  // ---- text overlay (SVG, same markup as the poster) ----
  let hlEls = hlLines.map((line, i) => {
    let fill = brand.ink;
    if (page.id === '1077306835630491') fill = i === 0 ? '#141414' : '#FFFFFF';
    else if (page.id === '116157974886564') fill = (i === 1 || hlLines.length === 1) ? brand.scrimAccent || '#F5E31C' : brand.ink;
    else if (page.id === '108044922375174') fill = (i === 2 || (hlLines.length === 1 && i === 0)) ? '#1A56E8' : brand.ink;
    return `<text ${anchor} y="${hlTop + i * hSp}" font-family="${brand.hlFont.css}" font-size="${hSize}" font-weight="${page.id === '106473735839651' ? 700 : page.id === '114550268199751' ? 900 : 400}"${page.id === '106473735839651' ? ' letter-spacing="2"' : ''} fill="${fill}">${escapeXml(line)}</text>`;
  }).join('\n  ');

  let extrasUnder = '';
  let extrasOver = '';
  if (brand.underline) {
    const lastY = hlTop + (hlLines.length - 1) * hSp;
    extrasOver += `<line x1="100" y1="${lastY + 18}" x2="560" y2="${lastY + 18}" stroke="#FF8A1E" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (brand.highlighter) {
    const lastY = hlTop + (hlLines.length - 1) * hSp;
    const w = Math.min(700, Math.max(300, (hlLines[hlLines.length - 1] || '').length * hSize * 0.58 + 40));
    extrasUnder += `<rect x="86" y="${lastY - hSize * 0.74}" width="${w}" height="${hSize * 1.12}" fill="#F2E24B" opacity="0.95"/>`;
  }

  const bodyEls = bodyLines.map((line, i) =>
    `<text ${anchor} y="${bodyTop + i * bSp}" font-family="${brand.bodyFont.css}" font-size="${bSize}" font-weight="400" fill="${brand.ink}">${escapeXml(line)}</text>`).join('\n  ');

  const accentColor = page.id === '116157974886564' ? '#F5E31C' : page.id === '114550268199751' ? '#C8202D' : brand.eyeColor;
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs><style>${EMBEDDED_FONTS_CSS}</style></defs>
  <text ${anchor} y="${eyebrowY}" font-family="${brand.bodyFont.css}" font-weight="700" font-size="30" letter-spacing="6" fill="${accentColor}">${escapeXml(eyebrowFor(page.id))}</text>
  ${extrasUnder}
  ${hlEls}
  ${extrasOver}
  ${bodyEls}
  <text ${anchor} y="${footTop}" font-family="${brand.bodyFont.css}" font-size="26" letter-spacing="3" fill="${brand.footColor}">${escapeXml(footerFor(page.id))}</text>
</svg>`;
  const overlayFile = `${POOL_DIR}/text-${page.id}.png`;
  await sharp(Buffer.from(overlaySvg)).png().toFile(overlayFile);

  const musicFile = musicOverride?.file
    ? musicOverride.file
    : (fs.existsSync(`image-tools/audio/${mood}.mp3`) ? `image-tools/audio/${mood}.mp3` : 'image-tools/audio/awakening-dew.mp3');
  const dur = Math.min(13, clip.maxDur);
  const chain = [
    `[0:v]crop=ih*9/16:ih,scale=1080:1920,eq=saturation=1.06:contrast=1.04,fade=t=in:st=0:d=0.7,fade=t=out:st=${(dur - 0.9).toFixed(1)}:d=0.9[bv]`,
    `[1:v]scale=1080:1920[sc]`,
    `[bv][sc]overlay=0:0[base]`,
    `[base][3:v]overlay=0:0[v]`
  ].join(';') + `;[2:a]volume=0.85,afade=t=in:st=0:d=1,afade=t=out:st=${(dur - 1.5).toFixed(1)}:d=1.5[a]`;

  const outFile = `${POOL_DIR}/reel-${page.id}.tmp.mp4`;
  try {
    execFileSync(FF, [
      '-y', '-ss', String(clip.start), '-i', clip.file, '-i', scrimFile, '-stream_loop', '-1', '-i', musicFile, '-i', overlayFile,
      '-filter_complex', chain, '-map', '[v]', '-map', '[a]',
      '-t', String(dur), '-r', '30',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outFile
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    const buf = fs.readFileSync(outFile);
    fs.unlinkSync(outFile);
    fs.rmSync(overlayFile, { force: true });
    console.log(`      ✓ Cinematic reel rendered (${Math.round(buf.length / 1024)} KB)`);
    return buf;
  } catch (e) {
    fs.rmSync(overlayFile, { force: true });
    const msg = e.stderr ? e.stderr.toString().split('\n').filter(l => /Error|Invalid|No such|Unable/i.test(l)).join(' | ') : e.message;
    throw new Error('cinematic reel failed: ' + msg.slice(0, 300));
  }
}

function eyebrowFor(pageId) {
  return { '116157974886564': 'SIMPLE TRUTH // SILENT WEALTH', '108044922375174': 'CORE RULE // STRATEGIC SILENCE', '106473735839651': 'MINDSET TIP // THE BOUNDARIES CLUB', '1077306835630491': 'TAKE ACTION // EON VENTURES', '114550268199751': 'DAILY LESSON // RELIQ NORTH' }[pageId];
}
function footerFor(pageId) {
  return { '116157974886564': 'silentwealth.co', '108044922375174': 'strategicsilence.com', '106473735839651': 'boundariesclub.com', '1077306835630491': 'eonventures.co', '114550268199751': 'reliqnorth.com' }[pageId];
}
