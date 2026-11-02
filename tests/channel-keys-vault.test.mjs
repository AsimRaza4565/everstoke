import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PROVIDERS, encryptKeys, decryptKeys, maskKey, readKeys, currentKeyVersion, legacyEncKey, masterEncKey, _resetLegacyWarnForTests } from '../studio/lib/keys-vault.js';
import { PROVIDER_ENV, applyChannelKeys } from '../lib/channel-keys.mjs';

test('keys-vault encrypts and decrypts provider keys cleanly with AES-256-GCM', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'test-secret-vault-12345';

  const sampleKeys = {
    gemini: 'AIzaSySampleGeminiKey12345',
    groq: 'gsk_SampleGroqKey987654321',
    pixabay: '12345678-abcdef123456',
  };

  const encrypted = encryptKeys(sampleKeys);
  assert.ok(typeof encrypted === 'string', 'Encrypted output should be a string');
  assert.equal(encrypted.split('.').length, 3, 'Ciphertext format must be iv.tag.ct');

  const decrypted = decryptKeys(encrypted);
  assert.deepEqual(decrypted, sampleKeys, 'Decrypted keys must match original object');
});

test('maskKey properly masks keys leaving only the last 4 characters visible', () => {
  assert.equal(maskKey('AIzaSyD-1234567890ABCD'), '••••ABCD');
  assert.equal(maskKey('short'), '••••');
  assert.equal(maskKey(''), '••••');
});

test('keys-vault PROVIDERS map matches PROVIDER_ENV mapping in lib/channel-keys', () => {
  for (const [providerKey, meta] of Object.entries(PROVIDERS)) {
    const ciEnvName = PROVIDER_ENV[providerKey];
    assert.ok(ciEnvName, `CI mapping must exist for provider: ${providerKey}`);
    assert.equal(meta.env, ciEnvName, `Env variable name must match between Studio and CI for: ${providerKey}`);
  }
});

test('decryptKeys gracefully returns null on corrupted ciphertext or wrong secret', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'original-secret';
  const ciphertext = encryptKeys({ openai: 'sk-12345' });

  // Switch secret
  process.env.YOUTUBE_CLIENT_SECRET = 'wrong-secret';
  const failed = decryptKeys(ciphertext);
  assert.equal(failed, null, 'Decryption with wrong secret should fail-closed and return null');

  // Corrupted ciphertext
  const corrupt = decryptKeys('invalid.iv.format');
  assert.equal(corrupt, null, 'Decryption of corrupted string should return null');
});

// ---- #39: shared-key stash/restore (drop must not leave NO key) ----
import fs from 'node:fs';
import { applyChannelKeys as applyK, dropChannelKeys as dropK, resetSharedKeyStash } from '../lib/channel-keys.mjs';

const KEYS_FILE = 'yt-mcp/channel-keys.json';
const TEST_SLUG = 'zz-keys-test';

test('#39 dropChannelKeys restores the stashed shared key (not delete)', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'test-secret-vault-12345';
  resetSharedKeyStash();
  // fixture vault: back up the real file, write a test entry, restore after
  const backup = fs.existsSync(KEYS_FILE) ? fs.readFileSync(KEYS_FILE, 'utf8') : null;
  const cipher = encryptKeys({ groq: 'gsk_CHANNEL_OVERRIDE_KEY' });
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ [TEST_SLUG]: { enc: cipher } }));
    const fake = { GROQ_API_KEY: 'gsk_SHARED_KEY', GEMINI_API_KEY: 'AIzaShared' };
    const applied = applyK(TEST_SLUG, fake);
    assert.deepEqual(applied, ['groq'], 'only the overridden provider applies');
    assert.equal(fake.GROQ_API_KEY, 'gsk_CHANNEL_OVERRIDE_KEY');
    dropK(['groq'], fake);
    assert.equal(fake.GROQ_API_KEY, 'gsk_SHARED_KEY', 'shared key must RESUME after drop');
  } finally {
    if (backup === null) fs.rmSync(KEYS_FILE, { force: true });
    else fs.writeFileSync(KEYS_FILE, backup);
    resetSharedKeyStash();
  }
});

test('#39 drop with no stashed shared value removes the env entry', () => {
  resetSharedKeyStash();
  const fake = { PIXABAY_API_KEY: 'chan-only-key' };
  dropK(['pixabay'], fake);
  assert.equal(fake.PIXABAY_API_KEY, undefined);
});

test('#39 re-apply after drop keeps stash-once semantics (original shared preserved)', () => {
  process.env.YOUTUBE_CLIENT_SECRET = 'test-secret-vault-12345';
  resetSharedKeyStash();
  const backup = fs.existsSync(KEYS_FILE) ? fs.readFileSync(KEYS_FILE, 'utf8') : null;
  const cipher = encryptKeys({ gemini: 'AIza_CH_KEY_A' });
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ [TEST_SLUG]: { enc: cipher } }));
    const fake = { GEMINI_API_KEY: 'AIza_SHARED' };
    applyK(TEST_SLUG, fake); // stash AIza_SHARED, apply CH_KEY_A
    dropK(['gemini'], fake); // restore AIza_SHARED
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ [TEST_SLUG]: { enc: encryptKeys({ gemini: 'AIza_CH_KEY_B' }) } }));
    applyK(TEST_SLUG, fake); // stash-once: must NOT re-stash AIza_CH_KEY_A as "shared"
    assert.equal(fake.GEMINI_API_KEY, 'AIza_CH_KEY_B');
    dropK(['gemini'], fake);
    assert.equal(fake.GEMINI_API_KEY, 'AIza_SHARED', 'original shared value survives re-apply cycles');
  } finally {
    if (backup === null) fs.rmSync(KEYS_FILE, { force: true });
    else fs.writeFileSync(KEYS_FILE, backup);
    resetSharedKeyStash();
  }
});

// ---- #104 / D8: MASTER_KEY derivation + key_version + migrate-on-read ----

// scoped env helper: sets the given vars, restores prior values (incl. absent) after
function withEnv(env, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('#104 MASTER_KEY set: new writes derive from MASTER_KEY (key_version 2, no deprecation warning)', () => {
  withEnv({ MASTER_KEY: 'master-secret-red-1', YOUTUBE_CLIENT_SECRET: 'legacy-secret-red' }, () => {
    _resetLegacyWarnForTests();
    const warns = [];
    const orig = console.warn;
    console.warn = (m) => warns.push(String(m));
    let enc;
    try {
      assert.equal(currentKeyVersion(), 2, 'current key version must be 2 when MASTER_KEY is set');
      enc = encryptKeys({ openai: 'sk_MASTER_ROW_AAA' });
    } finally {
      console.warn = orig;
    }
    assert.equal(warns.length, 0, 'no deprecation warning when MASTER_KEY derivation is used');

    // the ciphertext must decrypt under the master key (v2)…
    const viaMaster = readKeys({ enc, key_version: 2 });
    assert.deepEqual(viaMaster.keys, { openai: 'sk_MASTER_ROW_AAA' }, 'row must be readable as key_version 2');
    assert.equal(viaMaster.migrated, false);
    // …and must NOT decrypt under the legacy derivation
    withEnv({ MASTER_KEY: undefined }, () => {
      const viaLegacy = readKeys({ enc, key_version: 1 });
      assert.equal(viaLegacy.keys, null, 'master-derived row must not decrypt under the legacy key');
    });
  });
});

test('#104 legacy row read under MASTER_KEY migrates to key_version 2 with content unchanged', () => {
  withEnv({ MASTER_KEY: undefined, YOUTUBE_CLIENT_SECRET: 'legacy-secret-red' }, () => {
    const legacyEnc = encryptKeys({ groq: 'gsk_LEGACY_ROW_BBB' }); // v1-era write
    withEnv({ MASTER_KEY: 'master-secret-red-1' }, () => {
      const r = readKeys({ enc: legacyEnc }); // pre-#104 rows carry no key_version
      assert.deepEqual(r.keys, { groq: 'gsk_LEGACY_ROW_BBB' }, 'content must decrypt byte-identical');
      assert.equal(r.migrated, true, 'legacy row must be migrated on read');
      assert.equal(r.key_version, 2, 'migrated row must be key_version 2');
      assert.notEqual(r.enc, legacyEnc, 'migrated row must carry fresh (master-key) ciphertext');
      // the migrated ciphertext reads back clean as v2
      const again = readKeys({ enc: r.enc, key_version: r.key_version });
      assert.deepEqual(again.keys, { groq: 'gsk_LEGACY_ROW_BBB' });
      assert.equal(again.migrated, false);
    });
  });
});

test('#104 no MASTER_KEY: legacy rows read exactly as today (no lockout, no rewrite)', () => {
  withEnv({ MASTER_KEY: undefined, YOUTUBE_CLIENT_SECRET: 'legacy-secret-red' }, () => {
    const enc = encryptKeys({ gemini: 'AIza_NO_MASTER_CCC' });
    const r = readKeys({ enc });
    assert.deepEqual(r.keys, { gemini: 'AIza_NO_MASTER_CCC' }, 'legacy row must stay readable without MASTER_KEY');
    assert.equal(r.migrated, false, 'no migration without MASTER_KEY');
    assert.equal(r.key_version, 1);
    assert.equal(r.enc, enc, 'ciphertext must be returned untouched (nothing to migrate to)');
    assert.equal(currentKeyVersion(), 1);
  });
});

test('#104 wrong MASTER_KEY fails closed (null, not garbage decryption)', () => {
  const enc = withEnv({ MASTER_KEY: 'right-master-red', YOUTUBE_CLIENT_SECRET: 'legacy-secret-red' }, () =>
    encryptKeys({ pixabay: 'PIXABAY_WRONG_MASTER_DDD' }));
  withEnv({ MASTER_KEY: 'wrong-master-red' }, () => {
    assert.equal(decryptKeys(enc), null, 'decryptKeys with wrong MASTER_KEY must return null');
    const r = readKeys({ enc, key_version: 2 });
    assert.equal(r.keys, null, 'readKeys with wrong MASTER_KEY must fail closed');
    assert.equal(r.migrated, false);
  });
});

test('#104 decryptKeys stays backward-compatible: legacy rows still decrypt while MASTER_KEY is set', () => {
  withEnv({ MASTER_KEY: undefined, YOUTUBE_CLIENT_SECRET: 'legacy-secret-red' }, () => {
    const legacyEnc = encryptKeys({ openrouter: 'sk-or_LEGACY_ROW_EEE' });
    withEnv({ MASTER_KEY: 'master-secret-red-1' }, () => {
      assert.deepEqual(decryptKeys(legacyEnc), { openrouter: 'sk-or_LEGACY_ROW_EEE' },
        'legacy rows must not lock out while MASTER_KEY is set');
    });
  });
});

test('#104 legacy fallback logs the deprecation warning exactly once per process, with no secret material', () => {
  withEnv({ MASTER_KEY: undefined, YOUTUBE_CLIENT_SECRET: 'legacy-secret-red' }, () => {
    _resetLegacyWarnForTests();
    const warns = [];
    const orig = console.warn;
    console.warn = (m) => warns.push(String(m));
    try {
      encryptKeys({ cerebras: 'csd_LEGACY_WARN_FFFF' });
      encryptKeys({ mistral: 'mlt_LEGACY_WARN_GGGG' });
      decryptKeys('garbage.input.here');
    } finally {
      console.warn = orig;
    }
    const hits = warns.filter((m) => m.includes('MASTER_KEY') && m.includes('legacy'));
    assert.equal(hits.length, 1, 'deprecation warning must fire exactly once per process');
    assert.ok(!warns.some((m) => m.includes('legacy-secret-red')), 'warning must never contain secret material');
  });
});
