// music-engine.mjs — picks a DIFFERENT track for every reel from Kevin
// MacLeod's full incompetech catalog (1,442 tracks; ~715 pass the
// motivational feel-whitelist). Downloads only what it uses into
// .music-cache/ (gitignored), returns the attribution line automatically
// (CC BY 4.0 requires credit).
//
// Fallback: callers keep their local MUSIC_PRESETS if this returns null.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

const CACHE_DIR = '.music-cache';
const CATALOG_URL = 'https://incompetech.com/music/royalty-free/pieces.json';
const MP3_BASE = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';

const GOOD_FEELS = ['epic', 'uplifting', 'driving', 'action', 'bright', 'grooving', 'calming', 'heroic', 'inspir', 'mystical'];
const BAD_FEELS = ['dark', 'somber', 'sad', 'horror', 'tense', 'eerie', 'scary', 'ominous', 'creepy'];

function httpsGet(url, maxBytes = 60 * 1024 * 1024, _depth = 0) {
  return new Promise((resolve, reject) => {
    if (_depth > 5) return reject(new Error('too many redirects'));
    const req = (url.startsWith('http:') ? http : https).get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpsGet(res.headers.location, maxBytes, _depth + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > maxBytes) {
          req.destroy();
          return reject(new Error('response too large'));
        }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(45000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

const CATALOG_CACHE = `${CACHE_DIR}/pieces.json`;

function loadCatalog() {
  try {
    const age = Date.now() - fs.statSync(CATALOG_CACHE).mtimeMs;
    if (age < 7 * 24 * 3600 * 1000) return JSON.parse(fs.readFileSync(CATALOG_CACHE, 'utf8'));
  } catch { }
  return null;
}

async function fetchCatalog() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  let catalog = loadCatalog();
  if (!catalog) {
    const buf = await httpsGet(CATALOG_URL);
    catalog = JSON.parse(buf.toString('utf8'));
    fs.writeFileSync(CATALOG_CACHE, buf);
  }
  return catalog;
}

async function getCatalog() {
  const catalog = await fetchCatalog();
  return catalog.filter((t) => {
    const feel = (t.feel || '').toLowerCase();
    if (!t.filename || !t.filename.endsWith('.mp3')) return false;
    return GOOD_FEELS.some((g) => feel.includes(g)) && !BAD_FEELS.some((b) => feel.includes(b));
  });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/**
 * Picks a whitelisted track (never the same as the last one used) and
 * downloads it into the cache if needed.
 * @param {number} pageIndex legacy rotating index
 * @param {{feels?: string[]}} opts preferred feel substrings — when any tracks
 *        match, one is chosen from that subset only (brand vibe matching)
 * @returns {null|{file:string, title:string, credit:string, feel:string}}
 */
// ============================================================================
// OWN-MUSIC LIBRARY (10-11) — self-produced tracks (ACE-Step, Apache 2.0),
// stored as release assets on own-music-v1 + manifest. When the library is
// populated, these tracks are ALWAYS picked before any third-party music;
// credit line needs no attribution. Empty/missing library = zero behavior
// change (MacLeod flow as before). Kill switch: OWN_MUSIC_DISABLE=1.
const OWN_BASE = process.env.OWN_MUSIC_BASE || 'https://github.com/muzzamilhassan/automation/releases/download/own-music-v1';
let _ownLib = undefined;
async function ownLibrary() {
  if (process.env.OWN_MUSIC_DISABLE) return null;
  if (_ownLib !== undefined) return _ownLib;
  try {
    const m = JSON.parse((await httpsGet(`${OWN_BASE}/manifest.json`, 5 * 1024 * 1024)).toString());
    _ownLib = (m.tracks || []).length ? m : null;
  } catch { _ownLib = null; }
  return _ownLib;
}

// brand feels -> library moods
const OWN_MOOD_MAP = { calming: 'calm', calm: 'calm', mystical: 'calm', epic: 'epic', heroic: 'epic', inspir: 'epic', driving: 'driving', action: 'driving', grooving: 'driving', bright: 'bright', uplifting: 'bright', luxury: 'luxury', dark: 'dark', tense: 'dark' };

async function pickOwnTrack(feels = []) {
  const lib = await ownLibrary();
  if (!lib) return null;
  const moods = feels.map((f) => OWN_MOOD_MAP[f.toLowerCase()] || f.toLowerCase());
  let pool = lib.tracks.filter((t) => !moods.length || moods.some((m) => (t.mood || '').toLowerCase().includes(m) || (t.tags || '').toLowerCase().includes(m)));
  if (!pool.length) pool = lib.tracks;
  if (!pool.length) return null;

  const lastFile = `${CACHE_DIR}/own-last.json`;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  try {
    const last = JSON.parse(fs.readFileSync(lastFile, 'utf8'));
    if (last.file === pick.file && pool.length > 1) {
      pick = pool[(pool.indexOf(pick) + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length];
    }
  } catch { }

  const file = `${CACHE_DIR}/own-${path.basename(pick.file)}`;
  if (!fs.existsSync(file) || fs.statSync(file).size < 200000) {
    const buf = await httpsGet(`${OWN_BASE}/${pick.file}`);
    fs.writeFileSync(file, buf);
  }
  const info = {
    file,
    title: String(pick.title || 'Quarry Original').trim(),
    feel: pick.mood || '',
    credit: `"${String(pick.title || 'Quarry Original').trim()}" — Quarry Studio Original (self-produced, royalty-free)`,
  };
  try { fs.writeFileSync(lastFile, JSON.stringify({ file: pick.file, at: Date.now() })); } catch { }
  return info;
}

export async function pickMusicTrack(pageIndex = 0, opts = {}) {
  try {
    const own = await pickOwnTrack((opts || {}).feels || []).catch((e) => {
      console.warn(`      [music] own-library skip: ${e.message}`);
      return null;
    });
    if (own) {
      console.warn(`      [music] OWN track: ${own.title}`);
      return own;
    }
    let pool = await getCatalog();
    if (!pool.length) return null;
    const feels = (opts.feels || []).map((f) => f.toLowerCase());
    if (feels.length) {
      const matched = pool.filter((t) => feels.some((f) => (t.feel || '').toLowerCase().includes(f)));
      if (matched.length) pool = matched;
    }

    // seeded by time so every reel gets a different track
    let idx = Math.floor(Math.random() * pool.length);
    let track = pool[idx];
    const lastFile = `${CACHE_DIR}/last-used.json`;
    try {
      const last = JSON.parse(fs.readFileSync(lastFile, 'utf8'));
      if (last.title === track.title && pool.length > 1) {
        idx = (idx + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
        track = pool[idx];
      }
    } catch { }

    const slug = slugify(track.title) || `track-${track.uuid}`;
    const file = `${CACHE_DIR}/inc-${slug}.mp3`;
    if (!fs.existsSync(file) || fs.statSync(file).size < 300000) {
      const url = MP3_BASE + encodeURIComponent(track.filename);
      let buf = null;
      for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
        try {
          buf = await httpsGet(url);
        } catch (e) {
          console.warn(`      [music] download attempt ${attempt} failed: ${e.message}`);
          await new Promise((r) => setTimeout(r, 2500 * attempt));
        }
      }
      if (!buf) return null;
      fs.writeFileSync(file, buf);
    }

    const info = {
      file,
      title: String(track.title || slug).trim(),
      feel: track.feel || '',
      credit: `"${String(track.title).trim()}" by Kevin MacLeod (incompetech.com), Licensed under CC BY 4.0`,
    };
    fs.writeFileSync(lastFile, JSON.stringify({ title: info.title, at: Date.now(), pageIndex }));
    return info;
  } catch (e) {
    console.warn('      [music] engine failed: ' + e.message);
    return null;
  }
}

/**
 * Picks ONLY from a user-approved list of track titles (locked pool).
 * Same download/retry/credit behavior as pickMusicTrack.
 * @param {string[]} titles approved track titles (exact catalog titles)
 * @returns {Promise<null|{file:string, title:string, credit:string, feel:string}>}
 */
export async function pickApprovedTrack(titles) {
  try {
    const own = await pickOwnTrack([]).catch(() => null);
    if (own) {
      console.warn(`      [music] OWN track (approved bypass): ${own.title}`);
      return own;
    }
    const want = new Set((titles || []).map((t) => t.trim().toLowerCase()));
    // RAW catalog — the approved pool bypasses the shorts feel-whitelist
    // (documentary picks are intentionally dark/tense, which GOOD_FEELS would exclude)
    const raw = await fetchCatalog();
    const pool = raw.filter((t) => want.has(String(t.title || '').trim().toLowerCase()) && t.filename && t.filename.endsWith('.mp3'));
    if (!pool.length) return null;
    const track = pool[Math.floor(Math.random() * pool.length)];
    const slug = slugify(track.title) || `track-${track.uuid}`;
    const file = `${CACHE_DIR}/inc-${slug}.mp3`;
    if (!fs.existsSync(file) || fs.statSync(file).size < 300000) {
      const url = MP3_BASE + encodeURIComponent(track.filename);
      let buf = null;
      for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
        try {
          buf = await httpsGet(url);
        } catch (e) {
          console.warn(`      [music] download attempt ${attempt} failed: ${e.message}`);
          await new Promise((r) => setTimeout(r, 2500 * attempt));
        }
      }
      if (!buf) return null;
      fs.writeFileSync(file, buf);
    }
    return {
      file,
      title: String(track.title || slug).trim(),
      feel: track.feel || '',
      credit: `"${String(track.title).trim()}" by Kevin MacLeod (incompetech.com), Licensed under CC BY 4.0`,
    };
  } catch (e) {
    console.warn('      [music] approved-pool pick failed: ' + e.message);
    return null;
  }
}
