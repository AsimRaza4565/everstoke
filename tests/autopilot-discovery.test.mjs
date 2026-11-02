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
  
  const qq = filterChannels(reg.channels, { scheduleCron: '13 2 * * *' });
  assert.equal(qq.length, 1);
  assert.equal(qq[0].slug, 'quotequarry');
  assert.equal(qq[0].envSlug, 'QUOTEQUARRY');

  const ic = filterChannels(reg.channels, { scheduleCron: '47 2 * * *' });
  assert.equal(ic.length, 1);
  assert.equal(ic[0].slug, 'investors-compass');
  assert.equal(ic[0].envSlug, 'INVESTORS_COMPASS');

  const mr = filterChannels(reg.channels, { scheduleCron: '21 3 * * *' });
  assert.equal(mr.length, 1);
  assert.equal(mr[0].slug, 'money-rulebook');
  assert.equal(mr[0].envSlug, 'MONEY_RULEBOOK');

  const dfd = filterChannels(reg.channels, { scheduleCron: '53 3 * * *' });
  assert.equal(dfd.length, 1);
  assert.equal(dfd[0].slug, 'debt-free-doctrine');
  assert.equal(dfd[0].envSlug, 'DEBT_FREE_DOCTRINE');
});

test('filterChannels: single slug override via workflow_dispatch input', () => {
  const reg = JSON.parse(fs.readFileSync('yt-mcp/studio-channels.json', 'utf8'));
  const target = filterChannels(reg.channels, { targetChannel: 'money-rulebook' });
  assert.equal(target.length, 1);
  assert.equal(target[0].slug, 'money-rulebook');
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
