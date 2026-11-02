// codecard-v2.js — premium code cards (Playfair/Cormorant/Inter/Archivo/Cinzel/Space Mono).
// Fonts ship in image-tools/fonts/ (installed via fontconfig in Dockerfile & CI workflow).
"use strict";

const F = {
  serif: "'Playfair Display', Georgia, 'Liberation Serif', serif",
  garamond: "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
  sans: "'Inter', 'Liberation Sans', Arial, sans-serif",
  heavy: "'Archivo Black', 'Liberation Sans', sans-serif",
  mono: "'Space Mono', 'Liberation Mono', monospace",
  cinzel: "'Cinzel', 'Playfair Display', serif"
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const v2W = (t, size, factor, ls = 0) => [...t].length * factor * size + Math.max(0, [...t].length - 1) * ls * size;
const v2Fit = (lines, max, inner, factor = 0.52, ls = 0) => {
  const longest = lines.reduce((a, b) => (v2W(b, 1, factor, ls) > v2W(a, 1, factor, ls) ? b : a));
  return Math.max(40, Math.min(max, Math.floor(inner / v2W(longest, 1, factor, ls))));
};
const v2Title = (t) => String(t).toLowerCase().split(/\s+/).map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const v2Wrap = (text, maxChars, maxLines = 3) => {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines - 1);
    kept.push(lines.slice(maxLines - 1).join(' '));
    return kept;
  }
  return lines;
};
const v2Clip = (t, n) => { t = String(t).trim(); return t.length <= n ? t : t.slice(0, n - 1).trim() + '…'; };
const v2Line = (x, y, line, o = {}) => {
  let inner = esc(line);
  if (o.accentLast && line.includes(' ')) {
    const li = line.lastIndexOf(' ');
    inner = esc(line.slice(0, li + 1)) + `<tspan fill="${o.accent}">${esc(line.slice(li + 1))}</tspan>`;
  }
  return `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" font-family="${o.f || F.serif}" font-weight="${o.w || 700}" ${o.it ? 'font-style="italic" ' : ''}font-size="${o.fs}" fill="${o.fill}" letter-spacing="${o.ls || 0}">${inner}</text>`;
};
const v2Tag = (x, y, s, fill, fs = 26, f = F.sans) =>
  s ? `<text x="${x}" y="${y}" text-anchor="middle" font-family="${f}" font-weight="600" font-size="${fs}" fill="${fill}" letter-spacing="10">${esc(s)}</text>` : '';

function buildCodeCardV2({ headline, takeaway, tag, style, themeIdx }) {
  const W = 1080, H = 1350, CX = 540;
  const rawHead = String(headline || 'Make it count').replace(/\s+/g, ' ').trim();
  const sub = v2Clip(takeaway || '', 56);
  const top = v2Clip(String(tag || '').toUpperCase(), 24);
  const T = (themes) => themes[((themeIdx % themes.length) + themes.length) % themes.length];
  const serifHead = v2Title(rawHead);
  let body = '';

  // 1 GOLD LUX — cream radial gradient, triple hairline ellipse, refined crown
  if (style === 'gold-lux') {
    const t = T([
      { bg1: '#faf6ec', bg2: '#efe6d2', ink: '#2b2416', ac: '#a87f2e', sub: '#8a6f37' },
      { bg1: '#f8f1e6', bg2: '#eadfc9', ink: '#2d2113', ac: '#9c7526', sub: '#7f6530' },
      { bg1: '#fbf7f0', bg2: '#f0e8d8', ink: '#282216', ac: '#b08a33', sub: '#8f7440' }
    ]);
    const lines = v2Wrap(serifHead, 15, 2);
    const s = v2Fit(lines, 118, 740, 0.52);
    const y0 = 640 - ((lines.length - 1) * s * 0.62);
    body = `<defs><radialGradient id="bg" cx="0.5" cy="0.42" r="0.9"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<ellipse cx="${CX}" cy="690" rx="452" ry="512" fill="none" stroke="${t.ac}" stroke-width="1.6"/>
<ellipse cx="${CX}" cy="690" rx="428" ry="488" fill="none" stroke="${t.ac}" stroke-opacity="0.55" stroke-width="1"/>
<ellipse cx="${CX}" cy="690" rx="404" ry="464" fill="none" stroke="${t.ac}" stroke-opacity="0.25" stroke-width="0.8"/>
${v2Tag(CX, 268, top, t.sub, 30)}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.24, l, { w: 800, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.ac })).join('')}
<path d="M 498 862 L 498 838 L 517 854 L 540 828 L 563 854 L 582 838 L 582 862 Z" fill="none" stroke="${t.ac}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="540" cy="828" r="4.5" fill="${t.ac}"/>
${sub ? v2Line(CX, 1074, sub, { f: F.garamond, w: 600, it: true, fs: 46, fill: t.sub }) : ''}`;
  }
  // 2 MIDNIGHT COPPER — vignette, double border, crescent + stars, Cormorant italic
  else if (style === 'midnight-copper') {
    const t = T([
      { bg1: '#111c30', bg2: '#070d1a', ink: '#ede7db', ac: '#cd8a52', sub: '#cd8a52' },
      { bg1: '#20162e', bg2: '#100a1a', ink: '#eae2ee', ac: '#cf9258', sub: '#cf9258' },
      { bg1: '#0f2427', bg2: '#071416', ink: '#e2ebe9', ac: '#d09a5e', sub: '#d09a5e' }
    ]);
    const lines = v2Wrap(serifHead, 16, 2);
    const s = v2Fit(lines, 96, 800, 0.5);
    const y0 = 660 - ((lines.length - 1) * s * 0.62);
    body = `<defs><radialGradient id="bg" cx="0.5" cy="0.4" r="0.95"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${t.ac}" stroke-width="2"/>
<rect x="54" y="54" width="${W - 108}" height="${H - 108}" fill="none" stroke="${t.ac}" stroke-opacity="0.55" stroke-width="1"/>
${v2Tag(CX, 168, top, t.sub, 28)}
<path d="M 566 322 A 56 56 0 1 0 566 418 A 45 45 0 1 1 566 322 Z" fill="${t.ac}"/>
<path d="M 402 356 l 3.5,9 9,3.5 -9,3.5 -3.5,9 -3.5,-9 -9,-3.5 9,-3.5 Z" fill="${t.ac}" fill-opacity="0.8"/>
<path d="M 686 424 l 3,7.5 7.5,3 -7.5,3 -3,7.5 -3,-7.5 -7.5,-3 7.5,-3 Z" fill="${t.ac}" fill-opacity="0.55"/>
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.28, l, { f: F.garamond, w: 600, it: true, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.ac })).join('')}
${sub ? `<line x1="392" y1="908" x2="492" y2="908" stroke="${t.ac}" stroke-opacity="0.7" stroke-width="1.4"/><path d="M 540 896 L 552 908 L 540 920 L 528 908 Z" fill="none" stroke="${t.ac}" stroke-width="1.6"/><line x1="588" y1="908" x2="688" y2="908" stroke="${t.ac}" stroke-opacity="0.7" stroke-width="1.4"/>` + v2Line(CX, 1010, sub, { f: F.garamond, w: 500, it: true, fs: 42, fill: t.sub }) : ''}
${v2Tag(CX, 1176, 'START SMALL', t.ac, 26)}`;
  }
  // 3 PAPER SHADOW — tilted card, Playfair quote glyph, deep shadow
  else if (style === 'paper-shadow') {
    const t = T([
      { bg: '#e8e5df', ink: '#26292e', ac: '#a87f2e', sub: '#6f6a61' },
      { bg: '#e6e1d7', ink: '#2e2b24', ac: '#96702a', sub: '#6b665c' },
      { bg: '#e1e5e9', ink: '#232a33', ac: '#7d6a3a', sub: '#616a75' }
    ]);
    const lines = v2Wrap(serifHead, 14, 2);
    const s = v2Fit(lines, 96, 640, 0.52);
    const y0 = 660 - ((lines.length - 1) * s * 0.62);
    body = `<defs><filter id="sh2" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="14" dy="20" stdDeviation="24" flood-color="#00000038"/></filter></defs>
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<g transform="rotate(-1.8 540 675)" filter="url(#sh2)"><rect x="128" y="196" width="824" height="958" fill="#fdfcfb"/></g>
<g transform="rotate(-1.8 540 675)">
<text x="196" y="474" font-family="${F.serif}" font-style="italic" font-weight="800" font-size="230" fill="#ddd6c8">\u201C</text>
${v2Tag(CX, 520, top, t.sub, 26)}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.3, l, { w: 800, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.ac })).join('')}
${sub ? `<line x1="438" y1="${y0 + (lines.length - 1) * s * 1.3 + 96}" x2="642" y2="${y0 + (lines.length - 1) * s * 1.3 + 96}" stroke="#c8c2b4" stroke-width="2"/>` + v2Line(CX, y0 + (lines.length - 1) * s * 1.3 + 168, sub, { f: F.garamond, w: 600, it: true, fs: 44, fill: t.sub }) : ''}
</g>`;
  }
  // 4 INK MINIMAL — huge Playfair, rough underline
  else if (style === 'ink-minimal') {
    const t = T([
      { bg: '#fbfaf7', ink: '#15130f', ac: '#15130f', sub: '#a49e93' },
      { bg: '#f7f3ea', ink: '#191612', ac: '#191612', sub: '#a59d8d' },
      { bg: '#eff2f4', ink: '#141a20', ac: '#141a20', sub: '#96a0a9' }
    ]);
    const lines = v2Wrap(serifHead, 13, 2);
    const s = v2Fit(lines, 128, 880, 0.52);
    const y0 = 640 - ((lines.length - 1) * s * 0.62);
    body = `<rect width="${W}" height="${H}" fill="${t.bg}"/>
${top ? `<text x="120" y="150" font-family="${F.mono}" font-size="24" fill="${t.sub}" letter-spacing="5">${esc(top)}</text>` : ''}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.18, l, { w: 800, fs: s, fill: t.ink })).join('')}
<path d="M 420 ${y0 + (lines.length - 1) * s * 1.18 + 84} q 80 18 160 3 t 130 -6" stroke="${t.ac}" stroke-width="7" fill="none" stroke-linecap="round"/>
${sub ? v2Line(CX, 1042, sub, { f: F.garamond, w: 500, it: true, fs: 44, fill: '#5f5a50' }) : ''}
<rect x="533" y="1150" width="14" height="14" fill="${t.ink}"/>`;
  }
  // 5 PURPLE MYSTIC — Cormorant italic, radiating star, glow vignette
  else if (style === 'purple-mystic') {
    const t = T([
      { bg1: '#231a42', bg2: '#120c24', ink: '#e9e3fa', ac: '#b9a7ff', sub: '#9d8ee0' },
      { bg1: '#182046', bg2: '#0b1028', ink: '#e3e8fb', ac: '#a7b8ff', sub: '#8e9de0' },
      { bg1: '#2e1533', bg2: '#170a1c', ink: '#fae9f4', ac: '#e7a7d8', sub: '#d08ec2' }
    ]);
    const lines = v2Wrap(serifHead, 15, 2);
    const s = v2Fit(lines, 100, 800, 0.44);
    const y0 = 660 - ((lines.length - 1) * s * 0.62);
    body = `<defs><radialGradient id="bg" cx="0.5" cy="0.42" r="0.85"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g stroke="${t.ac}" stroke-opacity="0.35" stroke-width="1">
<line x1="540" y1="360" x2="540" y2="240"/><line x1="540" y1="360" x2="624" y2="258"/><line x1="540" y1="360" x2="456" y2="258"/><line x1="540" y1="360" x2="654" y2="334"/><line x1="540" y1="360" x2="426" y2="334"/>
</g>
<path d="M 540 300 L 557 343 L 600 360 L 557 377 L 540 420 L 523 377 L 480 360 L 523 343 Z" fill="${t.ac}"/>
${v2Tag(CX, 172, top, t.sub, 26)}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.3, l, { f: F.garamond, w: 600, it: true, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.ac })).join('')}
${sub ? `<line x1="386" y1="918" x2="486" y2="918" stroke="${t.sub}" stroke-opacity="0.6" stroke-width="1.4"/><circle cx="540" cy="918" r="4.5" fill="${t.ac}"/><line x1="594" y1="918" x2="694" y2="918" stroke="${t.sub}" stroke-opacity="0.6" stroke-width="1.4"/>` + v2Line(CX, 1020, sub, { f: F.garamond, w: 500, it: true, fs: 42, fill: t.sub }) : ''}`;
  }
  // 6 TEAL TECH — Archivo Black stack, grid crosses, Space Mono tags
  else if (style === 'teal-tech') {
    const t = T([
      { bg: '#e2f2f0', ink: '#0e3a34', ac: '#0d8a7f', sub: '#0d5f59' },
      { bg: '#e4f4e8', ink: '#113a26', ac: '#0d8a55', sub: '#0d5f42' },
      { bg: '#e1edf8', ink: '#122740', ac: '#0d6e8a', sub: '#0d5160' }
    ]);
    const lines = v2Wrap(rawHead.toUpperCase(), 12, 3);
    const s = v2Fit(lines, 108, 820, 0.64);
    const y0 = 640 - ((lines.length - 1) * s * 0.6);
    const cross = (x, y) => `<path d="M ${x - 9} ${y} h 18 M ${x} ${y - 9} v 18" stroke="${t.sub}" stroke-opacity="0.45" stroke-width="1.6"/>`;
    body = `<rect width="${W}" height="${H}" fill="${t.bg}"/>
<rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="${t.sub}" stroke-opacity="0.5" stroke-width="1.6"/>
${cross(100, 100)}${cross(980, 100)}${cross(100, 1250)}${cross(980, 1250)}
${top ? `<text x="540" y="176" text-anchor="middle" font-family="${F.mono}" font-size="28" fill="${t.sub}" letter-spacing="7">${esc(top)}</text>` : ''}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.32, l, { f: F.heavy, w: 400, fs: s, fill: i === lines.length - 1 && lines.length > 1 ? t.ac : t.ink, ls: Math.round(s * 0.02) })).join('')}
<path d="M 292 816 l 28 -22 v 44 Z" fill="${t.sub}"/><path d="M 788 816 l -28 -22 v 44 Z" fill="${t.sub}"/>
${sub ? `<text x="540" y="1098" text-anchor="middle" font-family="${F.mono}" font-size="27" fill="${t.sub}">${esc(sub)}</text>` : ''}`;
  }
  // 7 PINK SOFT — Cormorant, six-petal blossom, soft gradient
  else if (style === 'pink-soft') {
    const t = T([
      { bg1: '#f7e3ea', bg2: '#efd4de', ink: '#7c2140', ac: '#e5a8bd', sub: '#b06a85' },
      { bg1: '#eee4f8', bg2: '#e2d2f2', ink: '#4a2a7c', ac: '#c4a8ea', sub: '#8a6ab0' },
      { bg1: '#faece0', bg2: '#f4dccc', ink: '#7c4a21', ac: '#eac4a4', sub: '#b0836a' }
    ]);
    const lines = v2Wrap(serifHead, 15, 2);
    const s = v2Fit(lines, 108, 830, 0.42);
    const y0 = 660 - ((lines.length - 1) * s * 0.62);
    body = `<defs><radialGradient id="bg" cx="0.5" cy="0.4" r="0.95"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="540" cy="318" rx="21" ry="46" fill="${t.ac}" transform="rotate(${a} 540 318)"/>`).join('')}
<circle cx="540" cy="318" r="15" fill="${t.ink}"/>
${v2Tag(CX, 478, top, t.sub, 26)}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.28, l, { f: F.garamond, w: 600, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.sub })).join('')}
${sub ? `<line x1="408" y1="${y0 + (lines.length - 1) * s * 1.28 + 130}" x2="672" y2="${y0 + (lines.length - 1) * s * 1.28 + 130}" stroke="${t.sub}" stroke-width="2.4" stroke-dasharray="2 9" stroke-linecap="round"/>` + v2Line(CX, y0 + (lines.length - 1) * s * 1.28 + 200, sub, { f: F.garamond, w: 500, it: true, fs: 44, fill: t.sub }) : ''}`;
  }
  // 8 ELECTRIC BLUE — gradient, bolt, Inter ExtraBold Italic
  else if (style === 'electric-blue') {
    const t = T([
      { bg1: '#2a4bb4', bg2: '#152a72', ink: '#ffffff', ac: '#ffd166', sub: '#cdd9ff' },
      { bg1: '#33407f', bg2: '#1a2050', ink: '#ffffff', ac: '#ffd166', sub: '#c9d0f2' },
      { bg1: '#1d4266', bg2: '#0f2440', ink: '#ffffff', ac: '#ffc46b', sub: '#c4d9ea' }
    ]);
    const lines = v2Wrap(rawHead.toUpperCase(), 12, 2);
    const s = v2Fit(lines, 104, 840, 0.56);
    const y0 = 660 - ((lines.length - 1) * s * 0.62);
    body = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<line x1="84" y1="146" x2="262" y2="206" stroke="#ffffff" stroke-opacity="0.4" stroke-width="5"/>
<line x1="84" y1="226" x2="222" y2="272" stroke="#ffffff" stroke-opacity="0.28" stroke-width="5"/>
<line x1="84" y1="306" x2="182" y2="340" stroke="#ffffff" stroke-opacity="0.16" stroke-width="5"/>
<path d="M 726 292 L 660 420 L 714 420 L 648 548 L 792 396 L 732 396 Z" fill="${t.ac}"/>
${v2Tag(CX, 196, top, t.sub, 27)}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.26, l, { f: F.sans, w: 800, it: true, fs: s, fill: t.ink })).join('')}
${sub ? `<line x1="424" y1="${y0 + (lines.length - 1) * s * 1.26 + 112}" x2="656" y2="${y0 + (lines.length - 1) * s * 1.26 + 112}" stroke="${t.ac}" stroke-width="4.5"/>` + v2Line(CX, y0 + (lines.length - 1) * s * 1.26 + 182, sub, { f: F.garamond, w: 500, it: true, fs: 42, fill: t.sub }) : ''}`;
  }
  // 9 WAX STAMP — Cormorant + double-ring stamp + Cinzel label
  else if (style === 'wax-stamp') {
    const t = T([
      { bg: '#f8f3ea', ink: '#2d2a24', ac: '#b0372e', sub: '#8a8578' },
      { bg: '#f5f1e5', ink: '#2b2820', ac: '#a83a30', sub: '#87816d' },
      { bg: '#fbf7ef', ink: '#33302a', ac: '#b5453a', sub: '#908a7a' }
    ]);
    const lines = v2Wrap(serifHead, 16, 2);
    const s = v2Fit(lines, 96, 840, 0.42);
    const y0 = 560 - ((lines.length - 1) * s * 0.62);
    const stampWord = sub ? v2Clip(sub, 14).toUpperCase() : 'APPROVED';
    body = `<rect width="${W}" height="${H}" fill="${t.bg}"/>
${v2Tag(CX, 196, top, t.sub, 26, F.cinzel)}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.28, l, { f: F.garamond, w: 600, fs: s, fill: t.ink })).join('')}
<g transform="rotate(-8 540 926)">
<circle cx="540" cy="926" r="104" fill="${t.ac}"/>
<circle cx="540" cy="926" r="82" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="2.2"/>
<circle cx="540" cy="926" r="74" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1"/>
<text x="540" y="916" text-anchor="middle" font-family="${F.cinzel}" font-weight="700" font-size="34" fill="#ffffff" letter-spacing="4">OK\u2019D</text>
<text x="540" y="956" text-anchor="middle" font-family="${F.sans}" font-weight="600" font-size="17" fill="#f2cfc9" letter-spacing="3">${esc(stampWord)}</text>
</g>
${sub ? v2Line(CX, 1148, sub, { f: F.garamond, w: 500, it: true, fs: 42, fill: t.sub }) : ''}`;
  }
  // 10 NOIR FRAME — demo-quote-card faithful, Playfair + vignette + gem divider
  else if (style === 'noir-frame') {
    const t = T([
      { bg1: '#161619', bg2: '#08080a', ink: '#f5f2ea', ac: '#f0c25a', sub: '#9a948a' },
      { bg1: '#1d1d22', bg2: '#0d0d10', ink: '#f2ede3', ac: '#e8b64c', sub: '#8f8a80' },
      { bg1: '#1a1512', bg2: '#0b0908', ink: '#f2ead9', ac: '#d9a944', sub: '#8a8072' }
    ]);
    const lines = v2Wrap(serifHead, 17, 3);
    const s = v2Fit(lines, 104, 860, 0.52);
    const y0 = 560 - ((lines.length - 1) * s * 0.6);
    body = `<defs><radialGradient id="bg" cx="0.5" cy="0.42" r="0.9"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="44" y="44" width="992" height="1262" fill="none" stroke="${t.ac}" stroke-opacity="0.55" stroke-width="2"/>
<rect x="57" y="57" width="966" height="1236" fill="none" stroke="${t.ac}" stroke-opacity="0.2" stroke-width="1"/>
${top ? `<text x="540" y="152" text-anchor="middle" font-family="${F.cinzel}" font-weight="700" font-size="30" fill="${t.ac}" letter-spacing="10">\u2014 ${esc(top)} \u2014</text>` : ''}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.32, l, { w: 800, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.ac })).join('')}
<line x1="336" y1="918" x2="486" y2="918" stroke="${t.ac}" stroke-opacity="0.6" stroke-width="2"/>
<g transform="translate(540,918)"><polygon points="-17,-5 -8,-15 8,-15 17,-5 0,17" fill="none" stroke="${t.ac}" stroke-width="2.6" stroke-linejoin="round"/></g>
<line x1="594" y1="918" x2="744" y2="918" stroke="${t.ac}" stroke-opacity="0.6" stroke-width="2"/>
${sub ? v2Line(CX, 1032, sub, { f: F.garamond, w: 600, it: true, fs: 48, fill: t.sub }) : ''}`;
  }
  // 11 LABEL SERIF — corner-L frame, Cinzel labels, accent last word
  else {
    const t = T([
      { bg1: '#15151a', bg2: '#0b0b0e', ink: '#f2ede3', ac: '#c9a54e', sub: '#c9a54e' },
      { bg1: '#16281e', bg2: '#0c1712', ink: '#e9f2ea', ac: '#b9c98a', sub: '#b9c98a' },
      { bg1: '#28141d', bg2: '#150a10', ink: '#f2e6ea', ac: '#c98aa5', sub: '#c98aa5' }
    ]);
    const lines = v2Wrap(serifHead, 15, 2);
    const s = v2Fit(lines, 118, 820, 0.52);
    const y0 = 620 - ((lines.length - 1) * s * 0.62);
    const bottom = sub ? v2Clip(sub, 26).toUpperCase() : 'DAILY WISDOM';
    body = `<defs><radialGradient id="bg" cx="0.5" cy="0.42" r="0.9"><stop offset="0%" stop-color="${t.bg1}"/><stop offset="100%" stop-color="${t.bg2}"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="46" y="46" width="988" height="1258" fill="none" stroke="${t.ac}" stroke-opacity="0.7" stroke-width="1.6"/>
<path d="M 46 108 L 46 46 L 108 46" fill="none" stroke="${t.ac}" stroke-width="4"/>
<path d="M 972 46 L 1034 46 L 1034 108" fill="none" stroke="${t.ac}" stroke-width="4"/>
<path d="M 1034 1242 L 1034 1304 L 972 1304" fill="none" stroke="${t.ac}" stroke-width="4"/>
<path d="M 108 1304 L 46 1304 L 46 1242" fill="none" stroke="${t.ac}" stroke-width="4"/>
${top ? `<text x="540" y="214" text-anchor="middle" font-family="${F.cinzel}" font-weight="700" font-size="36" fill="${t.ac}" letter-spacing="12">${esc(top)}</text>` : ''}
${lines.map((l, i) => v2Line(CX, y0 + i * s * 1.26, l, { w: 800, fs: s, fill: t.ink, accentLast: i === lines.length - 1, accent: t.ac })).join('')}
<line x1="424" y1="936" x2="512" y2="936" stroke="${t.ac}" stroke-opacity="0.7" stroke-width="1.6"/>
<path d="M 540 923 L 553 936 L 540 949 L 527 936 Z" fill="none" stroke="${t.ac}" stroke-width="1.8" stroke-linejoin="round"/>
<line x1="568" y1="936" x2="656" y2="936" stroke="${t.ac}" stroke-opacity="0.7" stroke-width="1.6"/>
<text x="540" y="1164" text-anchor="middle" font-family="${F.cinzel}" font-weight="700" font-size="34" fill="${t.ac}" letter-spacing="12">${esc(bottom)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

module.exports = { buildCodeCardV2 };
