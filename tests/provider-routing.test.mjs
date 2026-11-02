import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProviderRouting } from '../studio/lib/provider-routing.js';

// ---------------------------------------------------------------------------
// Stub client contract (fixture seam — no live Neon in tests).
//
// The module calls the client as `client(sqlText, params)` and awaits an
// array of row objects (postgres.js-compatible positional-param style:
// $1..$n placeholders, snake_case column names on returned rows).
//
// The stub understands exactly the SQL shapes the routing layer emits
// (nothing more — so a passing test cannot be trivially green):
//   - CREATE TABLE IF NOT EXISTS <t> (...)            -> recorded, no-op
//   - SELECT <cols> FROM provider_routes [WHERE ...]  -> filters stored rows
//     WHERE conditions supported: `<col> = $n`, `<col> = true|false`,
//     `<col> IS NULL`; ORDER BY priority ASC supported
//   - INSERT INTO provider_routes / provider_route_audit (...) VALUES (...)
//     -> appended (id + created_at/at synthesized)
//   - UPDATE provider_routes SET <assignments> WHERE ... -> in-place update
//
// State is exposed for assertions: `tables` (Map table -> Map key -> row)
// and `calls` (every {sql, params} executed). Unknown SQL shapes throw.
// ---------------------------------------------------------------------------

function makeStubClient() {
  const tables = new Map(); // table name -> Map(key -> row)
  const auditRows = [];
  const calls = [];
  let routeSeq = 0;
  let auditSeq = 0;

  const getStore = (table) => {
    if (!tables.has(table)) tables.set(table, new Map());
    return tables.get(table);
  };

  function rowsOf(table) {
    return table === 'provider_route_audit'
      ? auditRows
      : [...(tables.get(table)?.values() || [])];
  }

  function parseConds(wherePart, params) {
    // Only the exact condition shapes the module emits:
    //   col = $n | col = true | col = false | col IS NULL
    const conds = [];
    const re = /(\w+) (?:= (\$\d+|true|false)|IS NULL)/gi;
    let m;
    while ((m = re.exec(wherePart)) !== null) {
      const [, col, val] = m;
      if (val === undefined) {
        conds.push([col, { isNull: true }]);
      } else if (/^\$\d+$/.test(val)) {
        conds.push([col, params[Number(val.slice(1)) - 1]]);
      } else {
        conds.push([col, val.toLowerCase() === 'true']);
      }
    }
    return conds;
  }

  function matches(row, conds) {
    return conds.every(([c, v]) =>
      v && v.isNull === true ? row[c] === null || row[c] === undefined : row[c] === v);
  }

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
      if (table === 'provider_route_audit') {
        row.id = ++auditSeq;
        row.at = new Date();
        auditRows.push(row);
        return [row];
      }
      if (table === 'provider_routes') {
        row.id = ++routeSeq;
        row.created_at = new Date();
        const store = getStore(table);
        store.set(`row-${row.id}`, row);
        return [row];
      }
      throw new Error(`stub client: unknown INSERT table: ${table}`);
    }

    const selectMatch = sql.match(/^SELECT .*?FROM (\w+)/i);
    if (selectMatch) {
      calls.push({ sql, params });
      const table = selectMatch[1];
      const whereSplit = sql.split(/WHERE/i);
      const orderMatch = sql.match(/ORDER BY (\w+)( ASC| DESC)?$/i);
      let src = rowsOf(table);
      if (whereSplit.length > 1) {
        const conds = parseConds(whereSplit.slice(1).join(' WHERE'), params);
        src = src.filter(r => matches(r, conds));
      }
      if (orderMatch) {
        const col = orderMatch[1];
        const desc = (orderMatch[2] || '').trim().toUpperCase() === 'DESC';
        src = [...src].sort((a, b) => (desc ? b[col] - a[col] : a[col] - b[col]));
      }
      return src;
    }

    const updateMatch = sql.match(/^UPDATE (\w+) SET (.*?) WHERE (.+)$/i);
    if (updateMatch) {
      calls.push({ sql, params });
      const [, table, setClause, wherePart] = updateMatch;
      const store = getStore(table);
      const conds = parseConds(wherePart, params);
      // SET assignments supported: col = $n and col = true|false
      const sets = [...setClause.matchAll(/(\w+) = (\$\d+|true|false)/gi)]
        .map(([ , col, val]) => [col,
          /^\$\d+$/.test(val) ? params[Number(val.slice(1)) - 1]
            : val.toLowerCase() === 'true']);
      let updated = 0;
      for (const [, row] of store) {
        if (matches(row, conds)) {
          for (const [col, v] of sets) row[col] = v;
          updated++;
        }
      }
      return [{ updated }];
    }

    throw new Error(`stub client: unsupported SQL shape: ${sql.slice(0, 120)}`);
  }

  const clientFn = (sqlText, params = []) => Promise.resolve(run(sqlText, params));
  clientFn.tables = tables;
  clientFn.calls = calls;
  return clientFn;
}

// ---- ensureSchema ----

test('ensureSchema issues CREATE TABLE IF NOT EXISTS for both tables', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.ensureSchema();
  const creates = stub.calls.filter(c => /^CREATE TABLE/i.test(c.sql));
  assert.equal(creates.length, 2, 'must emit two CREATE TABLE statements');
  const joined = creates.map(c => c.sql).join('\n');
  for (const t of ['provider_routes', 'provider_route_audit']) {
    assert.ok(joined.includes(`CREATE TABLE IF NOT EXISTS ${t}`), `${t} must use IF NOT EXISTS`);
  }
  assert.ok(/channel_id TEXT/i.test(joined), 'provider_routes must have nullable channel_id');
});

// ---- setRoute: replace + audit ----

test('setRoute inserts a new channel route and writes an audit row', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  const r = await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', priority: 1, actor: 'tester' });
  assert.equal(r.ok, true);

  const routes = [...stub.tables.get('provider_routes').values()];
  assert.equal(routes.length, 1);
  assert.equal(routes[0].channel_id, 'chan-1');
  assert.equal(routes[0].capability, 'script-gen');
  assert.equal(routes[0].provider_id, 'gemini');
  assert.equal(routes[0].priority, 1);
  assert.equal(routes[0].active, true);

  const audits = stub.calls.filter(c => /^INSERT INTO provider_route_audit/i.test(c.sql));
  assert.equal(audits.length, 1, 'setRoute must write exactly one audit row');
  assert.equal(audits[0].params[0], 'tester');
  assert.deepEqual(audits[0].params.slice(1, 5), ['chan-1', 'script-gen', 'gemini', 1]);
  assert.equal(audits[0].params[5], 'set', 'audit action must be set');
});

test('setRoute replaces the existing route (no duplicate row) and audits again', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', priority: 1, actor: 'tester' });
  const r = await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', priority: 3, actor: 'tester-2' });
  assert.equal(r.ok, true);

  const routes = [...stub.tables.get('provider_routes').values()];
  assert.equal(routes.length, 1, 'upsert must not duplicate the route row');
  assert.equal(routes[0].priority, 3, 'priority must be replaced');
  assert.equal(routes[0].active, true, 're-set must (re)activate');

  const audits = stub.calls.filter(c => /^INSERT INTO provider_route_audit/i.test(c.sql));
  assert.equal(audits.length, 2, 'both sets must be audited');
  assert.equal(audits[1].params[0], 'tester-2');
});

test('setRoute treats null channelId as a workspace-default route', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  const r = await db.setRoute({ channelId: null, capability: 'tts', providerId: 'openai', priority: 1, actor: 'tester' });
  assert.equal(r.ok, true);
  const routes = [...stub.tables.get('provider_routes').values()];
  assert.equal(routes.length, 1);
  assert.equal(routes[0].channel_id, null, 'null channelId must store NULL (workspace default)');

  // Re-set with null must replace the same default row, not add another.
  await db.setRoute({ channelId: null, capability: 'tts', providerId: 'openai', priority: 2, actor: 'tester' });
  const after = [...stub.tables.get('provider_routes').values()];
  assert.equal(after.length, 1);
  assert.equal(after[0].priority, 2);
});

test('setRoute fails closed on missing capability / providerId / priority', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  assert.equal((await db.setRoute({ channelId: 'c', capability: '', providerId: 'gemini', priority: 1, actor: 't' })).ok, false);
  assert.equal((await db.setRoute({ channelId: 'c', capability: 'tts', providerId: '', priority: 1, actor: 't' })).ok, false);
  assert.equal((await db.setRoute({ channelId: 'c', capability: 'tts', providerId: 'openai', priority: 'high', actor: 't' })).ok, false);
  assert.equal((await db.setRoute({ channelId: 'c', capability: 'tts', providerId: 'openai', priority: 1, actor: '' })).ok, false);
  assert.equal((stub.calls || []).length, 0, 'invalid input must not reach the client');
});

// ---- deactivateRoute ----

test('deactivateRoute sets active=false, excludes from reads, and audits', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', priority: 1, actor: 'tester' });

  const r = await db.deactivateRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', actor: 'tester' });
  assert.equal(r.ok, true);

  const routes = [...stub.tables.get('provider_routes').values()];
  assert.equal(routes[0].active, false, 'route must be inactive after deactivate');
  assert.deepEqual(await db.resolveCapability('script-gen', 'chan-1'), [], 'inactive routes must be excluded from resolution');

  const audits = stub.calls.filter(c => /^INSERT INTO provider_route_audit/i.test(c.sql));
  assert.equal(audits.length, 2, 'set + deactivate both audited');
  assert.equal(audits[1].params[5], 'deactivate', 'second audit action must be deactivate');
});

test('deactivateRoute fails closed when nothing is active (no audit row)', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  const r = await db.deactivateRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'groq', actor: 'tester' });
  assert.equal(r.ok, false);
  const audits = stub.calls.filter(c => /^INSERT INTO provider_route_audit/i.test(c.sql));
  assert.equal(audits.length, 0, 'failed deactivate must write no audit');
});

test('re-set after deactivate reactivates the route', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', priority: 1, actor: 'tester' });
  await db.deactivateRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', actor: 'tester' });
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'gemini', priority: 5, actor: 'tester' });

  assert.equal((await db.resolveCapability('script-gen', 'chan-1')).length, 1, 're-set must reactivate');
  const routes = [...stub.tables.get('provider_routes').values()];
  assert.equal(routes.length, 1, 'reactivation must reuse the same row');
  assert.equal(routes[0].active, true);
  assert.equal(routes[0].priority, 5);
});

// ---- listRoutes ----

test('listRoutes returns active routes ordered by priority', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'groq', priority: 2, actor: 't' });
  await db.setRoute({ channelId: null, capability: 'script-gen', providerId: 'gemini', priority: 1, actor: 't' });
  await db.setRoute({ channelId: null, capability: 'tts', providerId: 'elevenlabs', priority: 9, actor: 't' });
  await db.setRoute({ channelId: 'chan-2', capability: 'script-gen', providerId: 'openrouter', priority: 3, actor: 't' });
  await db.deactivateRoute({ channelId: 'chan-2', capability: 'script-gen', providerId: 'openrouter', actor: 't' });

  const all = await db.listRoutes();
  assert.equal(all.length, 3, 'inactive routes excluded');
  assert.deepEqual(all.map(r => r.priority), [1, 2, 9], 'ordered by priority ascending');

  const tts = await db.listRoutes('tts');
  assert.equal(tts.length, 1);
  assert.equal(tts[0].provider_id, 'elevenlabs');
});

// ---- resolveCapability ----

test('resolveCapability: channel override beats a lower-priority default route', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  // Default route has the BEST priority — the channel route must still win.
  await db.setRoute({ channelId: null, capability: 'script-gen', providerId: 'gemini', priority: 1, actor: 't' });
  await db.setRoute({ channelId: null, capability: 'script-gen', providerId: 'groq', priority: 2, actor: 't' });
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'cerebras', priority: 99, actor: 't' });

  const resolved = await db.resolveCapability('script-gen', 'chan-1');
  assert.deepEqual(resolved.map(r => r.providerId), ['cerebras', 'gemini', 'groq'], 'channel routes first (by priority), then defaults (by priority)');
  assert.deepEqual(resolved.map(r => r.source), ['channel', 'default', 'default']);
});

test('resolveCapability: dedupes by providerId keeping the channel occurrence', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: null, capability: 'tts', providerId: 'openai', priority: 1, actor: 't' });
  await db.setRoute({ channelId: 'chan-1', capability: 'tts', providerId: 'openai', priority: 5, actor: 't' });
  await db.setRoute({ channelId: 'chan-1', capability: 'tts', providerId: 'elevenlabs', priority: 6, actor: 't' });

  const resolved = await db.resolveCapability('tts', 'chan-1');
  assert.deepEqual(resolved.map(r => r.providerId), ['openai', 'elevenlabs'], 'openai appears once');
  assert.deepEqual(resolved.map(r => r.source), ['channel', 'channel']);
});

test('resolveCapability: channel layer alone ordered by priority', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'openrouter', priority: 3, actor: 't' });
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'groq', priority: 1, actor: 't' });
  await db.setRoute({ channelId: 'chan-1', capability: 'script-gen', providerId: 'cloudflare', priority: 2, actor: 't' });

  const resolved = await db.resolveCapability('script-gen', 'chan-1');
  assert.deepEqual(resolved.map(r => r.providerId), ['groq', 'cloudflare', 'openrouter']);
  assert.ok(resolved.every(r => r.source === 'channel'));
});

test('resolveCapability: no channel configured -> defaults only; nothing -> empty array', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: null, capability: 'captions', providerId: 'whisper-local', priority: 1, actor: 't' });

  const resolved = await db.resolveCapability('captions', 'chan-9');
  assert.deepEqual(resolved.map(r => r.providerId), ['whisper-local']);
  assert.deepEqual(resolved.map(r => r.source), ['default']);

  assert.deepEqual(await db.resolveCapability('image-gen'), [], 'nothing configured -> empty array, never throws');
  assert.deepEqual(await db.resolveCapability('captions'), [{ providerId: 'whisper-local', priority: 1, source: 'default' }], 'channelId omitted -> defaults only');
});

test('resolveCapability with no channelId configured routes only from defaults even when other channels have overrides', async () => {
  const stub = makeStubClient();
  const db = makeProviderRouting(stub);
  await db.setRoute({ channelId: 'chan-1', capability: 'search', providerId: 'serper', priority: 1, actor: 't' });
  await db.setRoute({ channelId: null, capability: 'search', providerId: 'tavily', priority: 2, actor: 't' });

  const resolved = await db.resolveCapability('search', 'chan-2');
  assert.deepEqual(resolved.map(r => r.providerId), ['tavily'], 'another channel override must not leak');
  assert.deepEqual(resolved.map(r => r.source), ['default']);
});

// ---- factory contract ----

test('makeProviderRouting rejects a non-function client', () => {
  assert.throws(() => makeProviderRouting(null), TypeError);
  assert.throws(() => makeProviderRouting({}), TypeError);
});
