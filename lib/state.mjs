// Per-channel state store (09-20): one file per channel kills the write race
// where parallel CI runs overwrote each other's "done" marks in the shared
// schedule-state.json (3 of 4 backfill marks were lost that way on 09-19).
// Per-channel files are the source of truth; the legacy shared file is kept
// as a best-effort mirror for read-only consumers (dashboard, reports).
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join('yt-mcp', 'state');
const LEGACY = path.join('yt-mcp', 'schedule-state.json');

export function loadChannelState(slug) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, slug + '.json'), 'utf8')); } catch { }
  try { const leg = JSON.parse(fs.readFileSync(LEGACY, 'utf8')); return leg[slug] || {}; } catch { }
  return {};
}

// #55: atomic write — a concurrent reader must never observe a torn file
// (a partial JSON used to make loadChannelState silently fall back to the
// stale legacy mirror). tmp+rename in the same directory is atomic on POSIX.
function atomicWrite(file, data) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function saveChannelState(slug, data) {
  fs.mkdirSync(DIR, { recursive: true });
  atomicWrite(path.join(DIR, slug + '.json'), JSON.stringify(data, null, 2));
  try { // best-effort mirror — losing this race no longer loses logic
    const leg = fs.existsSync(LEGACY) ? JSON.parse(fs.readFileSync(LEGACY, 'utf8')) : {};
    leg[slug] = data;
    atomicWrite(LEGACY, JSON.stringify(leg, null, 2));
  } catch { }
}

export function loadAllStates() {
  const merged = {};
  try { Object.assign(merged, JSON.parse(fs.readFileSync(LEGACY, 'utf8'))); } catch { }
  try {
    for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
      merged[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    }
  } catch { }
  return merged;
}
