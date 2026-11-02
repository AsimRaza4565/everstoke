import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDupTitle, normTitle, findDup, recentUploadTitles } from '../lib/dup-gate.mjs';

// Real title pairs from the Oct-09..15 investor's-compass runs (#91) — pulled
// verbatim from GH run logs 37912688508 / 38378589467 / 38700767657.
test('#91 template siblings (same template, one hook word swapped) are ALLOWED', () => {
  // Oct 15: strictest vs ultimate — 4/6 shared tokens, exactly one swapped word
  assert.equal(
    isDupTitle(
      "Warren Buffett's Strictest Rule | Investing Psychology",
      "Warren Buffett's Ultimate Rule | Investing Psychology"
    ),
    false,
    'one hook-word swap with >=3 shared tokens must not block the upload'
  );
  // Oct 13/14: unbroken vs ultimate — the same shape, blocked 2 days running
  assert.equal(
    isDupTitle(
      "Warren Buffett's Unbroken Rule | Investing Psychology",
      "Warren Buffett's Ultimate Rule | Investing Psychology"
    ),
    false
  );
});

test('true re-uploads still BLOCK: identical titles', () => {
  assert.equal(
    isDupTitle(
      "Warren Buffett's Ultimate Rule | Investing Psychology",
      "Warren Buffett's Ultimate Rule | Investing Psychology"
    ),
    true
  );
});

test('true re-uploads still BLOCK: digit-equivalent titles (#91 Oct-09 pair)', () => {
  // "Rule #1" normalizes to "rule" (digits stripped) — identical after normTitle
  assert.equal(normTitle('Rule #1 Warren Buffett Never Breaks'), 'rule warren buffett never breaks');
  assert.equal(
    isDupTitle(
      'The Rule Warren Buffett Never Breaks | Investing Psychology',
      'Rule #1 Warren Buffett Never Breaks | Investing Psychology'
    ),
    true
  );
});

test('containment (same title extended) still BLOCKS', () => {
  assert.equal(
    isDupTitle(
      "Warren Buffett's Ultimate Rule",
      "Warren Buffett's Ultimate Rule For Beginners"
    ),
    true
  );
});

test('multi-word reworks still BLOCK (the #36 near-identical collapse class)', () => {
  // two words swapped in a 9-token title: inter=7 union=11 jaccard≈0.636,
  // symmetric diff 4 — NOT a single hook-word swap, so the sibling carve-out
  // must not fire and the >= 0.6 Jaccard rule keeps blocking
  assert.equal(
    isDupTitle(
      'this boring rule quietly built warren buffett s entire fortune',
      'this boring trick quietly destroyed warren buffett s entire fortune'
    ),
    true
  );
});

test('genuinely different topics stay ALLOWED', () => {
  assert.equal(
    isDupTitle(
      'Why the Market Panics Every September | Investing Psychology',
      'The 4% Withdrawal Rule Nobody Explains | Investing Psychology'
    ),
    false
  );
});

// ---- #36: the three dead paths ----

test('#36 findDup with an undefined script title returns null (never crashes, never blocks)', () => {
  assert.equal(findDup(undefined, ['Some Title On The Channel']), null);
  assert.equal(findDup(undefined, [], []), null);
});

test('#36 containment floor: sub-3-token titles do not containment-match longer ones', () => {
  // "buffett rule" is 2 tokens — must not block via containment anymore
  assert.equal(isDupTitle('Buffett Rule', 'The Buffett Rule Explained For Beginners'), false);
  // 3+ token containment still blocks (pre-#36 behaviour preserved)
  assert.equal(isDupTitle('Warren Buffett Rule', 'The Warren Buffett Rule Explained'), true);
});

test('#36 recentUploadTitles falls back to titleHistory on API failure (gate stays closed)', async () => {
  const throwing = { channels: { list: async () => { throw new Error('quotaExceeded'); } } };
  const out = await recentUploadTitles(throwing, { fallback: ['Durable History Title | Channel'] });
  assert.deepEqual(out, ['Durable History Title | Channel']);
});

test('#36 recentUploadTitles falls back when the channel has no uploads playlist', async () => {
  const empty = { channels: { list: async () => ({ data: { items: [] } }) } };
  const out = await recentUploadTitles(empty, { fallback: ['Hist | Ch'] });
  assert.deepEqual(out, ['Hist | Ch']);
});

test('#36 recentUploadTitles still prefers live titles on success', async () => {
  const ok = {
    channels: { list: async () => ({ data: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] } }) },
    playlistItems: { list: async () => ({ data: { items: [{ snippet: { title: 'Live Title | Ch' } }] } }) },
  };
  const out = await recentUploadTitles(ok, { fallback: ['Hist | Ch'] });
  assert.deepEqual(out, ['Live Title | Ch']);
});
