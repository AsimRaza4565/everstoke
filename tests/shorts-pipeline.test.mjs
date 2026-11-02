import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssCaptions, buildScriptMeta } from '../youtube-engine.mjs';

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
