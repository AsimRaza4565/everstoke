// Demo factory v2: 3 niches × Documentary-2 layouts, fully sequential.
// Per video: script (LONGVIDEO keys) -> beats (chapter cards, split layouts with
// Pexels photos, stat beats) -> Edge-TTS -> docv2 json -> 720p render (retry once).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchPhoto } from "../explainer/assets-photos.mjs";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
const EXPL = path.join(ROOT, "explainer");
const PUB = path.join(EXPL, "public");
import { resolveBinary } from '../lib/ffmpeg.mjs';
import { textHash } from '../lib/text-hash.mjs';
import { loadEnv } from '../lib/env.mjs';

loadEnv();
const FFPROBE = resolveBinary('ffprobe');




const VIDEOS = [
  { n: 1, topic: "The Fake Tweet That Erased 136 Billion Dollars in 3 Minutes", brand: "investors-compass",
    kicker: "MARKET SHOCK // 2013",
    photoQueries: ["stock market crash screens", "wall street buildings", "smartphone news alert", "trading floor monitors"] },
  { n: 2, topic: "The Company That Pays You to Quit Your Job", brand: "money-rulebook",
    kicker: "CAREER ECONOMICS // PAY TO QUIT",
    photoQueries: ["modern office workspace", "resignation letter desk", "money cash bonus", "professional walking out"] },
  { n: 3, topic: "The Tiny Island That Makes 90 Percent of the Worlds Most Advanced Chips", brand: "ai-observer",
    kicker: "CHIP GEOGRAPHY // TAIWAN",
    photoQueries: ["semiconductor fab cleanroom", "microchip macro closeup", "taiwan city skyline", "computer chip circuit"] },
];

const fit = (text, max) => {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";
};
const sentences = (text) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const chunk = (text, max) => {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  const out = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  return out;
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.quiet ? "pipe" : "inherit", shell: process.platform === "win32", cwd: opts.cwd || ROOT, ...opts });
  if (r.status !== 0) throw new Error(`${tag(args)} failed`);
}
const tag = (args) => args.filter((a) => !String(a).startsWith("-")).join(" ").slice(0, 90);

function ttsBeats(slug, beats) {
  const audioDir = path.join(PUB, "v2-audio", slug);
  fs.mkdirSync(audioDir, { recursive: true });
  const spoken = beats.map((b, i) => ({ i, text: b.text || "" })).filter((b) => b.text.trim());
  const inPath = path.join(audioDir, "tts-input.json");
  fs.writeFileSync(inPath, JSON.stringify(spoken));

  // resume: reuse existing good audio
  const durCache = path.join(audioDir, "tts-durations.json");
  const cachedOk = (() => {
    try {
      const c = JSON.parse(fs.readFileSync(durCache, "utf8"));
      if (c.length !== spoken.length) return false;
      return c.every((d) => fs.existsSync(path.join(audioDir, "audio", `beat-${String(d.i).padStart(2, "0")}.mp3`)) && fs.statSync(path.join(audioDir, "audio", `beat-${String(d.i).padStart(2, "0")}.mp3`)).size > 10240);
    } catch { return false; }
  })();
  if (cachedOk) { console.log(`  [tts] cached`); return JSON.parse(fs.readFileSync(durCache, "utf8")); }

  const r = spawnSync("python", [path.join(EXPL, "edge_batch.py"), inPath], { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error("tts failed");
  return JSON.parse(fs.readFileSync(durCache, "utf8"));
}

const probeMs = (file) => {
  try { return Math.round(parseFloat(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout.toString().trim()) * 1000); }
  catch { return 0; }
};

async function makeVideo(v) {
  const slug = slugify(v.topic);
  console.log(`\n=== VIDEO ${v.n}: ${v.topic} (${v.brand}) ===`);

  // ---- script ----
  cd(DIR);
  run("node", ["generate-longscript.mjs", "--topic", v.topic, "--minutes", "9", "--brand", v.brand], { cwd: DIR });
  const outRoot = path.join(DIR, "out");
  const slugDir = fs.readdirSync(outRoot).map((f) => path.join(outRoot, f)).filter((f) => fs.statSync(f).isDirectory()).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const script = JSON.parse(fs.readFileSync(path.join(slugDir, "script.json"), "utf8"));
  console.log(`  [script] ${script.stats.totalWords}w ≈ ${script.stats.estMinutes}min`);

  // ---- beats ----
  const beats = [];
  const push = (b) => { b.i = beats.length; beats.push(b); return b; };

  push({ layout: "hero", kicker: v.kicker, headline: fit(script.hook, 120), text: script.hook });
  script.chapters.forEach((ch, ci) => {
    push({ layout: "chapter", n: ci + 1, chapterTitle: ch.title });
    const sents = sentences(ch.narration);
    for (const s of sents) {
      const isStat = /(\$\d|\d+%|\d{4,})/.test(s);
      push({ layout: isStat ? "stat" : "split", n: ci + 1, chapterTitle: ch.title, side: beats.length % 2 ? "right" : "left", headline: fit(s, 140), text: s });
    }
  });
  push({ layout: "end", text: "Follow for daily breakdowns." });

  // ---- photos (chapters + alternates) ----
  const photoDir = path.join(PUB, "v2-photos", `v${v.n}`);
  const photos = [];
  for (let k = 0; k < 8; k++) {
    const q = v.photoQueries[k % v.photoQueries.length];
    const r = await fetchPhoto({ key: process.env.PEXELS_API_KEY, query: q, outPath: path.join(photoDir, `p-${k}.jpg`) });
    if (r) photos.push(path.relative(PUB, r.file).split(path.sep).join("/"));
  }
  let pi = 0;
  const nextPhoto = () => (photos.length ? photos[pi++ % photos.length] : null);

  // ---- TTS + durations ----
  const durs = ttsBeats(slug, beats);
  const durByI = new Map(durs.map((d) => [d.i, d.ms]));

  // ---- timeline (statement beats rotate split sides + photos) ----
  let cursor = 600;
  let photoIdx = 0;
  for (const b of beats) {
    const d = durByI.get(b.i);
    const spokenMs = d ? Math.max(d.ms, probeMs(path.join(PUB, "v2-audio", slug, "audio", `beat-${String(b.i).padStart(2, "0")}.mp3`))) : 0;
    b.ms = Math.round(d ? spokenMs + 500 : 2800);
    b.startMs = Math.round(cursor);
    cursor += b.ms;
    if (b.layout === "split" || b.layout === "statement") {
      b.photo = nextPhoto();
      b.layout = "split";
    }
    if (b.layout === "hero") {
      b.photo = nextPhoto();
    }
  }
  const totalMs = Math.round(cursor + 1200);

  const doc = { title: script.title, beats, totalMs, fps: 24, brand: v.brand };
  const jsonPath = path.join(PUB, `docv2-${slug}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(doc, null, 2));
  console.log(`  [doc] ${beats.length} beats, ${(totalMs / 60000).toFixed(1)} min -> ${path.basename(jsonPath)}`);

  // ---- render ----
  cd(EXPL);
  const outMp4 = `out/demo-${v.n}-${slug}.mp4`;
  const args = ["remotion", "render", "remotion/index.ts", "DocV2", outMp4, `--props=${jsonPath}`, "--width=1280", "--height=720", "--concurrency=4", "--timeout=180000", "--port=3486"];
  let r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32", cwd: EXPL });
  if (r.status !== 0) {
    console.log("  render retry (concurrency 3)");
    r = spawnSync("npx", args.concat(["--concurrency=3"]).filter((a) => a !== "--concurrency=4"), { stdio: "inherit", shell: process.platform === "win32", cwd: EXPL });
  }
  if (r.status !== 0) throw new Error(`render failed: ${outMp4}`);
  console.log(`  DONE -> ${outMp4}`);
}

const cd = (d) => { process.chdir(d); };
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function main() {
  for (const v of VIDEOS) {
    try {
      await makeVideo(v);
    } catch (e) {
      console.error(`VIDEO ${v.n} FAILED: ${String(e.message).slice(0, 200)}`);
    }
  }
  console.log("=== ALL VIDEOS PROCESSED ===");
}
main();
