import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, loadEnvWith } from '../lib/env.mjs';

test('parseEnv parses KEY=VALUE lines, ignoring empty lines and comments', () => {
  const raw = `
# Comment here
FOO=bar
  # indented comment
BAZ=qux 123
EMPTY=
  SPACED_KEY = not_matched
MULTILINE_VALUE=hello world
`;
  const parsed = parseEnv(raw);
  assert.equal(parsed.FOO, 'bar');
  assert.equal(parsed.BAZ, 'qux 123');
  assert.equal(parsed.EMPTY, '');
  assert.equal(parsed.MULTILINE_VALUE, 'hello world');
  assert.equal(parsed['# Comment here'], undefined);
});

test('loadEnvWith preserves ??= semantics (does not overwrite existing env)', () => {
  const env = { ALREADY_SET: 'original', UNSET: undefined };
  const fakeFs = {
    '/.env': 'ALREADY_SET=new_value\nUNSET=from_file\nNEW_KEY=brand_new\n'
  };

  loadEnvWith({
    env,
    envPath: '/.env',
    readFile: (p) => fakeFs[p] || null,
  });

  assert.equal(env.ALREADY_SET, 'original');
  assert.equal(env.UNSET, 'from_file');
  assert.equal(env.NEW_KEY, 'brand_new');
});

test('loadEnvWith handles missing .env file gracefully without throwing', () => {
  const env = { KEEP_ME: 'safe' };
  assert.doesNotThrow(() => {
    loadEnvWith({
      env,
      envPath: '/non/existent/.env',
      readFile: () => null,
    });
  });
  assert.equal(env.KEEP_ME, 'safe');
});
