import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asciiHeaderValue, sendAlert } from '../lib/ntfy-alert.mjs';

test('asciiHeaderValue strips emoji and control chars from header values', () => {
  // run 39055331728: '🏥 CI Doctor problems' in the Title header -> undici
  // "Cannot convert argument to a ByteString" -> push never sent
  assert.equal(asciiHeaderValue('🏥 CI Doctor problems'), 'CI Doctor problems');
  assert.equal(asciiHeaderValue('line1\nline2\rx'), 'line1line2x');
  assert.equal(asciiHeaderValue('plain ASCII'), 'plain ASCII');
});

test('sendAlert files a GitHub issue and logs the outcome (ntfy removed 11-11)', async () => {
  const gh = [];
  const lines = [];
  const r = await sendAlert({
    text: 'boom', title: 'Pipeline alert',
    execImpl: (cmd, args) => { gh.push([cmd, ...args]); return ''; },
    log: (m) => lines.push(m),
  });
  assert.deepEqual(r, { channel: 'github-issue', ok: true });
  assert.equal(gh.length, 1, 'exactly one gh call when no issueSearch');
  assert.deepEqual(gh[0].slice(0, 3), ['gh', 'issue', 'create']);
  assert.equal(gh[0][3], '--title');
  assert.equal(gh[0][4], 'Pipeline alert', 'issueTitle defaults to title');
  assert.ok(lines.some((l) => /GitHub issue: created/.test(l)), 'outcome must be logged');
});

test('sendAlert comments on the existing open issue when issueSearch matches', async () => {
  const gh = [];
  const r = await sendAlert({
    text: '0/1 uploads', issueSearch: 'verify-run in:title',
    issueTitle: 'verify-run: upload verification FAILED',
    execImpl: (cmd, args) => {
      gh.push([cmd, ...args]);
      if (args[1] === 'list') return '7\tsome title\tlabel\tdate';
      return '';
    },
    log: () => { },
  });
  assert.deepEqual(r, { channel: 'github-issue', ok: true });
  assert.equal(gh.length, 2, 'list then comment');
  assert.deepEqual(gh[1].slice(0, 3), ['gh', 'issue', 'comment']);
  assert.equal(gh[1][3], '7');
});

test('sendAlert never throws and reports ok:false when gh is unavailable', async () => {
  const lines = [];
  const r = await sendAlert({
    text: 'x', title: 'offline',
    execImpl: () => { throw new Error('gh: not logged in'); },
    log: (m) => lines.push(m),
  });
  assert.deepEqual(r, { channel: 'none', ok: false });
  assert.ok(lines.some((l) => /GitHub issue failed/.test(l)), 'dead end must be logged');
});
