// Cost dashboard API (issue #104 Phase 2 BYOK vault v2, Task 7 — spec D6, AC-P2-5).
// GET /api/usage?days=7|30|90 (default 30) → read-only rollups from the
// usage_events ledger written by lib/ai-adapter.mjs (Task 5, schema D5):
//   - per channel / per provider / per capability: total tokens, ok/fail
//     call counts, measured-vs-estimated token split (GROUP BY aggregates —
//     no row scans into JS)
//   - recent events: last 50, newest first
// Owner + staff read (route-auth); GET-only surface, no writes anywhere.
// DB failure → { error } with 502 (house pattern, channels/registry route).
import { requireRole } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';

export const dynamic = 'force-dynamic';

// D5 schema, kept in lockstep with lib/ai-adapter.mjs makeUsageWriter().ensureUsageSchema
// (single logical DDL, two copies: the writer lives in repo-root lib/ which is
// OUTSIDE the studio Turbopack root — next.config turbopack.root='.' — so it
// cannot be imported here; cross-root imports are a build error in this setup).
const ENSURE_USAGE_EVENTS_SQL = `CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  job_id TEXT,
  channel_id TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  capability TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  usage_source TEXT NOT NULL DEFAULT 'estimated',
  ok BOOLEAN NOT NULL DEFAULT true,
  error_class TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

const WINDOWS = new Set([7, 30, 90]);
// GROUP BY dimensions — the interpolated column names are code-controlled
// (this fixed map), never user input; the ?days param rides as a bound value.
const DIMS = { channel: 'channel_id', provider: 'provider', capability: 'capability' };

async function rollup(col, days) {
  return db`
    SELECT ${db(col)} AS key,
      COUNT(*)::int AS calls,
      COUNT(*) FILTER (WHERE ok)::int AS ok_calls,
      COUNT(*) FILTER (WHERE NOT ok)::int AS fail_calls,
      COALESCE(SUM(tokens), 0)::int AS tokens,
      COUNT(*) FILTER (WHERE usage_source = 'measured')::int AS measured_calls,
      COUNT(*) FILTER (WHERE usage_source = 'estimated')::int AS estimated_calls,
      COALESCE(SUM(tokens) FILTER (WHERE usage_source = 'measured'), 0)::int AS measured_tokens,
      COALESCE(SUM(tokens) FILTER (WHERE usage_source = 'estimated'), 0)::int AS estimated_tokens
    FROM usage_events
    WHERE created_at >= now() - make_interval(days => ${days})
    GROUP BY ${db(col)}
    ORDER BY tokens DESC`;
}

export async function GET(req) {
  if (!(await requireRole(req, ['owner', 'staff']))) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }
  const raw = Number(new URL(req.url).searchParams.get('days') || '30');
  const days = WINDOWS.has(raw) ? raw : 30;

  if (!dbReady || !db) {
    return Response.json({ error: 'database not configured on this server' }, { status: 502 });
  }

  try {
    // Idempotent D5 ensure — a dashboard opened before the first routed AI
    // call must show the empty state, not a 502 about a missing table.
    await db.unsafe(ENSURE_USAGE_EVENTS_SQL);

    const [totals] = await db`
      SELECT COUNT(*)::int AS events,
        COALESCE(SUM(tokens), 0)::int AS tokens,
        COUNT(*) FILTER (WHERE ok)::int AS ok_calls,
        COUNT(*) FILTER (WHERE NOT ok)::int AS fail_calls,
        COALESCE(SUM(tokens) FILTER (WHERE usage_source = 'measured'), 0)::int AS measured_tokens,
        COALESCE(SUM(tokens) FILTER (WHERE usage_source = 'estimated'), 0)::int AS estimated_tokens,
        COUNT(*) FILTER (WHERE usage_source = 'measured')::int AS measured_calls,
        COUNT(*) FILTER (WHERE usage_source = 'estimated')::int AS estimated_calls
      FROM usage_events
      WHERE created_at >= now() - make_interval(days => ${days})`;

    const [byChannel, byProvider, byCapability, recent] = await Promise.all([
      rollup(DIMS.channel, days),
      rollup(DIMS.provider, days),
      rollup(DIMS.capability, days),
      db`
        SELECT id::text AS id, job_id, channel_id, provider, model, capability,
          tokens::int AS tokens, usage_source, ok, error_class, created_at
        FROM usage_events
        WHERE created_at >= now() - make_interval(days => ${days})
        ORDER BY created_at DESC, id DESC
        LIMIT 50`,
    ]);

    return Response.json({ window: days, totals, byChannel, byProvider, byCapability, recent });
  } catch (e) {
    return Response.json({ error: String(e.message || e).slice(0, 200) }, { status: 502 });
  }
}
