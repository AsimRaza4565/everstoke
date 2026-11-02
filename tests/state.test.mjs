import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadChannelState, saveChannelState, loadAllStates } from '../lib/state.mjs';

const SLUG = 'zz-state-test';

test('#55 saveChannelState leaves a valid JSON file (atomic write, no torn reads)', () => {
  saveChannelState(SLUG, { lastRunDate: '2026-10-24', n: 1 });
  const raw = fs.readFileSync(`yt-mcp/state/${SLUG}.json`, 'utf8');
  assert.deepEqual(JSON.parse(raw), { lastRunDate: '2026-10-24', n: 1 });
  // no leftover tmp files from an interrupted rename
  const leftovers = fs.readdirSync('yt-mcp/state').filter((f) => f.startsWith(`${SLUG}.json.tmp-`));
  assert.equal(leftovers.length, 0, `stray tmp files: ${leftovers.join(',')}`);
});

test('#55 loadChannelState prefers the per-channel file over the legacy mirror', () => {
  saveChannelState(SLUG, { marker: 'per-channel' });
  const s = loadChannelState(SLUG);
  assert.equal(s.marker, 'per-channel');
});

test('#55 loadChannelState falls back to {} when nothing exists', () => {
  assert.deepEqual(loadChannelState('zz-never-existed'), {});
});

test('#55 loadAllStates merges per-channel files over the legacy mirror', () => {
  const all = loadAllStates();
  assert.ok(all[SLUG], 'per-channel state must appear in the merged view');
  assert.equal(all[SLUG].marker, 'per-channel');
});

test.after(() => {
  // clean the synthetic slug so repo state stays clean
  try { fs.rmSync(`yt-mcp/state/${SLUG}.json`, { force: true }); } catch { }
  try {
    const leg = JSON.parse(fs.readFileSync('yt-mcp/schedule-state.json', 'utf8'));
    delete leg[SLUG];
    fs.writeFileSync('yt-mcp/schedule-state.json', JSON.stringify(leg, null, 2));
  } catch { }
});
