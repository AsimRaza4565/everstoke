import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt } from '../lib/srt.mjs';
import { candidateWindows, parseSelection, pickTitles, cuesToWords, cardSvg, nextUnposted } from '../lib/clipper.mjs';

function srtFixture() {
  // 6 cues, ~10s total — times in seconds
  const cues = [];
  for (let i = 0; i < 6; i++) {
    cues.push({ start: i * 10 + 0.5, end: i * 10 + 9.5, text: `Sentence number ${i + 1} of the documentary.` });
  }
  return { cues, srt: null };
}

test('candidateWindows builds 20-60s candidates from cues with joined text', () => {
  const { cues } = srtFixture();
  const wins = candidateWindows(cues, { minDur: 20, maxDur: 60, stepCues: 2 });
  assert.ok(wins.length >= 2, 'a 60s timeline yields several candidates');
  for (const w of wins) {
    assert.ok(w.durSec >= 20, `window >= 20s (got ${w.durSec})`);
    assert.ok(w.durSec <= 60, `window <= 60s (got ${w.durSec})`);
    assert.ok(w.text.length > 0, 'window carries its transcript');
  }
  assert.match(wins[0].text, /^Sentence number 1/, 'first window starts at the first cue');
});

test('candidateWindows on a short timeline yields at least one window when minDur relaxed', () => {
  const cues = [{ start: 0.5, end: 9.5, text: 'Only one sentence here.' }];
  const wins = candidateWindows(cues, { minDur: 5, maxDur: 60, stepCues: 1 });
  assert.equal(wins.length, 1);
  assert.equal(wins[0].durSec, 9);
});

test('parseSelection extracts ranked picks from messy LLM output and validates indexes', () => {
  const wins = [ { i: 0 }, { i: 1 }, { i: 2 } ];
  const llm = `Here are my picks:\n\`\`\`json\n{"picks":[{"index":2,"title":"The Lie About Discipline","altTitle":"Why Discipline Feels Impossible"},{"index":0,"title":"How It Really Started","altTitle":"The Origin Nobody Tells"}]}\n\`\`\`\nHope this helps!`;
  const picks = parseSelection(llm, wins);
  assert.deepEqual(picks.map((p) => p.index), [2, 0], 'ranked order preserved');
  assert.equal(picks[0].title, 'The Lie About Discipline');
});

test('parseSelection drops invalid indexes and returns [] on garbage', () => {
  const wins = [ { i: 0 } ];
  assert.deepEqual(parseSelection('{"picks":[{"index":9,"title":"x"}]}', wins), [], 'index beyond windows is dropped');
  assert.deepEqual(parseSelection('no json at all', wins), []);
  assert.deepEqual(parseSelection('{"picks":[]}', wins), []);
});

test('pickTitles prefers title, falls back to altTitle, rejects dup titles', () => {
  const recent = ['The Lie About Discipline | Investing Psychology'];
  const picks = [
    { index: 0, title: 'The Lie About Discipline', altTitle: 'Why Discipline Feels Impossible' },
    { index: 1, title: 'Fresh Angle Title', altTitle: 'Another Fresh Angle' },
    { index: 2, title: 'Investing Psychology', altTitle: 'The Lie About Discipline' },
  ];
  const out = pickTitles(picks, recent, (a, b) => a.includes(b) || b.includes(a));
  assert.equal(out[0].title, 'Why Discipline Feels Impossible', 'dup title swapped for altTitle');
  assert.equal(out[1].title, 'Fresh Angle Title', 'clean title kept');
  assert.equal(out[2], undefined, 'clip whose both titles dup is rejected');
});

test('cuesToWords re-times cues into word timestamps relative to the clip start', () => {
  const cues = [{ start: 130, end: 134, text: 'Two words here' }];
  const words = cuesToWords(cues, 128); // clip starts at 128s -> cue lands at 2s..6s
  assert.equal(words.length, 3);
  assert.equal(words[0].w, 'Two');
  assert.ok(words[0].s >= 2 && words[0].s < 2.5, 'first word near clip-relative 2s');
  assert.ok(words[2].s > words[1].s && words[2].s < 6, 'last word starts inside the cue span');
});

test('cardSvg renders a 1080x1920 branded title card with the clip title', () => {
  const svg = cardSvg({ title: 'The Lie About Discipline', brand: 'MONEY RULEBOOK', subline: 'How money evolved', accent: '#C1272D', bg: '#120808' });
  assert.match(svg, /width="1080"/);
  assert.match(svg, /height="1920"/);
  assert.match(svg, /The Lie About/, 'title line 1 (long titles wrap by design)');
  assert.match(svg, /Discipline/, 'title line 2');
  assert.match(svg, /MONEY RULEBOOK/);
});

test('nextUnposted returns the first unposted clip whose title passes the live dup gate', () => {
  const clips = [
    { part: 1, title: 'Already Posted', postedAt: '2026-10-19T10:00:00Z' },
    { part: 2, title: 'Dup With Live Upload' },
    { part: 3, title: 'Fresh Clip' },
  ];
  const live = ['Dup With Live Upload | Investing Psychology'];
  const pick = nextUnposted(clips, live, (a, b) => a.includes(b) || b.includes(a));
  assert.ok(pick, 'a clip is found');
  assert.equal(pick.clip.title, 'Fresh Clip');
  assert.equal(pick.skipped.length, 2, 'posted + dup clips are reported as skipped');
});

test('nextUnposted returns null (with skips) when the queue is exhausted', () => {
  const clips = [
    { part: 1, title: 'A', postedAt: 'x' },
    { part: 2, title: 'B', postedAt: 'y' },
  ];
  const pick = nextUnposted(clips, [], (a, b) => false);
  assert.equal(pick, null);
});
