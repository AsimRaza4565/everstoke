// TECH EXPLAIN demo factory — LOCAL ONLY (do not commit/push).
// Builds narration + captions + music, writes props json, renders 1080p locally.
//   node make-tech-demo.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pickApprovedTrack } from "../music-engine.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
const IS_WIN = process.platform === "win32";
const PY = IS_WIN ? "python" : "python3";
const spawnOpts = { stdio: "inherit", shell: IS_WIN };

try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { }

// scene narration (beat texts) — scene slots 1..4, starts/durs mirror tech-explain.tsx
const STARTS = [0, 3, 13.5, 24, 35, 48];
const DURS = [3, 10.5, 10.5, 11, 13, 4.5];
const TEXTS = [
  "Every database needs a unique ID for every row. The simplest way is to just count. One thousand one, one thousand two, one thousand three. Done.",
  "A plain integer uses only four bytes. A UUID uses sixteen, and it is impossible to say out loud. So why would anyone pay four times the memory?",
  "Because the moment you run two databases, one in the US and one in Europe, both start counting from zero. And both generate ID one thousand one. Collision.",
  "The fix is UUID version seven. It hides a timestamp inside the ID itself, so every value is unique, and the newest rows always sort first. That is why modern systems love it.",
];

// ---------------- TTS ----------------
const audioDir = path.join(PUB, "tech-audio");
fs.mkdirSync(audioDir, { recursive: true });
const spoken = TEXTS.map((text, i) => ({ i, text }));
const inPath = path.join(audioDir, "tts-input.json");
fs.writeFileSync(inPath, JSON.stringify(spoken));
const tts = spawnSync(PY, [path.join(EXPL, "edge_batch.py"), inPath], { ...spawnOpts, env: { ...process.env, EXPLAINER_VOICE: "en-US-AndrewNeural", EXPLAINER_RATE: "+4%" } });
if (tts.status !== 0) throw new Error("tts failed");
const durs = JSON.parse(fs.readFileSync(path.join(audioDir, "tts-durations.json"), "utf8"));
const byI = new Map(durs.map((d) => [d.i, d]));
const buildWords = (ws) => (ws || []).map((w) => ({ w: w.w, t0: Math.round(w.s * 1000), t1: Math.round((w.s + w.d) * 1000) }));

// sanity: narration must fit its scene window
for (let i = 0; i < 4; i++) {
  const d = byI.get(i)?.ms || 0;
  const avail = DURS[i + 1] * 1000 - 400;
  console.log(`[tts] scene ${i + 1}: ${(d / 1000).toFixed(1)}s / ${((DURS[i + 1] * 1000) / 1000).toFixed(0)}s window`);
  if (d > avail) console.log(`[warn] scene ${i + 1} narration may overflow its window`);
}

// ---------------- music ----------------
const ALL = JSON.parse(fs.readFileSync(path.join(DIR, "approved-music.json"), "utf8"));
const tech = ALL.filter((m) => m.group === "TECH");
const track = await (async () => { try { return await pickApprovedTrack((tech.length ? tech : ALL).map((m) => m.title)); } catch { return null; } })();
let music = null;
if (track) {
  music = "tech-audio/music.mp3";
  fs.copyFileSync(track.file, path.join(PUB, music));
  console.log(`[music] "${track.title}"`);
}

// ---------------- props ----------------
const sceneAudio = [0, 1, 2, 3].map((i) => {
  const rel = `tech-audio/audio/beat-${String(i).padStart(2, "0")}.mp3`;
  return fs.existsSync(path.join(PUB, rel)) && fs.statSync(path.join(PUB, rel)).size > 2048 ? rel : null;
});
const props = {
  sceneWords: [0, 1, 2, 3].map((i) => buildWords(byI.get(i)?.words)),
  sceneAudio,
  music,
};
const propsPath = path.join(PUB, "tech-demo.json");
fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
console.log(`[props] ${propsPath}`);

// ---------------- render (local only) ----------------
const ensure = spawnSync("npx", ["remotion", "browser", "ensure"], { cwd: EXPL, ...spawnOpts });
if (ensure.status !== 0) throw new Error("browser ensure failed");
const outMp4 = path.join(EXPL, "out", "tech-demo.mp4");
const args = ["remotion", "render", "remotion/index.ts", "TechExplain", outMp4, `--props=${propsPath}`, "--concurrency=3", "--timeout=180000", "--port=3497"];
let r = spawnSync("npx", args, { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) r = spawnSync(args.map((a) => (a === "--concurrency=3" ? "--concurrency=2" : a)), { cwd: EXPL, ...spawnOpts });
if (r.status !== 0) throw new Error("render failed");
console.log(`[DONE] ${outMp4} (${(fs.statSync(outMp4).size / 1048576).toFixed(1)} MB)`);
