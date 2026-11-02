// Generates 150x150 transparent video watermarks -> yt-brands/watermarks/<slug>.png
// Usage: node yt-brands/gen-watermarks.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import { BRANDS } from './brands.mjs';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function monogram(label) {
  return label.split(/\s+/).filter(w => w.toUpperCase() !== 'THE').map(w => w[0]).join('').replace(/[^A-Z']/g, '').split('').filter(c => /[A-Z]/.test(c)).slice(0, 2).join('');
}

function watermarkSvg(b) {
  const S = 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <circle cx="75" cy="75" r="70" fill="#000000" fill-opacity="0.45"/>
  <circle cx="75" cy="75" r="70" fill="none" stroke="${b.accent}" stroke-width="7"/>
  <text x="75" y="99" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="62" letter-spacing="2" fill="${b.ink}" fill-opacity="0.92">${esc(monogram(b.label))}</text>
  <circle cx="75" cy="118" r="5" fill="${b.accent}"/>
</svg>`;
}

fs.mkdirSync('yt-brands/watermarks', { recursive: true });
for (const b of BRANDS) {
  await sharp(Buffer.from(watermarkSvg(b)), { density: 96 }).png().toFile(`yt-brands/watermarks/${b.slug}.png`);
  console.log('✓', `yt-brands/watermarks/${b.slug}.png`);
}
