// Template registry DB layer (issue #102 Phase 1, Task 5).
// Sync the registry index, assign/unassign channel templates, audit every
// change. The client is injected via the `makeRegistryDb(client)` factory so
// tests run against an in-memory stub — no live Neon in unit tests.
//
// Client contract (postgres.js-compatible positional style):
//   `client(sqlText, params)` -> Promise<rowObject[]>
// Rows use snake_case column names; parameters use $1..$n placeholders
// (never string-interpolated — SQL-injection safe by construction).
// Production callers get the real client lazily via getRegistryDb().

import { createHash } from 'node:crypto';
import { validateRegistryMeta, resolveAssignment } from './template-registry.js';

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

// Stable JSON: object keys sorted recursively, so the same registry block
// always hashes identically regardless of key insertion order.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function contentHash(registry) {
  return createHash('sha256').update(stableStringify(registry)).digest('hex');
}

function majorOf(version) {
  return parseInt(version.split('.')[0], 10);
}

export function makeRegistryDb(client) {
  if (typeof client !== 'function') {
    throw new TypeError('makeRegistryDb: client must be a function (sqlText, params) -> Promise<rows>');
  }

  async function ensureSchema() {
    await client(`CREATE TABLE IF NOT EXISTS template_registry_index (
      family_id text PRIMARY KEY,
      version text NOT NULL,
      major integer NOT NULL,
      meta_hash text NOT NULL,
      meta_json jsonb NOT NULL,
      deprecated boolean NOT NULL DEFAULT false,
      synced_at timestamptz NOT NULL DEFAULT now()
    )`, []);
    await client(`CREATE TABLE IF NOT EXISTS channel_template_assignments (
      channel_id text NOT NULL,
      family_id text NOT NULL,
      pinned_major integer NOT NULL,
      pinned_version text NOT NULL,
      assigned_by text NOT NULL,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      active boolean NOT NULL DEFAULT true,
      PRIMARY KEY (channel_id, family_id)
    )`, []);
    await client(`CREATE TABLE IF NOT EXISTS template_assignment_audit (
      id bigserial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      actor text NOT NULL,
      channel_id text NOT NULL,
      family_id text NOT NULL,
      from_major integer,
      to_major integer,
      action text NOT NULL
    )`, []);
  }

  /**
   * Sync catalog families into the registry index. Upserts only rows whose
   * content hash changed (idempotent: same input twice -> zero writes).
   * Phase 1 has NO removal at all: families absent from the input stay in
   * the index untouched. As a guard, if an absent family still has an
   * active channel assignment the sync reports it in `removedRefused` with
   * ok:false (removal would strand the channel) — nothing is deleted.
   * @param {Array<{familyId: string, name?: string, registry: object, hash?: string}>} families
   */
  async function syncRegistry(families) {
    if (!Array.isArray(families)) {
      throw new TypeError('syncRegistry: families must be an array');
    }

    const skippedInvalid = [];
    const valid = [];
    for (const fam of families) {
      if (fam === null || typeof fam !== 'object' || !isNonEmptyString(fam.familyId)) {
        skippedInvalid.push({ familyId: fam?.familyId ?? null, reason: 'missing familyId', errors: [] });
        continue;
      }
      const v = validateRegistryMeta(fam.registry);
      if (!v.ok) {
        skippedInvalid.push({ familyId: fam.familyId, reason: 'invalid registry block', errors: v.errors });
        continue;
      }
      valid.push({
        familyId: fam.familyId,
        registry: fam.registry,
        hash: isNonEmptyString(fam.hash) ? fam.hash : contentHash(fam.registry),
      });
    }

    const existingRows = await client('SELECT family_id, meta_hash FROM template_registry_index', []);
    const existing = new Map(existingRows.map(r => [r.family_id, r.meta_hash]));

    const activeRows = await client('SELECT DISTINCT family_id FROM channel_template_assignments WHERE active = true', []);
    const activelyAssigned = new Set(activeRows.map(r => r.family_id));

    const inputIds = new Set(valid.map(f => f.familyId));
    const removedRefused = [];
    for (const [familyId] of existing) {
      if (!inputIds.has(familyId) && activelyAssigned.has(familyId)) removedRefused.push(familyId);
    }

    const synced = [];
    let writes = 0;
    for (const fam of valid) {
      if (existing.get(fam.familyId) === fam.hash) continue; // unchanged -> zero write (idempotency)
      await client(
        `INSERT INTO template_registry_index (family_id, version, major, meta_hash, meta_json, deprecated, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (family_id) DO UPDATE SET
           version = $2, major = $3, meta_hash = $4, meta_json = $5, deprecated = $6, synced_at = $7`,
        [fam.familyId, fam.registry.version, majorOf(fam.registry.version), fam.hash,
          JSON.stringify(fam.registry), fam.registry.deprecated === true, new Date()],
      );
      writes++;
      synced.push(fam.familyId);
    }

    return { ok: removedRefused.length === 0, synced, skippedInvalid, removedRefused, writes };
  }

  async function getActiveAssignmentRow(channelId, familyId) {
    const rows = await client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_by
       FROM channel_template_assignments
       WHERE channel_id = $1 AND family_id = $2 AND active = true`,
      [channelId, familyId],
    );
    return rows[0] || null;
  }

  /**
   * Assign a channel to a family within a pinned major. Resolves the
   * current indexed version inside that major via resolveAssignment
   * (fail-closed: no version in the pinned major -> no writes). Writes the
   * assignment (upsert, active=true) and an audit row
   * (action 'assign', from_major null on first assignment).
   */
  async function assignTemplate(channelId, familyId, pinnedMajor, actor) {
    if (!isNonEmptyString(channelId) || !isNonEmptyString(familyId)
      || !Number.isInteger(pinnedMajor) || !isNonEmptyString(actor)) {
      return { ok: false, errors: ['assignTemplate: requires channelId, familyId, integer pinnedMajor, actor'] };
    }

    // Pass every indexed block: resolveAssignment filters by familyId itself,
    // and the wider view lets it report majorUpdateAvailable across majors.
    const indexRows = await client('SELECT family_id, version FROM template_registry_index', []);
    const blocks = indexRows.map(r => ({ familyId: r.family_id, version: r.version }));
    const resolved = resolveAssignment({ familyId, pinned_major: pinnedMajor }, blocks);
    if (!resolved.ok) return { ok: false, errors: resolved.errors };

    // from_major = the channel's previous pinned_major for this family if a
    // row exists at all (active or not — a re-assign after unassign still
    // records what it moved from), null on first assignment.
    const priorRows = await client(
      'SELECT pinned_major FROM channel_template_assignments WHERE channel_id = $1 AND family_id = $2',
      [channelId, familyId],
    );
    const fromMajor = priorRows.length > 0 ? priorRows[0].pinned_major : null;

    await client(
      `INSERT INTO channel_template_assignments
         (channel_id, family_id, pinned_major, pinned_version, assigned_by, assigned_at, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (channel_id, family_id) DO UPDATE SET
         pinned_major = $3, pinned_version = $4, assigned_by = $5, assigned_at = $6, active = true`,
      [channelId, familyId, pinnedMajor, resolved.resolvedVersion, actor, new Date()],
    );
    await client(
      `INSERT INTO template_assignment_audit (actor, channel_id, family_id, from_major, to_major, action)
       VALUES ($1, $2, $3, $4, $5, 'assign')`,
      [actor, channelId, familyId, fromMajor, pinnedMajor],
    );

    return {
      ok: true,
      channelId,
      familyId,
      pinnedMajor,
      resolvedVersion: resolved.resolvedVersion,
      majorUpdateAvailable: resolved.majorUpdateAvailable,
      fromMajor,
    };
  }

  /**
   * Deactivate a channel's assignment and write an audit row
   * (action 'unassign', to_major null). Fail-closed when nothing is active.
   */
  async function unassignTemplate(channelId, familyId, actor) {
    if (!isNonEmptyString(channelId) || !isNonEmptyString(familyId) || !isNonEmptyString(actor)) {
      return { ok: false, error: 'unassignTemplate: requires channelId, familyId, actor' };
    }

    const current = await getActiveAssignmentRow(channelId, familyId);
    if (!current) return { ok: false, error: 'no_active_assignment' };

    await client(
      'UPDATE channel_template_assignments SET active = false WHERE channel_id = $1 AND family_id = $2',
      [channelId, familyId],
    );
    await client(
      `INSERT INTO template_assignment_audit (actor, channel_id, family_id, from_major, to_major, action)
       VALUES ($1, $2, $3, $4, $5, 'unassign')`,
      [actor, channelId, familyId, current.pinned_major, null],
    );

    return { ok: true };
  }

  /** All active assignments for a channel. */
  async function listAssignments(channelId) {
    return client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_by, assigned_at
       FROM channel_template_assignments
       WHERE channel_id = $1 AND active = true`,
      [channelId],
    );
  }

  /** All active assignments of a family (which channels use it). */
  async function listUsage(familyId) {
    return client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_at
       FROM channel_template_assignments
       WHERE family_id = $1 AND active = true`,
      [familyId],
    );
  }

  /**
   * Single active assignment for a channel; pass familyId to narrow to that
   * family, otherwise the first active row. Returns null when none active.
   */
  async function getActiveAssignment(channelId, familyId) {
    if (isNonEmptyString(familyId)) {
      return getActiveAssignmentRow(channelId, familyId);
    }
    const rows = await client(
      `SELECT channel_id, family_id, pinned_major, pinned_version, assigned_by
       FROM channel_template_assignments
       WHERE channel_id = $1 AND active = true`,
      [channelId],
    );
    return rows[0] || null;
  }

  return {
    ensureSchema,
    syncRegistry,
    assignTemplate,
    unassignTemplate,
    listAssignments,
    listUsage,
    getActiveAssignment,
  };
}

/**
 * Bridge a real postgres.js `sql` function to the positional client contract
 * this module uses. postgres.js REJECTS positional calls
 * (`client(sqlText, params)` → NOT_TAGGED_CALL: Query not called as a tagged
 * template literal); `sql.unsafe(text, params)` is its documented escape
 * hatch for pre-built parameterized queries. Still injection-safe: the text
 * contains only placeholders, the values travel in `params`.
 */
export function adaptPostgres(sql) {
  return (text, params) => sql.unsafe(text, params);
}

/**
 * Production entry point (Tasks 6/7/9). Lazy-imports db.mjs so importing
 * this module never touches the DB layer — unit tests and non-Neon machines
 * stay safe until this is actually called. Throws fail-closed when the
 * database is not configured.
 */
export async function getRegistryDb() {
  const { db, dbReady } = await import('./db.mjs');
  if (!dbReady || !db) {
    throw new Error('registry db: DATABASE_URL missing / db not ready — cannot construct registry DB layer');
  }
  return makeRegistryDb(adaptPostgres(db));
}

export default getRegistryDb;
