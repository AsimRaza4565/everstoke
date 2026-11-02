// #101 CLIPS LANE DRIVER — runs the #98 publisher for every channel flipped to
// the clips lane (cadence.json shortsSource === 'clips'). The daily cron calls
// this once; each publisher is once-per-day guarded, so reruns are safe.
// Usage: node longvideo/clips-lane.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..');
let cadence = {};
try { cadence = JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'cadence.json'), 'utf8')); } catch { }

const slugs = Object.entries(cadence)
  .filter(([, c]) => c && c.shortsSource === 'clips')
  .map(([slug]) => slug);

if (!slugs.length) { console.log('[lane] no clips channels configured — nothing to do'); process.exit(0); }
console.log(`[lane] clips channels: ${slugs.join(', ')}`);

let failed = 0;
for (const slug of slugs) {
  console.log(`\n[lane] ▶ post-next ${slug}`);
  const r = spawnSync('node', [path.join(ROOT, 'longvideo', 'shorts-clips.mjs'), 'post-next', slug], { stdio: 'inherit', timeout: 20 * 60 * 1000 });
  if (r.status !== 0) { console.log(`[lane] ✗ ${slug} exit ${r.status}`); failed++; }
}
console.log(`\n[lane] complete: ${slugs.length - failed}/${slugs.length} ok`);
process.exit(failed ? 1 : 0);
