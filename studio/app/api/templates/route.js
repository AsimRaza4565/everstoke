// Template registry view (issue #102 Phase 1, Task 7; view extensions Task 8).
// GET: the registry-assignable templates (git catalog + metadata, loaded
// fail-closed by template-registry.js) plus:
//   ?channel=<id> -> that channel's active assignments from Neon and its
//                    validator-shaped channelConfig (niches/formats) so the
//                    assignment picker can order niche-first (AC-10) on the
//                    exact strings the validator compares.
//   ?family=<id>  -> that family's active usage across channels (AC-4 detail).
// Every response carries `role` (owner|staff) so the UI renders read-only for
// staff (AC-9); the API layer still enforces all writes itself.
// Read-only surface: owner AND staff. Writes live in ./assign.
import { requireRole } from '@/lib/route-auth';
import { readRegistry } from '@/lib/channels-registry';
import { loadRegistryTemplates, channelConfigFromRegistryEntry } from '@/lib/template-registry';
import { TEMPLATES_DATA } from '@/lib/templates-catalog';
import { REGISTRY_META } from '@/lib/template-registry.data';
import { getRegistryDb } from '@/lib/template-registry-db';

export const dynamic = 'force-dynamic';

// DB-first channel lookup — same accessor the other /api/channels routes use.
async function findChannelEntry(channelId) {
  const reg = await readRegistry().catch(() => null);
  const channels = Array.isArray(reg?.channels) ? reg.channels : [];
  return channels.find((c) => c.slug === channelId || c.channelId === channelId) || null;
}

export async function GET(req) {
  const role = await requireRole(req, ['owner', 'staff']);
  if (!role) return Response.json({ error: 'not signed in' }, { status: 401 });

  // Loader is pure and fail-closed: families without (valid) metadata are
  // simply absent; invalid blocks are reported in `invalid`, never listed.
  const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);

  const params = new URL(req.url).searchParams;
  const familyId = params.get('family');
  const channelId = params.get('channel');

  // Family branch — usage list for the template detail page (AC-4). DB
  // failure degrades to an empty usage list with `error` set; the catalog
  // metadata still renders.
  if (familyId) {
    let usage = [];
    let error = null;
    try {
      const db = await getRegistryDb();
      usage = await db.listUsage(familyId);
    } catch (e) {
      error = e.message;
    }
    return Response.json({ role, familyId, templates: view.templates, invalid: view.invalid, usage, ...(error ? { error } : {}) });
  }

  if (channelId) {
    // channelConfig (niches/formats) comes from the channel registry and is
    // served even when the registry DB is unreachable — the picker ordering
    // must not depend on Neon.
    const channelConfig = await findChannelEntry(channelId).then(
      (entry) => (entry ? channelConfigFromRegistryEntry(entry) : null),
    );
    let assignments = [];
    let error = null;
    try {
      const db = await getRegistryDb();
      assignments = await db.listAssignments(channelId);
    } catch (e) {
      error = e.message;
    }
    return Response.json(
      { role, channelId, templates: view.templates, invalid: view.invalid, assignments, channelConfig, ...(error ? { error } : {}) },
      error ? { status: 502 } : undefined,
    );
  }

  return Response.json({ role, templates: view.templates, invalid: view.invalid });
}
