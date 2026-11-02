// Pixabay Videos b-roll fetcher. Downloads ONE suitable clip for a beat.
// Resilient by design: any failure returns null and the beat renders clean.
import fs from "node:fs";
import { fetchBuffer } from "../lib/fetch-safe.mjs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(key, query, videoType) {
  const url = `https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&video_type=${videoType}&per_page=25`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchBroll({ key, query, minDurationSec, outPath }) {
  try {
    if (!key) throw new Error("no PIXABAY_API_KEY");
    const types = ["film", "stock_footage", "all"];
    let hits = [];
    for (const vt of types) {
      const data = await search(key, query, vt);
      hits = data?.hits || [];
      if (hits.length) break;
      await sleep(400);
    }
    if (!hits.length) throw new Error("no results");

    const minDur = Math.max((minDurationSec || 6) * 0.9, 4);
    const qWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const usable = hits
      .filter((h) => h.duration >= minDur)
      .map((h) => {
        const v = h.videos?.large?.width >= 1280 ? h.videos.large : (h.videos?.medium || h.videos?.large || h.videos?.small);
        if (!v) return null;
        const tags = String(h.tags || "").toLowerCase();
        const relevance = qWords.filter((w) => tags.includes(w)).length;
        return { ...v, duration: h.duration, id: h.id, relevance };
      })
      .filter(Boolean)
      .sort((a, b) => b.relevance - a.relevance || a.size - b.size); // most on-topic, then smallest

    if (!usable.length) throw new Error("no clip long enough");
    const pick = usable[0];

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100 * 1024) {
      console.log(`  [broll] cached ${path.basename(outPath)} (${query})`);
      return { file: outPath, width: pick.width, height: pick.height, duration: pick.duration };
    }
    // #65: deadline covers the body transfer
    const { buf } = await fetchBuffer(pick.url, { timeoutMs: 120000 });
    fs.writeFileSync(outPath, buf);
    console.log(`  [broll] ${query} -> ${path.basename(outPath)} ${pick.width}x${pick.height} ${pick.duration}s ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
    return { file: outPath, width: pick.width, height: pick.height, duration: pick.duration };
  } catch (e) {
    console.warn(`  [broll] SKIP (${query}): ${String(e.message).slice(0, 100)}`);
    return null;
  }
}
