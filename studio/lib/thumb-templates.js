// Thumbnail template engine (Studio side) v3 — 28-template registry.
// Pure sharp + SVG: text converted to vector PATHS via opentype.js (TTFs in
// lib/fonts) — zero system-font dependency, identical output on Vercel,
// locally and in CI. librsvg ignores data-URL @font-face (tofu boxes), which
// is exactly why this is paths, not text.
// v3: 28-template registry (core 3 + photo 19 + type 3 + AI-art 6). AI-art
// templates are layout variants that carry aiPreset prompt patterns — the
// background arrives through the same photo channel via /api/thumbs/ai-bg.
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const FONT_DIR = path.join(process.cwd(), 'lib', 'fonts');
const TTF = {
  anton: 'Anton-Regular.ttf',
  oswald500: 'Oswald-500.ttf',
  oswald700: 'Oswald-700.ttf',
  inter600: 'Inter-SemiBold.ttf',
  inter800: 'Inter-ExtraBold.ttf',
  playfair: 'PlayfairDisplay-Bold.ttf',
  playfairI: 'PlayfairDisplay-italic-400.woff',
};
const _fonts = {};
function font(name) {
  if (!_fonts[name]) {
    let buf = fs.readFileSync(path.join(FONT_DIR, TTF[name]));
    _fonts[name] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _fonts[name];
}

export const escapeXml = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const adv = (f, text, size, spacing = 0) =>
  f.getAdvanceWidth(text, size) + Math.max(0, text.length - 1) * spacing;

function linePath(f, text, x, y, size, spacing = 0) {
  if (!text) return { d: '', width: 0 };
  if (!spacing) {
    const p = f.getPath(text, x, y, size);
    const bb = p.getBoundingBox();
    return { d: p.toPathData(1), width: bb.x2 - bb.x1 };
  }
  let cx = x;
  const parts = [];
  for (const ch of text) {
    if (ch !== ' ') parts.push(f.getPath(ch, cx, y, size).toPathData(1));
    cx += f.getAdvanceWidth(ch, size) + spacing;
  }
  return { d: parts.join(' '), width: cx - x - spacing };
}

function accentLinePath(f, words, x, y, size, fill, accentFill, accentWord) {
  let cx = x;
  return words.map((w) => {
    const isAccent = accentWord && w.toLowerCase().replace(/[^a-z$%0-9]/g, '') === String(accentWord).toLowerCase().replace(/[^a-z$%0-9]/g, '');
    const p = f.getPath(w, cx, y, size).toPathData(1);
    cx += f.getAdvanceWidth(w, size) + f.getAdvanceWidth(' ', size);
    return `<path d="${p}" fill="${isAccent ? accentFill : fill}"/>`;
  }).join('');
}

export function wrapByWidth(f, text, size, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const test = [...cur, words[i]].join(' ');
    if (adv(f, test, size) <= maxWidth || cur.length === 0) cur.push(words[i]);
    else {
      lines.push(cur.join(' '));
      if (lines.length === 2) { lines.push(words.slice(i).join(' ')); return lines; }
      cur = [words[i]];
    }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines.slice(0, 3);
}

function fitLines(f, text, startSize, maxWidth, minSize) {
  for (let size = startSize; size >= minSize; size -= 6) {
    const lines = wrapByWidth(f, text, size, maxWidth);
    const widest = Math.max(...lines.map((l) => adv(f, l, size)));
    if (widest <= maxWidth) return { lines, size };
  }
  return { lines: wrapByWidth(f, text, minSize, maxWidth), size: minSize };
}

export function wrapForTemplate(template, title) {
  const f = font('anton');
  const widths = { poster: 468, clean: 1160, hero: 620, statue: 560, luxury: 560, motion: 1100, glass: 900, bignum: 520, equation: 620, stats: 1100, timeline: 1100, annotate: 1100, question: 900, newspaper: 1160, magazine: 700, collage: 1160, splitba: 1160, vs: 1100, duotone: 1000, brutalist: 1180, anime: 1100, soft3d: 1100, liminal: 900, pov: 1100, iso: 1100, map: 1000 };
  return fitLines(f, String(title || '').trim(), template === 'poster' ? 140 : 150, widths[template] || 1100, template === 'poster' ? 72 : 84).lines;
}

export const pickAccentWord = (title) => {
  const words = String(title || '').split(/\s+/).filter((w) => w.replace(/[^a-zA-Z$%]/g, '').length > 3);
  if (!words.length) return '';
  return words.reduce((a, b) => (b.replace(/[^a-zA-Z$%]/g, '').length > a.replace(/[^a-zA-Z$%]/g, '').length ? b : a));
};

// ---- shared builders ----
const chipEl = (text, x, y, accent, ink = '#0B0B0D') => {
  if (!text) return '';
  const f = font('inter800');
  const w = adv(f, text.toUpperCase(), 19, 3) + 40;
  return `<rect x="${x}" y="${y}" rx="6" width="${w.toFixed(0)}" height="42" fill="${accent}"/>
    <path d="${linePath(f, text.toUpperCase(), x + 20, y + 28, 19, 3).d}" fill="${ink}"/>`;
};
const scrimEl = (y0 = 300) => `<rect x="0" y="${y0}" width="1280" height="${720 - y0}" fill="url(#scrimUp)"/>`;
const vignetteEl = (op = 0.55) => `<rect x="0" y="0" width="1280" height="720" fill="url(#vig)" opacity="${op}"/>`;
const bgOrFill = (o, fill) => o.photoHref
  ? `<image href="${o.photoHref}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>`
  : `<rect width="1280" height="720" fill="${fill}"/>`;

const DEFS = `
<defs>
  <linearGradient id="scrimUp" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.88"/>
  </linearGradient>
  <linearGradient id="gradL" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity="0.92"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="1"/>
  </radialGradient>
  <radialGradient id="paperVignette" cx="0.5" cy="0.35" r="1">
    <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.16"/>
  </radialGradient>
  <linearGradient id="aurora" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1B2A4A"/>
    <stop offset="0.5" stop-color="#5E3A8C"/>
    <stop offset="1" stop-color="#0E6B6B"/>
  </linearGradient>
  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
  <filter id="motionBlur" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur stdDeviation="16 2"/>
  </filter>
  <filter id="frost" x="-5%" y="-5%" width="110%" height="110%">
    <feGaussianBlur stdDeviation="14"/>
  </filter>
  <filter id="gray"><feColorMatrix type="saturate" values="0"/></filter>
  <filter id="newsDuotone">
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer>
      <feFuncR type="table" tableValues="0.10 0.92"/>
      <feFuncG type="table" tableValues="0.09 0.89"/>
      <feFuncB type="table" tableValues="0.08 0.80"/>
    </feComponentTransfer>
  </filter>
  <filter id="rough">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7"/>
  </filter>
  <clipPath id="clipL"><rect x="0" y="0" width="640" height="720"/></clipPath>
  <clipPath id="clipR"><rect x="640" y="0" width="640" height="720"/></clipPath>
  <clipPath id="clipTL"><rect x="40" y="40" width="420" height="300"/></clipPath>
  <clipPath id="clipNews"><rect x="340" y="210" width="600" height="360"/></clipPath>
  <clipPath id="photoOval"><ellipse cx="310" cy="360" rx="280" ry="300"/></clipPath>
  <clipPath id="frameClip"><rect x="0" y="0" width="1280" height="720"/></clipPath>
  <clipPath id="glassClip"><rect x="70" y="300" width="1140" height="420" rx="18"/></clipPath>
  <!-- premium gradients + filters -->
  <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0A0E1A"/>
    <stop offset="0.45" stop-color="#0C1224"/>
    <stop offset="0.75" stop-color="#0E0C1E"/>
    <stop offset="1" stop-color="#080610"/>
  </linearGradient>
  <linearGradient id="gradeOverlay" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0A3A4A" stop-opacity="0.18"/>
    <stop offset="0.5" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#4A2808" stop-opacity="0.22"/>
  </linearGradient>
  <radialGradient id="photoVignette" cx="0.5" cy="0.45" r="0.85">
    <stop offset="0.5" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.55"/>
  </radialGradient>
  <filter id="textBlur" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="5"/>
  </filter>
  <filter id="glowBlur" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="18"/>
  </filter>
</defs>`;

// ---- renderers ----

function rClean(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 150, 1160, 84);
  const lineH = size + 12;
  const startY = 720 - 60 - (lines.length - 1) * lineH;
  const linesEls = lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const shadow = f.getPath(l, x + 4, startY + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, startY + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${shadow}" fill="#000" opacity="0.5" filter="url(#textBlur)"/>${main}`;
  }).join('');
  return `${bgOrFill(o, '#101014')}
    <rect width="1280" height="720" fill="url(#gradeOverlay)"/>
    ${vignetteEl(0.35)}
    ${scrimEl(330)}
    ${chipEl(o.chip, 56, 48, o.accent)}
    ${o.eyebrow ? (() => { const os = font('oswald500'); const e = o.eyebrow.toUpperCase(); return `<path d="${linePath(os, e, 640 - adv(os, e, 24, 8) / 2, startY - size - 26, 24, 8).d}" fill="#FFF" opacity="0.92"/>`; })() : ''}
    ${linesEls}
    <rect x="0" y="712" width="1280" height="8" fill="${o.accent}"/>`;
}

function rPoster(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 140, 468, 72);
  const lineH = size + 10;
  const startY = 720 - 96 - (lines.length - 1) * lineH;

  // text: soft blurred shadow (same shape, offset, blurred) then crisp fill
  const linesEls = lines.map((l, i) => {
    const shadow = f.getPath(l, 62, startY + i * lineH + 7, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), 58, startY + i * lineH, size, '#F5F2E8', o.accent, o.accentWord);
    return `<path d="${shadow}" fill="#000" opacity="0.6" filter="url(#textBlur)"/>${main}`;
  }).join('');

  // eyebrow: small, tracked, above headline
  const os500 = font('oswald500');
  const eyebrowEl = o.eyebrow
    ? `<path d="${linePath(os500, o.eyebrow.toUpperCase(), 58, startY - size - 28, 20, 8).d}" fill="${o.accent}" opacity="0.85"/>`
    : '';

  // brand: bottom right on the photo, small
  const i800 = font('inter800');
  const brandEl = o.brand
    ? `<path d="${linePath(i800, o.brand.toUpperCase(), 1224 - adv(i800, o.brand.toUpperCase(), 18, 3), 678, 18, 3).d}" fill="#FFF" opacity="0.75"/>`
    : '';

  return `
    <!-- photo side with cinematic grade -->
    ${o.photoHref
    ? `<image href="${o.photoHref}" x="540" y="0" width="740" height="720" preserveAspectRatio="xMidYMid slice"/>
       <!-- teal-orange grade: push shadows cool, highlights warm -->
       <rect x="540" y="0" width="740" height="720" fill="url(#gradeOverlay)"/>
       <!-- vignette on photo edges -->
       <rect x="540" y="0" width="740" height="720" fill="url(#photoVignette)"/>`
    : `<rect x="540" y="0" width="740" height="720" fill="${o.shade}"/>`}

    <!-- panel side: layered gradient for depth, not flat -->
    <rect x="0" y="0" width="560" height="720" fill="url(#panelGrad)"/>
    <!-- subtle accent glow at the panel-photo seam -->
    <rect x="548" y="0" width="18" height="720" fill="${o.accent}" opacity="0.15" filter="url(#glowBlur)"/>
    <rect x="556" y="0" width="3" height="720" fill="${o.accent}"/>

    <!-- chip -->
    ${chipEl(o.chip, 56, 56, o.accent)}

    ${eyebrowEl}
    ${linesEls}

    <!-- thin accent tick instead of thick bar -->
    <rect x="58" y="${720 - 52}" width="32" height="3" fill="${o.accent}" opacity="0.8"/>
    ${brandEl}

    <!-- film grain over everything -->
    <rect width="1280" height="720" fill="url(#filmGrain)" opacity="0.04"/>`;
}

function rPaper(o) {
  const anton = font('anton');
  const inter = font('inter600');
  const playfair = font('playfair');
  const big = (o.accentWord || pickAccentWord(o.title) || 'STORY').toUpperCase();
  const rest = o.title.replace(new RegExp((o.accentWord || pickAccentWord(o.title) || '§').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim().replace(/\s+/g, ' ') || o.title;
  const restFit = fitLines(playfair, rest, 42, 600, 26);
  const chipEls = o.chip ? `<path d="${linePath(inter, o.chip.toUpperCase(), 620, 150, 20, 6).d}" fill="#8A8272"/>
    <path d="${linePath(inter, 'P R E S E N T S', 620, 196, 15, 4).d}" fill="#A39A85"/>` : '';
  const phraseEls = restFit.lines.map((l, i) =>
    `<path d="${linePath(playfair, l, 620, 360 + i * (restFit.size + 14), restFit.size).d}" fill="#232019"/>`).join('');
  const bigSize = Math.min(150, 62000 / Math.max(1, adv(anton, big, 100)));
  const bigEls = `<path d="${anton.getPath(big, 616, 300 + 60 + restFit.lines.length * (restFit.size + 14) + bigSize * 0.9, bigSize).toPathData(1)}" fill="${o.accent}"/>`;
  const monoEls = `<circle cx="1180" cy="120" r="44" fill="none" stroke="${o.accent}" stroke-width="3"/>
    <path d="${linePath(playfair, o.brand.slice(0, 2).toUpperCase() || 'QQ', 1180 - adv(playfair, o.brand.slice(0, 2).toUpperCase() || 'QQ', 30) / 2, 131, 30).d}" fill="#232019"/>`;
  const eyebrowEls = o.eyebrow ? `<path d="${linePath(inter, o.eyebrow, 620, 668, 15, 2).d}" fill="#8A8272"/>` : '';
  return `
    <rect width="1280" height="720" fill="#F3F1EC"/>
    <rect width="1280" height="720" fill="url(#paperVignette)"/>
    ${o.photoHref ? `<g clip-path="url(#photoOval)">
      <image href="${o.photoHref}" x="30" y="60" width="560" height="600" preserveAspectRatio="xMidYMid slice"/>
    </g>
    <ellipse cx="310" cy="360" rx="282" ry="302" fill="none" stroke="#DDD8CC" stroke-width="3"/>` : ''}
    ${chipEls}
    ${phraseEls}
    ${bigEls}
    ${monoEls}
    ${eyebrowEls}`;
}

function rHero(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 140, 620, 76);
  const lineH = size + 10;
  const startY = 720 - 72 - (lines.length - 1) * lineH;
  const linesEls = lines.map((l, i) => {
    const shadow = f.getPath(l, 60, startY + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), 56, startY + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${shadow}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
  }).join('');
  return `
    ${o.photoHref ? `<image href="${o.photoHref}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMaxYMid slice"/>` : `<rect width="1280" height="720" fill="${o.shade}"/>`}
    <rect x="0" y="0" width="760" height="720" fill="url(#gradL)"/>
    ${vignetteEl(0.35)}
    ${chipEl(o.chip, 56, 48, o.accent)}
    ${o.eyebrow ? `<path d="${linePath(font('oswald500'), o.eyebrow.toUpperCase(), 56, startY - size - 26, 22, 7).d}" fill="#FFF" opacity="0.9"/>` : ''}
    ${linesEls}
    <rect x="0" y="712" width="1280" height="8" fill="${o.accent}"/>`;
}

function rStatue(o) {
  const f = font('anton');
  const playfair = font('playfair');
  const inter = font('inter600');
  const { lines, size } = fitLines(f, o.title, 132, 560, 72);
  const lineH = size + 10;
  const startY = 720 - 96 - (lines.length - 1) * lineH;
  const linesEls = lines.map((l, i) => {
    const shadow = f.getPath(l, 68, startY + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), 64, startY + i * lineH, size, '#F2EAD8', o.accent, o.accentWord);
    return `<path d="${shadow}" fill="#000" opacity="0.55" filter="url(#softShadow)"/>${main}`;
  }).join('');
  return `
    ${bgOrFill(o, '#141412')}
    <rect width="1280" height="720" fill="#000" opacity="0.22"/>
    ${scrimEl(300)}
    ${vignetteEl(0.4)}
    <rect x="20" y="20" width="1240" height="680" fill="none" stroke="${o.accent}" stroke-width="2" opacity="0.65"/>
    <rect x="28" y="28" width="1224" height="664" fill="none" stroke="${o.accent}" stroke-width="0.8" opacity="0.4"/>
    ${o.chip ? `<path d="${linePath(playfair, o.chip.toUpperCase(), 64, 92, 24, 6).d}" fill="${o.accent}"/>` : ''}
    ${o.eyebrow ? `<path d="${linePath(inter, o.eyebrow, 64, startY - size - 24, 15, 3).d}" fill="#D8CFBA"/>` : ''}
    ${linesEls}`;
}

function rSilhouette(o) {
  const f = font('anton');
  const word = (o.accentWord || pickAccentWord(o.title) || o.title).toUpperCase();
  const size = Math.min(210, 110000 / Math.max(1, adv(f, word, 100)));
  const w = adv(f, word, size);
  const restHtml = o.title.replace(word, '').trim() !== o.title.replace(word, '').trim() || o.title.replace(word, '').trim()
    ? (() => {
      const restText = o.title.replace(word, '').trim();
      if (!restText) return '';
      const rest = fitLines(f, restText, 64, 1000, 44);
      return rest.lines.map((l, i) => {
        const lw = adv(f, l, rest.size);
        return `<path d="${f.getPath(l, 640 - lw / 2, 520 + i * (rest.size + 14), rest.size).toPathData(1)}" fill="#FFF" opacity="0.92"/>`;
      }).join('');
    })()
    : '';
  return `
    ${bgOrFill(o, '#191512')}
    ${vignetteEl(0.6)}
    <path d="${f.getPath(word, 640 - w / 2 + 5, 407, size).toPathData(1)}" fill="#000" opacity="0.6" filter="url(#softShadow)"/>
    <path d="${f.getPath(word, 640 - w / 2, 400, size).toPathData(1)}" fill="${o.accent}"/>
    ${restHtml}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

function rLuxury(o) {
  const playfair = font('playfair');
  const inter = font('inter600');
  const { lines, size } = fitLines(playfair, o.title, 76, 560, 40);
  const lineH = size + 18;
  const startY = 720 - 110 - (lines.length - 1) * lineH;
  return `
    <rect width="1280" height="720" fill="#0B0B0C"/>
    ${o.photoHref ? `<image href="${o.photoHref}" x="640" y="0" width="640" height="720" preserveAspectRatio="xMidYMid slice"/>
    <rect x="640" y="0" width="640" height="720" fill="#000" opacity="0.25"/>` : ''}
    ${o.chip ? `<path d="${linePath(inter, o.chip.toUpperCase(), 64, 110, 16, 6).d}" fill="${o.accent}"/>
    <rect x="64" y="126" width="60" height="2" fill="${o.accent}" opacity="0.7"/>` : ''}
    ${lines.map((l, i) => `<path d="${playfair.getPath(l, 62, startY + i * lineH, size).toPathData(1)}" fill="#F4EFE2"/>`).join('')}
    <rect x="64" y="${startY + (lines.length - 1) * lineH + 34}" width="90" height="2" fill="${o.accent}"/>
    ${o.eyebrow ? `<path d="${linePath(inter, o.eyebrow, 64, startY + (lines.length - 1) * lineH + 70, 13, 3).d}" fill="#9A917E"/>` : ''}
    ${o.brand ? `<path d="${linePath(inter, o.brand.toUpperCase(), 64, 64, 14, 4).d}" fill="#7E7668"/>` : ''}`;
}

function rSplitBA(o) {
  const f = font('anton');
  const t = font('inter800');
  const half = 640;
  const img = (x, gray) => o.photoHref
    ? `<g clip-path="url(#${x === 0 ? 'clipL' : 'clipR'})"><image href="${o.photoHref}" x="${x}" y="0" width="${half}" height="720" preserveAspectRatio="xMidYMid slice" ${gray ? 'filter="url(#gray)"' : ''}/></g>`
    : `<rect x="${x}" width="${half}" height="720" fill="${x === 0 ? '#202024' : o.shade}"/>`;
  return `
    ${img(0, true)}
    ${img(half, false)}
    <rect x="0" y="0" width="${half}" height="720" fill="#000" opacity="0.45"/>
    <rect x="${half - 3}" y="0" width="6" height="720" fill="${o.accent}"/>
    ${(() => {
    const l = linePath(t, 'BEFORE', 48, 76, 26, 4);
    const r = linePath(t, 'AFTER', half + 48, 76, 26, 4);
    return `<path d="${l.d}" fill="#FFF" opacity="0.95"/><path d="${r.d}" fill="${o.accent}"/>`;
  })()}
    ${(() => {
    const { lines, size } = fitLines(f, o.title, 110, 1100, 60);
    const lineH = size + 8;
    const y0 = 720 - 64 - (lines.length - 1) * lineH;
    return lines.map((l2, i) => {
      const x = 640 - adv(f, l2, size) / 2;
      const sh = f.getPath(l2, x + 4, y0 + i * lineH + 6, size).toPathData(1);
      const main = accentLinePath(f, l2.split(' '), x, y0 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
      return `<path d="${sh}" fill="#000" opacity="0.55" filter="url(#softShadow)"/>${main}`;
    }).join('');
  })()}`;
}

function rVS(o) {
  const f = font('anton');
  const half = 640;
  const aw = (o.accentWord || 'BROKE').toUpperCase();
  const awFit = fitLines(f, aw, 150, 540, 80);
  const { lines, size } = fitLines(f, o.title, 96, 1120, 56);
  const lineH = size + 8;
  const y0 = 720 - 56 - (lines.length - 1) * lineH;
  return `
    ${o.photoHref ? `<g clip-path="url(#clipL)"><image href="${o.photoHref}" x="0" y="0" width="${half}" height="720" preserveAspectRatio="xMidYMid slice"/></g>` : `<rect width="${half}" height="720" fill="#1A1A1E"/>`}
    <rect x="${half}" y="0" width="${half}" height="720" fill="${o.shade}"/>
    ${awFit.lines.map((l, i) => {
    const w = adv(f, l, awFit.size);
    return `<path d="${f.getPath(l, half + 320 - w / 2, 300 + i * (awFit.size + 10), awFit.size).toPathData(1)}" fill="${o.accent}"/>`;
  }).join('')}
    <circle cx="640" cy="360" r="86" fill="${o.accent}"/>
    <path d="${f.getPath('VS', 640 - adv(f, 'VS', 84) / 2, 390, 84).toPathData(1)}" fill="#0B0B0D"/>
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x + 4, y0 + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.55" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

function rCollage(o) {
  const f = font('anton');
  if (!o.photoHref) return rPoster(o);
  const { lines, size } = fitLines(f, o.title, 96, 1140, 64);
  const barY = 720 - 40 - (lines.length - 1) * (size + 8) - size;
  return `
    <rect width="1280" height="720" fill="#111014"/>
    <g clip-path="url(#clipR)"><image href="${o.photoHref}" x="400" y="0" width="880" height="720" preserveAspectRatio="xMidYMid slice"/></g>
    <rect x="400" y="0" width="880" height="720" fill="#000" opacity="0.2"/>
    <g clip-path="url(#clipTL)">
      <image href="${o.photoHref}" x="40" y="40" width="420" height="300" preserveAspectRatio="xMidYMid slice" filter="url(#gray)"/>
    </g>
    <rect x="40" y="40" width="420" height="300" fill="none" stroke="#E8E2D2" stroke-width="4"/>
    <rect x="34" y="34" width="120" height="34" fill="${o.accent}"/>
    <path d="${linePath(font('inter800'), (o.chip || 'THE STORY').toUpperCase(), 44, 57, 15, 2).d}" fill="#0B0B0D"/>
    <rect x="0" y="${barY - 18}" width="1280" height="${720 - barY + 18}" fill="#111014" opacity="0.94"/>
    ${lines.map((l, i) => accentLinePath(f, l.split(' '), 48, barY + size + i * (size + 8), size, '#F2EDE0', o.accent, o.accentWord)).join('')}
    <rect width="1280" height="720" fill="url(#paperVignette)" opacity="0.5"/>
    ${o.brand ? `<path d="${linePath(font('inter800'), o.brand.toUpperCase(), 1224 - adv(font('inter800'), o.brand.toUpperCase(), 16, 4), 44, 16, 4).d}" fill="#E8E2D2" opacity="0.9"/>` : ''}`;
}

function rNewspaper(o) {
  const playfair = font('playfair');
  const inter = font('inter600');
  const mast = (o.brand || 'THE DAILY ARCHIVE').toUpperCase();
  const photoY = 150;
  const { lines, size } = fitLines(playfair, o.title, 72, 1080, 44);
  const lineH = size + 14;
  const headY = photoY + 360 + size + 18;
  return `
    <rect width="1280" height="720" fill="#E9E4D6"/>
    <rect width="1280" height="720" fill="url(#paperVignette)"/>
    <path d="${linePath(playfair, mast, 640 - adv(playfair, mast, 52, 8) / 2, 96, 52, 8).d}" fill="#1C1A16"/>
    <rect x="64" y="116" width="1152" height="4" fill="#1C1A16"/>
    <rect x="64" y="124" width="1152" height="1.6" fill="#1C1A16"/>
    ${o.photoHref ? `<g clip-path="url(#clipNews)"><image href="${o.photoHref}" x="340" y="${photoY}" width="600" height="360" preserveAspectRatio="xMidYMid slice" filter="url(#newsDuotone)"/></g>
    <rect x="340" y="${photoY}" width="600" height="360" fill="none" stroke="#1C1A16" stroke-width="2"/>` : ''}
    ${o.chip ? `<rect x="84" y="${photoY + 8}" rx="3" width="${(o.chip.length * 12 + 28).toFixed(0)}" height="32" fill="#8E2B25"/>
    <path d="${linePath(inter, o.chip.toUpperCase(), 98, photoY + 30, 14, 2).d}" fill="#EFE9DA"/>` : ''}
    ${lines.map((l, i) => {
    const x = 640 - adv(playfair, l, size) / 2;
    return `<path d="${playfair.getPath(l, x, headY + i * lineH, size).toPathData(1)}" fill="#1C1A16"/>`;
  }).join('')}
    <rect x="64" y="${headY + (lines.length - 1) * lineH + 26}" width="1152" height="2" fill="#1C1A16" opacity="0.7"/>
    ${o.eyebrow ? `<path d="${linePath(inter, o.eyebrow.toUpperCase(), 640 - adv(inter, o.eyebrow.toUpperCase(), 14, 4) / 2, headY + (lines.length - 1) * lineH + 52, 14, 4).d}" fill="#6B6455"/>` : ''}`;
}

function rMagazine(o) {
  const f = font('anton');
  const playfair = font('playfair');
  const inter = font('inter600');
  const mast = (o.brand || 'QUARRY').toUpperCase();
  const { lines, size } = fitLines(f, o.title, 130, 640, 76);
  const lineH = size + 8;
  const startY = 720 - 120 - (lines.length - 1) * lineH;
  const coverLines = ['THE FULL STORY', 'INSIDE THE EMPIRE', (o.chip || 'EXCLUSIVE').toUpperCase()];
  return `
    ${bgOrFill(o, o.shade)}
    <rect width="1280" height="720" fill="url(#gradL)" opacity="0.9"/>
    <path d="${linePath(playfair, mast, 56, 96, 58, 4).d}" fill="#FFFFFF"/>
    <rect x="56" y="112" width="1168" height="2.5" fill="#FFFFFF" opacity="0.85"/>
    ${coverLines.map((cl, i) => `<path d="${linePath(inter, cl, 56, 210 + i * 44, 17, 2).d}" fill="#FFF" opacity="0.92"/>
      <circle cx="${56 + adv(inter, cl, 17, 2) + 12}" cy="${204 + i * 44}" r="3.5" fill="${o.accent}"/>`).join('')}
    ${lines.map((l, i) => {
    const sh = f.getPath(l, 60, startY + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), 56, startY + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    <rect x="1128" y="600" width="96" height="64" fill="#F4F1E8"/>
    <rect x="1136" y="612" width="80" height="3" fill="#111"/><rect x="1136" y="626" width="80" height="6" fill="#111"/><rect x="1136" y="640" width="80" height="3" fill="#111" opacity="0.7"/>
    <rect x="1160" y="608" width="8" height="48" fill="#111"/><rect x="1174" y="608" width="5" height="48" fill="#111"/><rect x="1184" y="608" width="10" height="48" fill="#111"/>`;
}

function rMotion(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 140, 1100, 80);
  const lineH = size + 10;
  const startY = 720 - 90 - (lines.length - 1) * lineH;
  return `
    ${bgOrFill(o, '#101018')}
    ${o.photoHref ? `<g filter="url(#motionBlur)"><rect width="1280" height="720" fill="#000" opacity="0"/></g>` : ''}
    <rect width="1280" height="720" fill="#0A0A12" opacity="0.35"/>
    ${[120, 300, 520, 640].map((y, i) => `<rect x="${i % 2 ? -40 : 600}" y="${y}" width="720" height="4" fill="${o.accent}" opacity="${(0.25 + i * 0.12).toFixed(2)}"/>`).join('')}
    <g transform="rotate(-2 640 420)">
      ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x + 5, startY + i * lineH + 7, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, startY + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.6" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    </g>
    <rect x="0" y="712" width="1280" height="8" fill="${o.accent}"/>`;
}

function rAnnotate(o) {
  const f = font('anton');
  const marker = font('inter800');
  const { lines, size } = fitLines(f, o.title, 110, 1080, 64);
  const lineH = size + 8;
  const y0 = 720 - 70 - (lines.length - 1) * lineH;
  const circCx = 950, circCy = 240;
  const note = (o.eyebrow || o.chip || 'look closer').toUpperCase();
  return `
    ${bgOrFill(o, '#15161A')}
    <rect width="1280" height="720" fill="#0A0C10" opacity="0.3"/>
    <g filter="url(#rough)" fill="none" stroke="${o.accent}" stroke-width="7" stroke-linecap="round">
      <ellipse cx="${circCx}" cy="${circCy}" rx="150" ry="110" transform="rotate(-6 ${circCx} ${circCy})"/>
      <path d="M ${circCx - 40} ${circCy + 130} C ${circCx - 120} ${circCy + 260}, ${circCx + 60} ${circCy + 240}, ${circCx + 260} ${circCy + 190}"/>
      <path d="M ${circCx + 260} ${circCy + 190} l -46 -6"/>
      <path d="M ${circCx + 260} ${circCy + 190} l -10 40"/>
    </g>
    <g filter="url(#rough)">
      <rect x="70" y="${y0 - size - 26}" width="${Math.min(430, adv(marker, note, 26, 2) + 40).toFixed(0)}" height="${size + 44}" fill="none" stroke="${o.accent}" stroke-width="5" transform="rotate(-1 80 ${y0 - size})"/>
    </g>
    ${lines.map((l, i) => {
    const x = 72;
    const sh = f.getPath(l, x + 4, y0 + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.6" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    <g filter="url(#rough)"><path d="${linePath(marker, note, 76, y0 - size - 34, 24, 2).d}" fill="${o.accent}"/></g>`;
}

function rBigNum(o) {
  const f = font('anton');
  const numMatch = String(o.title).match(/\d+/);
  const num = (o.accentWord && /\d/.test(o.accentWord) ? o.accentWord : numMatch ? numMatch[0] : '7').slice(0, 3);
  const numSize = Math.min(560, 630000 / Math.max(1, adv(f, num, 100) * 7));
  const rest = o.title.replace(num, '').trim().replace(/\s+/g, ' ') || o.title;
  const restFit = fitLines(f, rest, 92, 500, 52);
  return `
    <rect width="1280" height="720" fill="${o.shade}"/>
    ${o.photoHref ? `<g clip-path="url(#clipR)"><image href="${o.photoHref}" x="760" y="0" width="520" height="720" preserveAspectRatio="xMidYMid slice" opacity="0.85"/></g>
    <rect x="760" y="0" width="520" height="720" fill="${o.shade}" opacity="0.35"/>` : ''}
    <path d="${f.getPath(num, 48, 560, numSize).toPathData(1)}" fill="none" stroke="${o.accent}" stroke-width="${Math.max(6, numSize * 0.045).toFixed(0)}" stroke-linejoin="round"/>
    <path d="${f.getPath(num, 48, 560, numSize).toPathData(1)}" fill="${o.accent}" opacity="0.16"/>
    ${restFit.lines.map((l, i) => {
    const main = accentLinePath(f, l.split(' '), 700, 300 + i * (restFit.size + 12), restFit.size, '#F2EDE0', o.accent, o.accentWord);
    const sh = f.getPath(l, 704, 306 + i * (restFit.size + 12), restFit.size).toPathData(1);
    return `<path d="${sh}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    ${chipEl(o.chip, 700, 120, o.accent)}`;
}

function rEquation(o) {
  const f = font('anton');
  const parts = String(o.title).split(/\s*(=|→|->)\s*/);
  const hasEq = parts.length >= 3;
  const lhs = hasEq ? parts[0] : '';
  const eq = hasEq ? parts[1] : '=';
  const rhs = hasEq ? parts.slice(2).join(' ') : o.title;
  const lhsFit = fitLines(f, lhs, 150, 900, 70);
  const rhsFit = fitLines(f, rhs, 150, 900, 70);
  const centered = (text, y, fill) => {
    const w = adv(f, text, 150);
    return `<path d="${f.getPath(text, 640 - w / 2, y, 150).toPathData(1)}" fill="${fill}"/>`;
  };
  const lhsY = hasEq ? 230 : 400;
  return `
    <rect width="1280" height="720" fill="${o.shade}"/>
    ${o.photoHref ? `<g clip-path="url(#frameClip)"><image href="${o.photoHref}" width="1280" height="720" preserveAspectRatio="xMidYMid slice" opacity="0.22"/></g>` : ''}
    ${(hasEq ? lhsFit.lines : [o.title]).map((l, i) => centered(l, 200 + i * 170, '#F2EDE0')).join('')}
    ${hasEq ? centered(eq, 450, o.accent) : ''}
    ${hasEq ? rhsFit.lines.map((l, i) => centered(l, 640 + i * 170, o.accent)).join('') : ''}
    ${chipEl(o.chip, 56, 56, o.accent)}
    <rect x="0" y="712" width="1280" height="8" fill="${o.accent}"/>`;
}

function rTimeline(o) {
  const f = font('anton');
  const inter = font('inter600');
  const { lines, size } = fitLines(f, o.title, 110, 1100, 60);
  const lineH = size + 8;
  const y0 = 300;
  const nodes = (o.title.match(/\b[A-Za-z]{4,}\b/g) || ['START', 'RISE', 'PEAK', 'FALL']).slice(0, 4).map((w) => w.toUpperCase());
  const x0 = 120, x1 = 1160, step = (x1 - x0) / Math.max(1, nodes.length - 1);
  return `
    <rect width="1280" height="720" fill="${o.shade}"/>
    ${o.photoHref ? `<g clip-path="url(#frameClip)"><image href="${o.photoHref}" width="1280" height="240" preserveAspectRatio="xMidYMid slice" opacity="0.4"/></g>
    <rect width="1280" height="240" fill="${o.shade}" opacity="0.4"/>` : ''}
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x + 4, y0 - 90 + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 - 90 + i * lineH, size, '#F2EDE0', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    <rect x="${x0}" y="${y0 + 130}" width="${x1 - x0}" height="4" fill="${o.accent}" opacity="0.75"/>
    ${nodes.map((n, i) => {
    const nx = nodes.length > 1 ? x0 + i * step : x0;
    return `<circle cx="${nx}" cy="${y0 + 132}" r="14" fill="${o.accent}"/>
      <path d="${linePath(inter, n.slice(0, 9), nx - adv(inter, n.slice(0, 9), 16, 1) / 2, y0 + 180, 16, 1).d}" fill="#F2EDE0" opacity="0.9"/>`;
  }).join('')}
    <rect x="0" y="712" width="1280" height="8" fill="${o.accent}"/>`;
}

function rStats(o) {
  const f = font('anton');
  const inter = font('inter600');
  const { lines, size } = fitLines(f, o.title, 130, 1100, 72);
  const lineH = size + 8;
  const y0 = 380;
  const bars = [[220, 'YEAR 1'], [340, 'YEAR 2'], [460, 'TODAY']];
  return `
    <rect width="1280" height="720" fill="${o.shade}"/>
    ${o.photoHref ? `<g clip-path="url(#frameClip)"><image href="${o.photoHref}" width="1280" height="720" preserveAspectRatio="xMidYMid slice" opacity="0.25"/></g>` : ''}
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x + 4, 200 + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, 200 + i * lineH, size, '#F2EDE0', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.5" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    <rect x="80" y="${y0 + 40}" width="1120" height="3" fill="#F2EDE0" opacity="0.4"/>
    ${bars.map(([h, label], i) => {
    const x = 180 + i * 360;
    return `<rect x="${x}" y="${y0 + 40 - h}" width="200" height="${h}" fill="${i === bars.length - 1 ? o.accent : '#F2EDE0'}" opacity="${i === bars.length - 1 ? 1 : 0.75}"/>
      <path d="${linePath(inter, label, x + 100 - adv(inter, label, 16, 2) / 2, y0 + 70, 16, 2).d}" fill="#F2EDE0" opacity="0.85"/>`;
  }).join('')}`;
}

function rGlass(o) {
  const f = font('anton');
  const os = font('oswald500');
  const { lines, size } = fitLines(f, o.title, 120, 880, 68);
  const lineH = size + 10;
  const panel = { x: 70, y: 560 - lines.length * lineH - 40, w: 1140, h: lines.length * lineH + 80 };
  return `
    ${bgOrFill(o, 'url(#aurora)')}
    <g clip-path="url(#glassClip)">
      ${bgOrFill(o, 'url(#aurora)').replace('/>', ' filter="url(#frost)"/>')}
      <rect x="70" y="300" width="1140" height="420" fill="#FFFFFF" opacity="0.10"/>
    </g>
    <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="18" fill="#FFFFFF" opacity="0.10"/>
    <rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="18" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>
    ${o.eyebrow ? `<path d="${linePath(os, o.eyebrow.toUpperCase(), panel.x + 44, panel.y + 46, 20, 7).d}" fill="#FFF" opacity="0.95"/>` : ''}
    ${lines.map((l, i) => accentLinePath(f, l.split(' '), panel.x + 44, panel.y + 92 + size * 0.8 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord)).join('')}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

function rDuotone(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 130, 1040, 76);
  const lineH = size + 10;
  const y0 = 720 - 90 - (lines.length - 1) * lineH;
  const dark = '#12303A';
  const light = o.accent || '#5EEAD4';
  return `
    ${o.photoHref ? `<g clip-path="url(#frameClip)"><image href="${o.photoHref}" width="1280" height="720" preserveAspectRatio="xMidYMid slice" filter="url(#duoFilter)"/></g>
    <rect width="1280" height="720" fill="${dark}" opacity="0.25"/>` : `<rect width="1280" height="720" fill="url(#aurora)"/>`}
    <filter id="duoFilter">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.04 0.95"/>
        <feFuncG type="table" tableValues="0.12 0.62"/>
        <feFuncB type="table" tableValues="0.18 0.55"/>
      </feComponentTransfer>
    </filter>
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x, y0 + i * lineH + 7, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 + i * lineH, size, '#FFFFFF', dark, o.accentWord);
    return `<path d="${sh}" fill="${light}" opacity="0.85" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    ${chipEl(o.chip, 56, 48, light, dark)}
    <rect x="0" y="712" width="1280" height="8" fill="${light}"/>`;
}

function rQuestion(o) {
  const playfairI = font('playfairI');
  const anton = font('anton');
  let q = o.title;
  if (!q.includes('?')) q = q.replace(/[.!?]+$/, '') + '?';
  const fit = fitLines(playfairI, q, 84, 980, 44);
  const lineH = fit.size + 20;
  const y0 = 380 - (fit.lines.length - 1) * lineH / 2;
  return `
    ${bgOrFill(o, '#191B22')}
    <rect width="1280" height="720" fill="#0A0C14" opacity="0.55"/>
    <path d="${anton.getPath('?', 1010 - adv(anton, '?', 480) / 2, 560, 480).toPathData(1)}" fill="${o.accent}" opacity="0.9"/>
    ${fit.lines.map((l, i) => {
    const w = adv(playfairI, l, fit.size);
    return `<path d="${playfairI.getPath(l, 620 - w / 2 - (l.length > 12 ? 40 : 0), y0 + i * lineH, fit.size).toPathData(1)}" fill="#F4F1E8"/>`;
  }).join('')}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

function rBrutalist(o) {
  const f = font('anton');
  const inter = font('inter800');
  const acid = o.accent || '#D8FF3C';
  const { lines, size } = fitLines(f, o.title.toUpperCase(), 210, 1180, 110);
  const lineH = size + 4;
  const startY = 320 - (lines.length - 1) * lineH / 2 + size;
  return `
    <rect width="1280" height="720" fill="#0D0D0D"/>
    <g transform="rotate(-2 640 360)">
      ${lines.map((l, i) => {
    const main = accentLinePath(f, l.split(' '), 40, startY + i * lineH, size, '#F5F2E8', acid, o.accentWord);
    return main + `<rect x="40" y="${startY + i * lineH + 14}" width="${Math.min(1180, adv(f, l, size)).toFixed(0)}" height="${(size * 0.06).toFixed(0)}" fill="${acid}"/>`;
  }).join('')}
    </g>
    <rect x="0" y="0" width="1280" height="16" fill="${acid}"/>
    <rect x="0" y="704" width="1280" height="16" fill="${acid}"/>
    ${o.brand ? `<path d="${linePath(inter, o.brand.toUpperCase(), 40, 690, 16, 4).d}" fill="#F5F2E8"/>` : ''}`;
}

// ---- AI-preset layouts (bg arrives from /api/thumbs/ai-bg with the preset) ----

function rAnime(o) { return rClean(o); }

function rSoft3D(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 110, 1100, 64);
  const lineH = size + 8;
  const y0 = 720 - 200 - (lines.length - 1) * lineH;
  return `
    ${bgOrFill(o, '#12101A')}
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x, y0 + i * lineH + 7, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.6" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

function rLiminal(o) {
  const playfair = font('playfair');
  const inter = font('inter600');
  const { lines, size } = fitLines(playfair, o.title, 64, 900, 36);
  const lineH = size + 20;
  const y0 = 620 - (lines.length - 1) * lineH;
  return `
    ${bgOrFill(o, '#3A3D42')}
    <rect width="1280" height="720" fill="#0E1013" opacity="0.35"/>
    ${lines.map((l, i) => {
    const w = adv(playfair, l, size);
    return `<path d="${playfair.getPath(l, 640 - w / 2, y0 + i * lineH, size).toPathData(1)}" fill="#EDEAE0" opacity="0.96"/>`;
  }).join('')}
    ${o.chip ? `<path d="${linePath(inter, o.chip.toUpperCase(), 56, 56, 14, 5).d}" fill="#EDEAE0" opacity="0.8"/>` : ''}`;
}

function rPOV(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 120, 1100, 68);
  const lineH = size + 8;
  return `
    ${bgOrFill(o, '#151A20')}
    <rect width="1280" height="230" fill="#000" opacity="0.55"/>
    ${lines.map((l, i) => accentLinePath(f, l.split(' '), 640 - adv(f, l, size) / 2, 100 + i * lineH + size, size, '#FFFFFF', o.accent, o.accentWord)).join('')}
    ${chipEl(o.chip, 56, 620, o.accent)}`;
}

function rIso(o) {
  const f = font('anton');
  const { lines, size } = fitLines(f, o.title, 110, 1000, 64);
  const lineH = size + 8;
  const y0 = 720 - 100 - (lines.length - 1) * lineH;
  return `
    ${bgOrFill(o, '#0F1420')}
    <rect width="1280" height="720" fill="#0A0E18" opacity="0.25"/>
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x + 4, y0 + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.55" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

function rMap(o) {
  const f = font('anton');
  const inter = font('inter600');
  const { lines, size } = fitLines(f, o.title, 116, 1000, 64);
  const lineH = size + 8;
  const y0 = 720 - 130 - (lines.length - 1) * lineH;
  const labels = (o.eyebrow ? o.eyebrow.split(/[,;]/) : ['ORIGIN', 'EXPANSION', 'TODAY']).slice(0, 3).map((s) => s.trim().toUpperCase());
  return `
    ${bgOrFill(o, '#0B1218')}
    <rect width="1280" height="720" fill="#060B10" opacity="0.3"/>
    <path d="M 160 480 C 400 380, 620 420, 780 330 S 1080 260, 1150 180" fill="none" stroke="${o.accent}" stroke-width="4" stroke-dasharray="14 10" opacity="0.9"/>
    ${[[160, 480], [780, 330], [1150, 180]].slice(0, Math.max(2, labels.length)).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="9" fill="${o.accent}"/>
      <path d="${linePath(inter, labels[i] || '', x + 14, y - 10, 15, 2).d}" fill="#FFF" opacity="0.95"/>`).join('')}
    ${lines.map((l, i) => {
    const x = 640 - adv(f, l, size) / 2;
    const sh = f.getPath(l, x + 4, y0 + i * lineH + 6, size).toPathData(1);
    const main = accentLinePath(f, l.split(' '), x, y0 + i * lineH, size, '#FFFFFF', o.accent, o.accentWord);
    return `<path d="${sh}" fill="#000" opacity="0.55" filter="url(#softShadow)"/>${main}`;
  }).join('')}
    ${chipEl(o.chip, 56, 48, o.accent)}`;
}

// ---- registry ----

export const TEMPLATES = {
  // CORE
  clean: { label: 'Clean Frame', desc: 'Full-bleed photo, bottom scrim, centered headline', category: 'core', needsPhoto: true, render: rClean },
  poster: { label: 'Bold Poster', desc: 'Shade panel + huge left headline', category: 'core', needsPhoto: false, render: rPoster },
  paper: { label: 'Paper Doc', desc: 'Warm paper, masked photo, serif + giant accent word', category: 'core', needsPhoto: false, render: rPaper },
  // PHOTO
  hero: { label: 'Hero Object', desc: 'Object right, dark text zone left', category: 'photo', needsPhoto: true, render: rHero, aiPreset: 'single {subject}, dramatic rim light, dark charcoal backdrop, subject on the right third, left third plain dark space, cinematic, no text' },
  statue: { label: 'Statue Close-Up', desc: 'Museum gold trim + serif kicker', category: 'photo', needsPhoto: true, render: rStatue, aiPreset: 'marble statue of Roman philosopher extreme close-up, dramatic side lighting, stormy dark sky, gold rim light, no text' },
  silhouette: { label: 'Silhouette Word', desc: 'Backlit figure, one giant accent word', category: 'photo', needsPhoto: true, render: rSilhouette, aiPreset: 'lone figure silhouette backlit by bright light through fog, heavy vignette, no text' },
  luxury: { label: 'Dark Luxury', desc: 'Near-black + serif headline + gold accent', category: 'photo', needsPhoto: false, render: rLuxury, aiPreset: '{subject} on dark silk, single amber rim light, deep shadows, editorial product photography, no text' },
  splitba: { label: 'Before / After', desc: 'Desaturated before, vivid after, accent divider', category: 'photo', needsPhoto: true, render: rSplitBA },
  vs: { label: 'VS Battle', desc: 'Photo vs accent panel, VS medallion center', category: 'photo', needsPhoto: true, render: rVS },
  collage: { label: 'Documentary Collage', desc: 'Layered photos + headline bar — Vox/Jani style', category: 'photo', needsPhoto: true, render: rCollage },
  newspaper: { label: 'Retro Newspaper', desc: 'Aged paper, duotone photo, serif masthead', category: 'photo', needsPhoto: true, render: rNewspaper, aiPreset: 'aged newspaper front page texture, halftone print, vintage, no readable text' },
  magazine: { label: 'Magazine Cover', desc: 'Masthead + cover lines + full-bleed subject', category: 'photo', needsPhoto: true, render: rMagazine },
  motion: { label: 'Motion Blur', desc: 'Speed streaks + tilted headline', category: 'photo', needsPhoto: true, render: rMotion, aiPreset: 'long exposure motion blur, {subject} streaking through frame, cinematic, no text' },
  annotate: { label: 'Hand-Drawn Notes', desc: 'Sketch circles/arrows over photo', category: 'photo', needsPhoto: true, render: rAnnotate },
  glass: { label: 'Glass Panel', desc: 'Frosted panel over vivid scene', category: 'photo', needsPhoto: true, render: rGlass, aiPreset: 'vivid aurora gradient background, flowing colors, dark edges, abstract, no text' },
  duotone: { label: 'Duotone Aurora', desc: 'Two-color photo treatment + glow', category: 'photo', needsPhoto: true, render: rDuotone },
  question: { label: 'Burning Question', desc: 'Serif italic question + giant accent ?', category: 'photo', needsPhoto: true, render: rQuestion },
  // TYPE
  bignum: { label: 'Giant Number', desc: 'Huge outlined number + short title', category: 'type', needsPhoto: false, render: rBigNum },
  equation: { label: 'Equation X = Y', desc: 'Pure-type equation with accent = sign', category: 'type', needsPhoto: false, render: rEquation },
  timeline: { label: 'Timeline', desc: 'Milestone nodes across a glowing line', category: 'type', needsPhoto: false, render: rTimeline },
  stats: { label: 'Stats Hero', desc: 'Giant stat + rising bars', category: 'type', needsPhoto: false, render: rStats },
  brutalist: { label: 'Brutalist Type', desc: 'Type fills the frame, acid accent, tilted', category: 'type', needsPhoto: false, render: rBrutalist },
  // AI
  anime: { label: 'Anime Panel', desc: 'AI anime scene + speed lines', category: 'ai', needsPhoto: false, render: rAnime, aiPreset: 'anime style dramatic panel, speed lines, bold ink shading, {subject}, no text' },
  soft3d: { label: 'Soft 3D Object', desc: 'Glossy 3D render on dark stage', category: 'ai', needsPhoto: false, render: rSoft3D, aiPreset: 'soft 3D render, glossy {subject}, studio lighting, dark backdrop, octane style, no text' },
  liminal: { label: 'Liminal Space', desc: 'Eerie empty atmosphere + quiet serif', category: 'ai', needsPhoto: false, render: rLiminal, aiPreset: 'liminal space, empty endless corridor, fluorescent hum, fog, desaturated, unsettling, no text' },
  pov: { label: 'POV Hands', desc: 'First-person hands + looming subject', category: 'ai', needsPhoto: false, render: rPOV, aiPreset: 'POV first person view, hands holding {subject}, looking ahead, cinematic, no text' },
  iso: { label: 'Isometric System', desc: 'Isometric diagram, glowing nodes', category: 'ai', needsPhoto: false, render: rIso, aiPreset: 'isometric 3D illustration of {subject} as a system, clean dark background, glowing nodes, no text' },
  map: { label: 'Map Strategy', desc: 'Dark map, glowing routes, markers', category: 'ai', needsPhoto: false, render: rMap, aiPreset: 'dark world map, glowing cyan route lines and city markers, top-down, strategic, no text' },
};

export function buildThumbSvg(template, opts) {
  const t = TEMPLATES[template] || TEMPLATES.clean;
  const o = {
    title: String(opts.title || 'Untitled story').trim(),
    accent: opts.accent || '#E8C15A',
    chip: String(opts.chip || '').slice(0, 26),
    eyebrow: String(opts.eyebrow || '').slice(0, 40),
    shade: opts.shade || '#0A1128',
    brand: String(opts.brand || '').slice(0, 28),
    photoHref: opts.photoHref || '',
  };
  o.accentWord = opts.accentWord || pickAccentWord(o.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">${DEFS}${t.render(o)}</svg>`;
}
