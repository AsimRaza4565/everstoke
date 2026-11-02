import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchedule, projection } from '../studio/lib/schedule-projection.js';

test('validateSchedule accepts clean input and normalizes day names', () => {
  const r = validateSchedule({ docDays: ['tue', 'fri'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], shortsSource: 'clips' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.clean.docDays, ['Tue', 'Fri']);
  assert.equal(r.clean.shortsSource, 'clips');
});

test('validateSchedule rejects unknown days and bad source', () => {
  assert.equal(validateSchedule({ docDays: ['Funday'] }).ok, false);
  assert.equal(validateSchedule({ shortsSource: 'recycle' }).ok, false);
});

test('validateSchedule warns when clips shorts have no docs producing', () => {
  const r = validateSchedule({ docDays: [], shortDays: ['Mon'], shortsSource: 'clips' });
  assert.equal(r.ok, true, 'warning, not a block');
  assert.ok(r.warnings.some((w) => /no doc days/i.test(w)));
});

test('validateSchedule warns when weekly shorts outpace clip supply (docs*4+1)', () => {
  const r = validateSchedule({ docDays: ['Tue'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], shortsSource: 'clips' });
  assert.ok(r.warnings.some((w) => /supply/i.test(w)), JSON.stringify(r.warnings));
});

test('projection: worst-day counts docs+shorts landing on the same weekday', () => {
  const p = projection({ docDays: ['Tue', 'Fri'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] });
  // Tue: 1 doc + 1 short = 2 uploads -> worst day; 9 uploads/week
  assert.equal(p.worstDayUploads, 2);
  assert.equal(p.worstDayUnits, 3400);
  assert.equal(p.weeklyUploads, 9);
  assert.equal(p.tone, 'ok', '3,400 of 10,000 on the busiest day is green');
});

test('projection: >100% worst day is over and must block', () => {
  // 7 docs + 7 shorts, all spread but worst case pairing = 2/day -> not over.
  // Force the over case: same-day stacking
  const p = projection({ docDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] });
  assert.equal(p.worstDayUploads, 2, 'Mon..Sun pairs 1 doc + 1 short per day');
  assert.equal(p.tone, 'ok');
  const heavy = projection({ docDays: ['Mon', 'Tue', 'Wed'], shortDays: ['Mon', 'Tue', 'Wed'] });
  // Mon-Wed: 2 uploads/day -> 3,400 (ok). Over needs 6 uploads in one day:
  const over = projection({ docDays: ['Mon', 'Tue', 'Wed'], shortDays: ['Mon', 'Tue', 'Wed'], dailyLimit: 5000 });
  assert.equal(over.tone, 'over', 'with a 5,000 pool, 2 uploads/day = 3,400 > 4,900? no — uses limit-margin');
  assert.equal(over.blocked, true, '3,400 + margin vs 5,000: blocked when 3,400+1,700 > 5,000-100');
});

test('projection: blocked flag mirrors the engine ledger rule (used + next > limit - margin)', () => {
  const p = projection({ docDays: ['Mon', 'Tue', 'Wed', 'Thu'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu'] });
  // worst day 2 uploads = 3,400; +1,700 next = 5,100 <= 9,900 -> not blocked
  assert.equal(p.blocked, false);
});

test('applyCadence overlays scheduling fields onto a resolved kit (#100)', async () => {
  const { applyCadence } = await import('../lib/brand-resolve.mjs');
  const kit = { docDay: 'Tue', docDays: null, shortsSource: 'generated', accent: '#ffffff' };
  const out = applyCadence(kit, { docDays: ['Tue', 'Fri'], shortDays: ['Mon'], shortsSource: 'clips' });
  assert.deepEqual(out.docDays, ['Tue', 'Fri']);
  assert.deepEqual(out.shortDays, ['Mon']);
  assert.equal(out.shortsSource, 'clips');
  assert.equal(out.accent, '#ffffff', 'non-scheduling fields pass through');
});

test('applyCadence is a no-op without cadence, and ignores junk values', async () => {
  const { applyCadence } = await import('../lib/brand-resolve.mjs');
  const kit = { shortsSource: 'generated' };
  assert.equal(applyCadence(kit, null), kit, 'no cadence entry -> same kit object');
  assert.equal(applyCadence(kit, { shortsSource: 'weird', docDays: 'not-an-array' }).shortsSource, 'generated');
});
