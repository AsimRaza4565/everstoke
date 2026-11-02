// #100 SCHEDULING PANEL — pure validation + quota projection for the Studio
// scheduling card. Field names are the ENGINE contract (lib/doc-days.mjs,
// shorts-clips.mjs, channel-pipeline shortsSource) — this file and the engine
// must stay in lockstep (see also #96/#98/#99).

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SET = new Set(DAY_NAMES);
const PER_UPLOAD = 1700;   // insert 1,600 + thumbnail 50 + pinned comment 50
const READS_MARGIN = 100;  // daily read-calls reservation — keep in lockstep with ./quota-ledger.mjs

// #104 — quota model as data. projection() consumes an optional quota-model
// object (the shape loadQuotaModel() returns in ./quota-ledger.mjs); when
// one is present and explicit opts are not, the pool/per-upload/budget come
// from the model and an ADVISORY (non-blocking) warning is emitted when the
// worst projected day would exceed the model's insert bucket.

const normDays = (days) =>
  (Array.isArray(days) ? days : [])
    .map((d) => String(d || '').trim())
    .filter((d) => {
      const cap = d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
      return DAY_SET.has(cap);
    })
    .map((d) => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase());

// {ok, clean:{docDays, shortDays, shortsSource}, errors[], warnings[]}
export function validateSchedule({ docDays, shortDays, shortsSource } = {}) {
  const errors = [];
  const warnings = [];
  const clean = {
    docDays: normDays(docDays),
    shortDays: normDays(shortDays),
    shortsSource: shortsSource === 'clips' ? 'clips' : 'generated',
  };
  if (Array.isArray(docDays) && normDays(docDays).length !== docDays.filter(Boolean).length) {
    errors.push('unknown day name in docDays');
  }
  if (Array.isArray(shortDays) && normDays(shortDays).length !== shortDays.filter(Boolean).length) {
    errors.push('unknown day name in shortDays');
  }
  if (shortsSource && !['generated', 'clips'].includes(shortsSource)) {
    errors.push('shortsSource must be "generated" or "clips"');
  }
  if (clean.shortsSource === 'clips' && !clean.docDays.length) {
    warnings.push('Clips source is selected but no doc days are set — with no long-forms there is nothing to clip from.');
  }
  if (clean.shortsSource === 'clips' && clean.docDays.length) {
    const supply = clean.docDays.length * 4 + 1; // one 10-min doc yields ~4 usable clips
    if (clean.shortDays.length > supply) {
      warnings.push(`Short days (${clean.shortDays.length}) outpace clip supply (≈${supply}/week from ${clean.docDays.length} docs) — dry days will skip.`);
    }
  }
  if (clean.shortDays.length && !clean.shortDays.some((d) => clean.docDays.includes(d)) && clean.docDays.length) {
    warnings.push('No short day shares a doc day — clips will post from the queue backlog only.');
  }
  return { ok: errors.length === 0, clean, errors, warnings };
}

// Quota projection against the shared daily pool (#99 constants, or a #104
// quota-model row). The worst day is what matters: uploads landing on the
// same weekday stack in one pool window. tone: 'ok' (<=70%), 'warn'
// (70-100%), 'over' (>100%, must block). Explicit dailyLimit/perUpload/margin
// always win over the model. warnings[] is ADVISORY only — it never sets
// blocked/tone (AC-P2-6).
export function projection({ docDays = [], shortDays = [], dailyLimit, perUpload, margin = READS_MARGIN, model = null } = {}) {
  const m = model && typeof model === 'object' ? model : null;
  const perUploadEff = Number.isFinite(perUpload)
    ? perUpload
    : (m && Number.isFinite(m.insertCostUnits) ? m.insertCostUnits : PER_UPLOAD);
  const dailyLimitEff = Number.isFinite(dailyLimit)
    ? dailyLimit
    : (m && Number.isFinite(m.sharedUnitsPerDay) ? m.sharedUnitsPerDay : 10000);
  const perDay = {};
  for (const d of docDays) perDay[d] = (perDay[d] || 0) + 1;
  for (const d of shortDays) perDay[d] = (perDay[d] || 0) + 1;
  const worstDayUploads = Math.max(0, ...Object.values(perDay));
  const weeklyUploads = docDays.length + shortDays.length;
  const worstDayUnits = worstDayUploads * perUploadEff;
  const avgDayUnits = Math.round(((weeklyUploads / 7) * perUploadEff + margin) * 10) / 10;
  const budget = dailyLimitEff - margin;
  const pct = Math.round((worstDayUnits / budget) * 100);
  const blocked = worstDayUnits + perUploadEff > budget;
  const tone = blocked || pct > 100 ? 'over' : pct > 70 ? 'warn' : 'ok';
  const warnings = [];
  if (m && Number.isFinite(m.insertPerDay) && worstDayUploads > m.insertPerDay) {
    warnings.push(
      `Advisory: the busiest day plans ${worstDayUploads} uploads, over this project's insert bucket of ${m.insertPerDay}/day — YouTube would refuse uploads past the bucket even though the unit pool allows them.`,
    );
  }
  return { worstDayUploads, weeklyUploads, worstDayUnits, avgDayUnits, budget, pct, tone, blocked, warnings };
}

// Async variant: loads the quota model for a GCP project via loadQuotaModel
// (injected for tests; defaults to the lib loader) and projects against it.
// Returns { ...projection, model }. Advisory-only — never blocks (AC-P2-6);
// a changed row re-computes the projection with no code change (AC-P2-7).
export async function projectWithQuotaModel({ docDays = [], shortDays = [], projectId, dbClient = null, margin = READS_MARGIN, loadQuotaModel: loader } = {}) {
  let load = loader;
  if (typeof load !== 'function') {
    // Fix round 1 (#104): the quota-model core lives at studio/lib/quota-ledger.mjs —
    // INSIDE the Turbopack root, so this resolves at build time (the earlier
    // repo-root import — even with turbopackIgnore — broke `next build`).
    // The repo-root lib/quota-ledger.mjs is a re-export shim for pipeline callers.
    ({ loadQuotaModel: load } = await import('./quota-ledger.mjs'));
  }
  const model = await load(projectId, dbClient);
  return { ...projection({ docDays, shortDays, margin, model }), model };
}
