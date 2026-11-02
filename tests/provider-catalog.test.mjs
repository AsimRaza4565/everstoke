// Task 1 (#104, Phase 2 BYOK vault v2): provider catalog — single source of
// truth for capability providers. Retires the two hand-mirrored
// CAPABILITY_PROVIDERS tables (assign route M31 / preflight M34): both
// consumers now import capabilityProviders() from
// studio/lib/provider-catalog.js, and this file pins the projection against
// drift with the retired literals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROVIDERS, capabilityProviders, CAPABILITY_BASELINE } from '../studio/lib/provider-catalog.js';
import { CAPABILITY_BASELINE as BASELINE_FROM_REGISTRY } from '../studio/lib/template-registry.js';
import { PROVIDER_ENV } from '../lib/channel-keys.mjs';

const LICENSE_CLASSES = ['free', 'free-with-caveats', 'paid'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- Catalog shape ----

test('catalog: every provider entry carries the full data shape', () => {
  assert.equal(typeof PROVIDERS, 'object');
  assert.notEqual(PROVIDERS, null);
  assert.equal(Array.isArray(PROVIDERS), false);
  for (const [id, p] of Object.entries(PROVIDERS)) {
    assert.equal(p.id, id, `${id}.id must match its key`);
    assert.ok(Array.isArray(p.capabilities) && p.capabilities.length >= 1
      && p.capabilities.every((c) => typeof c === 'string' && c.length > 0), `${id}.capabilities`);
    assert.ok(Array.isArray(p.envVars) && p.envVars.every((e) => typeof e === 'string' && e.length > 0), `${id}.envVars`);
    assert.ok(p.baseUrl === null || (typeof p.baseUrl === 'string' && p.baseUrl.length > 0), `${id}.baseUrl`);
    assert.ok(Array.isArray(p.models) && p.models.every((m) => typeof m === 'string' && m.length > 0), `${id}.models`);
    assert.ok(p.freeTier.rpd === null || typeof p.freeTier.rpd === 'number', `${id}.freeTier.rpd (number or null)`);
    assert.ok(p.freeTier.maxOutputTokens === null || typeof p.freeTier.maxOutputTokens === 'number', `${id}.freeTier.maxOutputTokens (number or null)`);
    assert.ok(p.freeTier.rpd === null || p.freeTier.rpd > 0, `${id}.freeTier.rpd`);
    assert.ok(p.freeTier.maxOutputTokens === null || p.freeTier.maxOutputTokens > 0, `${id}.freeTier.maxOutputTokens`);
    assert.ok(DATE_RE.test(p.freeTier.fetched), `${id}.freeTier.fetched must be YYYY-MM-DD`);
    assert.ok(LICENSE_CLASSES.includes(p.licenseClass), `${id}.licenseClass must be one of ${LICENSE_CLASSES.join('|')}`);
  }
});

test('catalog: includes every provider the brief names', () => {
  for (const id of ['gemini', 'groq', 'cerebras', 'mistral', 'openrouter', 'openai', 'cloudflare', 'tavily', 'serper', 'elevenlabs', 'edge-tts-local', 'whisper-local']) {
    assert.ok(PROVIDERS[id], `missing provider ${id}`);
  }
});

test('catalog: envVars match PROVIDER_ENV wherever the provider is vault-mapped', () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (PROVIDER_ENV[id]) {
      assert.ok(p.envVars.includes(PROVIDER_ENV[id]), `${id}.envVars must include PROVIDER_ENV's ${PROVIDER_ENV[id]}`);
    }
  }
});

// ---- Projection: every baseline-true capability covered; image-gen empty ----

test('projection: every baseline-true capability has >=1 provider', () => {
  for (const [cap, available] of Object.entries(CAPABILITY_BASELINE)) {
    const providers = capabilityProviders(cap);
    if (available === true) {
      assert.ok(providers.length >= 1, `baseline-true capability "${cap}" must have >=1 provider`);
    }
  }
});

test('projection: image-gen is empty (no generator provider in the vault)', () => {
  assert.deepEqual(capabilityProviders('image-gen'), []);
});

test('projection: gemini first for script-gen (research primary), per baseline order', () => {
  const providers = capabilityProviders('script-gen');
  assert.equal(providers[0], 'gemini');
  // Drift pin vs the retired M31/M34 literal (['gemini', 'groq', 'cerebras',
  // 'mistral', 'hf', 'openrouter']): the catalog keeps that as an exact
  // PREFIX, then appends cloudflare — the research-added FALLBACK #2 the old
  // hand-mirrors predated (see free-doc-script-apis-2026-10-28 §4.1 slot 4) —
  // then appends openai (Task 5 re-review follow-up: the paid chat lane must
  // be ROUTABLE via real key application — user story 10's slot-0 UI action).
  assert.deepEqual(providers, ['gemini', 'groq', 'cerebras', 'mistral', 'hf', 'openrouter', 'cloudflare', 'openai']);
});

test('projection: openai declares script-gen (paid slot-0 routable, Task 5 re-review follow-up)', () => {
  assert.ok(PROVIDERS.openai.capabilities.includes('script-gen'), 'openai must cover script-gen so a route/key can reach the chat lane');
  // the tts/captions lanes keep their defaults — the chat entry was appended,
  // not prepended (Task 5 fix round 1 invariant)
  assert.deepEqual(capabilityProviders('tts'), ['openai', 'elevenlabs', 'edge-tts-local']);
  assert.deepEqual(capabilityProviders('captions'), ['openai', 'whisper-local']);
});

test('projection: tts and captions keep the retired tables as prefix, local lanes appended', () => {
  assert.deepEqual(capabilityProviders('tts'), ['openai', 'elevenlabs', 'edge-tts-local']);
  assert.deepEqual(capabilityProviders('captions'), ['openai', 'whisper-local']);
});

test('projection: no duplicate or unknown provider ids in any capability projection', () => {
  const ids = new Set(Object.keys(PROVIDERS));
  for (const cap of [...Object.keys(CAPABILITY_BASELINE), 'search']) {
    const providers = capabilityProviders(cap);
    assert.equal(new Set(providers).size, providers.length, `${cap}: duplicate provider`);
    for (const p of providers) {
      assert.ok(ids.has(p), `${cap}: unknown provider ${p}`);
      assert.ok(PROVIDERS[p].capabilities.includes(cap), `${cap}: ${p} does not declare the capability`);
    }
  }
});

// ---- Baseline re-export ----

test('CAPABILITY_BASELINE re-export deep-equals template-registry.js', () => {
  assert.deepEqual(CAPABILITY_BASELINE, BASELINE_FROM_REGISTRY);
  assert.deepEqual(CAPABILITY_BASELINE, { 'script-gen': true, tts: true, captions: true, 'image-gen': false });
});

// ---- Research spot-values (research/free-doc-script-apis-2026-10-28.md +
// research/platform-byok-providers-2026-10-24.md §1) ----

test('research spot-values: gemini maxOutputTokens 65536 (fetched 2026-10-28)', () => {
  assert.equal(PROVIDERS.gemini.freeTier.maxOutputTokens, 65536);
  assert.equal(PROVIDERS.gemini.freeTier.fetched, '2026-10-28');
});

test('research spot-values: groq rpd 1000 + maxOutputTokens 65536 (fetched 2026-10-28)', () => {
  assert.equal(PROVIDERS.groq.freeTier.rpd, 1000);
  assert.equal(PROVIDERS.groq.freeTier.maxOutputTokens, 65536);
  assert.equal(PROVIDERS.groq.freeTier.fetched, '2026-10-28');
});

test('research spot-values: openrouter free 50 RPD; openai has no free tier (paid)', () => {
  assert.equal(PROVIDERS.openrouter.freeTier.rpd, 50);
  assert.equal(PROVIDERS.openai.licenseClass, 'paid');
  assert.equal(PROVIDERS.openai.freeTier.rpd, null);
});

test('research spot-values: local lanes are keyless with null baseUrls', () => {
  for (const id of ['edge-tts-local', 'whisper-local']) {
    assert.deepEqual(PROVIDERS[id].envVars, [], `${id} is keyless`);
    assert.equal(PROVIDERS[id].baseUrl, null, `${id} has no baseUrl`);
  }
});

// ---- Consumers import the catalog (M31/M34 retired — drift pin by source) ----

function readSrc(p) {
  return fs.readFileSync(p, 'utf8');
}

test('assign route imports capabilityProviders from the catalog, no local table', () => {
  const src = readSrc('studio/app/api/templates/assign/route.js');
  assert.ok(src.includes('provider-catalog'), 'route must import from provider-catalog');
  assert.equal(src.includes('const CAPABILITY_PROVIDERS'), false, 'route must not declare a local CAPABILITY_PROVIDERS');
});

test('template preflight imports capabilityProviders from the catalog, no local table', () => {
  const src = readSrc('lib/template-preflight.mjs');
  assert.ok(src.includes('provider-catalog'), 'preflight must import from provider-catalog');
  assert.equal(src.includes('const CAPABILITY_PROVIDERS'), false, 'preflight must not declare a local CAPABILITY_PROVIDERS');
});
