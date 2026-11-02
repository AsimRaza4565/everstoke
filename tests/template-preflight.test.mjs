// Task 9 (#102 Phase 1): generation preflight tests.
// runPreflight is a pure-ish orchestrator — the registry DB is injected, so
// these fixtures use a stub client (same seam style as
// tests/template-registry-db.test.mjs). No live Neon, no pipeline spawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync as readFs } from 'node:fs';
import { runPreflight, capabilityMapFromAppliedProviders } from '../lib/template-preflight.mjs';

// ---------------------------------------------------------------------------
// Fixtures — same shapes the real pipeline call site passes.
// ---------------------------------------------------------------------------

// Schema-valid registry metadata (same shape tests/template-registry.test.mjs uses).
const META_V120 = {
  version: '1.2.0',
  niches: ['personal finance'],
  formats: ['short'],
  renderer: 'remotion',
  required_capabilities: ['script-gen', 'tts'],
  variation_rules: ['distinct storyline per video', 'no repeated hook across last 5'],
  safety: { required_sources: true, review_required: [] },
  deprecated: false,
  changelog: [{ version: '1.2.0', date: '2026-10-26', note: 'initial seed' }],
};

const CATALOG = [
  { id: 'finance-explainer', name: 'Finance Explainer', family: 'finance-explainer', aspectRatios: ['9:16'] },
];

const REGISTRY_META_FIXTURE = { 'finance-explainer': META_V120 };

// Channel registry entry (yt-mcp/studio-channels.json entry shape — the same
// shape the Studio assign route validated against at save time).
const CHANNEL_ENTRY = {
  slug: 'money-rulebook',
  niche: 'personal finance',
  kit: { niches: ['personal finance'], longSlot: null },
};

// Both capabilities available; renderer intentionally absent (route parity:
// Phase-1 renderers ship in-repo, the preflight mirrors the route's assertion).
const CAPS = { 'script-gen': true, 'tts': true };

const ASSIGNMENT_ROW = {
  channel_id: 'money-rulebook',
  family_id: 'finance-explainer',
  pinned_major: 1,
  pinned_version: '1.1.0',
  assigned_by: 'owner@example.com',
};

function stubDb(rows, opts = {}) {
  const calls = [];
  return {
    calls,
    getActiveAssignment: async (channelId) => {
      calls.push(channelId);
      if (opts.reject) throw opts.reject;
      return rows.find((r) => r.channel_id === channelId) || null;
    },
  };
}

const run = (db, over = {}) => runPreflight({
  channelId: 'money-rulebook',
  registryDb: db,
  catalog: CATALOG,
  meta: REGISTRY_META_FIXTURE,
  channelEntry: CHANNEL_ENTRY,
  capabilityMap: CAPS,
  ...over,
});

// ---------------------------------------------------------------------------
// 1. No active assignment -> legacy mode, verdict null (spec D5: zero change).
// ---------------------------------------------------------------------------
test('preflight: no active assignment -> legacy mode with null verdict', async () => {
  const db = stubDb([]);
  const pre = await run(db);
  assert.deepEqual(pre, { mode: 'legacy', verdict: null });
  assert.deepEqual(db.calls, ['money-rulebook'], 'looks up by the passed channelId');
});

// ---------------------------------------------------------------------------
// 2. Assigned + compatible -> enforce ok, enrichment fields correct (AC-7).
//    Pinned major 1 with catalog at 1.2.0 auto-adopts the minor (AC-5).
// ---------------------------------------------------------------------------
test('preflight: assigned + compatible -> enforce ok with template_id, resolved_version, metaSummary', async () => {
  const pre = await run(stubDb([ASSIGNMENT_ROW]));
  assert.equal(pre.mode, 'enforce');
  assert.equal(pre.verdict.ok, true);
  assert.equal(pre.verdict.template_id, 'finance-explainer');
  assert.equal(pre.verdict.resolved_version, '1.2.0'); // auto-adopted from pinned 1.1.0
  assert.deepEqual(pre.verdict.metaSummary, {
    variation_rules: META_V120.variation_rules,
    safety: META_V120.safety,
  });
});

// ---------------------------------------------------------------------------
// 3. Renderer parity with the assign route: capability map without the
//    renderer key still passes (Phase-1 renderers ship in-repo).
// ---------------------------------------------------------------------------
test('preflight: renderer mirrored like the assign route -> not renderer_unavailable', async () => {
  const pre = await run(stubDb([ASSIGNMENT_ROW]));
  assert.equal(pre.verdict.ok, true, 'remotion absent from CAPS must not block');
});

// ---------------------------------------------------------------------------
// 4. Assigned + incompatible -> enforce, ok:false, stable reason codes.
//    Caller (pipeline) fails the run on a not-ok verdict (AC-8).
// ---------------------------------------------------------------------------
test('preflight: assigned + blocked -> ok:false verdict carrying reason codes', async () => {
  const pre = await run(stubDb([ASSIGNMENT_ROW]), {
    capabilityMap: { 'script-gen': true }, // tts missing
    channelEntry: { slug: 'money-rulebook', niche: 'history', kit: { niches: ['history'] } },
  });
  assert.equal(pre.mode, 'enforce');
  assert.equal(pre.verdict.ok, false);
  const codes = pre.verdict.reasons.map((r) => r.code);
  assert.ok(codes.includes('missing_capability:tts'), `got ${codes}`);
  assert.ok(codes.includes('niche_mismatch'), `got ${codes}`);
});

// ---------------------------------------------------------------------------
// 5. Assignment resolvable against nothing (bad pin / family gone from the
//    catalog registry data) -> blocked verdict, not a silent pass, not a crash.
// ---------------------------------------------------------------------------
test('preflight: pinned major with no catalog version -> ok:false no_version_in_major', async () => {
  const pre = await run(stubDb([{ ...ASSIGNMENT_ROW, pinned_major: 9 }]));
  assert.equal(pre.mode, 'enforce');
  assert.equal(pre.verdict.ok, false);
  assert.ok(pre.verdict.reasons.some((r) => r.code === 'no_version_in_major'));
});

// ---------------------------------------------------------------------------
// 6. Registry DB error -> legacy path + warning (FIX ROUND 1, spec D5 governs:
//    an unreachable DB is not a block — fail-closed is reserved for channels
//    with a KNOWN active assignment whose verdict is not-ok).
// ---------------------------------------------------------------------------
test('preflight: DB error -> legacy + warning, never a throw', async () => {
  const pre = await run(stubDb([], { reject: new Error('db down') }));
  assert.deepEqual(pre, {
    mode: 'legacy',
    verdict: null,
    warning: 'registry db unavailable — legacy path, no template enforcement',
    warning_detail: 'db down',
  });
});

// Caller-contract violations still throw (programmer error, pre-DB) — the
// throw boundary stays sharp: infra unavailability never throws.
test('preflight: missing channelId / registryDb still throw (caller bug, not infra)', () => {
  const base = { catalog: CATALOG, meta: REGISTRY_META_FIXTURE, channelEntry: CHANNEL_ENTRY, capabilityMap: CAPS };
  assert.rejects(() => runPreflight({ ...base, channelId: '', registryDb: stubDb([]) }), /channelId/);
  assert.rejects(() => runPreflight({ ...base, channelId: 'money-rulebook', registryDb: null }), /registryDb/);
});

// ---------------------------------------------------------------------------
// 7. Capability map = SHARED pipeline-truth baseline refined add-only by the
//    vault (fix round 3 — the assign route and the preflight cannot drift).
// ---------------------------------------------------------------------------
test('capabilityMapFromAppliedProviders: baseline holds with zero vault keys; vault adds only', () => {
  const map = capabilityMapFromAppliedProviders(['gemini', 'openai']);
  assert.equal(map['script-gen'], true); // baseline true regardless; gemini also covers
  assert.equal(map['tts'], true);
  assert.equal(map['captions'], true);
  assert.equal(map['image-gen'], false); // baseline false AND no vault generator
  assert.deepEqual(capabilityMapFromAppliedProviders(null), {
    'script-gen': true, 'tts': true, 'captions': true, 'image-gen': false,
  }, 'no vault keys -> the pipeline-truth baseline still holds, image-gen stays unavailable');
});

// ---------------------------------------------------------------------------
// 6b. Zero vault keys -> assigned channel still passes enforce (fix round 3,
//     E2E round-2 finding: the CI runner has no vault keys, so the old
//     vault-only map blocked on missing_capability:tts,missing_capability:captions).
// ---------------------------------------------------------------------------
test('preflight: zero applied providers -> assigned channel verdict ok via shared baseline', async () => {
  const pre = await run(stubDb([ASSIGNMENT_ROW]), {
    capabilityMap: capabilityMapFromAppliedProviders(null),
  });
  assert.equal(pre.mode, 'enforce');
  assert.equal(pre.verdict.ok, true, `baseline must cover script-gen/tts/captions, got ${JSON.stringify(pre.verdict.reasons)}`);
});

// ---------------------------------------------------------------------------
// 8. Guard shape: the pipeline insertion sits behind TEMPLATE_PREFLIGHT_ENABLED.
//    The pipeline itself spawns children + exits, so it cannot run in unit
//    tests — these source-shape assertions pin the rollback (flip the constant
//    to false -> the preflight module is never even imported).
// ---------------------------------------------------------------------------
test('guard: pipeline preflight is gated by TEMPLATE_PREFLIGHT_ENABLED', () => {
  const src = readFs(new URL('../channel-pipeline.mjs', import.meta.url), 'utf8');
  const constantAt = src.indexOf('const TEMPLATE_PREFLIGHT_ENABLED = true;');
  const guardAt = src.indexOf('if (TEMPLATE_PREFLIGHT_ENABLED) {');
  const callAt = src.indexOf('runPreflight(');
  assert.ok(constantAt !== -1, 'module-top constant must exist');
  assert.ok(guardAt > constantAt, 'guard must sit after the constant');
  assert.ok(callAt > guardAt, 'runPreflight call must be inside the guarded block');
  assert.ok(!src.slice(guardAt + 1).includes('const TEMPLATE_PREFLIGHT_ENABLED'), 'one gate, one call site');
});

test('guard: legacy contract — disabled preflight lib still exports the flag contract', async () => {
  // The lib is only imported by the pipeline inside the guard; assert the
  // exported surface the guard relies on stays intact.
  const lib = await import('../lib/template-preflight.mjs');
  assert.equal(typeof lib.runPreflight, 'function');
  assert.equal(typeof lib.capabilityMapFromAppliedProviders, 'function');
});
