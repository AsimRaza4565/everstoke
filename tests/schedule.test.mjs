import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSlotISO } from '../lib/schedule.mjs';

test('nextSlotISO returns today UTC slot when comfortably in the future', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  assert.equal(nextSlotISO('22:35', now), '2026-10-20T22:35:00Z');
});

test('nextSlotISO rolls to tomorrow when the slot is nearer than 35 minutes', () => {
  const now = new Date('2026-10-20T22:10:00Z'); // 25 min before 22:35
  assert.equal(nextSlotISO('22:35', now), '2026-10-21T22:35:00Z');
});

test('nextSlotISO rolls to tomorrow when the slot already passed', () => {
  const now = new Date('2026-10-20T23:50:00Z');
  assert.equal(nextSlotISO('22:35', now), '2026-10-21T22:35:00Z');
});

// ---- #37: topup suppress semantics ----
import { shouldSuppressNext } from '../lib/schedule.mjs';

test('#37 a reel landing TODAY must not suppress tomorrow (oscillation kill)', () => {
  const results = [{ videoId: 'v1', publishAt: '2026-10-24T22:35:00Z' }];
  assert.equal(shouldSuppressNext(results, 1, '2026-10-25'), false);
});

test('#37 a reel landing TOMORROW covers tomorrow -> suppress', () => {
  const results = [{ videoId: 'v1', publishAt: '2026-10-25T22:35:00Z' }];
  assert.equal(shouldSuppressNext(results, 1, '2026-10-25'), true);
});

test('#37 gate rejections / slot errors never suppress', () => {
  const results = [
    { videoId: null, gateRejected: true, publishAt: '2026-10-25T22:35:00Z' },
    { videoId: null, slotError: true, publishAt: '2026-10-25T22:35:00Z' },
  ];
  assert.equal(shouldSuppressNext(results, 1, '2026-10-25'), false);
});

test('#37 partial tomorrow-coverage does not blank the whole day', () => {
  const results = [{ videoId: 'v1', publishAt: '2026-10-25T09:00:00Z' }];
  assert.equal(shouldSuppressNext(results, 3, '2026-10-25'), false);
});

test('#37 full tomorrow-coverage suppresses', () => {
  const results = [
    { videoId: 'v1', publishAt: '2026-10-25T09:00:00Z' },
    { videoId: 'v2', publishAt: '2026-10-25T15:00:00Z' },
    { videoId: 'v3', publishAt: '2026-10-25T22:35:00Z' },
  ];
  assert.equal(shouldSuppressNext(results, 3, '2026-10-25'), true);
});
