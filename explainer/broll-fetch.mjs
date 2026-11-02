// Multi-provider b-roll fetcher: Pexels + Pixabay searched in parallel,
// candidates merged and scored (relevance -> duration fit -> size), best wins.
// Resilient: if one provider fails the other still answers; total failure = null.
import fs from "node:fs";
import { fetchBuffer } from "../lib/fetch-safe.mjs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveBinary } from '../lib/ffmpeg.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const qWords = (q) => q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
const scoreText = (text, words) => words.filter((w) => String(text).toLowerCase().includes(w)).length;

async function jget(url, headers, timeout = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function pexelsCandidates(key, query) {
  if (!key) throw new Error("no pexels key");
  const d = await jget(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
    { Authorization: key, "User-Agent": UA });
  const words = qWords(query);
  const out = [];
  for (const v of d.videos || []) {
    const slug = decodeURIComponent((v.url || "").split("/video/")[1] || "").replace(/-\d+\/?$/, "").replace(/-/g, " ");
    const relevance = scoreText(slug, words);
    const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && f.width >= 1280)
      .sort((a, b) => (a.width * (a.height || 1)) - (b.width * (b.height || 1)));
    if (!files.length) continue;
    const f = files[0];
    out.push({ provider: "pexels", url: f.link, width: f.width, height: f.height, duration: v.duration, relevance, size: (f.width * f.height) / 1e6 });
  }
  return out;
}

async function pixabayCandidates(key, query) {
  if (!key) throw new Error("no pixabay key");
  const words = qWords(query);
  const out = [];
  for (const vt of ["film", "stock_footage", "all"]) {
    const d = await jget(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&video_type=${vt}&per_page=15`, {});
    const hits = d?.hits || [];
    if (hits.length) {
      for (const h of hits) {
        const v = h.videos?.large?.width >= 1280 ? h.videos.large : (h.videos?.medium || h.videos?.large || h.videos?.small);
        if (!v) continue;
        out.push({ provider: "pixabay", url: v.url, width: v.width, height: v.height, duration: h.duration, relevance: scoreText(h.tags, words), size: (v.width * v.height) / 1e6 });
      }
      break;
    }
    await sleep(300);
  }
  return out;
}

async function download(url, outPath) {
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100 * 1024) return true;
  for (let a = 0; a < 2; a++) {
    try {
      // #65: shared helper — the deadline now covers the body transfer too
      const { buf } = await fetchBuffer(url, { headers: { "User-Agent": UA } });
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf);
      return fs.statSync(outPath).size > 100 * 1024;
    } catch (e) {
      if (a === 1) throw e;
      await sleep(2000);
    }
  }
  return false;
}

// Pre-process for fast rendering: scale to 1080p once + pre-extend to ~150s
// (renderer never decodes 4K and never needs looping).
function prepForRender(srcPath, displayPath, seconds = 150) {
  const FF = resolveBinary('ffmpeg');
  try {
    execFileSync(FF, ["-y", "-v", "error", "-stream_loop", "30", "-i", srcPath,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080",
      "-t", String(seconds), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", displayPath], { timeout: 300000 });
    return fs.existsSync(displayPath) && fs.statSync(displayPath).size > 100 * 1024;
  } catch {
    return false;
  }
}

export async function fetchBestBroll({ query, minDurationSec = 10, outPath, pixabayKey, pexelsKey, excludeUrls }) {
  try {
    const words = qWords(query);
    const results = await Promise.allSettled([pexelsCandidates(pexelsKey, query), pixabayCandidates(pixabayKey, query)]);
    let cands = [];
    for (const r of results) if (r.status === "fulfilled") cands.push(...r.value);
    if (!cands.length) throw new Error("no candidates from any provider");
    if (excludeUrls && excludeUrls.size) cands = cands.filter((c) => !excludeUrls.has(c.url));
    if (!cands.length) throw new Error("all candidates already used");

    const minDur = Math.max((minDurationSec || 10) * 0.8, 6);
    const scored = cands
      .map((c) => ({ ...c, fits: c.duration >= minDur ? 1 : 0 }))
      .sort((a, b) => (b.relevance - a.relevance) || (b.fits - a.fits) || (a.size - b.size));

    const best = scored.find((c) => c.fits) || scored.sort((a, b) => b.duration - a.duration)[0];
    const ok = await download(best.url, outPath);
    if (!ok) throw new Error("download failed");
    // display version: 1080p, pre-extended — the renderer-decodes-cheap version
    const displayPath = outPath.replace(/\.mp4$/, "-display.mp4");
    if (prepForRender(outPath, displayPath)) {
      return { file: path.resolve(displayPath), url: best.url, provider: best.provider, width: 1920, height: 1080, duration: Math.min(best.duration, 150), relevance: best.relevance };
    }
    return { file: path.resolve(outPath), url: best.url, provider: best.provider, width: best.width, height: best.height, duration: best.duration, relevance: best.relevance };
  } catch (e) {
    console.warn(`  [broll] SKIP (${query}): ${String(e.message).slice(0, 90)}`);
    return null;
  }
}
