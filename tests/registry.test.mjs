import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChannels, listChannels, getChannel, fbPageId, LEGACY_SLUGS } from '../lib/registry.mjs';

// --- pure merge logic (no I/O) ---

test('mergeChannels: legacy + wizard channels merge, legacy wins on slug collision', () => {
  const legacy = { 'quotequarry': { label: 'QUOTE QUARRY', slots: ['22:35'] } };
  const registry = [
    { slug: 'quotequarry', label: 'wizard copy', active: true },   // collision → legacy wins
    { slug: 'wizard-chan', label: 'Wizard Chan', active: true },   // new → included
    { slug: 'paused-chan', label: 'Paused', active: false },       // inactive → excluded
  ];
  const out = mergeChannels(legacy, registry);
  const slugs = out.map((c) => c.slug);
  assert.ok(slugs.includes('quotequarry'), 'legacy slug present');
  assert.ok(slugs.includes('wizard-chan'), 'active wizard channel included');
  assert.ok(!slugs.includes('paused-chan'), 'inactive wizard channel excluded');
  const qq = out.find((c) => c.slug === 'quotequarry');
  assert.equal(qq.label, 'QUOTE QUARRY', 'legacy entry wins collision');
  assert.equal(qq.source, 'legacy');
  assert.equal(out.find((c) => c.slug === 'wizard-chan').source, 'registry');
});

// --- real-file behavior ---

test('listChannels includes all four legacy slugs from lib/brands.json', () => {
  const slugs = listChannels().map((c) => c.slug);
  for (const s of LEGACY_SLUGS) assert.ok(slugs.includes(s), `missing ${s}`);
});

test('listChannels filters by source (legacy / registry / merged)', () => {
  const legacyOnly = listChannels({ source: 'legacy' });
  assert.ok(legacyOnly.every((c) => c.source === 'legacy'));
  const allMerged = listChannels({ source: 'merged' });
  assert.ok(allMerged.length >= legacyOnly.length);
});

test('getChannel returns the legacy kit for a known slug with destinations and ytAuth', () => {
  // everstoke adoption: inherited channels stay resolvable (dormant) but have
  // no FB destination in this repo; everstoke carries the live token wiring.
  const qq = getChannel('quotequarry');
  assert.ok(qq, 'quotequarry resolves');
  assert.ok(qq.slots, 'has slots');
  assert.ok(qq.niches, 'has niches');
  assert.equal(qq.destinations.fbPageId, undefined);
  assert.equal(qq.ytAuth.envName, 'YT_TOKEN_QUOTEQUARRY');
  assert.ok(qq.ytAuth.tokenFile.includes('quotequarry'));

  const es = getChannel('everstoke');
  assert.ok(es, 'everstoke resolves');
  assert.equal(es.ytAuth.envName, 'YT_TOKEN_EVERSTOKE');
  assert.ok(es.ytAuth.tokenFile.includes('everstoke'));
});

test('getChannel returns undefined for an unknown slug (no silent fallback)', () => {
  assert.equal(getChannel('quptequarry'), undefined, 'typo must NOT resolve to a real channel');
});

// --- FB page destinations (regression: #38 yt-daily posted QQ frames to the retired page) ---

test('fbPageId: undefined for every channel until cross-post destinations are configured', () => {
  // everstoke adoption: previous owner's page ids removed from lib/registry.mjs;
  // fbPageId must return undefined for all slugs (FB lane stays paused).
  assert.equal(fbPageId('quotequarry'), undefined);
  assert.equal(fbPageId('investors-compass'), undefined);
  assert.equal(fbPageId('money-rulebook'), undefined);
  assert.equal(fbPageId('debt-free-doctrine'), undefined);
  assert.equal(fbPageId('everstoke'), undefined);
});

test('fbPageId: wizard channel without a destination and unknown slugs return undefined', () => {
  assert.equal(fbPageId('definitely-not-a-channel'), undefined);
});
