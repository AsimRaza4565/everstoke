// PsychToon demo orchestrator.
// Reads public/psych-storyboard.json (scenes + narration), synthesizes each
// scene's narration with Edge TTS via the hardened edge_batch.py, probes real
// durations, computes the scene timeline, and writes public/psych-demo.json —
// the input props for the "PsychToon" Remotion composition.
//
//   node make-psych-demo.mjs           # build timeline only
//   node make-psych-demo.mjs --render  # then render out/psych-demo.mp4
import fs from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";

const DIR = import.meta.dirname;
const PUB = path.join(DIR, "public");
const OUT = path.join(PUB, "psych-demo.json");
const SB = path.join(PUB, "psych-storyboard.json");

const LEAD_MS = 300;   // breath before the first scene
const PAD_MS = 480;    // breath after each scene's narration
const TAIL_MS = 900;   // hold the last scene briefly

const sb = JSON.parse(fs.readFileSync(SB, "utf8"));
const scenes = sb.scenes;

// ---- 1. TTS -----------------------------------------------------------------
// #44: psych-private workspace — edge_batch derives its audio/ + durations
// from the beats file's directory, so psych no longer shares
// public/audio + public/tts-durations.json with the explainer run (the old
// shared workspace made "resume" replay psych narration under explainer text).
const PSYCH_TTS = path.join(PUB, "psych-tts");
fs.mkdirSync(PSYCH_TTS, { recursive: true });
const beatsIn = path.join(PSYCH_TTS, "psych-tts-input.json");
fs.writeFileSync(beatsIn, JSON.stringify(scenes.map((s, i) => ({ i, text: s.narration }))));

const ownDursPath = path.join(PSYCH_TTS, "tts-durations.json");

console.log(`[psych] synthesizing ${scenes.length} scenes (voice: ${sb.voice || process.env.EXPLAINER_VOICE || "en-US-AndrewNeural"})`);
execFileSync("python", [path.join(DIR, "edge_batch.py"), beatsIn], { stdio: "inherit", env: { ...process.env, EXPLAINER_VOICE: sb.voice || "en-US-AndrewNeural" } });

const durs = JSON.parse(fs.readFileSync(ownDursPath, "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

import { resolveBinary } from '../lib/ffmpeg.mjs';
const FFPROBE = resolveBinary('ffprobe');
const probeMs = (file) => {
  try {
    const out = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(PUB, file)]).toString().trim();
    return Math.round(parseFloat(out) * 1000);
  } catch {
    return 0;
  }
};

// ---- 2. timeline + word-synced actions ---------------------------------------
// Actions can trigger on `word` — resolved to seconds-within-scene using the
// Edge TTS word boundaries captured during synthesis.
let cursor = LEAD_MS;
scenes.forEach((s, i) => {
  const audio = `psych-tts/audio/beat-${String(i).padStart(2, "0")}.mp3`;
  const beat = durByI.get(i);
  const spoken = Math.max(beat?.ms ?? 0, probeMs(audio));
  s.audio = audio;
  s.startMs = cursor;
  s.ms = spoken + PAD_MS;

  if (Array.isArray(s.actions) && s.actions.length > 0 && Array.isArray(beat?.words) && beat.words.length > 0) {
    const words = beat.words; // [{ w, s }] relative to audio start
    let searchFrom = 0;
    for (const a of s.actions) {
      if (!a.word || a.at !== undefined) continue;
      const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9']/g, "");
      let idx = words.findIndex((w, j) => j >= searchFrom && norm(w.w) === norm(a.word));
      if (idx < 0) idx = words.findIndex((w) => norm(w.w) === norm(a.word)); // same word may drive two cues
      if (idx >= 0) {
        a.at = Math.max(0, words[idx].s - 0.15); // land the cue just before the word
        searchFrom = idx + 1;
        if (a.prop !== undefined && s.props?.[a.prop]) {
          s.props[a.prop].hideUntil = a.at; // prop pops in on its word
          delete a.prop;
        }
      } else {
        console.warn(`[psych] scene ${i + 1}: word "${a.word}" not found in TTS — cue dropped`);
        a.at = undefined;
      }
    }
  }
  cursor += s.ms;
});
const totalMs = cursor + TAIL_MS - PAD_MS;

// ---- 3. music ----------------------------------------------------------------
let music = null;
if (sb.music?.src) {
  const cachePath = path.join(DIR, "..", ".music-cache", sb.music.src);
  const dest = path.join(PUB, "psych-music.mp3");
  fs.copyFileSync(cachePath, dest);
  music = { src: "psych-music.mp3", volume: sb.music.volume ?? 0.11 };
}

// ---- 4. props doc --------------------------------------------------------------
const doc = {
  title: sb.title,
  fps: 30,
  width: 1920,
  height: 1080,
  totalMs,
  music,
  scenes,
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));

console.log("\n[psych] timeline:");
scenes.forEach((s, i) => {
  const sec = (s.ms / 1000).toFixed(1).padStart(5);
  console.log(`  scene ${i + 1}  ${sec}s  ${(s.label?.text || s.cardText || s.signText || "").slice(0, 40)}`);
});
console.log(`  TOTAL    ${(totalMs / 1000).toFixed(1)}s  ->  public/psych-demo.json`);

if (process.argv.includes("--render")) {
  console.log("\n[psych] rendering out/psych-demo.mp4 ...");
  execSync("npx remotion render remotion/index.ts PsychToon out/psych-demo.mp4 --props=public/psych-demo.json", {
    cwd: DIR,
    stdio: "inherit",
  });
  console.log("[psych] done -> explainer/out/psych-demo.mp4");
}
