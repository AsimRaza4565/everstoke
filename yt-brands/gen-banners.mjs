// Renders a 2560x1440 channel banner per brand -> yt-brands/banners/<slug>.jpg
// All text sits inside YouTube's 1546x423 center safe area (mobile-visible).
// Usage: node yt-brands/gen-banners.mjs [slug]
import sharp from 'sharp';
import fs from 'node:fs';
import { BRANDS } from './brands.mjs';

const W = 2560, H = 1440;
const SAFE_X = (W - 1546) / 2, SAFE_Y = (H - 423) / 2; // 507, 508.5

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function bannerSvg(b) {
  // vertical layout, centered on the safe band
  const cx = W / 2;
  const eyebrowY = SAFE_Y + 62;
  const labelY = SAFE_Y + 208;
  const tagY = SAFE_Y + 290;
  const ruleY = SAFE_Y + 340;
  const kwY = SAFE_Y + 386;
  const labelSize = b.label.length > 17 ? 104 : b.label.length > 13 ? 122 : 138;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="62%">
      <stop offset="0%" stop-color="${b.accent}" stop-opacity="0.16"/>
      <stop offset="55%" stop-color="${b.accent}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${b.bg}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${b.bg}"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="${SAFE_X}" y="${SAFE_Y}" width="1546" height="423" fill="none" stroke="${b.accent}" stroke-opacity="0.55" stroke-width="3"/>
  <rect x="${SAFE_X + 14}" y="${SAFE_Y + 14}" width="1518" height="395" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="1"/>
  <text x="${cx}" y="${eyebrowY}" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="34" letter-spacing="12" fill="${b.accent}">${esc(b.eyebrow)}</text>
  <text x="${cx}" y="${labelY}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${labelSize}" letter-spacing="6" fill="${b.ink}">${esc(b.label)}</text>
  <text x="${cx}" y="${tagY}" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="40" font-style="italic" letter-spacing="3" fill="${b.ink}" fill-opacity="0.85">${esc(b.tagline)} &#8226; DAILY SHORTS</text>
  <line x1="${cx - 330}" y1="${ruleY}" x2="${cx - 20}" y2="${ruleY}" stroke="${b.accent}" stroke-width="3" stroke-opacity="0.9"/>
  <line x1="${cx + 20}" y1="${ruleY}" x2="${cx + 330}" y2="${ruleY}" stroke="${b.accent}" stroke-width="3" stroke-opacity="0.9"/>
  <circle cx="${cx}" cy="${ruleY}" r="7" fill="${b.accent}"/>
  <text x="${cx}" y="${kwY}" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="30" letter-spacing="8" fill="${b.ink}" fill-opacity="0.6">${esc(b.tags.slice(0, 4).join('  •  ').toUpperCase())}</text>
</svg>`;
}

function monogram(label) {
  return label.split(/\s+/).filter(w => w.toUpperCase() !== 'THE').map(w => w[0]).join('').replace(/[^A-Z']/g, '').split('').filter(c => /[A-Z]/.test(c)).slice(0, 2).join('');
}

function avatarSvg(b) {
  const S = 800;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <radialGradient id="g" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="${b.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${b.bg}"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#g)"/>
  <circle cx="400" cy="400" r="330" fill="none" stroke="${b.accent}" stroke-width="14"/>
  <circle cx="400" cy="400" r="292" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="3"/>
  <text x="400" y="478" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="300" letter-spacing="6" fill="${b.ink}">${esc(monogram(b.label))}</text>
  <circle cx="400" cy="592" r="16" fill="${b.accent}"/>
</svg>`;
}

fs.mkdirSync('yt-brands/banners', { recursive: true });
fs.mkdirSync('yt-brands/avatars', { recursive: true });
const list = process.argv[2] ? [BRANDS.find(b => b.slug === process.argv[2])] : BRANDS;
for (const b of list) {
  if (!b) { console.error('no such slug'); process.exit(1); }
  const file = `yt-brands/banners/${b.slug}.jpg`;
  await sharp(Buffer.from(bannerSvg(b)), { density: 96 }).jpeg({ quality: 90 }).toFile(file);
  await sharp(Buffer.from(avatarSvg(b)), { density: 96 }).jpeg({ quality: 90 }).toFile(`yt-brands/avatars/${b.slug}.jpg`);
  console.log('✓', file, '+', `yt-brands/avatars/${b.slug}.jpg`);
}
