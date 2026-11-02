// Task 6 addendum (#104, Phase 2 BYOK vault v2) — CF-1/CF-2/CF-3 wiring of the
// schedule route to the quota-model store (Task 8 review carry-forwards):
//   CF-1  advisory when a live model's insertCostUnits differs from legacy 1,700
//         (the ~17x relaxation must never be silent),
//   CF-2  ensureQuotaModelSchema at the wiring point + table-missing vs
//         row-missing distinguished in the log,
//   CF-3  projectWithQuotaModel wired with the loader injected (AC-P2-6/7 end-to-end).
//
// Studio route files import through the '@/lib' alias, which plain node --test
// cannot resolve — so the wiring seam is pinned by SOURCE SCAN (the house
// pattern for route files: tests/provider-catalog.test.mjs 'assign route
// imports capabilityProviders...'). Build-level proof is the `next build`
// exit-0 gate; behavioral proof of the projection math lives in
// tests/quota-model.test.mjs (Task 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projection, projectWithQuotaModel } from '../studio/lib/schedule-projection.js';

const src = fs.readFileSync('studio/app/api/channels/schedule/route.js', 'utf8');

test('CF-3: route imports and wires projectWithQuotaModel with the loader injected', () => {
  assert.ok(src.includes('projectWithQuotaModel'), 'route must import projectWithQuotaModel from schedule-projection');
  assert.ok(/projectWithQuotaModel\(\s*\{/.test(src), 'route must CALL projectWithQuotaModel');
  assert.ok(/loadQuotaModel:\s*(async\s*)?\(?/.test(src), 'loader must be passed to projectWithQuotaModel (injected, CF-3)');
});

test('CF-2: ensureQuotaModelSchema is called at the wiring point', () => {
  assert.ok(src.includes('ensureQuotaModelSchema'), 'route must import ensureQuotaModelSchema');
  assert.ok(/await\s+ensureQuotaModelSchema\(/.test(src), 'route must CALL ensureQuotaModelSchema before loading the model');
  assert.ok(/from\s+'@\/lib\/db'/.test(src), 'route must acquire the real db client (db + dbReady)');
  assert.ok(src.includes('adaptPostgres'), 'the postgres client must be bridged to the positional client contract');
});

test('CF-2: table-missing and row-missing are distinguished log lines', () => {
  assert.ok(/table MISSING/i.test(src), 'ensureSchema failure must log TABLE-MISSING distinctly');
  assert.ok(/no row for project/i.test(src), 'empty lookup must log ROW-MISSING distinctly');
});

test('CF-1: legacy 1,700 cost advisory exists so the relaxation is never silent', () => {
  assert.ok(/1700/.test(src), 'legacy insert cost constant (1,700) must be named in the route');
  assert.ok(/ADVISORY/i.test(src), 'an advisory marker must exist for the cost divergence');
  // the advisory text carries both numbers and the multiplicative relaxation
  assert.ok(/units\/upload/.test(src), 'advisory must state the per-upload unit cost');
});

test('schedule-time projection is model-aware on BOTH read and write paths', () => {
  const calls = src.match(/await scheduleProjection\(/g) || [];
  assert.ok(calls.length >= 2, `GET and POST must both project through the model-aware helper (found ${calls.length})`);
  assert.equal(src.includes('projection: projection({'), false, 'the legacy sync-only projection call must be retired from GET');
  assert.equal(src.includes('const proj = projection('), false, 'the legacy sync-only projection call must be retired from POST');
});

test('blocking + response contract unchanged: validateSchedule first, blocked still 400s', () => {
  assert.ok(src.includes('validateSchedule('), 'schedule validation must stay');
  assert.ok(/proj\.blocked/.test(src), 'the blocked verdict must still gate the save');
  assert.ok(/status: 400/.test(src), 'blocked saves must still return 400');
});

// ---------------------------------------------------------------------------
// Fix round 1 (review verdict on 5ec0d32, two Importants):
//   I1 — the load tail (loadQuotaModel) and the projectWithQuotaModel call
//        were UNGUARDED: a quota store that is reachable-and-erroring
//        (transient failure after the guarded row-check, malformed row, a
//        throw inside the projection) propagated out of the handler -> 500 on
//        GET AND POST, contradicting the route's own fail-soft invariant.
//        Both awaits must sit in catch-to-legacy (log names the failure
//        class, legacy constants engage, the save never 500s).
//   I2 — proj.budget in the blocked message: VERIFIED defined on the legacy
//        path (studio/lib/schedule-projection.js projection() returns
//        budget = dailyLimitEff - margin = 10,000 - 100 = 9,900 — exactly the
//        pre-change hardcoded figure); pinned by the behavioral test below.
// ---------------------------------------------------------------------------

test('I1: the load tail is guarded — store error -> legacy constants, never a 500', () => {
  const guarded = /try \{[\s\S]{0,200}await loadQuotaModel\(QUOTA_PROJECT_ID, client\);[\s\S]{0,300}\} catch \(e\) \{[\s\S]{0,300}store ERROR loading model[\s\S]{0,300}return null;/;
  assert.ok(guarded.test(src), 'loadQuotaModel must be wrapped in catch-to-legacy naming the failure class');
});

test('I1: the model-aware projection call is guarded — projection error -> legacy verdict', () => {
  const guarded = /try \{[\s\S]{0,300}await projectWithQuotaModel\(\{[\s\S]{0,400}\} catch \(e\) \{[\s\S]{0,300}projection ERROR with live model[\s\S]{0,300}projection\(\{ docDays, shortDays \}\)/;
  assert.ok(guarded.test(src), 'projectWithQuotaModel must be wrapped in catch-to-legacy returning the legacy projection');
});

test('I1 residue behavior: a THROWING loader propagates from the lib — legacy verdict stays saveable', async () => {
  // The library layer propagates (this is the residue the route's guard must
  // convert; removing the route try/catch fails the structural pins above):
  await assert.rejects(
    projectWithQuotaModel({
      docDays: ['Mon'], shortDays: [], projectId: 'proj-x',
      dbClient: null,
      loadQuotaModel: async () => { throw new Error('store mid-request failure'); },
    }),
    /store mid-request failure/,
  );
  // The route's fallback composition on that rejection: the legacy projection
  // -> a well-formed verdict -> the save proceeds (no 500, no undefined math).
  const proj = projection({ docDays: ['Mon'], shortDays: [] });
  assert.equal(proj.blocked, false);
  assert.equal(typeof proj.budget, 'number');
  assert.equal(proj.tone, 'ok');
});

test('I2: blocked message budget is defined on the no-model path (legacy math = 9,900)', () => {
  const proj = projection({ docDays: ['Mon', 'Tue'], shortDays: ['Mon'] });
  assert.equal(proj.budget, 9900, 'legacy projection budget must equal the pre-change hardcoded 10000 - 100');
  // the route's exact blocked-message template renders a DEFINED pool figure
  const msg = `blocked: the busiest day would use ${proj.worstDayUnits} of the shared ${proj.budget} unit daily pool (${proj.worstDayUploads} uploads) — spread the days or lower the cadence`;
  assert.ok(msg.includes('the shared 9900 unit daily pool'), 'no "shared undefined" render possible');
  assert.ok(src.includes('${proj.budget} unit daily pool'), 'blocked message must interpolate proj.budget (model-aware pool figure)');
});
