// Provider routing (issue #104 Phase 2 BYOK vault v2, Task 3).
// RESOLUTION layer on top of the provider catalog: which configured provider
// serves a capability for a channel, in priority order —
//   channel-specific routes (by priority) → workspace-default routes
//   (channel_id IS NULL, by priority), deduped by providerId.
// Storage: `provider_routes` (upsert) + `provider_route_audit` (audit-lite
// on every set/deactivate). The client is injected via the
// `makeProviderRouting(dbClient)` factory so tests run against an in-memory
// stub — no live Neon in unit tests (same seam as template-registry-db.js).
//
// Client contract (postgres.js-compatible positional style):
//   `client(sqlText, params)` -> Promise<rowObject[]>
// Rows use snake_case column names; parameters use $1..$n placeholders
// (never string-interpolated — SQL-injection safe by construction).
//
// NULL-channel note: in Postgres `channel_id = NULL` matches nothing, so
// every workspace-default query emits `channel_id IS NULL` explicitly.

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isInteger(v) {
  return Number.isInteger(v);
}

export function makeProviderRouting(dbClient) {
  if (typeof dbClient !== 'function') {
    throw new TypeError('makeProviderRouting: dbClient must be a function (sqlText, params) -> Promise<rows>');
  }

  async function ensureSchema() {
    await dbClient(`CREATE TABLE IF NOT EXISTS provider_routes (
      id bigserial PRIMARY KEY,
      channel_id TEXT,
      capability TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (channel_id, capability, provider_id)
    )`, []);
    await dbClient(`CREATE TABLE IF NOT EXISTS provider_route_audit (
      id bigserial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      actor TEXT NOT NULL,
      channel_id TEXT,
      capability TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      priority INTEGER,
      action TEXT NOT NULL
    )`, []);
  }

  /** Validation shared by setRoute/deactivateRoute. channelId null/undefined = workspace default. */
  function validateRouteInput({ channelId, capability, providerId, priority, actor }, needPriority) {
    const errors = [];
    if (channelId !== null && channelId !== undefined && !isNonEmptyString(channelId)) {
      errors.push('channelId must be a non-empty string or null (workspace default)');
    }
    if (!isNonEmptyString(capability)) errors.push('capability is required');
    if (!isNonEmptyString(providerId)) errors.push('providerId is required');
    if (needPriority && !isInteger(priority)) errors.push('priority must be an integer');
    if (!isNonEmptyString(actor)) errors.push('actor is required');
    return { ok: errors.length === 0, errors, isDefault: channelId === null || channelId === undefined };
  }

  /**
   * Look up a route row for channel+capability+provider regardless of the
   * active flag (setRoute must find deactivated rows to reactivate them).
   * `channel_id = NULL` never matches in Postgres, so the default layer
   * queries `channel_id IS NULL` explicitly.
   */
  function findRouteRow(capability, providerId, isDefault, channelId) {
    if (isDefault) {
      return dbClient(
        'SELECT id, priority, active FROM provider_routes WHERE capability = $1 AND provider_id = $2 AND channel_id IS NULL',
        [capability, providerId],
      );
    }
    return dbClient(
      'SELECT id, priority, active FROM provider_routes WHERE capability = $1 AND provider_id = $2 AND channel_id = $3',
      [capability, providerId, channelId],
    );
  }

  function writeAudit(actor, channelId, capability, providerId, priority, action) {
    return dbClient(
      `INSERT INTO provider_route_audit (actor, channel_id, capability, provider_id, priority, action)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actor, channelId ?? null, capability, providerId, priority, action],
    );
  }

  /**
   * Upsert the active route for channel+capability+provider: replaces
   * priority (re)activating the row if it existed, inserts otherwise.
   * Audit-lite: one `set` row per call.
   */
  async function setRoute({ channelId, capability, providerId, priority, actor }) {
    const v = validateRouteInput({ channelId, capability, providerId, priority, actor }, true);
    if (!v.ok) return { ok: false, errors: v.errors };

    const existing = await findRouteRow(capability, providerId, v.isDefault, channelId);
    if (existing.length > 0) {
      await dbClient(
        'UPDATE provider_routes SET priority = $1, active = true WHERE id = $2',
        [priority, existing[0].id],
      );
    } else {
      await dbClient(
        `INSERT INTO provider_routes (channel_id, capability, provider_id, priority, active)
         VALUES ($1, $2, $3, $4, true)`,
        [v.isDefault ? null : channelId, capability, providerId, priority],
      );
    }
    await writeAudit(actor, channelId ?? null, capability, providerId, priority, 'set');
    return { ok: true, updated: existing.length > 0 };
  }

  /**
   * Deactivate the route for channel+capability+provider and audit
   * action 'deactivate'. Fail-closed when nothing is active (no write,
   * no audit) so a duplicate deactivate cannot pollute the trail.
   */
  async function deactivateRoute({ channelId, capability, providerId, actor }) {
    const v = validateRouteInput({ channelId, capability, providerId, actor }, false);
    if (!v.ok) return { ok: false, errors: v.errors };

    const rows = await dbClient(
      v.isDefault
        ? 'SELECT id, priority FROM provider_routes WHERE capability = $1 AND provider_id = $2 AND channel_id IS NULL AND active = true'
        : 'SELECT id, priority FROM provider_routes WHERE capability = $1 AND provider_id = $2 AND channel_id = $3 AND active = true',
      v.isDefault ? [capability, providerId] : [capability, providerId, channelId],
    );
    if (rows.length === 0) return { ok: false, error: 'no_active_route' };

    await dbClient('UPDATE provider_routes SET active = false WHERE id = $1', [rows[0].id]);
    await writeAudit(actor, channelId ?? null, capability, providerId, rows[0].priority, 'deactivate');
    return { ok: true };
  }

  /** All active routes (optionally narrowed to one capability), priority ascending. */
  async function listRoutes(capability) {
    if (capability !== undefined && capability !== null) {
      if (!isNonEmptyString(capability)) {
        throw new TypeError('listRoutes: capability must be a non-empty string when provided');
      }
      return dbClient(
        `SELECT id, channel_id, capability, provider_id, priority
         FROM provider_routes WHERE active = true AND capability = $1
         ORDER BY priority ASC`,
        [capability],
      );
    }
    return dbClient(
      `SELECT id, channel_id, capability, provider_id, priority
       FROM provider_routes WHERE active = true
       ORDER BY priority ASC`,
      [],
    );
  }

  /**
   * Ordered providers serving a capability for a channel:
   * channel-specific routes first (by priority), then workspace-default
   * routes (by priority), deduped by providerId keeping the first
   * (highest-precedence) occurrence. Empty array when nothing configured —
   * never throws on empty results.
   * @returns {Promise<Array<{providerId: string, priority: number, source: 'channel'|'default'}>>}
   */
  async function resolveCapability(capability, channelId) {
    if (!isNonEmptyString(capability)) {
      throw new TypeError('resolveCapability: capability must be a non-empty string');
    }
    const hasChannel = isNonEmptyString(channelId);

    const channelRows = hasChannel
      ? await dbClient(
          `SELECT provider_id, priority FROM provider_routes
           WHERE active = true AND capability = $1 AND channel_id = $2
           ORDER BY priority ASC`,
          [capability, channelId],
        )
      : [];
    const defaultRows = await dbClient(
      `SELECT provider_id, priority FROM provider_routes
       WHERE active = true AND capability = $1 AND channel_id IS NULL
       ORDER BY priority ASC`,
      [capability],
    );

    const out = [];
    const seen = new Set();
    for (const row of [...channelRows, ...defaultRows]) {
      if (seen.has(row.provider_id)) continue;
      seen.add(row.provider_id);
      out.push({ providerId: row.provider_id, priority: row.priority, source: hasChannel && channelRows.includes(row) ? 'channel' : 'default' });
    }
    return out;
  }

  return {
    ensureSchema,
    setRoute,
    deactivateRoute,
    listRoutes,
    resolveCapability,
  };
}

/**
 * Bridge a real postgres.js `sql` function to the positional client contract
 * this module uses (postgres.js rejects positional calls; `unsafe` is its
 * documented escape hatch). Same adapter shape as template-registry-db.js.
 */
export function adaptPostgres(sql) {
  return (text, params) => sql.unsafe(text, params);
}

/**
 * Production entry point. Lazy-imports db.mjs so importing this module never
 * touches the DB layer — unit tests and non-Neon machines stay safe until
 * this is actually called. Throws fail-closed when the DB is not configured.
 */
export async function getProviderRouting() {
  const { db, dbReady } = await import('./db.mjs');
  if (!dbReady || !db) {
    throw new Error('provider routing: DATABASE_URL missing / db not ready — cannot construct routing layer');
  }
  return makeProviderRouting(adaptPostgres(db));
}

export default getProviderRouting;
