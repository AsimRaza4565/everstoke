import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNumber } from '../longvideo/extract-number.mjs';

// #42: digit+magnitude sentences must apply the multiplier (was computed, dropped)
test('#42 digit+magnitude family renders full magnitudes', () => {
  assert.equal(extractNumber('The company lost 37 billion dollars.').big, '$37B');
  assert.equal(extractNumber('A 1.5 billion dollar buyout.').big, '$1.5B');
  assert.equal(extractNumber('It cost 4 million per year.').big, '$4M');
  assert.equal(extractNumber('The merger was 2.3 trillion dollars.').big, '$2.3T');
});

test('#42 the num >= 20 gate sees real magnitudes ("12 billion" becomes a stat)', () => {
  const r = extractNumber('It was 12 billion dollars.');
  assert.equal(r.num, 12e9);
  assert.ok(r.num >= 20, 'must pass the number-beat gate now');
  assert.equal(r.big, '$12B');
});

test('#42 plain numbers, years, and percents unchanged', () => {
  assert.equal(extractNumber('Founded in 2005.').big, '2005');
  assert.equal(extractNumber('12,402 servers.').big, '12,402');
  assert.equal(extractNumber('It grew 60 percent.').big, '60%');
  assert.equal(extractNumber('Down 12%.').big, '12%');
  assert.equal(extractNumber('$4.99 per month.').big, '$4.99');
});

test('#42 spelled-out branch still correct (regression guard)', () => {
  assert.equal(extractNumber('two billion dollars').big, '$2B');
  assert.equal(extractNumber('sixty percent').big, '60%');
  assert.equal(extractNumber('fifty billion dollars').big, '$50B');
});

test('#42 trailing sentence period no longer breaks the year guard', () => {
  assert.equal(extractNumber('Founded in 2005.').big, '2005');
  assert.equal(extractNumber('Launched in 2019.').big, '2019');
});

test('#42 tiny counts still skipped', () => {
  assert.equal(extractNumber('We tried 3 times.'), null);
});
