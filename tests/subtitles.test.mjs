import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssCaptions } from '../youtube-engine.mjs';

test('buildAssCaptions generates valid ASS script with dialogue events', () => {
  const sampleWords = [
    { w: 'Never', s: 0.1, d: 0.3 },
    { w: 'complain,', s: 0.45, d: 0.3 },
    { w: 'never', s: 0.8, d: 0.25 },
    { w: 'explain.', s: 1.1, d: 0.4 }
  ];

  const assContent = buildAssCaptions(sampleWords, { w: 1080, h: 1920 });

  assert.ok(assContent.includes('[Script Info]'), 'ASS should include Script Info header');
  assert.ok(assContent.includes('PlayResX: 1080'), 'ASS should set PlayResX to 1080');
  assert.ok(assContent.includes('PlayResY: 1920'), 'ASS should set PlayResY to 1920');
  assert.ok(assContent.includes('Style: Hormozi,Anton'), 'ASS should define Hormozi Anton style');
  assert.ok(assContent.includes('Dialogue: 0,'), 'ASS should contain Dialogue lines');
  assert.ok(assContent.includes('NEVER'), 'Words should be uppercased in output');
});

test('buildAssCaptions handles empty words list without crashing', () => {
  const emptyAss = buildAssCaptions([]);
  assert.ok(emptyAss.includes('[Script Info]'), 'Should return valid ASS headers even if empty');
  assert.ok(!emptyAss.includes('Dialogue: 0,'), 'Should contain no dialogue lines');
});
