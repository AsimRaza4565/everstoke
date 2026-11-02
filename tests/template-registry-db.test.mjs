import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRegistryDb, getRegistryDb, adaptPostgres } from '../studio/lib/template-registry-db.js';

// ---------------------------------------------------------------------------
// Stub client contract (fixture seam — no live Neon in tests).
//
// The module calls the client as `client(sqlText, params)` and awaits an
// array of row objects (postgres.js-compatible positional-param style:
// $1..$n placeholders, snake_case column names on returned rows).
//
// The stub understands exactly the SQL shapes the registry DB layer emits
// (nothing more — so a passing test cannot be trivially green):
//   - CREATE TABLE IF NOT EXISTS <t> (...)          -> recorded, no-op
//   - SELECT [DISTINCT] <cols> FROM <t> [WHERE ...] -> filters stored rows
//     WHERE conditions supported: `<col> = $n` and `<col> = true|false`
//   - INSERT INTO <t> (cols) VALUES ($1..$n)
//     [ON CONFLICT (keycols) DO UPDATE SET col = $n ...] -> upsert keyed on
//     the ON CONFLICT columns (composite keys joined with NUL); without
//     ON CONFLICT the row is appended (template_assignment_audit)
//   - UPDATE <t> SET <col> = true|false WHERE ...   -> in-place update
//
// State is exposed for assertions: `tables` (Map table -> Map key -> row)
// and `calls` (every {sql, params} executed).
// ---------------------------------------------------------------------------

function makeStubClient() {
  const tables = new Map(); // table name -> Map(key -> row)
  const auditRows = [];
  const calls = [];
  let auditSeq = 0;

  const getStore = (table) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table);
  };

  function run(sqlText, params) {
    const sql = sqlText.replace(/\s+/g, ' ').trim();

    if (/^CREATE TABLE/i.test(sql)) {
      calls.push({ sql, params });
      return [];
    }

    const insertMatch = sql.match(/^INSERT INTO (\w+)/i);
    if (insertMatch) {
      calls.push({ sql, params });
      const table = insertMatch[1];
      const cols = (sql.match(/\(([^)]+)\)\s*VALUES/i) || [])[1]
        .split(',').map(c => c.trim());
      const valuesTuple = (sql.match(/VALUES\s*\(([^)]+)\)/i) || [])[1]
        .split(',').map(v => v.trim());
      const row = {};
      cols.forEach((c, i) => {
        const v = valuesTuple[i] ?? '';
        row[c] = /^\$\d+$/.test(v) ? params[Number(v.slice(1)) - 1]
          : v.toLowerCase() === 'true' ? true
          : v.toLowerCase() === 'false' ? false
          : null;
      });

      if (table === 'template_assignment_audit') {
        row.id = ++auditSeq;
        row.at = new Date();
        auditRows.push(row);
        return [row];
      }

      const store = getStore(table);
      const conflict = sql.match(/ON CONFLICT \(([^)]+)\)/i);
      if (conflict) {
        const keyCols = conflict[1].split(',').map(x => x.trim());
        const key = keyCols.map(c => String(row[c])).join('\u0000');
        const prev = store.get(key);
        const merged = prev ? { ...prev, ...row } : row;
        store.set(key, merged);
        return [merged];
      }
      store.set(`row-${store.size}`, row);
      return [row];
    }

    const selectMatch = sql.match(/^SELECT .*?FROM (\w+)/i);
    if (selectMatch) {
      calls.push({ sql, params });
      const table = selectMatch[1];
      const src = table === 'template_assignment_audit'
        ? auditRows
        : [...(tables.get(table)?.values() || [])];
      const conds = [...sql.matchAll(/(\w+) = (\$\d+|true|false)/gi)]
        .map(([, col, val]) => {
          const v = /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1]
            : val.toLowerCase() === 'true';
          return [col, v];
        });
      return src.filter(r => conds.every(([c, v]) => r[c] === v));
    }

    const updateMatch = sql.match(/^UPDATE (\w+)/i);
    if (updateMatch) {
      calls.push({ sql, params });
      const table = updateMatch[1];
      const setClause = (sql.match(/SET (.*?) WHERE/i) || [])[1] || '';
      const setMatch = setClause.match(/(\w+) = (true|false)/i);
      const wherePart = sql.split(/WHERE/i)[1] || '';
      const conds = [...wherePart.matchAll(/(\w+) = (\$\d+|true|false)/gi)]
        .map(([, col, val]) => {
          const v = /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1]
            : val.toLowerCase() === 'true';
          return [col, v];
        });
      const store = getStore(table);
      for (const [key, row] of store) {
        if (conds.every(([c, v]) => row[c] === v)) {
          if (setMatch) row[setMatch[1]] = setMatch[2].toLowerCase() === 'true';
        }
      }
      return [];
    }

    throw new Error(`stub client: unsupported SQL shape: ${sql.slice(0, 120)}`);
  }

  const clientFn = (sqlText, params = []) => Promise.resolve(run(sqlText, params));
  clientFn.tables = tables;
  clientFn.calls = calls;
  return clientFn;
}

// ---- fixtures ----

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

const FAMILY_A = 'documentary-frames';
const FAMILY_B = 'kinetic-quotes';

function families() {
  return [
    { familyId: FAMILY_A, name: 'Documentary Master Frames', registry: makeValidMeta('1.2.3') },
    { familyId: FAMILY_B, name: 'Kinetic Quote Cards', registry: makeValidMeta('2.0.0') },
  ];
}

// ---- ensureSchema ----

test('ensureSchema issues CREATE TABLE IF NOT EXISTS for all three tables', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.ensureSchema();
  const creates = stub.calls.filter(c => /^CREATE TABLE/i.test(c.sql));
  assert.equal(creates.length, 3, 'must emit three CREATE TABLE statements');
  const joined = creates.map(c => c.sql).join('\n');
  for (const t of ['template_registry_index', 'channel_template_assignments', 'template_assignment_audit']) {
    assert.ok(joined.includes(t), `schema must include table ${t}`);
    assert.ok(joined.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `${t} must use IF NOT EXISTS`);
  }
});

// ---- syncRegistry ----

test('syncRegistry upserts new families and reports writes', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  const result = await db.syncRegistry(families());
  assert.equal(result.ok, true);
  assert.deepEqual(result.removedRefused, []);
  assert.deepEqual(result.skippedInvalid, []);
  assert.equal(result.writes, 2);
  assert.ok(result.synced.includes(FAMILY_A) && result.synced.includes(FAMILY_B));

  const index = stub.tables.get('template_registry_index');
  assert.equal(index.get(FAMILY_A).version, '1.2.3');
  assert.equal(index.get(FAMILY_A).major, 1);
  assert.equal(index.get(FAMILY_B).version, '2.0.0');
  assert.equal(index.get(FAMILY_B).major, 2);
});

test('syncRegistry is idempotent — identical input reports zero writes', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  const second = await db.syncRegistry(families());
  assert.equal(second.writes, 0, 'second identical sync must write nothing');
  assert.equal(second.ok, true);
  assert.deepEqual(second.synced, []);
});

test('syncRegistry upserts only the family whose content hash changed', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());

  const changed = [
    families()[0], // untouched
    { familyId: FAMILY_B, name: 'Kinetic Quote Cards', registry: makeValidMeta('2.0.1') }, // patch bump
  ];
  const result = await db.syncRegistry(changed);
  assert.equal(result.writes, 1, 'only the changed family is written');
  assert.deepEqual(result.synced, [FAMILY_B]);
  assert.equal(stub.tables.get('template_registry_index').get(FAMILY_B).version, '2.0.1');
  assert.equal(stub.tables.get('template_registry_index').get(FAMILY_A).version, '1.2.3', 'untouched family row must not change');
});

test('syncRegistry skips and reports invalid registry blocks', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  const result = await db.syncRegistry([
    families()[0],
    { familyId: 'broken-family', name: 'Broken', registry: { version: 'not-semver' } },
    { familyId: null, name: 'No Id', registry: makeValidMeta('1.0.0') },
  ]);
  assert.equal(result.ok, true, 'invalid blocks are skipped, not fatal');
  assert.equal(result.writes, 1);
  assert.equal(result.skippedInvalid.length, 2);
  assert.ok(result.skippedInvalid.some(s => s.familyId === 'broken-family'));
  assert.ok(!stub.tables.get('template_registry_index')?.has('broken-family'), 'invalid family must not reach the index');
});

test('syncRegistry refuses removal of indexed families with active assignments', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_B, 2, 'tester');

  const result = await db.syncRegistry([families()[0]]); // FAMILY_B dropped from input
  assert.equal(result.ok, false);
  assert.deepEqual(result.removedRefused, [FAMILY_B]);
  assert.equal(result.writes, 0, 'unchanged family A must not rewrite');

  // both rows remain in the index (Phase 1: no removal at all)
  const index = stub.tables.get('template_registry_index');
  assert.ok(index.has(FAMILY_A) && index.has(FAMILY_B));
});

test('syncRegistry leaves unassigned-but-absent families untouched and ok', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families()); // no assignments made

  const result = await db.syncRegistry([families()[0]]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.removedRefused, []);
  const index = stub.tables.get('template_registry_index');
  assert.ok(index.has(FAMILY_B), 'family absent from input with no assignments stays in the index');
});

// ---- assignTemplate ----

test('assignTemplate resolves version in pinned major, writes assignment + audit', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());

  const r = await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  assert.equal(r.ok, true);
  assert.equal(r.resolvedVersion, '1.2.3');
  assert.equal(r.majorUpdateAvailable, false, 'index holds one version per family (family_id PK), so no higher-major block exists for family A itself');
  assert.equal(r.fromMajor, null);

  const a = await db.getActiveAssignment('chan-1', FAMILY_A);
  assert.ok(a, 'active assignment must exist');
  assert.equal(a.pinned_major, 1);
  assert.equal(a.pinned_version, '1.2.3');
  assert.equal(a.assigned_by, 'tester');

  const auditRows = stub.calls.filter(c => /^INSERT INTO template_assignment_audit/i.test(c.sql))
    .map(c => ({ params: c.params, action: (c.sql.match(/'(\w+)'\s*\)$/) || [])[1] }));
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].params[3], null, 'from_major null on first assignment');
  assert.equal(auditRows[0].params[4], 1, 'to_major = 1');
  assert.equal(auditRows[0].action, 'assign');
});

test('assignTemplate fails closed when pinned major has no indexed version', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  const insertsBefore = stub.calls.filter(c => /^INSERT INTO/i.test(c.sql)).length;

  const r = await db.assignTemplate('chan-1', FAMILY_A, 9, 'tester');
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('no_version_in_major'));
  const insertsAfter = stub.calls.filter(c => /^INSERT INTO/i.test(c.sql)).length;
  assert.equal(insertsAfter - insertsBefore, 0, 'failed assignment must write nothing');
});

test('re-assignment writes an audit row from previous major to new major', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-1', FAMILY_B, 2, 'tester'); // second family, no prior row for B
  await db.unassignTemplate('chan-1', FAMILY_A, 'tester');
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester'); // re-assign after unassign

  const audits = stub.calls.filter(c => /^INSERT INTO template_assignment_audit/i.test(c.sql))
    .map(c => ({
      action: (c.sql.match(/'(\w+)'\s*\)$/) || [])[1],
      from: c.params[3],
      to: c.params[4],
    }));
  assert.deepEqual(audits, [
    { action: 'assign', from: null, to: 1 },
    { action: 'assign', from: null, to: 2 },
    { action: 'unassign', from: 1, to: null },
    { action: 'assign', from: 1, to: 1 }, // from previous pinned_major restored
  ]);
});

// ---- unassignTemplate ----

test('unassignTemplate deactivates and audits; unassign with nothing active fails closed', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');

  const r = await db.unassignTemplate('chan-1', FAMILY_A, 'tester');
  assert.equal(r.ok, true);
  assert.equal(await db.getActiveAssignment('chan-1', FAMILY_A), null, 'assignment must be inactive after unassign');
  assert.deepEqual(await db.listAssignments('chan-1'), [], 'active listing must exclude unassigned');

  const fail = await db.unassignTemplate('chan-1', FAMILY_A, 'tester');
  assert.equal(fail.ok, false, 'unassign with no active assignment must fail closed');
});

// ---- reads ----

test('listAssignments returns active rows for a channel', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-1', FAMILY_B, 2, 'tester');

  const rows = await db.listAssignments('chan-1');
  assert.equal(rows.length, 2);
  assert.ok(rows.some(r => r.family_id === FAMILY_A && r.pinned_major === 1));
  assert.ok(rows.some(r => r.family_id === FAMILY_B && r.pinned_major === 2));
});

test('listUsage returns active channels for a family', async () => {
  const stub = makeStubClient();
  const db = makeRegistryDb(stub);
  await db.syncRegistry(families());
  await db.assignTemplate('chan-1', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-2', FAMILY_A, 1, 'tester');
  await db.assignTemplate('chan-3', FAMILY_B, 2, 'tester');

  const usage = await db.listUsage(FAMILY_A);
  assert.equal(usage.length, 2);
  assert.ok(usage.every(r => r.channel_id === 'chan-1' || r.channel_id === 'chan-2'));

  const usageB = await db.listUsage(FAMILY_B);
  assert.deepEqual(usageB.map(r => r.channel_id), ['chan-3']);
});

test('getRegistryDb and default export exist for production callers (lazy, not invoked in tests)', () => {
  assert.equal(typeof getRegistryDb, 'function');
  assert.equal(typeof makeRegistryDb, 'function');
});

test('adaptPostgres bridges a postgres.js unsafe()-style client to the positional contract', async () => {
  // Stub-level check of the adapter shape only: makeRegistryDb must work
  // when handed adaptPostgres({ unsafe }) and must route text + params
  // through unsafe(). The real NOT_TAGGED_CALL failure mode is proven live
  // at Task 11 E2E against real Neon — NOT simulated here.
  const seen = [];
  const fakePostgres = {
    unsafe: (text, params) => {
      seen.push({ text, params });
      return Promise.resolve([{ family_id: FAMILY_A, pinned_major: 1, pinned_version: '1.2.3', assigned_by: 'tester' }]);
    },
  };
  const db = makeRegistryDb(adaptPostgres(fakePostgres));
  const rows = await db.listAssignments('chan-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].family_id, FAMILY_A);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].text.includes('FROM channel_template_assignments'));
  assert.deepEqual(seen[0].params, ['chan-1']);
});
