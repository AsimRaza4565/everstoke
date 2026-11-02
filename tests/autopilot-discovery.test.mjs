import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as yaml from 'js-yaml';

function filterChannels(channels, { targetChannel = '', scheduleCron = '' } = {}) {
  const all = (channels || [])
    .filter(c => c.autopilot !== false && c.active !== false && c.tokenSecretSaved !== false)
    .map(c => ({
      slug: c.slug,
      envSlug: c.slug.toUpperCase().replace(/-/g, '_'),
      cron: c.cron || '33 2 * * *'
    }));
  const target = targetChannel.trim();
  const sched = scheduleCron.trim();
  if (target) {
    return all.filter(c => c.slug === target);
  } else if (sched) {
    return all.filter(c => c.cron === sched);
  }
  return all;
}

test('filterChannels: preserves scheduled cron offsets for legacy channels', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));

  // everstoke adoption: everstoke is the active channel; its cron window picks
  // it up the moment tokenSecretSaved flips true (staged rollout switch).
  const flipped = JSON.parse(JSON.stringify(reg));
  flipped.channels.find(c => c.slug === 'everstoke').tokenSecretSaved = true;
  const es = filterChannels(flipped.channels, { scheduleCron: '07 1 * * *' });
  assert.equal(es.length, 1);
  assert.equal(es[0].slug, 'everstoke');
  assert.equal(es[0].envSlug, 'EVERSTOKE');

  // dormant inherited channels never run on schedule regardless of flag state
  assert.equal(filterChannels(reg.channels, { scheduleCron: '13 2 * * *' }).length, 0);
  assert.equal(filterChannels(reg.channels, { scheduleCron: '47 2 * * *' }).length, 0);
});

test('filterChannels: single slug override via workflow_dispatch input', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const flipped = JSON.parse(JSON.stringify(reg));
  flipped.channels.find(c => c.slug === 'everstoke').tokenSecretSaved = true;
  const target = filterChannels(flipped.channels, { targetChannel: 'everstoke' });
  assert.equal(target.length, 1);
  assert.equal(target[0].slug, 'everstoke');
});

test('composite actions exist and parse as valid YAML', () => {
  const renderAction = yaml.load(fs.readFileSync('.github/actions/setup-render/action.yml', 'utf8'));
  assert.equal(renderAction.name, 'Setup Render');
  assert.equal(renderAction.runs.using, 'composite');
  assert.ok(renderAction.runs.steps.length >= 3);

  const ffmpegAction = yaml.load(fs.readFileSync('.github/actions/setup-ffmpeg/action.yml', 'utf8'));
  assert.equal(ffmpegAction.name, 'Setup FFmpeg');
  assert.equal(ffmpegAction.runs.using, 'composite');
  assert.ok(ffmpegAction.runs.steps.length >= 2);
});
