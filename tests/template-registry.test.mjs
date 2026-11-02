import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistryMeta, loadRegistryTemplates, resolveAssignment, validateAssignment, channelConfigFromRegistryEntry } from '../studio/lib/template-registry.js';
import { REGISTRY_META } from '../studio/lib/template-registry.data.js';
import { TEMPLATES_DATA } from '../studio/lib/templates-catalog.js';

const valid = {
  version: '1.0.0',
  niches: ['history'],
  formats: ['short'],
  renderer: 'remotion',
  required_capabilities: ['script-gen', 'tts', 'captions'],
  variation_rules: ['distinct storyline per video', 'no repeated hook across last 5'],
  safety: { required_sources: true, review_required: [] },
  deprecated: false,
  changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial' }],
};

test('valid metadata passes', () => {
  assert.deepEqual(validateRegistryMeta(valid), { ok: true });
});
test('bad semver fails with named error', () => {
  const r = validateRegistryMeta({ ...valid, version: '1.0' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('version')));
});
test('unknown capability fails', () => {
  const r = validateRegistryMeta({ ...valid, required_capabilities: ['script-gen', 'teleport'] });
  assert.equal(r.ok, false);
});
test('deprecated without date fails', () => {
  const r = validateRegistryMeta({ ...valid, deprecated: true });
  assert.equal(r.ok, false);
});
test('empty variation_rules fails', () => {
  const r = validateRegistryMeta({ ...valid, variation_rules: [] });
  assert.equal(r.ok, false);
});

// ---- Task 2: registry loader over catalog families (fail-closed) ----

function makeValidMeta(version = '1.0.0') {
  return {
    version,
    niches: ['history'],
    formats: ['short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: ['distinct storyline per video'],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version, date: '2026-10-26', note: 'initial' }],
  };
}

const catalogFamilies = [
  { id: 'documentary-frames', name: 'Documentary Master Frames', family: 'documentary-frames', aspectRatios: ['16:9', '9:16'] },
  { id: 'kinetic-quotes', name: 'Kinetic Quote Cards', family: 'kinetic-quotes', aspectRatios: ['9:16'] },
  { id: 'podcast-waves', name: 'Podcast Waveforms', family: 'podcast-waves', aspectRatios: ['16:9'] },
];

// 2 metadata blocks: one valid, one invalid. The third family has no metadata.
const metaData = {
  'documentary-frames': makeValidMeta(),
  'kinetic-quotes': { ...makeValidMeta('2.0.0'), version: 'not-semver' },
};

test('loader returns templates for valid families, merging catalog + registry', () => {
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, metaData);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].familyId, 'documentary-frames');
  assert.equal(templates[0].name, 'Documentary Master Frames');
  assert.deepEqual(templates[0].catalog.aspectRatios, ['16:9', '9:16']);
  assert.equal(templates[0].registry.version, '1.0.0');
});

test('loader excludes AND reports invalid metadata blocks (AC-1)', () => {
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, metaData);
  assert.equal(templates.some(t => t.familyId === 'kinetic-quotes'), false);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0].familyId, 'kinetic-quotes');
  assert.ok(Array.isArray(invalid[0].errors) && invalid[0].errors.length > 0);
  assert.ok(invalid[0].errors.some(e => e.includes('version')));
});

test('loader simply omits families without metadata', () => {
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, metaData);
  assert.equal(templates.some(t => t.familyId === 'podcast-waves'), false);
  assert.equal(invalid.some(i => i.familyId === 'podcast-waves'), false);
});

test('loader never throws on invalid metadata', () => {
  const hostile = {
    'documentary-frames': 'a string, not an object',
    'kinetic-quotes': { ...makeValidMeta(), safety: null, changelog: 'nope', niches: 42 },
    'podcast-waves': null, // null block == no metadata -> absent, not invalid
  };
  const { templates, invalid } = loadRegistryTemplates(catalogFamilies, hostile);
  assert.equal(templates.length, 0);
  assert.equal(invalid.length, 2);
  assert.deepEqual(invalid.map(i => i.familyId).sort(), ['documentary-frames', 'kinetic-quotes']);
});

test('data module exposes an object REGISTRY_META (seeded in a later task)', () => {
  assert.equal(typeof REGISTRY_META, 'object');
  assert.notEqual(REGISTRY_META, null);
  assert.equal(Array.isArray(REGISTRY_META), false);
});

// ---- Task 3: semver resolver — minor/patch auto-adopt, major holds ----

const familyBlocks = [
  { familyId: 'documentary-frames', version: '1.0.0' },
  { familyId: 'documentary-frames', version: '1.1.0' },
  { familyId: 'documentary-frames', version: '1.1.3' },
  { familyId: 'documentary-frames', version: '2.0.0' },
];

test('resolver: highest version within pinned major, flags higher major available', () => {
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 1 }, familyBlocks);
  assert.deepEqual(r, { ok: true, resolvedVersion: '1.1.3', majorUpdateAvailable: true });
});

test('resolver: pin on the highest major resolves it, no major update available', () => {
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 2 }, familyBlocks);
  assert.deepEqual(r, { ok: true, resolvedVersion: '2.0.0', majorUpdateAvailable: false });
});

test('resolver: pin with no versions in that major errors no_version_in_major', () => {
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 3 }, familyBlocks);
  assert.deepEqual(r, { ok: false, errors: ['no_version_in_major'] });
});

test('resolver: only considers blocks of the assigned family', () => {
  const otherFamily = [{ familyId: 'kinetic-quotes', version: '1.5.0' }];
  const r = resolveAssignment({ familyId: 'documentary-frames', pinned_major: 1 }, otherFamily);
  assert.deepEqual(r, { ok: false, errors: ['no_version_in_major'] });
});

test('resolver: picks highest patch within same minor (numeric, not lexicographic)', () => {
  const blocks = [
    { familyId: 'f', version: '1.0.9' },
    { familyId: 'f', version: '1.0.10' },
    { familyId: 'f', version: '1.0.2' },
  ];
  const r = resolveAssignment({ familyId: 'f', pinned_major: 1 }, blocks);
  assert.equal(r.ok, true);
  assert.equal(r.resolvedVersion, '1.0.10');
});

// ---- Task 4: compatibility validator with stable reason codes ----

// Capability map that satisfies `valid` meta's required_capabilities + its renderer.
const fullCaps = { 'script-gen': true, tts: true, captions: true, remotion: true };
const matchingChannel = { formats: ['short'], niches: ['history'], brand_kit: true };

test('validator: compatible assignment passes', () => {
  assert.deepEqual(validateAssignment(valid, matchingChannel, fullCaps), { ok: true });
});

test('validator: unavailable required capability -> missing_capability:<cap>', () => {
  const r = validateAssignment(valid, matchingChannel, { ...fullCaps, tts: false });
  assert.equal(r.ok, false);
  // M7 fix (Task 3+4 ledgered minor): assert the real detail string, not
  // r.reasons[0].detail against itself (was a tautology).
  assert.deepEqual(r.reasons, [{
    code: 'missing_capability:tts',
    detail: 'required capability "tts" is not available (map value must be exactly true)',
  }]);
});

test('validator: capability present but not exactly true counts as unavailable', () => {
  const r = validateAssignment(valid, matchingChannel, { ...fullCaps, captions: 'yes' });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'missing_capability:captions'));
});

test('validator: no format overlap -> format_mismatch', () => {
  const r = validateAssignment(valid, { ...matchingChannel, formats: ['long'] }, fullCaps);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'format_mismatch'));
});

test('validator: no niche overlap -> niche_mismatch', () => {
  const r = validateAssignment(valid, { ...matchingChannel, niches: ['finance'] }, fullCaps);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'niche_mismatch'));
});

test('validator: renderer not available -> renderer_unavailable', () => {
  const r = validateAssignment(valid, matchingChannel, { 'script-gen': true, tts: true, captions: true });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'renderer_unavailable'));
});

test('validator: deprecated meta -> deprecated_template', () => {
  const r = validateAssignment({ ...valid, deprecated: true, deprecated_on: '2026-10-01' }, matchingChannel, fullCaps);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some(reason => reason.code === 'deprecated_template'));
});

test('validator: collects ALL blocking reasons, not first-only', () => {
  const r = validateAssignment(
    { ...valid, deprecated: true, deprecated_on: '2026-10-01' },
    { formats: ['long'], niches: ['finance'], brand_kit: false },
    { 'script-gen': true },
  );
  assert.equal(r.ok, false);
  assert.deepEqual(
    r.reasons.map(reason => reason.code).sort(),
    [
      'deprecated_template',
      'format_mismatch',
      'missing_capability:captions',
      'missing_capability:tts',
      'niche_mismatch',
      'renderer_unavailable',
    ],
  );
});

// ---- channelConfigFromRegistryEntry (Task 8 hoist of the assign route's
// verbatim channelConfig derivation — pins the validator-input contract) ----

test('channelConfig: null/absent entry and kit -> empty niches, shorts-only, no kit', () => {
  const empty = { formats: ['short'], niches: [], brand_kit: false };
  assert.deepEqual(channelConfigFromRegistryEntry(null), empty);
  assert.deepEqual(channelConfigFromRegistryEntry(undefined), empty);
  assert.deepEqual(channelConfigFromRegistryEntry({ slug: 'x' }), empty);
  assert.deepEqual(channelConfigFromRegistryEntry({ slug: 'x', kit: null }), empty);
  assert.deepEqual(channelConfigFromRegistryEntry({ slug: 'x', kit: {} }), empty);
});

test('channelConfig: main niche plus sub-niches, Set-deduped with main first', () => {
  const r = channelConfigFromRegistryEntry({ niche: 'History stories', kit: { niches: ['History stories', 'biographies', 'ancient civilizations'] } });
  assert.deepEqual(r.niches, ['History stories', 'biographies', 'ancient civilizations']);
  const r2 = channelConfigFromRegistryEntry({ niche: 'Finance explainers', kit: { niches: ['Finance explainers', 'Finance explainers'] } });
  assert.deepEqual(r2.niches, ['Finance explainers']);
});

test('channelConfig: non-string niches are dropped, not passed to the validator', () => {
  const r = channelConfigFromRegistryEntry({ niche: 'History stories', kit: { niches: ['', 42, null, 'war stories'] } });
  assert.deepEqual(r.niches, ['History stories', 'war stories']);
});

test('channelConfig: longSlot ternary drives formats (short always, long only with longSlot)', () => {
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n' }).formats, ['short']);
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n', kit: { longSlot: '18:00' } }).formats, ['short', 'long']);
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n', kit: { longSlot: '' } }).formats, ['short']);
  assert.deepEqual(channelConfigFromRegistryEntry({ niche: 'n', kit: { longSlot: null } }).formats, ['short']);
});

test('channelConfig: brand_kit is Boolean truthiness of a non-empty kit', () => {
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n' }).brand_kit, false);
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n', kit: {} }).brand_kit, false);
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n', kit: { voice: 'deep' } }).brand_kit, true);
  assert.equal(channelConfigFromRegistryEntry({ niche: 'n', kit: { niches: ['sub'] } }).brand_kit, true);
});

// ---- Task 10: the six seeded registry blocks (history + finance lanes) ----
// Contract pins carried from Task 7 review:
//   P2 — seed `niches` must be VERBATIM channel-registry niche strings
//        (exact-string matching in validateAssignment; no normalization).
//   P3 — NO seed may declare `image-gen` (Phase 1 vault has no generator
//        provider; photo families draw from the stock/assets lane).
//   M1 — fold-in: the validator collects ALL errors on one broken block.

const SEED_IDS = [
  'documentary-frames',
  'timeline-history',
  'photo-stories',
  'finance-explainers',
  'stats-counters',
  'chart-animations',
];
const FINANCE_SEED_IDS = ['finance-explainers', 'stats-counters', 'chart-animations'];
const HISTORY_SEED_IDS = ['documentary-frames', 'timeline-history', 'photo-stories'];

// Aspect-ratio -> format mapping the seeds must honor.
const ASPECT_TO_FORMAT = { '16:9': 'long', '9:16': 'short' };
function formatsForAspectRatios(aspectRatios) {
  return aspectRatios.map((a) => ASPECT_TO_FORMAT[a]);
}

test('seeds: REGISTRY_META contains at least the six seeded families', () => {
  // The registry grows as data (exit gate added editorial-headlines as #7) —
  // pin the six launch seeds as REQUIRED, not exhaustive; every additional
  // entry must still pass validateRegistryMeta (covered by the loader test).
  const keys = Object.keys(REGISTRY_META);
  for (const id of SEED_IDS) assert.ok(keys.includes(id), `missing seed ${id}`);
});

test('seeds: every seed passes validateRegistryMeta', () => {
  for (const id of SEED_IDS) {
    assert.deepEqual(validateRegistryMeta(REGISTRY_META[id]), { ok: true }, `seed ${id} must validate`);
  }
});

test('seeds: every seeded family exists in the catalog', () => {
  const catalogIds = new Set(TEMPLATES_DATA.map((t) => t.family || t.id));
  for (const id of SEED_IDS) {
    assert.ok(catalogIds.has(id), `seed ${id} must exist in TEMPLATES_DATA`);
  }
});

test('seeds: formats declared are a subset of the catalog aspectRatios', () => {
  for (const id of SEED_IDS) {
    const family = TEMPLATES_DATA.find((t) => (t.family || t.id) === id);
    const declared = REGISTRY_META[id].formats;
    const supported = formatsForAspectRatios(family.aspectRatios);
    for (const f of declared) {
      assert.ok(supported.includes(f), `seed ${id} declares format "${f}" not supported by catalog aspectRatios [${family.aspectRatios.join(', ')}]`);
    }
  }
});

test('seeds: finance seeds carry required_sources + review_required ["finance"]', () => {
  for (const id of FINANCE_SEED_IDS) {
    assert.deepEqual(REGISTRY_META[id].safety, { required_sources: true, review_required: ['finance'] }, `seed ${id}`);
  }
});

test('seeds: history seeds carry required_sources with no review_required', () => {
  for (const id of HISTORY_SEED_IDS) {
    assert.deepEqual(REGISTRY_META[id].safety, { required_sources: true, review_required: [] }, `seed ${id}`);
  }
});

test('seeds: no seed declares image-gen (pin P3 — Phase 1 vault has no generator)', () => {
  for (const id of SEED_IDS) {
    assert.equal(
      REGISTRY_META[id].required_capabilities.includes('image-gen'), false,
      `seed ${id} must not declare image-gen`,
    );
  }
});

test('seeds: version 1.0.0, not deprecated, changelog initial entry, >=2 variation rules', () => {
  for (const id of SEED_IDS) {
    const meta = REGISTRY_META[id];
    assert.equal(meta.version, '1.0.0', `seed ${id}`);
    assert.equal(meta.deprecated, false, `seed ${id}`);
    assert.equal(meta.deprecated_on, undefined, `seed ${id}`);
    assert.deepEqual(meta.changelog, [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }], `seed ${id}`);
    assert.ok(meta.variation_rules.length >= 2, `seed ${id} needs >=2 variation rules`);
    assert.ok(meta.variation_rules.every((r) => typeof r === 'string' && r.length > 0), `seed ${id}`);
  }
});

test('seeds: all seeds resolve as registry-assignable (>= 6 templates, 0 invalid)', () => {
  const { templates, invalid } = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);
  assert.deepEqual(invalid, []);
  const ids = templates.map((t) => t.familyId);
  for (const id of SEED_IDS) assert.ok(ids.includes(id), `seed ${id} must resolve`);
  assert.ok(templates.length >= SEED_IDS.length, `expected >= ${SEED_IDS.length} templates, got ${templates.length}`);
});

// M1 fold-in (Task 1+2 ledgered minor): pin the collect-all-errors contract —
// one block with several broken fields yields >=2 named errors, not first-only.
test('validator: collects >=2 errors on a single multi-broken block (not first-only)', () => {
  const r = validateRegistryMeta({
    ...valid,
    version: 'not-semver',        // error 1: version
    formats: ['vertical'],        // error 2: formats
    renderer: '',                 // error 3: renderer
    changelog: [{ version: 'x', date: 'tomorrow', note: '' }], // errors 4-6
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 2, `expected >=2 collected errors, got ${r.errors.length}: ${JSON.stringify(r.errors)}`);
  assert.ok(r.errors.some((e) => e.includes('version')));
  assert.ok(r.errors.some((e) => e.includes('formats')));
});
