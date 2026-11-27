import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssCaptions, buildScriptMeta, buildShortSegmentFilter, buildShortConcatFilter, buildThumbnailSvg, buildSectionCardSvg } from '../youtube-engine.mjs';
import { isMoodCleanHit } from '../youtube-clips.mjs';
import { resolveBrand } from '../lib/brand-resolve.mjs';

test('buildScriptMeta formats title for mobile Shorts feed with hook first and #shorts', () => {
  const mockPage = { slug: 'stoic-habits', id: 'stoic-habits' };
  const mockScript = {
    thumbHeadline: 'NEVER COMPLAIN TO ANYONE',
    hook: 'Never complain to anyone, especially when you are hurting.',
    points: [
      { title: 'Silence is Power', line: 'People use your pain against you.' },
      { title: 'Master Yourself', line: 'True strength is quiet.' }
    ],
    closing: 'Keep your battles private and let your success speak.'
  };

  const meta = buildScriptMeta(mockPage, mockScript);

  assert.ok(meta.title, 'Meta should have a title');
  // On mobile Shorts, hook must be prominent and not truncated
  assert.ok(meta.title.length <= 100, 'Title must not exceed YouTube 100 character limit');
  assert.ok(meta.tags.length > 0, 'Should include discovery tags');
});

test('buildAssCaptions keeps subtitles inside YouTube Shorts mobile safe zone', () => {
  const sampleWords = [
    { w: 'Stop', s: 0.1, d: 0.2 },
    { w: 'wasting', s: 0.35, d: 0.3 },
    { w: 'your', s: 0.7, d: 0.2 },
    { w: 'time.', s: 0.95, d: 0.3 }
  ];

  const ass = buildAssCaptions(sampleWords, { w: 1080, h: 1920 });

  // YouTube Shorts UI covers y >= 1520 (channel name, description, audio pill)
  // and y <= 250 (header bar, search, camera icon)
  // Subtitles should be centered between y=1050 and y=1350
  const posMatch = ass.match(/\\pos\(\d+,(\d+)\)/);
  assert.ok(posMatch, 'ASS should have positioning');
  const posY = parseInt(posMatch[1], 10);
  assert.ok(posY >= 950 && posY <= 1400, `Subtitle Y position (${posY}) must be within mobile safe zone (950-1400)`);
});

test('buildShortSegmentFilter normalizes SAR, FPS, and aspect ratio for multi-clip concat', () => {
  const withNarration = buildShortSegmentFilter({ index: 0, dur: 6.2, assFile: 'pixabay-pool/yt-script-build/cap-0.ass' });
  assert.ok(withNarration.includes("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'"), 'must guard narrow/portrait clips');
  assert.ok(withNarration.includes('scale=1080:1920,setsar=1'), 'must lock output SAR to 1:1');
  assert.ok(withNarration.includes('fps=fps=30:round=near'), 'must normalize fps to 30');
  assert.ok(withNarration.includes('fade=t=in:st=0:d=0.4'), 'hook section fades in');
  assert.ok(withNarration.includes('[2:a]apad,atrim=0:6.2,asetpts=PTS-STARTPTS[a]'), 'pads narration across full segment');

  const withoutNarration = buildShortSegmentFilter({ index: 2, dur: 4.5, assFile: null });
  assert.ok(!withoutNarration.includes('fade=t=in'), 'non-hook sections skip initial fade-in');
  assert.ok(withoutNarration.includes('fps=fps=30:round=near,setsar=1,format=yuv420p[v]'), 'normalizes output fps, SAR, and format');
  assert.ok(withoutNarration.includes('anullsrc=r=44100:cl=stereo,atrim=0:4.5[a]'), 'provides stereo silence fallback');
});

test('buildShortConcatFilter normalizes all segment streams before concat', () => {
  const concat = buildShortConcatFilter({ segmentCount: 6, total: 36.4 });
  for (let i = 0; i < 6; i++) {
    assert.ok(concat.includes(`[${i}:v]setsar=1,fps=fps=30:round=near,setpts=PTS-STARTPTS,format=yuv420p[sv${i}]`));
    assert.ok(concat.includes(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[sa${i}]`));
  }
  assert.ok(concat.includes('[sv0][sa0][sv1][sa1][sv2][sa2][sv3][sa3][sv4][sa4][sv5][sa5]concat=n=6:v=1:a=1[vc][ac]'));
  assert.ok(concat.includes('[6:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.13,atrim=0:36.4,afade=t=out:st=35.2:d=1.2[am]'));
  assert.ok(concat.includes('[ac]volume=1.414[acg];[acg][am]amix=inputs=2:duration=first:normalize=0[aout]'), 'restores +3 dB mono-to-stereo pan attenuation on voice');
});

test('buildThumbnailSvg builds 9:16 1080x1920 for Shorts and keeps 16:9 1280x720 for landscape', () => {
  const shortSvg = buildThumbnailSvg("SAMURAI'S CODE", 'AAAA', { accent: '#FF6B1A', eyebrow: 'DAILY DISCIPLINE // EVERSTOKE', vertical: true });
  assert.ok(shortSvg.includes('width="1080" height="1920" viewBox="0 0 1080 1920"'), 'Shorts thumbnail must be 9:16 1080x1920');
  assert.ok(shortSvg.includes('x="540"'), 'Shorts thumbnail elements centered at x=540');
  assert.ok(shortSvg.includes("SAMURAI&#39;S") || shortSvg.includes("SAMURAI'S"), 'renders escaped title text');

  const wideSvg = buildThumbnailSvg('MARCUS AURELIUS DAILY RULE', 'AAAA', { accent: '#FF6B1A', eyebrow: 'DAILY DISCIPLINE // EVERSTOKE' });
  assert.ok(wideSvg.includes('width="1280" height="720" viewBox="0 0 1280 720"'), 'Long-form thumbnail remains 16:9 1280x720');
});

test('buildSectionCardSvg scales down long hooks instead of slicing off the final punchline word', () => {
  const svg1 = buildSectionCardSvg('#FF6B1A', { kicker: 'WATCH TILL THE END', big: 'What If Your Biggest Failure Is Actually Your Launchpad?' }, '@everstoke-a5h', 'motivation');
  assert.ok(svg1.includes('LAUNCHPAD?'), 'long hook must retain final word instead of truncating at 4 lines');

  const svg2 = buildSectionCardSvg('#FF6B1A', { kicker: 'WATCH TILL THE END', big: "What If A Samurai's Secret Could End Your Excuses?" }, '@everstoke-a5h', 'motivation');
  assert.ok(svg2.includes('EXCUSES?'), 'Samurai hook must retain final word');
});

test('isMoodCleanHit rejects food/cooking/cartoon tags and everstoke exposes moody brollQueries', () => {
  assert.equal(isMoodCleanHit({ tags: 'mushrooms, food, slicing, kitchen' }), false);
  assert.equal(isMoodCleanHit({ tags: 'stickman, animation, cartoon' }), false);
  assert.equal(isMoodCleanHit({ tags: 'misty mountain sunset dark silhouette' }), true);

  const b = resolveBrand('everstoke');
  assert.ok(Array.isArray(b.brollQueries) && b.brollQueries.length >= 4, 'everstoke brand exposes moody brollQueries');

  const meta = buildScriptMeta({ id: 'everstoke', slug: 'everstoke', trend: { hotKeywords: ['animation', 'stickman', 'resilience'] } }, {
    thumbHeadline: 'SENECA RULE', hook: 'Hold your tongue.', points: [{ title: 'Silence', line: 'Guard your peace.' }], closing: 'Act today.'
  });
  assert.equal(meta.tags.includes('animation'), false, 'filters off-niche animation tag');
  assert.equal(meta.tags.includes('stickman'), false, 'filters off-niche stickman tag');
  assert.ok(meta.tags.includes('stoicism'), 'preserves core brand stoicism tag');
});
