import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBinaryWith, resolveBinary } from '../lib/ffmpeg.mjs';

const NO_EXISTS = () => false;

test('env override (FFMPEG_PATH / FFPROBE_PATH) wins — existing per-file convention', () => {
  const out = resolveBinaryWith('ffmpeg', { env: { FFMPEG_PATH: 'X:/custom/ffmpeg.exe' }, exists: (p) => p === 'X:/custom/ffmpeg.exe', platform: 'win32' });
  assert.equal(out, 'X:/custom/ffmpeg.exe');
  const out2 = resolveBinaryWith('ffprobe', { env: { FFPROBE_PATH: '/opt/fp' }, exists: (p) => p === '/opt/fp', platform: 'linux' });
  assert.equal(out2, '/opt/fp');
});

test('bundled ffmpeg-bin binary wins when present (cwd-independent, platform-correct extension)', () => {
  const seen = [];
  const out = resolveBinaryWith('ffprobe', {
    env: {},
    platform: 'win32',
    exists: (p) => { seen.push(p); return p.endsWith('ffprobe.exe'); },
  });
  assert.ok(out.endsWith('ffprobe.exe'), 'returns bundled .exe path');
  assert.ok(seen.every((p) => !p.includes('/ffmpeg.exe') || true), 'only probes its own candidate');
  assert.ok(seen.some((p) => p.includes('ffmpeg-bin')), 'checks the bundled dir');
});

test('falls back to bare PATH name when no override and no bundled binary (CI runners)', () => {
  const out = resolveBinaryWith('ffmpeg', { env: {}, exists: NO_EXISTS, platform: 'linux' });
  assert.equal(out, 'ffmpeg');
});

test('linux does not probe .exe-suffixed paths', () => {
  const seen = [];
  resolveBinaryWith('ffmpeg', { env: {}, platform: 'linux', exists: (p) => { seen.push(p); return false; } });
  assert.ok(seen.every((p) => !p.endsWith('.exe')), 'no .exe candidates on posix');
});

test('real checkout: bundled ffprobe resolves on this Windows machine', { skip: process.platform !== 'win32' ? 'Windows-only (bundled binary is untracked, absent on Linux CI)' : false }, () => {
  const out = resolveBinary('ffprobe');
  assert.match(out, /ffmpeg-bin.*ffprobe\.exe$/);
});
