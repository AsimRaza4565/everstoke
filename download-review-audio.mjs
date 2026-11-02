// download-review-audio.mjs — downloads every track in the approval menu to
// music-review/ so the user can LISTEN before approving. Organizes per channel:
//   music-review/ch-01-quotequarry/01 - Skye Cuillin.mp3  (+ playlist.m3u)
// Unique tracks are stored once in music-review/_lib/ and hardlinked into the
// channel folders. Safe to re-run: finished downloads are skipped.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { buildMenu, CHANNELS } from './build-music-menu.mjs';

const MP3_BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const ROOT = 'music-review';
const LIB = path.join(ROOT, '_lib');

const menu = buildMenu();
fs.mkdirSync(LIB, { recursive: true });

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();

// title -> catalog track (for the download URL)
const catalog = JSON.parse(fs.readFileSync('.music-cache/pieces.json', 'utf8'));
const byTitle = new Map(catalog.map((t) => [String(t.title).trim(), t]));

// unique download jobs across all channels
const jobs = new Map(); // slug -> {title, track, libFile}
for (const ch of CHANNELS) {
  for (const t of menu[ch.slug]) {
    const title = String(t.title).trim();
    const slug = slugify(title);
    if (!jobs.has(slug)) jobs.set(slug, { title, track: byTitle.get(title), libFile: path.join(LIB, `inc-${slug}.mp3`) });
  }
}

function httpsGet(url, maxBytes = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { req.destroy(); return reject(new Error('too large')); } chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const valid = (f) => { try { return fs.statSync(f).size >= 300000; } catch { return false; } };

async function download(job) {
  if (valid(job.libFile)) return 'cached';
  if (!job.track?.filename) return 'no-filename';
  const url = MP3_BASE + encodeURIComponent(job.track.filename);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await httpsGet(url);
      fs.writeFileSync(job.libFile, buf);
      return 'downloaded';
    } catch (e) {
      if (attempt === 3) return `FAILED: ${e.message}`;
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
}

const list = [...jobs.values()];
let done = 0; let ok = 0; const failures = [];
const CONCURRENCY = 3;
let cursor = 0;
const t0 = Date.now();
async function worker() {
  while (cursor < list.length) {
    const job = list[cursor++];
    const res = await download(job);
    done++;
    if (res === 'cached' || res === 'downloaded') ok++;
    else failures.push(`${job.title} -> ${res}`);
    if (done % 10 === 0 || done === list.length) {
      const mb = (list.slice(0, done).reduce ? 0 : 0);
      console.log(`[${done}/${list.length}] ok=${ok} fail=${failures.length} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
}
console.log(`[music-review] ${list.length} unique tracks to prepare, ${CONCURRENCY} at a time...`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// channel folders with numbered files + playlists
const reviewRoot = path.resolve(ROOT);
for (let c = 0; c < CHANNELS.length; c++) {
  const ch = CHANNELS[c];
  const dir = path.join(ROOT, `ch-${String(c + 1).padStart(2, '0')}-${ch.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  const lines = ['#EXTM3U'];
  menu[ch.slug].forEach((t, i) => {
    const slug = slugify(String(t.title).trim());
    const name = `${String(i + 1).padStart(2, '0')} - ${safeName(t.title)}.mp3`;
    const dest = path.join(dir, name);
    try { if (!fs.existsSync(dest)) fs.linkSync(path.join(LIB, `inc-${slug}.mp3`), dest); }
    catch { try { fs.copyFileSync(path.join(LIB, `inc-${slug}.mp3`), dest); } catch { } }
    lines.push(name);
  });
  fs.writeFileSync(path.join(dir, 'playlist.m3u'), lines.join('\r\n') + '\r\n');
}

fs.writeFileSync(path.join(ROOT, 'README.txt', ), `HOW TO LISTEN
1. Open the music-review folder.
2. Each ch-XX-... folder = one channel. Numbers match the list I sent you.
3. Double-click playlist.m3u inside a folder to play that channel from track 1.
4. Reply to me, for example: "Channel 3: remove 12, 21" or "Approve all".

All music: Kevin MacLeod (incompetech.com), CC BY 4.0 - free, credit goes in captions automatically.
`);
console.log(`\n[done] ok=${ok}/${list.length} failures=${failures.length}`);
if (failures.length) console.log(failures.join('\n'));
console.log(`[size] lib = ${Math.round(fs.statSync(LIB) && fs.readdirSync(LIB).reduce((a, f) => a + fs.statSync(path.join(LIB, f)).size, 0) / 1e6)} MB`);
console.log(`[path] ${reviewRoot}`);
