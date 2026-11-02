// Orchestrator: script → tts → render → verify. Usage: node build.mjs [all|script|tts|render|verify]
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = import.meta.dirname;
const ROOT = path.resolve(DIR, "..");
import { resolveBinary } from '../lib/ffmpeg.mjs';
const FF = resolveBinary('ffmpeg');
const FP = resolveBinary('ffprobe');
const stage = process.argv[2] || "all";

const run = (cmd, args, opts = {}) => {
  console.log(`\n=== ${cmd.split(/[\\/]/).pop()} ${args[0] || ""} ===`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: DIR, shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    console.error(`[build] stage failed: ${args.join(" ").slice(0, 160)}`);
    process.exit(1);
  }
};

const outVideo = path.join(DIR, "out", "demo.mp4");

async function main() {
  if (stage === "all" || stage === "script") run("node", ["generate-script.mjs"]);
  if (stage === "all" || stage === "tts") run("node", ["tts.mjs"]);
  if (stage === "all" || stage === "render") {
    fs.mkdirSync(path.join(DIR, "out"), { recursive: true });
    run("npx", ["remotion", "render", "remotion/index.ts", "Explainer", "out/demo.mp4", "--props=public/storyboard.json", "--log", "error"]);
  }
  if (stage === "all" || stage === "verify") {
    const probe = JSON.parse(
      execFileSync(FP, ["-v", "error", "-show_entries", "format=duration,size", "-of", "json", outVideo]).toString()
    );
    const secs = parseFloat(probe.format.duration);
    console.log(`\n[verify] ${outVideo}`);
    console.log(`[verify] duration ${(secs / 60).toFixed(2)} min (${Math.round(secs)}s), size ${(parseInt(probe.format.size) / 1e6).toFixed(1)} MB`);
    if (secs < 300) console.warn("[verify] WARNING: under 5 minutes");
    const framesDir = path.join(DIR, "out", "frames");
    fs.mkdirSync(framesDir, { recursive: true });
    const durInt = Math.round(secs);
    for (let i = 0; i < 10; i++) {
      const t = Math.round((durInt * (i + 0.5)) / 10);
      execFileSync(FF, ["-y", "-v", "error", "-ss", String(t), "-i", outVideo, "-frames:v", "1", path.join(framesDir, `check-${String(i).padStart(2, "0")}-t${t}s.jpg`)]);
    }
    console.log(`[verify] 10 check frames extracted to ${framesDir}`);
  }
}

main().catch((e) => {
  console.error("[build] FATAL", e);
  process.exit(1);
});
