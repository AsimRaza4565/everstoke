// FB-native variant (09-20): Meta demotes unchanged cross-posts to ~0 views
// ("unoriginal content" — research/facebook-audit-2026-09-20.md). This builds a
// genuinely different file from the rendered Short: 1s trimmed off the start,
// slight reframe + color shift, branded intro card (0.9s) + follow end card
// (1.3s), audio 4% faster. One ffmpeg pass — real transformation, near-zero cost.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const FONTS = 'image-tools/fonts';

export async function buildFbVariant(inputMp4, slug, outMp4) {
  const { BRANDS } = await import('./yt-brands/brands.mjs');
  const b = BRANDS.find(x => x.slug === slug);
  const clean = (s) => String(s || '').replace(/['"\\:;%,]/g, '');
  const eyebrow = clean(b && b.eyebrow) || 'QUARRY STUDIOS';
  const kw = clean((b && b.kwShort) || 'content').toUpperCase();
  const accent = clean((b && b.accent) || '#1877F2').replace('#', '0x');
  const ff = process.env.FFMPEG_PATH || 'ffmpeg';

  const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', inputMp4], { encoding: 'utf8' });
  const dur = parseFloat(String(pr.stdout || '').trim()) || 30;
  const endCardStart = Math.max(dur - 1.3, 1).toFixed(1);
  const vf = [
    'crop=iw*0.94:ih*0.94,scale=1080:1920',
    'eq=brightness=0.03:saturation=1.07',
    `drawtext=fontfile=${FONTS}/Anton-Regular.ttf:text='${eyebrow}':fontcolor=black:fontsize=50:box=1:boxcolor=${accent}@0.92:boxborderw=26:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,0.9)'`,
    `drawtext=fontfile=${FONTS}/Inter-SemiBold.ttf:text='FOLLOW FOR DAILY ${kw}':fontcolor=white:fontsize=38:box=1:boxcolor=0x101314@0.72:boxborderw=16:x=(w-text_w)/2:y=h-th-170:enable='between(t,${endCardStart},${dur.toFixed(1)})'`
  ].join(',');
  const r = spawnSync(ff, ['-y', '-ss', '1', '-i', inputMp4, '-vf', vf, '-af', 'atempo=1.04',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', outMp4],
    { encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0 || !fs.existsSync(outMp4)) throw new Error('ffmpeg variant failed: ' + String(r.stderr).slice(-160));
  return outMp4;
}

// CLI: node fb-variant.mjs <in.mp4> <slug> [out.mp4]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('fb-variant.mjs')) {
  const [,, input, slug, out] = process.argv;
  buildFbVariant(input, slug, out || input.replace(/\.mp4$/, '-fb.mp4'))
    .then(o => console.log('[fb-variant] saved', o))
    .catch(e => { console.error('[fb-variant]', e.message); process.exit(1); });
}
