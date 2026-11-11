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
const GROQ_API_KEY = envOf('GROQ_API_KEY');
const GEMINI_API_KEY = envOf('GEMINI_API_KEY');

// Curated fallback queries per brand (used when Gemini or search fails)
// B-roll query seeds — brand DATA (lib/brands.json brollQueries / registry kit),
// not a static code map (owner directive: new Gmail-login channels must work
// with zero code changes). Derived from niche/tags when the kit has none;
// one generic aesthetic set as last resort.
const GENERIC_QUERIES = ['cinematic landscape', 'city night aerial', 'ocean waves slow', 'mountain sunrise mist', 'dark forest moody'];
function brandQueries(kit) {
  if (kit?.brollQueries?.length) return kit.brollQueries;
  const words = String(kit?.niche || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  const derived = words.slice(0, 3).map((w) => `${w} cinematic`);
  return derived.length ? derived : GENERIC_QUERIES;
}

async function geminiClipQuery(postData, brandQueryHint = 'stoic motivation') {
  const prompt = `You choose b-roll footage search queries for a motivational video.
Quote headline: "${postData?.headline || ''}"
Quote text: "${(postData?.insight_body || '').slice(0, 160)}" (${brandQueryHint} theme)
Reply with ONLY a JSON object: {"clip_query": "<2-3 word cinematic b-roll search phrase, concrete and visual, e.g. 'foggy mountain sunrise'>"}`;

  // 1. Try Groq (fastest)
  const groqKey = envOf('GROQ_API_KEY');
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          reasoning_effort: 'low',
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const j = await res.json();
        const text = j.choices?.[0]?.message?.content;
        const q = text ? JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim()).clip_query : null;
        if (q && /^[\w\s-]{3,40}$/.test(q)) return q.trim();
      }
    } catch { }
  }

  // 2. Try Gemini
  const geminiKey = envOf('GEMINI_API_KEY');
  if (geminiKey) {
    for (const m of ['gemini-3.8-flash', 'gemini-2.5-flash']) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, responseMimeType: 'application/json' }
          })
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          const q = text ? JSON.parse(text.replace(/^```json\s*/, '').replace(/```$/, '').trim()).clip_query : null;
          if (q && /^[\w\s-]{3,40}$/.test(q)) return q.trim();
        }
      } catch { }
    }
  }

  return null;
}

function loadUsed() {
  try { return JSON.parse(fs.readFileSync(USED_FILE, 'utf8')); } catch (e) { return []; }
}
function saveUsed(arr) {
  fs.mkdirSync(POOL_DIR, { recursive: true });
  fs.writeFileSync(USED_FILE, JSON.stringify(arr.slice(-400)));
}

async function downloadAndReturnClip(hit, q, videoUrl, minDur, used) {
  const file = `${POOL_DIR}/yt-clip-${hit.id}.mp4`;
  fs.mkdirSync(POOL_DIR, { recursive: true });
  if (!fs.existsSync(file) || fs.statSync(file).size < 500000) {
    console.log(`[YT Clips] Downloading "${q}" clip ${hit.id} (${hit.duration}s, ${hit.videos?.large?.width || 'HD'}w, ${hit.downloads || 0} downloads)...`);
    execFileSync('curl', ['-s', '--retry', '3', '--retry-delay', '2', '-L', '-o', file, videoUrl]);
    if (fs.statSync(file).size < 500000) throw new Error('download failed');
  }
  if (!used.includes(hit.id)) {
    used.push(hit.id);
    saveUsed(used);
  }
  const start = Math.max(0, Math.min(3, (hit.duration || minDur) - 16));
  return { file, start, maxDur: Math.min(25, (hit.duration || minDur) - start), query: q, id: hit.id, duration: hit.duration || 0 };
}

export async function getTopicClip(page, postData, minDur = 12, excludeIds = []) {
  if (!KEY) throw new Error('PIXABAY_API_KEY missing');
  const brandQ = brandQueries(page?.ytBrand);
  const queries = [];
  const geminiQ = await geminiClipQuery(postData, (brandQ[0] || '').split(' ')[0]);
  if (geminiQ) queries.push(geminiQ);
  queries.push(brandQ[Math.floor(Math.random() * brandQ.length)]);
  for (const bq of brandQ) {
    if (!queries.includes(bq)) queries.push(bq);
  }
  for (const g of GENERIC_QUERIES) {
    if (!queries.includes(g)) queries.push(g);
  }

  const used = loadUsed();
  const exclude = new Set((excludeIds || []).map(String));

  // PASS 1: Search for UNUSED clips across all queries
  const allHits = [];
  for (const q of queries) {
    try {
      const res = await fetch(`https://pixabay.com/api/videos/?key=${KEY}&q=${encodeURIComponent(q)}&per_page=50&video_type=film`);
      const hits = (await res.json()).hits || [];
      if (!hits.length) continue;
      allHits.push({ query: q, hits });

      // Tier 1: 4K (width >= 3500), duration >= minDur, unused & not excluded
      let cands = hits.filter((h) => h.videos?.large && h.videos.large.width >= 3500 && (h.duration || 0) >= minDur && !used.includes(h.id) && !exclude.has(String(h.id)));

      // Tier 2: 4K (width >= 3500), duration >= 15s (longest first), unused & not excluded
      if (!cands.length) {
        cands = hits.filter((h) => h.videos?.large && h.videos.large.width >= 3500 && (h.duration || 0) >= 15 && !used.includes(h.id) && !exclude.has(String(h.id)));
      }

      // Tier 3: HD/4K, duration >= 10s, unused & not excluded
      if (!cands.length) {
        cands = hits.filter((h) => (h.videos?.large?.url || h.videos?.medium?.url) && (h.duration || 0) >= 10 && !used.includes(h.id) && !exclude.has(String(h.id)));
      }

      if (cands.length) {
        cands.sort((a, b) => ((b.duration || 0) - (a.duration || 0)) || ((b.downloads || 0) - (a.downloads || 0)));
        const hit = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
        const videoUrl = hit.videos?.large?.url || hit.videos?.medium?.url;
        if (videoUrl) {
          return await downloadAndReturnClip(hit, q, videoUrl, minDur, used);
        }
      }
    } catch (e) {
      console.log(`[YT Clips] Query "${q}" failed: ${String(e.message).slice(0, 100)}`);
    }
  }

  // PASS 2: If ALL queries exhausted without an unused clip, allow older used clips
  // BUT STRICTLY exclude clips in exclude (current episode) and pick oldest-used first
  for (const { query: q, hits } of allHits) {
    const cands = hits.filter((h) => (h.videos?.large?.url || h.videos?.medium?.url) && (h.duration || 0) >= 10 && !exclude.has(String(h.id)));
    if (cands.length) {
      cands.sort((a, b) => used.indexOf(a.id) - used.indexOf(b.id));
      const hit = cands[0];
      const videoUrl = hit.videos?.large?.url || hit.videos?.medium?.url;
      if (videoUrl) {
        console.log(`[YT Clips] Reusing oldest historical clip ${hit.id} for "${q}" (no unused found, strictly excluded current episode)`);
        return await downloadAndReturnClip(hit, q, videoUrl, minDur, used);
      }
    }
  }

  // Local pool fallback
  try {
    const existing = fs.readdirSync(POOL_DIR).filter(f => f.startsWith('yt-clip-') && f.endsWith('.mp4') && !exclude.has(f.replace('yt-clip-', '').replace('.mp4', '')));
    if (existing.length) {
      const pick = existing[Math.floor(Math.random() * existing.length)];
      const file = `${POOL_DIR}/${pick}`;
      const pickId = pick.replace('yt-clip-', '').replace('.mp4', '');
      console.log(`[YT Clips] Pool clip fallback: ${file}`);
      return { file, start: 0, maxDur: 25, query: 'local-pool', id: pickId, duration: 25 };
    }
  } catch {}

  return null;
}
