// Thumbnail A/B swapper — runs hourly on CI (thumb-ab.yml). Zero deps (fetch only).
// Reads yt-mcp/thumb-tests.json, attaches whichever variant is due, records the
// period boundary. Analytics are pulled on-demand by Studio (abresults).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
let envLines = [];
try { envLines = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n'); } catch { }
for (const line of envLines) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const STATE = path.join(ROOT, 'yt-mcp', 'thumb-tests.json');
const load = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2));

async function accessToken(slug) {
  const envName = 'YT_TOKEN_' + slug.toUpperCase().replace(/-/g, '_');
  let raw = process.env[envName];
  if (!raw) {
    const p = path.join(ROOT, 'yt-mcp', 'channels', slug, 'token.json');
    if (fs.existsSync(p)) raw = fs.readFileSync(p, 'utf8');
  }
  if (!raw) throw new Error('no token for ' + slug);
  const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('token refresh failed HTTP ' + r.status);
  return (await r.json()).access_token;
}

async function setThumb(slug, videoId, buf) {
  const at = await accessToken(slug);
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'image/jpeg', 'Content-Length': String(buf.length) },
    body: buf,
  });
  if (!r.ok) throw new Error(`thumbnails.set HTTP ${r.status}: ${(await r.text()).slice(0, 100)}`);
}

const state = load();
let changes = 0;
const errors = [];

for (const [videoId, t] of Object.entries(state)) {
  if (t.ended) continue;
  try {
    const elapsed = Date.now() - new Date(t.started).getTime();
    const idx = Math.max(0, Math.floor(elapsed / ((t.intervalHours || 48) * 3600000))) % t.variants.length;
    if (idx === t.current) { console.log(`[${videoId}] variant ${idx} already live — in sync`); continue; }
    const file = path.join(ROOT, t.variants[idx]);
    const buf = fs.readFileSync(file);
    await setThumb(t.slug, videoId, buf);
    t.current = idx;
    t.periods.push({ variant: idx, from: new Date().toISOString() });
    changes++;
    console.log(`[${videoId}] swapped to variant ${idx} (${file})`);
  } catch (e) {
    errors.push(`${videoId}: ${e.message}`);
    console.log(`[${videoId}] ERROR ${e.message}`);
  }
}

if (changes) save(state);
if (errors.length && process.env.NTFY_TOPIC) {
  fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Title: 'Thumbnail A/B errors' },
    body: errors.join('\n').slice(0, 400),
  }).catch(() => { });
}
console.log(`done — ${changes} swap(s), ${errors.length} error(s)`);
