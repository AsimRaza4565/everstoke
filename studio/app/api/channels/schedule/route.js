// #100 — per-channel production scheduling (cadence): docDays, shortDays,
// shortsSource. Stored in yt-mcp/cadence.json via the repo — the engine merges
// this overlay LAST in lib/brand-resolve.mjs, so Studio edits reach the daily
// runs without touching kit code. Writes: owner + staff only (this controls
// production); clients read their own channel. Quota projection blocks saves
// that would stack a day past the shared 10k-unit pool (#99 constants).
//
// #104 Task 6 addendum (Task 8 review carry-forwards CF-1/2/3): the
// projection is now MODEL-AWARE at schedule time (AC-P2-6/7 end-to-end) —
//   CF-3: projectWithQuotaModel wired with the loader injected,
//   CF-2: ensureQuotaModelSchema runs at this wiring point; TABLE-MISSING vs
//         ROW-MISSING are distinguished log lines,
//   CF-1: when a live model's insertCostUnits differs from the legacy 1,700
//         (the ~17x relaxation), one log line + one UI warning fire — never
//         silent. Every quota-store failure degrades to the legacy constants
//         (a broken DB must not block schedule saves).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { validateSchedule, projection, projectWithQuotaModel } from '@/lib/schedule-projection';
import { ensureQuotaModelSchema, loadQuotaModel } from '@/lib/quota-ledger';
import { adaptPostgres } from '@/lib/provider-routing';
import { db, dbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FILE = 'yt-mcp/cadence.json';

// The quota pool is workspace-wide (ONE shared OAuth project — see
// studio/lib/quota-ledger.mjs), so youtube_quota_models rows are keyed by this
// id. Set YT_GCP_PROJECT_ID to the real GCP project id to key rows by it; the
// sentinel keeps the default row addressable when the env is unset.
const QUOTA_PROJECT_ID = process.env.YT_GCP_PROJECT_ID || 'workspace-default';

// Pre-#104 per-upload cost (insert 1,600 + thumbnail 50 + pinned comment 50).
// CF-1: any live model row that diverges from this number must announce itself.
const LEGACY_INSERT_COST = 1700;

const loadFile = async () => (await readRepoJSON(FILE)) || {};
const quotaLog = (msg) => console.log(`[schedule] quota model: ${msg}`);

// CF-1: one advisory string per divergence — the ~17x relaxation must never
// be silent (log + UI warning). No threshold band: the row is owner-authored
// data, so ANY divergence from legacy gets the line.
export function insertCostAdvisories(model) {
  const cost = Number(model?.insertCostUnits);
  if (!Number.isFinite(cost) || cost === LEGACY_INSERT_COST) return [];
  return [
    `Quota advisory: this project's uploads are gated at ${cost} units/upload (legacy math assumed ${LEGACY_INSERT_COST} — ${(LEGACY_INSERT_COST / cost).toFixed(1)}x cheaper), so the shared pool now allows far more uploads per day than the old projection. Edit the youtube_quota_models row (project "${QUOTA_PROJECT_ID}") to change this.`,
  ];
}

// CF-2: load the schedule-time quota model, distinguishing TABLE-MISSING from
// ROW-MISSING in the log (a silently-DEFAULT-forever store is the failure mode
// the review flagged). Fail-soft: every failure path returns null and the
// caller projects with the legacy constants.
async function loadScheduleQuotaModel() {
  if (!dbReady || !db) {
    quotaLog('database not configured — legacy projection constants (10,000 units pool / 1,700 per upload)');
    return null;
  }
  const client = adaptPostgres(db);
  try {
    await ensureQuotaModelSchema(client);
  } catch (e) {
    quotaLog(`table MISSING or unwritable (${String(e?.message || e).slice(0, 120)}) — legacy projection constants`);
    return null;
  }
  let rowPresent = false;
  try {
    const rows = await client('SELECT project_id FROM youtube_quota_models WHERE project_id = $1', [QUOTA_PROJECT_ID]);
    rowPresent = Array.isArray(rows) && rows.length > 0;
  } catch { rowPresent = false; }
  if (!rowPresent) {
    quotaLog(`no row for project "${QUOTA_PROJECT_ID}" — DEFAULT model in effect (100 units/upload, 100 inserts/day)`);
  }
  let model = null;
  try {
    model = await loadQuotaModel(QUOTA_PROJECT_ID, client);
  } catch (e) {
    // reachable-but-erroring store (transient failure, malformed row) — same
    // fail-soft contract as the schema path above: legacy constants, never a 500
    quotaLog(`store ERROR loading model for "${QUOTA_PROJECT_ID}" (${String(e?.message || e).slice(0, 120)}) — legacy projection constants`);
    return null;
  }
  for (const advisory of insertCostAdvisories(model)) quotaLog(`ADVISORY: ${advisory}`);
  return model;
}

// Schedule-time projection: model-aware when the quota store is reachable
// (CF-3, loader injected — the model is already loaded and logged above),
// legacy constants otherwise. proj.warnings carries the model's insert-bucket
// advisory (Task 8) plus the CF-1 cost advisory.
async function scheduleProjection(schedule) {
  const { docDays = [], shortDays = [] } = schedule || {};
  const model = await loadScheduleQuotaModel();
  if (!model) return { proj: projection({ docDays, shortDays }), advisories: [] };
  let proj;
  try {
    proj = await projectWithQuotaModel({
      docDays,
      shortDays,
      projectId: QUOTA_PROJECT_ID,
      dbClient: adaptPostgres(db),
      loadQuotaModel: async () => model,
    });
  } catch (e) {
    // a throw inside the model-aware projection must never fail the request —
    // degrade to the legacy verdict (a broken quota store never blocks saves)
    quotaLog(`projection ERROR with live model (${String(e?.message || e).slice(0, 120)}) — legacy projection constants`);
    return { proj: projection({ docDays, shortDays }), advisories: [] };
  }
  const advisories = insertCostAdvisories(model);
  proj.warnings = [...(proj.warnings || []), ...advisories];
  return { proj, advisories };
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const e = (await loadFile())[slug] || {};
  const { docDays = [], shortDays = [], shortsSource = 'generated' } = e;
  const { proj } = await scheduleProjection({ docDays, shortDays });
  return Response.json({ slug, schedule: { docDays, shortDays, shortsSource }, projection: proj });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // scheduling controls production — owner + staff only (clients: read-only)
  if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'only owner and staff can change scheduling' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { slug, ...schedule } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });

  const v = validateSchedule(schedule);
  if (!v.ok) return Response.json({ error: v.errors.join('; ') }, { status: 400 });
  const { proj, advisories } = await scheduleProjection(v.clean);
  if (proj.blocked) {
    return Response.json({
      error: `blocked: the busiest day would use ${proj.worstDayUnits} of the shared ${proj.budget} unit daily pool (${proj.worstDayUploads} uploads) — spread the days or lower the cadence`,
      projection: proj,
    }, { status: 400 });
  }

  const file = await loadFile();
  file[slug] = {
    ...(file[slug] || {}),
    ...v.clean,
    updated: new Date().toISOString(),
    updatedBy: user.email,
  };
  await writeRepoJSON(FILE, file, `schedule: ${slug} cadence updated (#100)`);
  try { await appendAudit(user.email, 'channel schedule set', slug); } catch { }
  return Response.json({ ok: true, slug, schedule: v.clean, projection: proj, warnings: [...(v.warnings || []), ...advisories] });
}
