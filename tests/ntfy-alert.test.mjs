import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asciiHeaderValue, sendAlert } from '../lib/ntfy-alert.mjs';

const ok = () => ({ ok: true, status: 200 });
const fail = () => ({ ok: false, status: 503 });

test('asciiHeaderValue strips emoji and control chars from header values', () => {
  // run 39055331728: '🏥 CI Doctor problems' in the Title header -> undici
  // "Cannot convert argument to a ByteString" -> push never sent
  assert.equal(asciiHeaderValue('🏥 CI Doctor problems'), 'CI Doctor problems');
  assert.equal(asciiHeaderValue('line1\nline2\rx'), 'line1line2x');
  assert.equal(asciiHeaderValue('plain ASCII'), 'plain ASCII');
});

test('sendAlert delivers via ntfy and logs the outcome', async () => {
  const calls = [];
  const lines = [];
  const r = await sendAlert({
    text: 'boom', title: 'Pipeline alert', topic: 'my-topic',
    fetchImpl: async (url, opts) => { calls.push({ url, opts }); return ok(); },
    execImpl: () => { throw new Error('gh must not run when ntfy works'); },
    log: (m) => lines.push(m),
  });
  assert.deepEqual(r, { channel: 'ntfy', ok: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/ntfy\.sh\/my-topic$/);
  assert.equal(calls[0].opts.headers.Title, 'Pipeline alert');
  assert.ok(lines.some((l) => /ntfy push: sent/.test(l)), 'outcome must be logged');
});

test('sendAlert sanitizes the ntfy Title header (ByteString class)', async () => {
  let header;
  await sendAlert({
    text: 'x', title: '🚨 Upload verification FAILED: investors-compass', topic: 't',
    fetchImpl: async (u, o) => { header = o.headers.Title; return ok(); },
    execImpl: () => { throw new Error('no gh'); },
    log: () => { },
  });
  assert.equal(header, 'Upload verification FAILED: investors-compass');
});

test('sendAlert retries ntfy then falls back to the GitHub-issue channel', async () => {
  const fetches = [];
  const gh = [];
  const r = await sendAlert({
    text: '0/1 uploads', issueSearch: 'verify-run in:title',
    issueTitle: 'verify-run: upload verification FAILED',
    topic: 't',
    fetchImpl: async () => { fetches.push(1); return fail(); },
    execImpl: (cmd, args) => { gh.push([cmd, ...args]); return ''; },
    sleep: async () => { },
    log: () => { },
  });
  assert.deepEqual(r, { channel: 'github-issue', ok: true });
  assert.equal(fetches.length, 3, 'must retry before falling back');
  const actions = gh.filter((c) => c[1] === 'issue' && ['comment', 'create'].includes(c[2]));
  assert.equal(actions.length, 1, 'exactly one issue action after the search');
});

test('sendAlert with NO topic never returns silently — goes straight to fallback', async () => {
  const gh = [];
  const lines = [];
  const r = await sendAlert({
    text: 'alert', issueTitle: 'verify-run FAILED',
    topic: '',
    fetchImpl: async () => { throw new Error('fetch must not be called without a topic'); },
    execImpl: (cmd, args) => { gh.push([cmd, ...args]); return ''; },
    log: (m) => lines.push(m),
  });
  assert.deepEqual(r, { channel: 'github-issue', ok: true });
  assert.ok(lines.some((l) => /no NTFY_TOPIC/.test(l)), 'missing topic must be logged loudly');
});

test('sendAlert returns ok:false (never throws) when every channel fails', async () => {
  const lines = [];
  const r = await sendAlert({
    text: 'x', topic: 't',
    fetchImpl: async () => { throw new Error('network down'); },
    execImpl: () => { throw new Error('gh: not logged in'); },
    sleep: async () => { },
    log: (m) => lines.push(m),
  });
  assert.deepEqual(r, { channel: 'none', ok: false });
  assert.ok(lines.some((l) => /all channels failed/.test(l)), 'dead end must be logged');

  // fallback configured but gh itself fails -> still a logged dead end
  const lines2 = [];
  const r2 = await sendAlert({
    text: 'x', topic: 't', issueTitle: 'alert',
    fetchImpl: async () => { throw new Error('network down'); },
    execImpl: () => { throw new Error('gh: not logged in'); },
    sleep: async () => { },
    log: (m) => lines2.push(m),
  });
  assert.deepEqual(r2, { channel: 'none', ok: false });
  assert.ok(lines2.some((l) => /fallback failed/.test(l)), 'gh failure must be logged');
});
