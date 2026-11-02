// Deterministic: rebuild beats from script.json -> fresh TTS -> staged props json.
// Usage: node stage-docv2.mjs <slug>
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
import { resolveBinary } from '../lib/ffmpeg.mjs';
const FFPROBE = resolveBinary('ffprobe');

const slug = process.argv[2];
if (!slug) { console.error("usage: node stage-docv2.mjs <slug>"); process.exit(1); }

const BRANDS = {
  "the-fake-tweet": { kicker: "MARKET SHOCK // 2013", brand: "INVESTOR'S COMPASS" },
  "the-company": { kicker: "CAREER ECONOMICS // PAY TO QUIT", brand: "SILENT BRIEFING" },
  "the-tiny-island": { kicker: "CHIP GEOGRAPHY // TAIWAN", brand: "AI OBSERVER" },
};
const bk = Object.keys(BRANDS).find((k) => slug.startsWith(k)) || "the-fake-tweet";
const KICKER = BRANDS[bk].kicker;
const BRAND = BRANDS[bk].brand;

const script = JSON.parse(fs.readFileSync(path.join(DIR, "out", slug, "script.json"), "utf8"));
const sentences = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

// ---- beats (deterministic) ----
const beats = [];
const push = (b) => { b.i = beats.length; beats.push(b); };
push({ layout: "hero", kicker: KICKER, headline: script.hook.slice(0, 130), text: script.hook });
script.chapters.forEach((ch, ci) => {
  push({ layout: "chapter", n: ci + 1, chapterTitle: ch.title });
  for (const s of sentences(ch.narration)) {
    const isStat = /(\$\d|\d+%|\d{4,})/.test(s);
    push({ layout: isStat ? "stat" : "split", n: ci + 1, chapterTitle: ch.title,
      headline: s.length > 140 ? s.slice(0, s.lastIndexOf(" ", 140)) + "…" : s, text: s });
  }
});
push({ layout: "end", headline: "Follow for daily breakdowns.", text: "Follow for daily breakdowns." });

// ---- fresh TTS (flaky-net hardened, per-beat resume) ----
const audioDir = path.join(PUB, "v2-audio", slug);
fs.mkdirSync(path.join(audioDir, "audio"), { recursive: true });
const spoken = beats.filter((b) => (b.text || "").trim()).map((b) => ({ i: b.i, text: b.text }));
const inPath = path.join(audioDir, "tts-input.json");
fs.writeFileSync(inPath, JSON.stringify(spoken));

const durCache = path.join(audioDir, "tts-durations.json");
const cachedOk = (() => {
  try {
    const c = JSON.parse(fs.readFileSync(durCache, "utf8"));
    return c.length === spoken.length && c.every((d) => {
      const mp3 = path.join(audioDir, "audio", `beat-${String(d.i).padStart(2, "0")}.mp3`);
      return fs.existsSync(mp3) && fs.statSync(mp3).size > 10240;
    });
  } catch { return false; }
})();
if (cachedOk) console.log("[tts] cached");
else {
  console.log(`[tts] synthesizing ${spoken.length}/${beats.length} beats`);
  const r = spawnSync("python", [path.join(EXPL, "edge_batch.py"), inPath], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error("[tts] failed"); process.exit(1); }
}
const durs = JSON.parse(fs.readFileSync(durCache, "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

const probeMs = (f) => {
  try { return Math.round(parseFloat(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString().trim()) * 1000); }
  catch { return 0; }
};

// ---- timeline ----
let cursor = 500;
for (const b of beats) {
  const d = durByI.get(b.i);
  const audioRel = d ? `v2-audio/${slug}/audio/beat-${String(b.i).padStart(2, "0")}.mp3` : null;
  const audioAbs = audioRel ? path.join(PUB, audioRel) : null;
  const spokenMs = d ? Math.max(d.ms, probeMs(audioAbs)) : 0;
  b.audio = audioRel;
  b.ms = Math.round(d ? spokenMs + 600 : 2600);
  b.startMs = Math.round(cursor);
  cursor += b.ms;
}
const totalMs = Math.round(cursor + 1200);

// music
const musicSrc = path.join(ROOT, "image-tools", "audio", "quiet-night.mp3");
if (fs.existsSync(musicSrc)) fs.copyFileSync(musicSrc, path.join(PUB, "lv2-music.mp3"));

const doc = { title: script.title, brand: BRAND, kicker: KICKER, style: "documentary",
  beats, totalMs, fps: 24, music: "lv2-music.mp3" };
const stagePath = path.join(EXPL, "out", "props-stage", `${slug}.json`);
fs.mkdirSync(path.dirname(stagePath), { recursive: true });
fs.writeFileSync(stagePath, JSON.stringify(doc, null, 2));
console.log(`[stage] ${slug}: ${beats.length} beats, ${(totalMs / 60000).toFixed(1)} min -> ${stagePath}`);
