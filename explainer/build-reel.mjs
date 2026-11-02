// Reel builder: spec json -> per-beat Edge TTS -> timeline json -> vertical render.
// Usage: node build-reel.mjs reels/money.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fetchBroll } from "./broll-pixabay.mjs";
import { textHash } from "../lib/text-hash.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
import { resolveBinary } from '../lib/ffmpeg.mjs';
const FFPROBE = resolveBinary('ffprobe');
const specPath = path.resolve(DIR, process.argv[2] || "reels/money.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

import { loadEnv } from '../lib/env.mjs';
loadEnv();

const PAD_MS = 260;
const SILENT_MS = 3000;

// 1. synth narration per beat (skipped if cached durations already match — survives offline re-runs)
const audioDir = path.join(DIR, "public", "reel-audio", spec.id);
fs.mkdirSync(audioDir, { recursive: true });
const spoken = spec.beats
  .map((b, i) => ({ b, i }))
  .filter(({ b, i }) => (spec.narration[i] || "").trim().length > 0)
  .map(({ b, i }) => ({ i, text: spec.narration[i] }));
fs.writeFileSync(path.join(audioDir, "tts-input.json"), JSON.stringify(spoken));

const durCache = path.join(audioDir, "tts-durations.json");
const cachedOk = (() => {
  try {
    const cached = JSON.parse(fs.readFileSync(durCache, "utf8"));
    if (cached.length !== spoken.length) return false;
    // #44: cached audio may only be reused when the beat text is unchanged
    for (const d of cached) {
      const mp3 = path.join(audioDir, "audio", `beat-${String(d.i).padStart(2, "0")}.mp3`);
      const beat = spoken.find((b) => b.i === d.i);
      if (!beat || d.textHash !== textHash(beat.text)) return false;
      if (!fs.existsSync(mp3) || fs.statSync(mp3).size < 10 * 1024) return false;
    }
    return true;
  } catch { return false; }
})();

if (cachedOk) {
  console.log(`[reel:${spec.id}] using cached TTS (${spoken.length} beats)`);
} else {
  console.log(`[reel:${spec.id}] synthesizing ${spoken.length}/${spec.beats.length} beats`);
  execFileSync("python", [path.join(DIR, "edge_batch.py"), path.join(audioDir, "tts-input.json")], { stdio: "inherit" });
}
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, "tts-durations.json"), "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

const probeMs = (file) => {
  try {
    return Math.round(parseFloat(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) * 1000);
  } catch { return 0; }
};

// 2. b-roll: after beat durations are known, fetch one clip per beat that asked for it
// Cache filename includes a query slug — changing the query fetches a fresh clip.
const brollDir = path.join(DIR, "public", "reel-broll");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
const brollByI = new Map();
for (let i = 0; i < spec.beats.length; i++) {
  const b = spec.beats[i]?.broll;
  if (!b?.query) continue;
  const res = await fetchBroll({
    key: process.env.PIXABAY_API_KEY,
    query: b.query,
    minDurationSec: ((durByI.get(i)?.ms || 8000) / 1000) + 0.5,
    outPath: path.join(brollDir, `${spec.id}-b${i}-${slug(b.query)}.mp4`),
  });
  if (res) brollByI.set(i, path.relative(path.join(DIR, "public"), res.file).split(path.sep).join("/"));
}

// 3. timeline
let cursor = 250;
const timeline = spec.beats.map((b, i) => {
  const d = durByI.get(i);
  const audio = d ? `reel-audio/${spec.id}/audio/beat-${String(i).padStart(2, "0")}.mp3` : null;
  const ms = d ? Math.max(d.ms, probeMs(path.join(DIR, "public", audio))) + PAD_MS : SILENT_MS;
  const entry = { i, startMs: Math.round(cursor), ms: Math.round(ms), audio };
  if (brollByI.has(i)) entry.broll = brollByI.get(i);
  cursor += entry.ms;
  return entry;
});
const totalMs = Math.round(cursor + 400);

const doc = { spec, timeline, totalMs, fps: 30 };
const outJson = path.join(DIR, "public", `reel-${spec.id}.json`);
fs.writeFileSync(outJson, JSON.stringify(doc, null, 2));
const secs = totalMs / 1000;
console.log(`[reel:${spec.id}] ${secs.toFixed(1)}s timeline -> ${outJson}`);
if (secs < 20) { console.error("[reel] too short"); process.exit(2); }

// 3. render
fs.mkdirSync(path.join(DIR, "out", "reels"), { recursive: true });
const outMp4 = `out/reels/${spec.id}.mp4`;
console.log(`[reel:${spec.id}] rendering ${outMp4}`);
const r = spawnSync("npx", ["remotion", "render", "remotion/index.ts", "Reel", outMp4, `--props=public/reel-${spec.id}.json`, "--log", "error"], {
  stdio: "inherit", cwd: DIR, shell: process.platform === "win32",
});
if (r.status !== 0) {
  console.error(`[reel:${spec.id}] render failed, retrying once`);
  const r2 = spawnSync("npx", ["remotion", "render", "remotion/index.ts", "Reel", outMp4, `--props=public/reel-${spec.id}.json`, "--log", "error"], {
    stdio: "inherit", cwd: DIR, shell: process.platform === "win32",
  });
  if (r2.status !== 0) process.exit(1);
}
console.log(`[reel:${spec.id}] DONE -> out/reels/${spec.id}.mp4`);
