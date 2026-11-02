// Relevant-photo resolver for poster thumbnails. Order of preference:
//   1. Wikipedia lead photo for the video's subject (person/company/event — highly relevant)
//   2. Pexels topical photo (searched per video, not from a fixed pool)
//   3. Channel pool photo with NO-REPEAT rotation (a photo is not reused until
//      every other pool photo for that channel has been used — ledger in
//      state/poster-photos-used.json)
// Downloads go to the OS temp dir, so nothing extra lands in the repo.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const STOP = new Set(["THE", "A", "AN", "OF", "AND", "TO", "IN", "ON", "FOR", "FROM", "HOW", "WHY", "WHAT", "WHEN", "WITH", "THAT", "THIS", "HIS", "HER", "ITS", "INTO", "OVER", "MOST", "EVER"]);
// verbs/adjectives — fine for a Pexels mood search, but never a Wikipedia subject
const NOT_WIKI = new Set(["CRUSHED", "STOLE", "STOLEN", "BROKE", "BROKEN", "CRASHED", "FOOLED", "LIED", "WENT", "MADE", "CHANGED", "STAYED", "BEAT", "BLEW", "VANISHED", "TRAPPED", "TRAP", "SURPRISING", "FORGOTTEN", "SLEEPING", "PATIENT", "UNSHAKABLE", "TIMELESS", "DEADLIEST", "COLLAPSE", "COLLAPSED", "SCAM", "FRAUD", "RICHEST", "GREATEST", "WORST", "FIRST", "RULES", "LESSONS", "SECRETS", "STORY", "MONEY", "MILLION", "BILLION", "MILLIONAIRE", "BILLIONAIRE", "CRISIS",
  // generic single nouns that produced junk wiki matches (Crash Bandicoot, Wall, World, Game…)
  "CRASH", "WORLD", "WALL", "GAME", "MARKET", "MARKETS", "STREET", "FALL", "BET", "TICKET", "INDUSTRY", "EMPIRE", "PLAGUE", "MEDIA", "MAN", "DAY", "DAYS", "WAY", "WAR", "DOLLAR", "DOLLARS", "RISE", "INSIDE", "TRUE", "REAL", "SECRET", "UNTOLD", "MIND", "LIFE", "HISTORY", "EDGE", "SAGE", "SLAVE", "DEAL", "DEALS",
  "FLASH", "SPARKED", "EXPLAINED", "AVOID", "MISTAKE", "DOWNFALL", "CHAINS", "ORIGIN", "MODERN", "CHOICES", "CAUSED", "PAID"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bigWord(title) {
  const t = String(title || "").split(/[:—–|]/)[0].trim() || String(title || "");
  const words = t.toUpperCase().replace(/[^A-Z0-9 $]/g, "").split(/\s+/).filter((w) => w && !STOP.has(w));
  words.sort((a, b) => b.length - a.length);
  return (words[0] || "STORY").slice(0, 14);
}

function pairWords(words) {
  const keep = words.filter((w) => {
    const clean = w.replace(/[^A-Za-z0-9]/g, "");
    if (!clean || /^\d+$/.test(clean)) return false; // drop pure numbers like "7"
    return !STOP.has(clean.toUpperCase());
  });
  return keep.slice(0, 2).join(" ").trim();
}

// query candidates: subject pin > full segments (max 6 words) > tail pair > lead pair
// (big word is appended only for Pexels — generic verbs pull junk wiki articles)
export function photoCandidates(title, tags = [], thumbSubject) {
  const out = [];
  const push = (q) => { const s = String(q || "").trim(); if (s && s.length > 2 && !out.includes(s)) out.push(s); };
  push(thumbSubject);
  const segs = String(title || "").split(/\s*[:—–|]\s*/).filter(Boolean);
  for (const seg of segs.slice(0, 2)) {
    const ws = seg.trim().split(/\s+/).slice(0, 6).join(" "); // full segment — search engines rank it well
    push(ws);
  }
  for (const seg of segs.slice(0, 2)) {
    const ws = seg.trim().split(/\s+/);
    push(pairWords(ws.slice(-2)));            // "…Crushed Barings Bank" -> "Barings Bank"
    push(pairWords(ws.slice(0, 2)));          // "Marcus Aurelius Stoic…" -> "Marcus Aurelius"
  }
  push((tags || [])[0]);
  push(bigWord(title));
  return out.slice(0, 7);
}

export function wikiCandidates(title, tags = [], thumbSubject) {
  return photoCandidates(title, tags, thumbSubject).filter((q) => {
    if (thumbSubject && q === String(thumbSubject).trim()) return true;
    const sig = q.split(/\s+/).filter((w) => !STOP.has(w.replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
    if (sig.length >= 2) return true; // multi-word, both-words-in-title rule applies
    const one = (sig[0] || "").toUpperCase();
    return one.length > 2 && !NOT_WIKI.has(one); // single word must be noun-like
  });
}

async function fetchBuf(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("http " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

export async function wikiPhotoFor(query, dest, usedSources) {
  const api = "https://en.wikipedia.org/w/api.php";
  const headers = { "User-Agent": "QuarryStudio/1.0 (thumbnail pipeline)" };
  // a multi-word query must match at least 2 of its words in the article title
  // — stops generic phrases like "Changed History" or single words like "flash"
  // from pulling an unrelated article's photo
  const sigWords = String(query).split(/\s+/).filter((w) => w.replace(/[^A-Za-z0-9]/g, "") && !STOP.has(w.replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
  const needAll = sigWords.length >= 2;
  const needN = 2;
  let arts = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${api}?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=4`, { headers });
      const sr = await r.json();
      arts = (sr.query?.search || []).map((s) => s.title);
      break;
    } catch {
      if (attempt === 0) await sleep(1500); // rate-limited — wait once and retry
    }
  }
  for (const title of arts) {
    if (needAll) {
      const low = " " + title.toLowerCase().replace(/[^a-z0-9 ]/g, " ") + " ";
      let hits = 0;
      for (const w of sigWords) if (low.includes(" " + w.toLowerCase() + " ")) hits++;
      if (hits < needN) continue;
    } else if (!title.toLowerCase().startsWith(sigWords[0].toLowerCase())) {
      continue; // single word must lead the article title ("Bad" ≠ "Breaking Bad")
    }
    if (usedSources && usedSources.has("wikipedia:" + title)) continue; // no-repeat across videos
    try {
      const pi = await (await fetch(`${api}?action=query&format=json&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=thumbnail&pithumbsize=1200`, { headers })).json();
      const src = Object.values(pi.query?.pages || {})[0]?.thumbnail?.source;
      if (!src || !/\.(jpe?g|png)(\?|$)/i.test(src)) continue;
      const buf = await fetchBuf(src, headers);
      if (buf.length < 8000) continue;
      fs.writeFileSync(dest, buf);
      return { path: dest, source: `wikipedia:${title}` };
    } catch { }
  }
  return null;
}

export async function pexelsPhotoFor(query, dest, key, usedSources) {
  if (!key) return null;
  if (usedSources?.has("pexels:" + query)) return null; // no-repeat across videos
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`, { headers: { Authorization: key } });
    if (!r.ok) return null;
    const photos = (await r.json()).photos || [];
    const p = photos.find((x) => x.width >= 1600) || photos[0];
    if (!p) return null;
    const buf = await fetchBuf(p.src.large2x);
    if (buf.length < 20000) return null;
    fs.writeFileSync(dest, buf);
    return { path: dest, source: `pexels:${query}` };
  } catch { return null; }
}

// pool fallback with no-repeat rotation
export function poolPhotoFor(root, slugKey, title) {
  const dir = path.join(root, "thumbnails", "photos");
  const pool = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(slugKey + "-") && /\.jpe?g$/i.test(f)) : [];
  if (!pool.length) return null;
  const ledgerPath = path.join(root, "state", "poster-photos-used.json");
  let ledger = {};
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { }
  const used = ledger[slugKey] || [];
  let avail = pool.filter((f) => !used.includes(f));
  if (!avail.length) { avail = pool; used.length = 0; } // full cycle — restart rotation
  const h = [...String(title)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
  const pick = avail[h % avail.length];
  used.push(pick);
  ledger[slugKey] = used.slice(-pool.length);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  return { path: path.join(dir, pick), source: `pool:${pick}` };
}

// main entry: returns { path, source } or null (caller falls back to plain pool hash)
// Downloaded sources are also de-duplicated per channel (a channel never shows
// the same wiki article / pexels query twice), via state/poster-photos-used.json.
export async function resolvePosterPhoto({ root, slugKey, title, tags = [], thumbSubject, pexelsKey }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "poster-"));
  const ledgerPath = path.join(root, "state", "poster-photos-used.json");
  let ledger = {};
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { }
  const usedSources = new Set(ledger[`${slugKey}-sources`] || []);
  const remember = (src) => {
    usedSources.add(src);
    ledger[`${slugKey}-sources`] = [...usedSources].slice(-120);
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  };
  for (const q of wikiCandidates(title, tags, thumbSubject)) {
    const hit = await wikiPhotoFor(q, path.join(tmp, crypto.randomUUID() + ".jpg"), usedSources);
    if (hit) { remember(hit.source); return hit; }
    await sleep(350); // be polite to the Wikipedia API between videos/queries
  }
  for (const q of photoCandidates(title, tags, thumbSubject)) {
    const hit = await pexelsPhotoFor(q, path.join(tmp, crypto.randomUUID() + ".jpg"), pexelsKey, usedSources);
    if (hit) { remember(hit.source); return hit; }
  }
  return poolPhotoFor(root, slugKey, title);
}
