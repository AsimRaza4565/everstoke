// Turns a longscript into a narrated animated storyboard:
// script.json -> sentence beats -> scene selection -> Edge TTS -> longvideo-<slug>.json
// Usage: node storyboard.mjs <slug>   (reads longvideo/out/<slug>/script.json)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const PUB = path.join(ROOT, "explainer", "public");
import { resolveBinary } from '../lib/ffmpeg.mjs';
import { extractNumber } from './extract-number.mjs';
import { textHash } from '../lib/text-hash.mjs';
const FFPROBE = resolveBinary('ffprobe');

// load .env (PIXABAY_API_KEY, LONGVIDEO_GEMINI_API_KEY, …)
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const slug = process.argv[2];
if (!slug) { console.error("usage: node storyboard.mjs <slug>"); process.exit(1); }
const script = JSON.parse(fs.readFileSync(path.join(DIR, "out", slug, "script.json"), "utf8"));

const CHAPTER_GAP_MS = 2600; // silent chapter card
const PAD_MS = 700;          // breathing room between beats (text moves WITH voice)

// b-roll background clip per chapter, from Pixabay/Pexels
async function pickQueries(doc) {
  const fallback = ["wall street", "wall street", "new york city night", "money finance", "trading screens", "housing real estate", "city skyline aerial"];
  const prompt = `Video topic: "${doc.title}". Chapters:\n${doc.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}\nFor EACH chapter + a "hook" opening + a final "outro", give ONE stock-video search query of 2-3 CONCRETE VISUAL words (things a camera can see: cities, money, screens, crowds — never abstract words). Return ONLY JSON: {"queries": {"hook":"...", "1":"...", "outro":"..."}}`;
  try {
    let txt = "";
    if (process.env.LONGVIDEO_GEMINI_API_KEY) {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": process.env.LONGVIDEO_GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const j = await r.json();
        txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      }
    }
    if (!txt && process.env.LONGVIDEO_GROQ_API_KEY) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LONGVIDEO_GROQ_API_KEY}` },
        body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: prompt }], temperature: 0.4, max_tokens: 800 }),
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const j = await r.json();
        txt = j.choices?.[0]?.message?.content || "";
      }
    }
    if (txt) {
      const parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]);
      if (parsed?.queries?.hook) return parsed.queries;
    }
    throw new Error("bad shape");
  } catch (e) {
    console.log(`[broll] LLM queries failed (${String(e.message).slice(0, 60)}) — using fallback pool`);
    const keys = ["hook", ...doc.chapters.map((_, i) => String(i + 1)), "outro"];
    const out = {};
    keys.forEach((k, i) => { out[k] = fallback[i % fallback.length]; });
    return out;
  }
}

async function fetchChapterBroll(slug, doc) {
  const { fetchBestBroll } = await import(pathToFileURL(path.join(ROOT, "explainer", "broll-fetch.mjs")).href);
  const queries = await pickQueries(doc);
  const brollDir = path.join(PUB, "lv-broll", slug);
  const byChapter = {};

  const jobs = [["hook", queries.hook || queries["1"]], ...doc.chapters.map((c, i) => [String(i + 1), queries[String(i + 1)]]), ["outro", queries.outro]];
  const usedUrls = new Set(); // a clip may only reappear after all others have been used
  for (const [chKey, q] of jobs) {
    if (!q) continue;
    const res = await fetchBestBroll({
      query: q, minDurationSec: 10,
      outPath: path.join(brollDir, `ch-${chKey}-${q.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}.mp4`),
      pixabayKey: process.env.PIXABAY_API_KEY,
      pexelsKey: process.env.PEXELS_API_KEY,
      excludeUrls: usedUrls,
    });
    if (res) {
      usedUrls.add(res.url);
      byChapter[chKey] = path.relative(PUB, res.file).split(path.sep).join("/");
      console.log(`  [broll] ch${chKey} (${q}) <- ${res.provider} ${res.width}x${res.height} ${res.duration}s rel=${res.relevance}`);
    }
  }
  return byChapter;
}

// ---- 1c. ONE background track for the whole video (fast renders) ------------
// Concatenates each chapter's clip (scaled + scrim) into a single mp4 that
// matches the beat timeline, so Remotion plays ONE backdrop video instead of
// seeking 8 looping clips on every frame.
async function buildBackgroundTrack(slug, beats, doc) {
  const FF = resolveBinary('ffmpeg');
  const brollDir = path.join(PUB, "lv-broll", slug);
  const bgOut = path.join(PUB, `lv-bg-${slug}.mp4`);
  if (fs.existsSync(bgOut) && fs.statSync(bgOut).size > 100 * 1024) {
    console.log("[bg] cached background track");
    return `lv-bg-${slug}.mp4`;
  }

  const groups = [];
  const hookBeats = beats.filter((b) => b.type === "hook");
  if (hookBeats.length) groups.push({ key: "hook", ms: hookBeats.reduce((a, b) => a + b.ms, 0) + 400 });
  for (let ci = 1; ci <= (doc.chapters?.length || 0); ci++) {
    const chBeats = beats.filter((b) => b.ch === ci);
    if (chBeats.length) groups.push({ key: String(ci), ms: chBeats.reduce((a, b) => a + b.ms, 0) });
  }
  const outroBeats = beats.filter((b) => b.type === "end");
  if (outroBeats.length) groups.push({ key: "outro", ms: outroBeats.reduce((a, b) => a + b.ms, 0) + 1500 });

  const segFiles = [];
  let t = 0;
  for (const g of groups) {
    const clip = brollByChapter[g.key] ? path.join(PUB, brollByChapter[g.key]) : null;
    const seg = path.join(brollDir, `seg-${g.key}.mp4`);
    const secs = (g.ms / 1000).toFixed(2);
    if (!clip) {
      segFiles.push(seg);
      execFileSync(FF, ["-y", "-v", "error", "-f", "lavfi", "-i", `color=c=0x0A1128:s=1920x1080:d=${secs}`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", seg], { timeout: 120000 });
      continue;
    }
    execFileSync(FF, ["-y", "-v", "error", "-stream_loop", "40", "-ss", ((t % 20) + 2).toFixed(2), "-i", clip,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,drawbox=c=0x080A14@0.68:t=fill",
      "-t", secs, "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p", seg], { timeout: 600000 });
    segFiles.push(seg);
    t += g.ms / 1000;
  }

  const listFile = path.join(brollDir, "concat.txt");
  fs.writeFileSync(listFile, segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  execFileSync(FF, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", bgOut], { timeout: 600000 });
  segFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
  console.log(`[bg] background track ready (${(fs.statSync(bgOut).size / 1048576).toFixed(0)}MB)`);
  return `lv-bg-${slug}.mp4`;
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

// one sentence per beat (2 only if both are very short) — text always matches
// exactly what the voice is saying at that moment
function groupBeats(sentences) {
  const groups = [];
  for (const s of sentences) {
    if (s.length <= 55 && groups.length && groups[groups.length - 1].length + s.length <= 105) {
      groups[groups.length - 1] += " " + s;
    } else {
      groups.push(s);
    }
  }
  return groups;
}

// ---- 1. build beats -------------------------------------------------------
const beats = [];
const numbersSeen = [];

const push = (b) => beats.push(b);

push({ type: "hook", text: script.hook });


script.promise && push({ type: "statement", text: script.promise, ch: 1 });

script.chapters.forEach((ch, ci) => {
  push({ type: "chapter", n: ci + 1, chapterTitle: ch.title, ch: ci + 1 });
  const groups = groupBeats(splitSentences(ch.narration));
  for (const g of groups) {
    const num = extractNumber(g);
    if (num && num.num >= 20) {
      numbersSeen.push({ label: g.length > 90 ? g.slice(0, 87) + "…" : g, value: num.big });
      push({ type: "number", big: num.big, label: g, text: g, ch: ci + 1 });
    } else {
      push({ type: "statement", text: g, ch: ci + 1 });
    }
  }
  if ((ci === 1 || ci === 3) && numbersSeen.length >= 2) {
    const rows = numbersSeen.slice(-4).slice(0, 3).map((n) => ({ label: n.label, value: n.value }));
    push({ type: "panel", rows, ch: ci + 1 });
  }
});

push({ type: "end", text: script.topic });

// ---- 1b. b-roll background per chapter (Pixabay test phase) ----------------
let brollByChapter = {};
if (!process.argv.includes("--no-broll")) {
  console.log("[broll] fetching chapter background clips…");
  brollByChapter = await fetchChapterBroll(slug, script);
  const got = Object.keys(brollByChapter).length;
  console.log(`[broll] ${got}/${script.chapters.length + 2} clips ready`);
  for (const b of beats) {
    const key = b.type === "hook" ? "hook" : b.type === "end" ? "outro" : b.ch ? String(b.ch) : null;
    if (key && brollByChapter[key]) b.broll = brollByChapter[key];
  }
}

// ---- 2. narration TTS per beat --------------------------------------------
const audioDir = path.join(PUB, "lv-audio", slug);
fs.mkdirSync(audioDir, { recursive: true });
const spoken = beats.map((b, i) => ({ i, text: b.text || b.label || b.chapterTitle || "" }))
  .filter((x) => x.text.trim().length > 0);
fs.writeFileSync(path.join(audioDir, "tts-input.json"), JSON.stringify(spoken));

const durCache = path.join(audioDir, "tts-durations.json");
const cachedOk = (() => {
  try {
    const c = JSON.parse(fs.readFileSync(durCache, "utf8"));
    if (c.length !== spoken.length) return false;
    // #44: cached audio may only be reused when the beat text is unchanged
    return c.every((d) => {
      const mp3 = path.join(audioDir, "audio", `beat-${String(d.i).padStart(2, "0")}.mp3`);
      const beat = spoken.find((b) => b.i === d.i);
      return beat && d.textHash === textHash(beat.text) &&
        fs.existsSync(mp3) && fs.statSync(mp3).size > 10 * 1024;
    });
  } catch { return false; }
})();

if (cachedOk) {
  console.log(`[lv] using cached TTS (${spoken.length} beats)`);
} else {
  console.log(`[lv] synthesizing ${spoken.length}/${beats.length} beats`);
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  execFileSync("python", [path.join(ROOT, "explainer", "edge_batch.py"), path.join(audioDir, "tts-input.json")], {
    stdio: "inherit",
    env: { ...process.env, EXPLAINER_VOICE: process.env.EXPLAINER_VOICE || "en-US-AndrewNeural", EXPLAINER_RATE: process.env.EXPLAINER_RATE || "-7%" },
  });
}
const durs = JSON.parse(fs.readFileSync(durCache, "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

const probeMs = (file) => {
  try { return Math.round(parseFloat(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) * 1000); }
  catch { return 0; }
};

// ---- 3. timeline -----------------------------------------------------------
let cursor = 400;
for (let i = 0; i < beats.length; i++) {
  const b = beats[i];
  const d = durByI.get(i);
  const isSilent = !d;
  const audio = d ? `lv-audio/${slug}/audio/beat-${String(i).padStart(2, "0")}.mp3` : null;
  const spokenMs = d ? Math.max(d.ms, probeMs(path.join(PUB, audio))) + PAD_MS : 0;
  b.audio = audio;
  b.startMs = Math.round(cursor);
  b.ms = Math.round(isSilent ? (b.type === "chapter" ? CHAPTER_GAP_MS : 2000) : spokenMs);
  cursor += b.ms;
}
const totalMs = Math.round(cursor + 1500);

// one continuous background track (fast-render architecture)
let bgTrack = null;
if (Object.keys(brollByChapter).length) {
  bgTrack = await buildBackgroundTrack(slug, beats, script);
}

// music
const trackName = script.musicTrack || "quiet-night.mp3";
const musicSrc = path.join(ROOT, "image-tools", "audio", trackName);
const fallbackMusic = path.join(ROOT, "image-tools", "audio", "quiet-night.mp3");
const musicDst = path.join(PUB, "lv-music.mp3");
if (fs.existsSync(musicSrc)) {
  fs.copyFileSync(musicSrc, musicDst);
  console.log(`[lv] using music: ${trackName}`);
} else if (fs.existsSync(fallbackMusic)) {
  fs.copyFileSync(fallbackMusic, musicDst);
  console.log(`[lv] fallback music: quiet-night.mp3`);
}

const doc = { title: script.title, beats, totalMs, fps: 24, bgTrack };
const out = path.join(PUB, `longvideo-${slug}.json`);
fs.writeFileSync(out, JSON.stringify(doc, null, 2));
const mins = totalMs / 60000;
console.log(`[lv] ${beats.length} beats, ${mins.toFixed(1)} min -> ${out}`);
if (mins < script.minutes * 0.75) { console.error("[lv] too short!"); process.exit(2); }
console.log(`[lv] render with: npx remotion render remotion/index.ts LongVideo out/long-${slug}.mp4 --props=public/longvideo-${slug}.json`);
