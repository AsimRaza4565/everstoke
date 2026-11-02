import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ptDate, evaluate, nextCounter, DEFAULT_QUOTA_MODEL, loadQuotaModel, ensureQuotaModelSchema } from '../studio/lib/quota-ledger.mjs';
import { projection, projectWithQuotaModel } from '../studio/lib/schedule-projection.js';
// Fix round 1 (#104): repo-root lib/quota-ledger.mjs is a re-export shim —
// the pipeline callers' import path must keep resolving to the same core.
import * as rootShim from '../lib/quota-ledger.mjs';
import * as studioCore from '../studio/lib/quota-ledger.mjs';

// ---------------------------------------------------------------------------
// Stub client contract (fixture seam — no live Neon in tests), same style as
// tests/template-registry-db.test.mjs: `client(sqlText, params)` ->
// Promise<rowObject[]>, postgres.js-compatible positional params ($1..$n),
// snake_case columns. Understands exactly the SQL shapes the quota-model
// layer emits: CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT (project_id)
// DO UPDATE, SELECT ... WHERE project_id = $1.
// ---------------------------------------------------------------------------

function makeStubClient() {
  const tables = new Map(); // table -> Map(project_id -> row)
  const calls = [];

  const store = (t) => {
    if (!tables.has(t)) tables.set(t, new Map());
    return tables.get(t);
  };

  function run(sqlText, params = []) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();

    if (/^CREATE TABLE/i.test(sql)) {
      calls.push({ sql, params });
      return [];
    }

    const insertMatch = sql.match(/^INSERT INTO (\w+)/i);
    if (insertMatch) {
      calls.push({ sql, params });
      const table = insertMatch[1];
      const cols = (sql.match(/\(([^)]+)\)\s*VALUES/i) || [])[1].split(',').map(c => c.trim());
      const values = (sql.match(/VALUES\s*\(([^)]+)\)/i) || [])[1].split(',').map(v => v.trim());
      const row = {};
      cols.forEach((c, i) => {
        const v = values[i] ?? '';
        row[c] = /^\$\d+$/.test(v) ? params[Number(v.slice(1)) - 1]
          : v.toLowerCase() === 'true' ? true
          : v.toLowerCase() === 'false' ? false
          : null;
      });
      const s = store(table);
      const prev = s.get(row.project_id);
      const merged = prev ? { ...prev, ...row } : row;
      s.set(row.project_id, merged);
      return [merged];
    }

    const selectMatch = sql.match(/^SELECT .*?FROM (\w+)/i);
    if (selectMatch) {
      calls.push({ sql, params });
      const rows = [...(store(selectMatch[1])?.values() || [])];
      const conds = [...sql.matchAll(/(\w+) = (\$\d+|true|false)/gi)].map(([_, col, val]) => {
        const v = /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1] : val.toLowerCase() === 'true';
        return [col, v];
      });
      return rows.filter(r => conds.every(([c, v]) => r[c] === v));
    }

    throw new Error(`stub client: unsupported SQL shape: ${sql.slice(0, 120)}`);
  }

  const clientFn = (sqlText, params) => Promise.resolve(run(sqlText, params));
  clientFn.tables = tables;
  clientFn.calls = calls;
  return clientFn;
}

// A client that throws on every call — the loader must fail safe to default.
function makeBrokenClient() {
  return async () => { throw new Error('connection refused'); };
}

async function seedLegacyRow(stub, projectId = 'proj-yt-shared') {
  // The seeded default row: today's hardcoded ledger constants as data
  // (10,000 shared units/day, 1,700 units per upload, generous insert bucket).
  await stub(
    `INSERT INTO youtube_quota_models (project_id, search_per_day, insert_per_day, shared_units_per_day, insert_cost_units, seeded_default, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, now())
     ON CONFLICT (project_id) DO UPDATE SET search_per_day = $2, insert_per_day = $3, shared_units_per_day = $4, insert_cost_units = $5, seeded_default = true, updated_at = now()`,
    [projectId, 100, 10000, 10000, 1700],
  );
}

const NOW = new Date('2026-10-20T18:00:00Z');
const states = (n) => ({ a: { uploadsToday: { date: '2026-10-20', count: n } } });

// ---- table + loader ----

test('ensureQuotaModelSchema creates youtube_quota_models with IF NOT EXISTS', async () => {
  const stub = makeStubClient();
  await ensureQuotaModelSchema(stub);
  const creates = stub.calls.filter(c => /^CREATE TABLE/i.test(c.sql));
  assert.equal(creates.length, 1);
  assert.ok(creates[0].sql.includes('CREATE TABLE IF NOT EXISTS youtube_quota_models'));
  for (const col of ['project_id', 'search_per_day', 'insert_per_day', 'shared_units_per_day', 'insert_cost_units', 'seeded_default', 'updated_at']) {
    assert.ok(creates[0].sql.includes(col), `schema must include ${col}`);
  }
});

test('missing project (and no client) -> loader returns the current-reality DEFAULT model', async () => {
  const noClient = await loadQuotaModel('proj-x', null);
  assert.deepEqual(noClient, {
    projectId: 'proj-x', searchPerDay: 100, insertPerDay: 100,
    sharedUnitsPerDay: 10000, insertCostUnits: 100, seededDefault: true,
  });
  const stub = makeStubClient();
  await ensureQuotaModelSchema(stub);
  const noRow = await loadQuotaModel('proj-x', stub);
  assert.deepEqual(noRow, { ...DEFAULT_QUOTA_MODEL, projectId: 'proj-x' });
  assert.equal(noRow.insertCostUnits, 100, 'default = current reality: uploads cost ~100 units');
  assert.equal(noRow.insertPerDay, 100, 'default insert bucket = 100 calls/day');
});

test('loadQuotaModel returns the stored row mapped to the model shape', async () => {
  const stub = makeStubClient();
  await ensureQuotaModelSchema(stub);
  await seedLegacyRow(stub);
  const m = await loadQuotaModel('proj-yt-shared', stub);
  assert.equal(m.projectId, 'proj-yt-shared');
  assert.equal(m.searchPerDay, 100);
  assert.equal(m.insertPerDay, 10000);
  assert.equal(m.sharedUnitsPerDay, 10000);
  assert.equal(m.insertCostUnits, 1700);
  assert.equal(m.seededDefault, true);
});

test('loadQuotaModel fails safe: broken DB client -> default model, never throws', async () => {
  const m = await loadQuotaModel('proj-x', makeBrokenClient());
  assert.deepEqual(m, { ...DEFAULT_QUOTA_MODEL, projectId: 'proj-x' });
});

// ---- GOLDEN: seeded legacy row reproduces the old hardcoded math exactly ----

test('GOLDEN: seeded-default row reproduces every legacy evaluate() verdict exactly', () => {
  const legacyModel = {
    projectId: 'proj-yt-shared', searchPerDay: 100, insertPerDay: 10000,
    sharedUnitsPerDay: 10000, insertCostUnits: 1700, seededDefault: true,
  };
  for (let n = 0; n <= 7; n++) {
    const legacy = evaluate(states(n), { now: NOW });
    const dataDriven = evaluate(states(n), { now: NOW, model: legacyModel });
    assert.deepEqual(
      {
        uploadsToday: dataDriven.uploadsToday, usedUnits: dataDriven.usedUnits,
        remainingUnits: dataDriven.remainingUnits, allowed: dataDriven.allowed,
        dailyLimit: dataDriven.dailyLimit, perUpload: dataDriven.perUpload,
      },
      {
        uploadsToday: legacy.uploadsToday, usedUnits: legacy.usedUnits,
        remainingUnits: legacy.remainingUnits, allowed: legacy.allowed,
        dailyLimit: legacy.dailyLimit, perUpload: legacy.perUpload,
      },
      `count ${n}: data-driven verdict must equal the hardcoded ledger output`,
    );
  }
  // Edge spot-checks mirror tests/quota-ledger.test.mjs:
  assert.equal(evaluate(states(5), { now: NOW, model: legacyModel }).allowed, false, '5 x 1,700 = 8,500; +1,700 > 9,900 -> blocked');
  assert.equal(evaluate(states(4), { now: NOW, model: legacyModel }).allowed, true, '4 x 1,700 = 6,800; +1,700 <= 9,900 -> allowed');
});

test('evaluate without a model keeps the legacy hardcoded behavior (existing callers unchanged)', () => {
  const r = evaluate(states(5), { now: NOW });
  assert.equal(r.perUpload, 1700);
  assert.equal(r.dailyLimit, 10000);
  assert.equal(r.allowed, false);
  assert.equal(evaluate(states(3), { now: NOW }).allowed, true);
});

test('current-reality default changes the ledger math: ~100 units/upload', () => {
  const r = evaluate(states(95), { now: NOW, model: { ...DEFAULT_QUOTA_MODEL, projectId: 'proj-x' } });
  assert.equal(r.perUpload, 100);
  assert.equal(r.usedUnits, 9500);
  assert.equal(r.allowed, true, '95 uploads at ~100 units each fit the 10,000 shared pool');
});

// ---- projection consumes the model ----

test('projection without a model keeps today\'s outputs byte-for-byte (warnings added, empty)', () => {
  const legacyShape = projection({ docDays: ['Tue', 'Fri'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] });
  assert.equal(legacyShape.worstDayUnits, 3400);
  assert.equal(legacyShape.tone, 'ok');
  assert.equal(legacyShape.blocked, false);
  assert.deepEqual(legacyShape.warnings, [], 'no model -> no advisory warnings');
});

test('custom row (insert_per_day 50, cost 100) changes the projection math', () => {
  const model = {
    projectId: 'proj-x', searchPerDay: 100, insertPerDay: 50,
    sharedUnitsPerDay: 10000, insertCostUnits: 100, seededDefault: false,
  };
  const p = projection({ docDays: ['Tue', 'Fri'], shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], model });
  assert.equal(p.worstDayUploads, 2);
  assert.equal(p.worstDayUnits, 200, '2 uploads x 100 units = 200, not the legacy 3,400');
  assert.equal(p.pct, 2, '200 of 9,900 budget rounds to 2%');
  assert.equal(p.blocked, false);
  assert.deepEqual(p.warnings, [], '2 uploads/day is inside the 50/day insert bucket — no advisory');
});

test('ADVISORY: warning fires when the projected day exceeds the model insert bucket — without blocking', () => {
  const model = {
    projectId: 'proj-x', searchPerDay: 100, insertPerDay: 2,
    sharedUnitsPerDay: 10000, insertCostUnits: 100, seededDefault: false,
  };
  // 2 docs + 2 shorts stacked on Mon = 4 uploads on the worst day > 2/day bucket.
  const over = projection({ docDays: ['Mon', 'Mon', 'Mon', 'Mon'], shortDays: [], model });
  assert.equal(over.worstDayUploads, 4);
  assert.equal(over.warnings.length, 1, 'advisory warning must fire above the bucket');
  assert.ok(/insert/i.test(over.warnings[0]) && /2/.test(over.warnings[0]), `warning names the insert bucket: ${over.warnings[0]}`);
  assert.equal(over.blocked, false, 'advisory must NOT block');
  assert.equal(over.tone, 'ok', 'units are fine (400 of 9,900) — advisory only');

  const at = projection({ docDays: ['Mon', 'Mon'], shortDays: [], model });
  assert.deepEqual(at.warnings, [], 'exactly at the bucket (2 = 2) is not a breach');
});

test('explicit dailyLimit/perUpload still win over the model (existing callers unchanged)', () => {
  const model = { ...DEFAULT_QUOTA_MODEL, projectId: 'proj-x' };
  const p = projection({ docDays: ['Mon', 'Tue', 'Wed'], shortDays: ['Mon', 'Tue', 'Wed'], model, dailyLimit: 5000, perUpload: 1700 });
  assert.equal(p.tone, 'over', 'explicit 5,000 limit overrides the model pool');
  assert.equal(p.blocked, true);
  const e = evaluate(states(1), { now: NOW, model, dailyLimit: 100, perUpload: 50, margin: 30 });
  assert.equal(e.allowed, false, 'explicit ledger opts override the model (100 - 30 - 50 = 20 < 50 -> blocked)');
});

test('projectWithQuotaModel loads the model via the injected loader and warns advisory', async () => {
  const stub = makeStubClient();
  await ensureQuotaModelSchema(stub);
  await seedLegacyRow(stub);
  const r = await projectWithQuotaModel({
    docDays: ['Tue', 'Fri'],
    shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    projectId: 'proj-yt-shared',
    dbClient: stub,
  });
  assert.equal(r.model.projectId, 'proj-yt-shared');
  assert.equal(r.worstDayUnits, 3400, 'legacy seeded row -> legacy projection math');
  assert.deepEqual(r.warnings, []);
});

test('projectWithQuotaModel falls back to the default model when the project has no row', async () => {
  const stub = makeStubClient();
  await ensureQuotaModelSchema(stub);
  const r = await projectWithQuotaModel({
    docDays: ['Tue', 'Fri'],
    shortDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    projectId: 'proj-unknown',
    dbClient: stub,
  });
  assert.equal(r.model.insertCostUnits, 100);
  assert.equal(r.worstDayUnits, 200, 'current-reality default: 2 uploads x ~100 units');
  assert.deepEqual(r.warnings, []);
});

test('projectWithQuotaModel accepts a fully injected loader (no dbClient needed)', async () => {
  const custom = {
    projectId: 'proj-custom', searchPerDay: 100, insertPerDay: 1,
    sharedUnitsPerDay: 10000, insertCostUnits: 100, seededDefault: false,
  };
  const r = await projectWithQuotaModel({
    docDays: ['Mon', 'Mon'],
    shortDays: [],
    projectId: 'proj-custom',
    loadQuotaModel: async () => custom,
  });
  assert.equal(r.model.insertPerDay, 1);
  assert.equal(r.warnings.length, 1, '2 uploads exceed the 1/day bucket -> advisory');
  assert.equal(r.blocked, false);
});

// ---- ptDate/nextCounter untouched (compat pin) ----

test('compat pin: ptDate and nextCounter signatures unchanged', () => {
  assert.equal(ptDate(new Date('2026-10-20T07:00:00Z')), '2026-10-20');
  assert.deepEqual(nextCounter({ date: '2026-10-19', count: 6 }, NOW), { date: '2026-10-20', count: 1 });
});

// ---- fix round 1: root shim resolves to the same core (pipeline contract) ----

test('repo-root lib/quota-ledger.mjs shim re-exports every named export from the studio core', async () => {
  for (const name of ['ptDate', 'nextCounter', 'evaluate', 'DEFAULT_QUOTA_MODEL', 'loadQuotaModel', 'ensureQuotaModelSchema']) {
    assert.equal(typeof rootShim[name], typeof studioCore[name], `shim must re-export ${name}`);
    assert.ok(rootShim[name] === studioCore[name] || typeof rootShim[name] === 'function', `${name} must resolve`);
  }
  assert.equal(rootShim.evaluate, studioCore.evaluate, 'shim evaluate must be the SAME function as the core');
  assert.equal(rootShim.DEFAULT_QUOTA_MODEL, studioCore.DEFAULT_QUOTA_MODEL);
  // Behavior through the shim matches the core (pipeline callers unchanged):
  const throughShim = rootShim.evaluate(states(5), { now: NOW });
  assert.equal(throughShim.perUpload, 1700);
  assert.equal(throughShim.allowed, false);
  const m = await rootShim.loadQuotaModel('proj-x', null);
  assert.equal(m.insertCostUnits, 100);
});
