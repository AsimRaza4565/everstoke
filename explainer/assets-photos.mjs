// Pexels PHOTO fetcher (photos, not videos) for sidebar/split layouts.
// Resilient: returns null on any failure.
import fs from "node:fs";
import { fetchBuffer } from "../lib/fetch-safe.mjs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchPhoto({ key, query, outPath, orientation = "landscape" }) {
  try {
    if (!key) throw new Error("no PEXELS_API_KEY");
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=${orientation}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(url, { headers: { Authorization: key, "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const photos = d.photos || [];
    if (!photos.length) throw new Error("no results");
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 6))]; // random among top 6 = variety
    const src = pick.src?.large2x || pick.src?.large || pick.src?.original;
    if (!src) throw new Error("no src");

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 30 * 1024) {
      return { file: path.resolve(outPath), width: pick.width, height: pick.height };
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const c2 = new AbortController();
    // #65: deadline covers the body transfer
    const { buf } = await fetchBuffer(src, { timeoutMs: 60000, headers: { "User-Agent": UA } });
    fs.writeFileSync(outPath, buf);
    return { file: path.resolve(outPath), width: pick.width, height: pick.height };
  } catch (e) {
    console.warn(`  [photo] SKIP (${query}): ${String(e.message).slice(0, 80)}`);
    return null;
  }
}

// Pixabay photo fallback (Pexels intermittently 401s from datacenter IPs)
export async function fetchPhotoPixabay({ key, query, outPath, orientation = "landscape" }) {
  try {
    if (!key) throw new Error("no PIXABAY_API_KEY");
    const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&orientation=${orientation}&per_page=10&safesearch=true`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const hits = d.hits || [];
    if (!hits.length) throw new Error("no results");
    const pick = hits[Math.floor(Math.random() * Math.min(hits.length, 6))];
    const src = pick.largeImageURL || pick.webformatURL;
    if (!src) throw new Error("no src");
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 30 * 1024) {
      return { file: path.resolve(outPath), width: pick.imageWidth, height: pick.imageHeight };
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const c2 = new AbortController();
    // #65: deadline covers the body transfer
    const { buf } = await fetchBuffer(src, { timeoutMs: 60000, headers: { "User-Agent": UA } });
    fs.writeFileSync(outPath, buf);
    return { file: path.resolve(outPath), width: pick.imageWidth, height: pick.imageHeight };
  } catch (e) {
    console.warn(`  [photo-pix] SKIP (${query}): ${String(e.message).slice(0, 80)}`);
    return null;
  }
}
