// Vox paper-collage documentary DEMO (Rachit Singh style, rebuilt on our free stack).
// Narration -> Edge TTS | cutout images -> Pollinations + ffmpeg white-key | SFX -> ffmpeg synth
// Output: public/vox-collage-demo.json + public/vox-collage/ (images, audio, sfx)
// Render: npx remotion render remotion/index.ts VoxCollage out/vox-collage-demo.mp4 --props=public/vox-collage-demo.json
import fs from "node:fs";
import { fetchBuffer } from "../lib/fetch-safe.mjs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIR = import.meta.dirname;
const PUB = path.join(DIR, "public", "vox-collage");
const RAW = path.join(PUB, "raw");
const IMG = path.join(PUB, "img");
const AUD = path.join(PUB, "audio");
const SFX = path.join(PUB, "sfx");
const ONLY = process.argv[2]; // optional: regenerate one asset key, e.g. `node make-vox-demo.mjs img:vault`

import { resolveBinary } from '../lib/ffmpeg.mjs';
const FF = resolveBinary('ffmpeg');
const FFPROBE = resolveBinary('ffprobe');

for (const d of [PUB, RAW, IMG, AUD, SFX]) fs.mkdirSync(d, { recursive: true });

// ---- Stage 4+5+6 of the Rachit system: fact-checked spine, TTS-clean narration, 4s beats ----
// Rules: no commas, only . and ?, numbers spoken, no invented stats, no faces in images.
const BEATS = [
  { id: "B001", text: "December 2008. New York City. Snow was falling on Wall Street.", img: "skyline", label: "DECEMBER 2008" },
  { id: "B002", text: "Investigators walked into a luxury apartment and arrested Bernard Madoff.", img: "arrest" },
  { id: "B003", text: "The seventy year old man ran Wall Street's biggest private fund.", img: "suit", label: "MADOFF" },
  { id: "B004", text: "For decades people trusted him with their life savings.", img: "hands-money" },
  { id: "B005", text: "Banks trusted him. Charities trusted him. Even other crooks trusted him.", img: "bank" },
  { id: "B006", text: "Then one day he told his sons a terrible secret.", img: "two-figures", thread: true },
  { id: "B007", text: "His famous fund was fake. One giant Ponzi scheme.", img: "cycle" },
  { id: "B008", text: "New money kept flowing in to pay the old investors.", img: "cash" },
  { id: "B009", text: "There was just one problem. The vault was empty.", img: "vault" },
  { id: "B010", text: "Losses reached about sixty five billion dollars. The largest fraud in history.", img: "shredded", stamp: "$65 BILLION" },
  { id: "B011", text: "Thousands of ordinary people lost everything they had.", img: "crowd" },
  { id: "B012", text: "In 2009 a judge gave him one hundred fifty years.", img: "gavel", stamp: "150 YEARS" },
  { id: "B013", text: "He never got out. He died behind bars in 2021.", img: "bars", label: "2021" },
  { id: "B014", text: "So how did one man fool the world for forty years?", img: "magnify" },
  { id: "B015", text: "He looked safe. He looked boring. And that was the trick.", img: null, card: true, stamp: "THE TRICK" },
];

const BG = { key: "bg-newsprint", p: "aged cream newsprint paper texture with faint old archival map lines and soft halftone print grain, flat matte documentary finish" };
const STY = "isolated product photo centered on a plain pure white background: {X}. simple flat composition, black and white halftone newspaper print style, vintage print grain, no text no letters no faces no people faces";
const IMGS = {
  skyline: "the New York City downtown skyline with tall skyscrapers",
  arrest: "a grand luxury apartment double door with a brass handle",
  suit: "an empty grey pinstripe businessman suit with shirt and tie displayed on a wooden coat hanger",
  "hands-money": "two hands holding a thick stack of one hundred dollar bills",
  bank: "a classical bank building facade with big stone columns",
  "two-figures": "two plain flat paper silhouette figures of men in suits standing face to face one holding a document",
  cycle: "a circular loop of paper arrows chasing each other clockwise",
  cash: "a thick banded stack of one hundred dollar bills",
  vault: "a massive round open steel bank vault door with a dark empty inside",
  shredded: "a heap of thin curly white paper confetti strips",
  crowd: "a large crowd of small plain faceless paper cutout people figures",
  gavel: "a wooden judge gavel resting on a small wooden block",
  bars: "a dark prison cell window with iron bars and a flat black paper silhouette standing behind",
  magnify: "a vintage brass magnifying glass lying on a blank white page",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (key) => !ONLY || ONLY === key;

async function dl(url, outPath, tries = 4) {
  for (let a = 1; a <= tries; a++) {
    try {
      // #65: deadline covers the body transfer
      const { buf } = await fetchBuffer(url, { timeoutMs: 150000 });
      if (buf.length < 8000) throw new Error(`too small ${buf.length}b`);
      fs.writeFileSync(outPath, buf);
      return;
    } catch (e) {
      console.log(`  [img] attempt ${a}/${tries} failed: ${String(e.message).slice(0, 70)}`);
      if (a === tries) throw e;
      await sleep(2500 * a);
    }
  }
}

function ff(args) {
  execFileSync(FF, ["-y", "-v", "error", ...args], { stdio: "inherit" });
}

// ---- images ----
async function makeImages() {
  const jobs = [{ ...BG, isBg: true }, ...Object.entries(IMGS).map(([key, p]) => ({ key, p }))];
  let n = 0;
  for (const j of jobs) {
    n++;
    const rawPath = path.join(RAW, `${j.key}.png`);
    const outPath = path.join(IMG, `${j.key}.png`);
    const prompt = j.isBg ? j.p : STY.replace("{X}", j.p);
    if (want(`img:${j.key}`) && !fs.existsSync(outPath)) {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&seed=${Math.floor(Math.random() * 99999)}`;
      process.stdout.write(`[img ${n}/${jobs.length}] ${j.key} ... `);
      try {
        await dl(url, rawPath);
        if (j.isBg) fs.copyFileSync(rawPath, outPath);
        else execFileSync("python", [path.join(DIR, "vox-key.py"), rawPath, outPath], { stdio: "inherit" });
        console.log("ok");
      } catch {
        console.log("FAILED (will retry on next run)");
      }
    } else if (fs.existsSync(outPath)) {
      console.log(`[img ${n}/${jobs.length}] ${j.key} cached`);
    }
  }
}

// ---- narration ----
async function makeAudio() {
  const inPath = path.join(PUB, "tts-input.json");
  const haveAll = BEATS.every((b) => {
    const f = path.join(AUD, `beat-${String(BEATS.indexOf(b)).padStart(2, "0")}.mp3`);
    return fs.existsSync(f) && fs.statSync(f).size > 4000;
  });
  if (haveAll && fs.existsSync(path.join(AUD, "durations.json")) && !ONLY) {
    console.log("[tts] cached");
    return;
  }
  fs.writeFileSync(inPath, JSON.stringify(BEATS.map((b, i) => ({ i, text: b.text }))));
  execFileSync("python", [path.join(DIR, "vox-tts.py"), inPath, AUD], { stdio: "inherit" });
}

// ---- paper sfx (synth, license-free) ----
function makeSfx() {
  if (!fs.existsSync(path.join(SFX, "swish.wav")))
    ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:duration=0.42:amplitude=0.8", "-af", "highpass=f=350,lowpass=f=2600,afade=t=in:d=0.07,afade=t=out:st=0.12:d=0.30,volume=1.5", path.join(SFX, "swish.wav")]);
  if (!fs.existsSync(path.join(SFX, "tap.wav")))
    ff(["-f", "lavfi", "-i", "anoisesrc=color=white:duration=0.09:amplitude=0.6", "-af", "highpass=f=1500,afade=t=out:st=0.015:d=0.07,volume=1.2", path.join(SFX, "tap.wav")]);
  if (!fs.existsSync(path.join(SFX, "stamp.wav")))
    ff(["-f", "lavfi", "-i", "sine=frequency=78:duration=0.24", "-f", "lavfi", "-i", "anoisesrc=color=brown:duration=0.06:amplitude=0.5", "-filter_complex", "[0:a]volume=2.2,afade=t=out:st=0.03:d=0.2[a0];[1:a]highpass=f=900,volume=1.4[a1];[a0][a1]amix=inputs=2:duration=first", path.join(SFX, "stamp.wav")]);
}

// ---- timeline doc ----
function makeDoc() {
  const durs = JSON.parse(fs.readFileSync(path.join(AUD, "durations.json"), "utf8"));
  const durByI = new Map(durs.map((d) => [d.i, d]));
  let cursor = 350;
  const beats = BEATS.map((b, i) => {
    const d = durByI.get(i);
    const audio = `vox-collage/audio/beat-${String(i).padStart(2, "0")}.mp3`;
    // #66: a beat whose TTS produced no file must be SKIPPED — an <Audio> on a
    // missing staticFile crashes the Remotion render instead of degrading
    if (!fs.existsSync(path.join(PUB, audio))) {
      console.warn(`[vox] beat ${i}: audio missing — skipping beat`);
      return null;
    }
    const spoken = Math.max(d?.ms || 0, 1200);
    const ms = Math.max(3800, spoken + 650); // >= 4s clip feel + breath
    const beat = {
      i, id: b.id, text: b.text, audio,
      img: b.img && fs.existsSync(path.join(IMG, `${b.img}.png`)) ? `vox-collage/img/${b.img}.png` : null,
      card: !!b.card,
      label: b.label || null, stamp: b.stamp || null, thread: !!b.thread,
      startMs: Math.round(cursor), ms: Math.round(ms),
    };
    cursor += ms;
    return beat;
  }).filter(Boolean);
  const doc = {
    title: "The Paper File: Madoff",
    fps: 30, width: 1920, height: 1080,
    bg: fs.existsSync(path.join(IMG, `${BG.key}.png`)) ? `vox-collage/img/${BG.key}.png` : null,
    totalMs: Math.round(cursor + 500),
    beats,
  };
  fs.writeFileSync(path.join(DIR, "public", "vox-collage-demo.json"), JSON.stringify(doc, null, 1));
  const secs = (doc.totalMs / 1000).toFixed(1);
  console.log(`[doc] ${beats.length} beats, total ${secs}s -> public/vox-collage-demo.json`);
  const missing = beats.filter((b) => !b.img).map((b) => b.id);
  if (missing.length) console.log(`[doc] WARNING beats without image: ${missing.join(", ")}`);
}

const onlyAudio = ONLY === "tts";
if (onlyAudio) await makeAudio();
else {
  await makeImages();
  await makeAudio();
  makeSfx();
  makeDoc();
}
