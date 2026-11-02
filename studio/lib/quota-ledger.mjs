// #99 QUOTA LEDGER — every channel token mints through ONE shared OAuth
// client, so all uploads draw on ONE Google Cloud project with the default
// 10,000 units/day (resets midnight PT; production consent-screen status does
// NOT raise it). Cost per upload: videos.insert 1,600 + thumbnails.set 50 +
// commentThreads.insert 50 = 1,700. This ledger fails CLOSED: when one more
// upload would breach the daily budget, slots skip before any render/LLM spend.
//
// Per-channel counters live in yt-mcp/state/<slug>.json as
//   uploadsToday: { date: '<YYYY-MM-DD PT>', count: N }
// The pool is per-PROJECT, so evaluate() sums the counters of ALL channels;
// concurrent runs read slightly stale sums — the documented approximation
// (reconcile path: verify-run claims vs counters).
//
// LOCATION NOTE (#104 fix round 1): the canonical implementation lives here,
// inside the Studio Next.js root, so studio/lib/schedule-projection.js can
// import it without reaching outside the Turbopack root (which fails
// `next build`). The repo-root lib/quota-ledger.mjs is a re-export shim —
// pipeline callers keep importing './lib/quota-ledger.mjs' unchanged.

// #104 QUOTA MODEL AS DATA — the current YouTube reality (verified 2026-10-28)
// is separate buckets per GCP project: videos.insert 100 calls/day,
// search.list 100 calls/day, everything else 10,000 units/day combined
// (reset midnight PT); an upload costs ~100 units, not the legacy 1,700.
// The DEFAULT model below is that reality as data, returned when a project
// has no youtube_quota_models row. The LEGACY constants (10,000 pool,
// 1,700/upload) remain the fallback inside evaluate() so existing callers
// and the seeded-default row reproduce today's verdicts unchanged.
export const DEFAULT_QUOTA_MODEL = Object.freeze({
  projectId: null,
  searchPerDay: 100,
  insertPerDay: 100,
  sharedUnitsPerDay: 10000,
  insertCostUnits: 100,
  seededDefault: true,
});

const PT_TZ = 'America/Los_Angeles';

// 'YYYY-MM-DD' calendar date in PT for a given instant (quota resets midnight PT).
// en-CA locale yields ISO-style YYYY-MM-DD directly.
export function ptDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Counter for one channel: rolls over when the PT date changes.
export function nextCounter(prev, now = new Date()) {
  const date = ptDate(now);
  if (prev && prev.date === date) return { date, count: (prev.count || 0) + 1 };
  return { date, count: 1 };
}

// Evaluate the shared daily budget against all channels' counters.
// opts: now, dailyLimit (10,000), perUpload (1,700), margin (100 reads),
// model (optional #104 quota-model object from loadQuotaModel() — used for
// dailyLimit/perUpload whenever the explicit opts are not given; explicit
// opts always win, so callers that pass them keep today's exact behavior).
export function evaluate(allStates, { now = new Date(), dailyLimit, perUpload, margin = 100, model = null } = {}) {
  const limit = Number.isFinite(dailyLimit)
    ? dailyLimit
    : (model && Number.isFinite(model.sharedUnitsPerDay) ? model.sharedUnitsPerDay : 10000);
  const cost = Number.isFinite(perUpload)
    ? perUpload
    : (model && Number.isFinite(model.insertCostUnits) ? model.insertCostUnits : 1700);
  const today = ptDate(now);
  let uploadsToday = 0;
  for (const st of Object.values(allStates || {})) {
    const c = st && st.uploadsToday;
    if (c && c.date === today) uploadsToday += c.count || 0;
  }
  const usedUnits = uploadsToday * cost;
  const remainingUnits = limit - margin - usedUnits;
  return {
    date: today,
    uploadsToday,
    usedUnits,
    remainingUnits,
    allowed: remainingUnits >= cost,
    dailyLimit: limit,
    perUpload: cost,
  };
}

// ---- #104: youtube_quota_models (per-GCP-project quota buckets as data) ----
// Client contract mirrors studio/lib/template-registry-db.js:
// `client(sqlText, params)` -> Promise<rows> (postgres.js positional style).

// Create the quota-model table (idempotent — safe to call on every boot).
export async function ensureQuotaModelSchema(dbClient) {
  await dbClient(`CREATE TABLE IF NOT EXISTS youtube_quota_models (
    project_id text PRIMARY KEY,
    search_per_day integer NOT NULL,
    insert_per_day integer NOT NULL,
    shared_units_per_day integer NOT NULL,
    insert_cost_units integer NOT NULL,
    seeded_default boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`, []);
}

// Load the quota model for a GCP project: the stored row when present, the
// DEFAULT model (current reality) otherwise. Fails safe — a broken or absent
// client never throws, it returns the default so gates degrade to documented
// behavior instead of crashing the pipeline.
export async function loadQuotaModel(projectId, dbClient) {
  const fallback = { ...DEFAULT_QUOTA_MODEL, projectId: projectId || null };
  if (typeof dbClient !== 'function') return fallback;
  try {
    const rows = await dbClient(
      `SELECT project_id, search_per_day, insert_per_day, shared_units_per_day,
              insert_cost_units, seeded_default
       FROM youtube_quota_models
       WHERE project_id = $1`,
      [projectId],
    );
    const r = rows && rows[0];
    if (!r) return fallback;
    return {
      projectId: r.project_id,
      searchPerDay: Number(r.search_per_day),
      insertPerDay: Number(r.insert_per_day),
      sharedUnitsPerDay: Number(r.shared_units_per_day),
      insertCostUnits: Number(r.insert_cost_units),
      seededDefault: r.seeded_default === true,
    };
  } catch {
    return fallback;
  }
}
