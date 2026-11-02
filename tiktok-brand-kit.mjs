// TikTok branding kit for @muzzamilhassan16
// Generates 4 circle-safe 1080x1080 profile pictures + preview sheet + copy doc.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'tiktok-kit';
fs.mkdirSync(OUT, { recursive: true });

// ---------- shared SVG pieces ----------
const bg = `<radialGradient id="bg" cx="50%" cy="42%" r="75%">
  <stop offset="0%" stop-color="#191922"/><stop offset="100%" stop-color="#0a0a0f"/>
</radialGradient>`;
const gold = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#f7de8b"/><stop offset="55%" stop-color="#c9962e"/><stop offset="100%" stop-color="#f2d47c"/>
</linearGradient>`;
const fire = `<linearGradient id="fire" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0%" stop-color="#ff3d00"/><stop offset="100%" stop-color="#ffb800"/>
</linearGradient>`;
const steel = `<linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#e8eef6"/><stop offset="100%" stop-color="#9fb2c8"/>
</linearGradient>`;

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>${bg}${gold}${fire}${steel}</defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  ${inner}
</svg>`;
}

// ---------- V1: Quote Quarry gold monogram ----------
const v1 = frame(`
  <circle cx="540" cy="452" r="292" fill="none" stroke="url(#gold)" stroke-width="5" opacity="0.95"/>
  <circle cx="540" cy="452" r="322" fill="none" stroke="#c9962e" stroke-width="1.6" opacity="0.45"/>
  <circle cx="540" cy="452" r="262" fill="none" stroke="#c9962e" stroke-width="1.2" opacity="0.3"/>
  <text x="540" y="596" text-anchor="middle" font-family="Cinzel" font-weight="bold" font-size="380" fill="url(#gold)">Q</text>
  <rect x="360" y="812" width="360" height="2.5" fill="#c9962e" opacity="0.6"/>
  <text x="540" y="880" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="52" letter-spacing="20" fill="#e8d9a8">QUOTE QUARRY</text>
  <text x="551" y="944" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="30" letter-spacing="9" fill="#9d9478">DAILY MOTIVATION</text>
`);

// ---------- V2: Reliq North monogram ----------
const v2 = frame(`
  <circle cx="540" cy="452" r="292" fill="none" stroke="url(#steel)" stroke-width="5" opacity="0.9"/>
  <circle cx="540" cy="452" r="322" fill="none" stroke="#9fb2c8" stroke-width="1.6" opacity="0.4"/>
  <text x="540" y="596" text-anchor="middle" font-family="Cinzel" font-weight="bold" font-size="380" fill="url(#steel)">R</text>
  <rect x="360" y="812" width="360" height="2.5" fill="#9fb2c8" opacity="0.55"/>
  <text x="540" y="880" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="52" letter-spacing="20" fill="#dbe4ee">RELIQ NORTH</text>
  <text x="546" y="944" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="30" letter-spacing="9" fill="#8fa0b5">STOIC CALM</text>
`);

// ---------- V3: DAILY MOTIVATION bolt ----------
const v3 = frame(`
  <polygon points="540,220 430,510 510,510 460,700 660,420 570,420 640,220"
    fill="url(#fire)" opacity="0.97"/>
  <text x="540" y="800" text-anchor="middle" font-family="Anton" font-size="158" letter-spacing="4" fill="#f4f4f2">MOTIVATION</text>
  <text x="547" y="872" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="40" letter-spacing="26" fill="#ffb800">DAILY</text>
  <rect x="330" y="912" width="420" height="2.5" fill="#ffb800" opacity="0.45"/>
`);

// ---------- V4: MINDSET minimal ----------
const v4 = frame(`
  <circle cx="540" cy="540" r="470" fill="none" stroke="url(#gold)" stroke-width="4" opacity="0.85"/>
  <circle cx="540" cy="540" r="440" fill="none" stroke="#c9962e" stroke-width="1.4" opacity="0.35"/>
  <text x="540" y="330" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="34" letter-spacing="12" fill="#c9962e">EVERY DAMN DAY</text>
  <rect x="440" y="366" width="200" height="2.5" fill="#c9962e" opacity="0.6"/>
  <text x="540" y="580" text-anchor="middle" font-family="Anton" font-size="176" letter-spacing="6" fill="#f4f4f2">MINDSET</text>
  <text x="552" y="680" text-anchor="middle" font-family="Oswald" font-weight="400" font-size="34" letter-spacing="14" fill="#9d9478">QUOTES · MOTIVATION</text>
`);

// ---------- render ----------
const variants = [
  ['1-quote-quarry-gold', v1],
  ['2-reliq-north', v2],
  ['3-daily-motivation', v3],
  ['4-mindset-minimal', v4],
];
for (const [name, svg] of variants) {
  await sharp(Buffer.from(svg), { density: 96 }).png().toFile(path.join(OUT, `${name}.png`));
  console.log(`✓ ${OUT}/${name}.png`);
}

// ---------- preview sheet (2x2) ----------
const thumbs = await Promise.all(variants.map(([name]) =>
  sharp(path.join(OUT, `${name}.png`)).resize(540, 540).toBuffer()));
await sharp({ create: { width: 1080, height: 1080, channels: 3, background: '#000' } })
  .composite([
    { input: thumbs[0], left: 0, top: 0 },
    { input: thumbs[1], left: 540, top: 0 },
    { input: thumbs[2], left: 0, top: 540 },
    { input: thumbs[3], left: 540, top: 540 },
  ])
  .jpeg({ quality: 88 }).toFile(path.join(OUT, 'preview-sheet.jpg'));
console.log(`✓ ${OUT}/preview-sheet.jpg`);

// ---------- copy doc ----------
const nameOpts = [
  ['Quote Quarry | Motivation', 'RECOMMENDED — matches your YouTube (@quotequarry302) + IG (@quotequarry8) brand'],
  ['Daily Motivation Quotes', 'pure-search option, no brand tie'],
  ['Muzzamil | Daily Motivation', 'keeps your personal name + keyword'],
];
const bioOpts = [
  'Daily motivational quotes & cinematic reels to sharpen your mindset 🔥',
  'Powerful quotes on discipline, wealth & mindset. New reels every day ⚡',
  'Stoic wisdom · discipline · daily motivation 🏔️ New video every day',
  'New motivational reel every day 👇 Full videos on YouTube',
];
const lines = [];
lines.push(`# TikTok Branding Kit — @muzzamilhassan16`);
lines.push('');
lines.push(`Generated ${new Date().toISOString().slice(0, 10)}. Everything below is copy-paste ready.`);
lines.push('');
lines.push(`## What TikTok's profile asks for (full checklist)`);
lines.push('');
lines.push(`| Field | Limit / spec | Your value |`);
lines.push(`|---|---|---|`);
lines.push(`| Username | ≤24 chars, lowercase letters/numbers/._ | keep \`muzzamilhassan16\` |`);
lines.push(`| Name (nickname) | ≤30 chars — SEARCHABLE, put keywords here | see options below |`);
lines.push(`| Bio | ≤80 chars | see options below |`);
lines.push(`| Profile photo | JPG/PNG, shows as a CIRCLE | use any png in tiktok-kit/ (1080×1080, circle-safe) |`);
lines.push(`| Link | Business account (or 1k+ followers) | https://www.youtube.com/@quotequarry302 |`);
lines.push(`| Category (business) | pick one | Digital creator |`);
lines.push('');
lines.push(`## Name (pick ONE)`);
lines.push('');
for (const [n, why] of nameOpts) lines.push(`- \`${n}\` (${n.length}/30) — ${why}`);
lines.push('');
lines.push(`## Bio (pick ONE, all ≤80 chars)`);
lines.push('');
for (const b of bioOpts) lines.push(`- \`${b}\` (${b.length}/80)`);
lines.push('');
lines.push(`## Profile pictures`);
lines.push('');
lines.push(`Open each PNG in tiktok-kit/ and pick one (they render as a circle on TikTok):`);
lines.push('');
lines.push(`1. \`1-quote-quarry-gold.png\` — gold Q monogram, matches your YouTube/IG brand`);
lines.push(`2. \`2-reliq-north.png\` — silver R monogram, matches your Facebook page brand`);
lines.push(`3. \`3-daily-motivation.png\` — lightning bolt, boldest at small sizes`);
lines.push(`4. \`4-mindset-minimal.png\` — MINDSET wordmark, cleanest look`);
lines.push('');
lines.push(`## How to apply (5 minutes, in the TikTok app)`);
lines.push('');
lines.push(`1. Profile → **Edit profile** → paste Name → paste Bio`);
lines.push(`2. **Change photo** → upload the PNG you picked (it uploads as square, displays as circle — already designed for that)`);
lines.push(`3. Settings → **Account → Switch to Business Account** (free, unlocks the website link + analytics; pick category "Digital creator")`);
lines.push(`4. Back in Edit profile → **Website** → paste your YouTube link`);
lines.push('');
lines.push(`## TikTok SEO rules baked into this kit`);
lines.push('');
lines.push(`- **Name field is searched** — that's why "Motivation" sits in it, not just a brand word`);
lines.push(`- **Bio keywords**: "motivational quotes", "mindset", "discipline" — the 3 phrases your audience actually searches`);
lines.push(`- **Captions**: put the main keyword in the first 100 chars, then 3–5 hashtags mixing broad (#motivation #quotes) + specific (#stoicism #dailymotivation #mindsetquotes)`);
lines.push(`- **Say keywords out loud** in reels — TikTok indexes spoken words for search`);
lines.push(`- **Post windows (PKT)**: ~2pm, ~9pm, and the 5–7am US-audience slot your machine already targets`);
lines.push('');
lines.push(`## Connect auto-posting`);
lines.push('');
lines.push(`Your Zernio TikTok integration auto-discovers accounts. Log into @muzzamilhassan16 in Zernio once and it joins the same posting flow as @munnabhai3483 (with the +3h reschedule safety net).`);
lines.push('');
await fs.promises.writeFile('tiktok-brand-kit.md', lines.join('\n'));
console.log('✓ tiktok-brand-kit.md');
console.log('\nBio char counts:', bioOpts.map(b => `${b.length}/80`).join(', '));
console.log('Name char counts:', nameOpts.map(([n]) => `${n.length}/30`).join(', '));
