import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuesFromWords, toSrt } from '../lib/srt.mjs';

// same parse shape tiktok-clips.mjs uses to read the artifact back
function parseSrt(text) {
  const cues = [];
  for (const b of text.replace(/\r/g, '').split('\n\n')) {
    const lines = b.split('\n').filter(Boolean);
    const tl = lines.find((l) => l.includes('-->'));
    if (!tl) continue;
    const [a, z] = tl.split('-->');
    const toMs = (t) => {
      const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      return m ? (+m[1]) * 3600000 + (+m[2]) * 60000 + (+m[3]) * 1000 + (+m[4]) : null;
    };
    cues.push({ start: toMs(a), end: toMs(z), text: lines.slice(lines.indexOf(tl) + 1).join(' ') });
  }
  return cues;
}

const WORDS = [
  { w: 'Ever', s: 0.0, d: 0.2 }, { w: 'wondered', s: 0.2, d: 0.3 }, { w: 'how', s: 0.5, d: 0.2 },
  { w: 'money', s: 0.7, d: 0.3 }, { w: 'began?', s: 1.0, d: 0.4 },
  { w: 'First,', s: 1.5, d: 0.3 }, { w: 'we', s: 1.8, d: 0.1 }, { w: 'traded', s: 1.9, d: 0.3 }, { w: 'grain.', s: 2.2, d: 0.4 },
];

test('cuesFromWords groups words into <=8-word cues with global offsets', () => {
  const cues = cuesFromWords(WORDS, 30, 8);
  assert.equal(cues.length, 2, '9 words at max 8 per cue -> 2 cues');
  assert.equal(cues[0].start, 30, 'offset shifts cue start to the chapter position in the episode');
  assert.match(cues[0].text, /^Ever wondered how money began\?$/);
  assert.match(cues[1].text, /^First, we traded grain\.$/);
  assert.ok(cues[0].end > cues[0].start, 'cue end must be after start');
});

test('cuesFromWords respects maxWords and closes each cue at its last word', () => {
  const cues = cuesFromWords(WORDS, 0, 3);
  // maxWords=3 + sentence breaks: "Ever wondered how" | "money began?" | "First, we traded" | "grain."
  assert.equal(cues.length, 4);
  assert.equal(cues[0].text, 'Ever wondered how');
  assert.equal(cues[1].text, 'money began?');
  assert.ok(Math.abs(cues[0].end - 0.7) < 0.05, 'cue end = last word s+d (how: 0.5 + 0.2)');
});

test('toSrt emits standard blocks the production parser reads back', () => {
  const cues = cuesFromWords(WORDS, 30, 8);
  const srt = toSrt(cues);
  const back = parseSrt(srt);
  assert.equal(back.length, cues.length);
  assert.equal(back[0].start, 30000, '30s offset in ms');
  assert.equal(back[0].text, cues[0].text);
  assert.match(srt, /^1\n00:00:30,000 --> /, 'index + HH:MM:SS,mmm timestamp format');
});

test('toSrt formats hours correctly past the 1h mark', () => {
  const srt = toSrt([{ start: 3661.5, end: 3663, text: 'deep in the episode' }]);
  assert.match(srt, /01:01:01,500 --> 01:01:03,000/);
});
