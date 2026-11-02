// Stage 2: narration. Synthesizes every narrated beat with Edge TTS (free),
// then assembles the final public/storyboard.json timeline used by Remotion.
// Chapter-card beats (empty text) become silent timed beats — no audio needed.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIR = import.meta.dirname;
const PUB = path.join(DIR, "public");
const BEATS_IN = path.join(PUB, "storyboard.beats.json");
const STORY_OUT = path.join(PUB, "storyboard.json");

const PAD_MS = 420;        // breath after each beat
const CARD_MS = 3200;      // silent chapter-card duration
const VISUAL_MS = 9000;    // silent panel/code beats — visuals carry them

const beatsDoc = JSON.parse(fs.readFileSync(BEATS_IN, "utf8"));
const beats = beatsDoc.beats;

// ---- collect beats that need audio ----
const spoken = beats
  .map((b, i) => ({ ...b, i }))
  .filter((b) => (b.text || "").trim().length > 0);

const ttsIn = path.join(PUB, "tts-input.json");
fs.writeFileSync(ttsIn, JSON.stringify(spoken.map((b) => ({ i: b.i, text: b.text }))));

console.log(`[tts] synthesizing ${spoken.length}/${beats.length} beats (voice: ${process.env.EXPLAINER_VOICE || "en-US-AndrewNeural"})`);
execFileSync("python", [path.join(DIR, "edge_batch.py"), ttsIn], { stdio: "inherit" });

const durs = JSON.parse(fs.readFileSync(path.join(PUB, "tts-durations.json"), "utf8"));
const durByI = new Map(durs.map((d) => [d.i, d]));

// real mp3 length (word boundaries end before trailing silence)
import { resolveBinary } from '../lib/ffmpeg.mjs';
const FFPROBE = resolveBinary('ffprobe');
const probeMs = (file) => {
  try {
    const out = execFileSync(
      FFPROBE,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(PUB, file)]
    ).toString().trim();
    return Math.round(parseFloat(out) * 1000);
  } catch {
    return 0;
  }
};

// ---- assemble timeline ----
let cursorMs = 300; // small lead-in before the first beat
const timeline = [];
beats.forEach((b, i) => {
  const d = durByI.get(i);
  const audio = d ? `audio/beat-${String(i).padStart(2, "0")}.mp3` : null;
  const spokenMs = d ? Math.max(d.ms, probeMs(audio)) : 0;
  const silentMs = b.tpl === "panel" || b.tpl === "code" ? VISUAL_MS : CARD_MS;
  const ms = d ? spokenMs + PAD_MS : silentMs;
  timeline.push({
    i,
    tpl: b.tpl,
    props: b.props || {},
    text: b.text || "",
    audio,
    words: d ? d.words : [],
    startMs: Math.round(cursorMs),
    ms: Math.round(ms),
  });
  cursorMs += ms;
});
const totalMs = Math.round(cursorMs + 1200); // tail after the last beat

const doc = {
  title: beatsDoc.title,
  chapters: beatsDoc.chapters,
  fps: 30,
  width: 1920,
  height: 1080,
  totalMs,
  beats: timeline,
};
fs.writeFileSync(STORY_OUT, JSON.stringify(doc, null, 2));

const spokenWords = timeline.reduce((a, b) => a + b.words.length, 0);
console.log(`[tts] wrote ${STORY_OUT}`);
console.log(`[tts] total ${(totalMs / 60000).toFixed(2)} min, ${timeline.length} beats, ${spokenWords} words timed`);
if (totalMs < 300000) {
  console.warn(`[tts] WARNING: only ${(totalMs / 60000).toFixed(2)} min — target was 5+ min`);
}
