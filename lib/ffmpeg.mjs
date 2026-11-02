// One resolution rule for ffmpeg/ffprobe across every pipeline (issue #79).
// Was hardcoded as ffmpeg-bin/ffmpeg-master-latest-win64-gpl/bin/<name>.exe in
// 12+ files with three divergent fallback behaviors — make3v2.mjs and
// stage-docv2.mjs had NO fallback at all, making them Linux-unrunnable.
//
// Order (matches the per-file convention that already existed):
//   1. env override — FFMPEG_PATH / FFPROBE_PATH (the names already used)
//   2. bundled Windows binary in ffmpeg-bin/ (local dev checkout)
//   3. bare name on PATH (GitHub runners, Linux/macOS)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUNDLED_DIR = path.join(ROOT, 'ffmpeg-bin', 'ffmpeg-master-latest-win64-gpl', 'bin');

// Pure core — dependencies injected so tests don't touch the real fs.
export function resolveBinaryWith(name, { env = process.env, exists = (p) => fs.existsSync(p), platform = process.platform } = {}) {
  const override = env[`${name.toUpperCase()}_PATH`];
  if (override) return override;
  const exe = platform === 'win32' ? `${name}.exe` : name;
  const bundled = path.join(BUNDLED_DIR, exe);
  if (exists(bundled)) return bundled;
  return name;
}

export function resolveBinary(name) {
  return resolveBinaryWith(name);
}
