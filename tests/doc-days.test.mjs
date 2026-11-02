import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDocDay, docDaysOf } from '../lib/doc-days.mjs';

test('docDaysOf: docDays array wins, docDay single falls back, neither means no docs', () => {
  assert.deepEqual(docDaysOf({ docDays: ['Tue', 'Fri'], docDay: 'Tue' }), ['Tue', 'Fri']);
  assert.deepEqual(docDaysOf({ docDay: 'Tue' }), ['Tue']);
  assert.deepEqual(docDaysOf({}), []);
  assert.deepEqual(docDaysOf({ docDays: [] }), []);
});

test('isDocDay matches UTC weekday names against the kit', () => {
  const tue = new Date('2026-10-20T12:00:00Z'); // a Tuesday
  const wed = new Date('2026-10-21T12:00:00Z');
  assert.equal(isDocDay({ docDays: ['Tue', 'Fri'] }, tue), true);
  assert.equal(isDocDay({ docDays: ['Tue', 'Fri'] }, wed), false);
  assert.equal(isDocDay({ docDay: 'Tue' }, tue), true, 'legacy single docDay keeps working');
  assert.equal(isDocDay({ docDay: 'Tue' }, wed), false);
  assert.equal(isDocDay({}, tue), false, 'no doc day configured = docs never scheduled here');
});
