import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ptDate, evaluate, nextCounter } from '../lib/quota-ledger.mjs';

test('ptDate converts UTC instants to America/Los_Angeles calendar dates', () => {
  // October = PDT (UTC-7): 06:59Z is still the previous PT day
  assert.equal(ptDate(new Date('2026-10-20T06:59:00Z')), '2026-10-19');
  assert.equal(ptDate(new Date('2026-10-20T07:00:00Z')), '2026-10-20');
  // the daily crons run 02:13-03:53 UTC = previous PT evening — same PT quota day
  assert.equal(ptDate(new Date('2026-10-20T02:35:00Z')), '2026-10-19');
  // January = PST (UTC-8)
  assert.equal(ptDate(new Date('2026-01-15T07:59:00Z')), '2026-01-14');
  assert.equal(ptDate(new Date('2026-01-15T08:00:00Z')), '2026-01-15');
});

test('evaluate sums only counters matching today\'s PT date across channels', () => {
  const states = {
    'quotequarry': { uploadsToday: { date: '2026-10-20', count: 2 } },
    'investors-compass': { uploadsToday: { date: '2026-10-20', count: 1 } },
    'money-rulebook': { uploadsToday: { date: '2026-10-19', count: 9 } }, // stale day ignored
    'debt-free-doctrine': {}, // no counter yet
  };
  const r = evaluate(states, { now: new Date('2026-10-20T18:00:00Z') });
  assert.equal(r.uploadsToday, 3);
  assert.equal(r.usedUnits, 3 * 1700);
  assert.equal(r.allowed, true, '3 uploads = 5,100 units — one more (1,700) still fits under 10,000 - 100 margin');
});

test('evaluate blocks when one more upload would breach the daily budget', () => {
  const states = { a: { uploadsToday: { date: '2026-10-20', count: 5 } } }; // 5*1700 = 8,500
  const r = evaluate(states, { now: new Date('2026-10-20T18:00:00Z') });
  // 8,500 used + 1,700 next upload = 10,200 > 10,000 - 100 margin -> blocked
  assert.equal(r.allowed, false);
});

test('evaluate allows exactly up to the limit edge', () => {
  const states = { a: { uploadsToday: { date: '2026-10-20', count: 4 } } }; // 4*1700 = 6,800
  const r = evaluate(states, { now: new Date('2026-10-20T18:00:00Z') });
  // 6,800 + 1,700 = 8,500 <= 9,900 -> allowed
  assert.equal(r.allowed, true);
});

test('nextCounter resets when the PT date rolls over', () => {
  const prev = { date: '2026-10-19', count: 6 };
  assert.deepEqual(nextCounter(prev, new Date('2026-10-20T18:00:00Z')), { date: '2026-10-20', count: 1 });
  assert.deepEqual(nextCounter(prev, new Date('2026-10-19T20:00:00Z')), { date: '2026-10-19', count: 7 });
  assert.deepEqual(nextCounter(undefined, new Date('2026-10-20T18:00:00Z')), { date: '2026-10-20', count: 1 });
});
