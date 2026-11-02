import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupFallbackBeats } from '../explainer/generate-script.mjs';

// #67: beats before the first chapter marker (hook + opening statement) must
// land in chapter 1's fallback group, not a null key that is never fetched.
const beats = [
  { tpl: 'hook', text: 'cold open line', props: { highlight: 'line' } },
  { tpl: 'statement', text: 'opening statement', props: { highlight: 'statement' } },
  { tpl: 'chapter', text: '', props: { n: 1, title: 'Ch1', total: 2 } },
  { tpl: 'server', text: 'chapter one body', props: { n: 1 } },
  { tpl: 'chapter', text: '', props: { n: 2, title: 'Ch2', total: 2 } },
  { tpl: 'cost', text: 'chapter two body', props: { n: 2 } },
];

test('#67 hook + statement group under chapter 1 (not a never-fetched null key)', () => {
  const m = groupFallbackBeats(beats, 1);
  const ch1 = m.get(1);
  assert.ok(ch1, 'chapter 1 group exists');
  assert.equal(ch1[0].tpl, 'hook', 'beat 0 is the hook');
  assert.equal(ch1[1].tpl, 'statement', 'beat 1 is the opening statement');
  assert.equal(ch1[2].tpl, 'chapter');
  assert.equal(m.has(undefined) && m.get(undefined).length > 0, false, 'no orphan null/undefined group');
});

test('#67 all-chapters-fail fallback output starts with the hook and keeps word count', () => {
  // simulate the assembly: every chapter falls back to its group
  const m = groupFallbackBeats(beats, 1);
  const out = [];
  for (const n of [1, 2]) out.push(...m.get(n));
  assert.equal(out[0].tpl, 'hook', 'video starts on the hook, not a chapter card');
  const words = out.reduce((a, b) => a + (b.text || '').split(/\s+/).filter(Boolean).length, 0);
  assert.ok(words >= 5, 'no dropped narration');
});

test('#67 mid-script chapter markers still re-key the groups', () => {
  const m = groupFallbackBeats(beats, 1);
  assert.equal(m.get(2)[0].tpl, 'chapter');
  assert.equal(m.get(2)[1].tpl, 'cost');
});
