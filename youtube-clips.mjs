// Topic-matched 4K clip search on Pixabay for YouTube Shorts.
// Gemini converts the quote into a short video-search query, then we fetch
// the best 4K footage for it (quality-filtered, no repeats across runs) and
// fall back to the brand pool when search fails.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const POOL_DIR = 'pixabay-pool';
const USED_FILE = `${POOL_DIR}/yt-used.json`;
import { loadEnv, envOf } from './lib/env.mjs';
loadEnv();
const KEY = envOf('PIXABAY_API_KEY');
const GEMINI_API_KEY = envOf('GEMINI_API_KEY');

// Curated fallback queries per brand (used when Gemini or search fails)
// B-roll query seeds — brand DATA (lib/brands.json brollQueries / registry kit),
// not a static code map (owner directive: new Gmail-login channels must work
// with zero code changes). Derived from niche/tags when the kit has none;
// one generic aesthetic set as last resort.
const GENERIC_QUERIES = ['cinematic landscape', 'city night aerial', 'ocean waves slow'];
function brandQueries(kit) {
  if (kit?.brollQueries?.length) return kit.brollQueries;
  const words = String(kit?.niche || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  const derived = words.slice(0, 3).map((w) => `${w} cinematic`);
  return derived.length ? derived : GENERIC_QUERIES;
}

async function geminiClipQuery(postData, brandQueryHint) {
  if (!GEMINI_API_KEY) return null;
  const prompt = `You choose b-roll footage search queries for a motivational video.
Quote headline: "${postData?.headline || ''}"
Quote text: "${(postData?.insight_body || '').slice(0, 160)}" (${brandQueryHint} theme)
Reply with ONLY a JSON object: {"clip_query": "<2-3 word cinematic b-roll search phrase, concrete and visual, e.g. 'foggy mountain sunrise'>"}`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } })
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const q = text ? JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim()).clip_query : null;
    return q && /^[\w\s-]{3,40}$/.test(q) ? q.trim() : null;
  } catch (e) { return null; }
}

function loadUsed() {
  try { return JSON.parse(fs.readFileSync(USED_FILE, 'utf8')); } catch (e) { return []; }
}
function saveUsed(arr) {
  fs.mkdirSync(POOL_DIR, { recursive: true });
  fs.writeFileSync(USED_FILE, JSON.stringify(arr.slice(-400)));
}

export async function getTopicClip(page, postData, minDur = 12) {
  if (!KEY) throw new Error('PIXABAY_API_KEY missing');
  const brandQ = brandQueries(page?.ytBrand);
  const queries = [];
  const geminiQ = await geminiClipQuery(postData, (brandQ[0] || '').split(' ')[0]);
  if (geminiQ) queries.push(geminiQ);
  queries.push(brandQ[Math.floor(Math.random() * brandQ.length)]);

  const used = loadUsed();
  for (const q of queries) {
    try {
      const res = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&q=${encodeURIComponent(q)}&per_page=25&video_type=film`);
      const hits = (await res.json()).hits || [];
      // 4K only (large stream), long enough, not used recently, decent popularity
      const cands = hits
        .filter((h) => h.videos?.large && h.videos.large.width >= 3500 && (h.duration || 0) >= minDur)
        .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
        .slice(0, 6)
        .filter((h) => !used.includes(h.id));
      if (!cands.length) continue;
      const hit = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
      const file = `${POOL_DIR}/yt-clip-${hit.id}.mp4`;
      fs.mkdirSync(POOL_DIR, { recursive: true });
      if (!fs.existsSync(file) || fs.statSync(file).size < 500000) {
        console.log(`[YT Clips] Downloading 4K "${q}" clip ${hit.id} (${hit.duration}s, ${hit.downloads || 0} downloads)...`);
        execFileSync('curl', ['-s', '--retry', '3', '--retry-delay', '2', '-L', '-o', file, hit.videos.large.url]);
        if (fs.statSync(file).size < 500000) throw new Error('download failed');
      }
      used.push(hit.id);
      saveUsed(used);
      const start = Math.max(0, Math.min(3, (hit.duration || minDur) - 16));
      return { file, start, maxDur: Math.min(20, (hit.duration || minDur) - start), query: q, id: hit.id };
    } catch (e) {
      console.log(`[YT Clips] Query "${q}" failed: ${String(e.message).slice(0, 100)}`);
    }
  }
  return null;
}
