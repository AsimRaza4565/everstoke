// Template assignment writes (issue #102 Phase 1, Task 7).
// POST = assign (compatibility validator gates the save — spec D4/AC-3),
// DELETE = unassign. Owner-only writes (AC-9); audit rows are written by the
// DB layer itself — this route only parses, gates, and calls the libs.
import { getUser } from '@/lib/route-auth';
import { readRegistry, readRepoJSON } from '@/lib/channels-registry';
import { decryptKeys } from '@/lib/keys-vault';
import { loadRegistryTemplates, validateAssignment, channelConfigFromRegistryEntry } from '@/lib/template-registry';
import { capabilityProviders, CAPABILITY_BASELINE } from '@/lib/provider-catalog';
import { TEMPLATES_DATA } from '@/lib/templates-catalog';
import { REGISTRY_META } from '@/lib/template-registry.data';
import { getRegistryDb } from '@/lib/template-registry-db';

export const dynamic = 'force-dynamic';

const KEYS_FILE = 'yt-mcp/channel-keys.json';

// CAPABILITY_BASELINE lives in the shared lib (template-registry.js) and the
// vault provider table lives in the provider catalog (#104, Task 1) — both
// imported above from one source of truth each, so the assign route and the
// pipeline preflight (lib/template-preflight.mjs) rule identically and cannot
// drift (E2E round-2 finding: two local copies diverged and blocked an
// assigned channel at generation; M31/M34: the two hand-mirrored
// CAPABILITY_PROVIDERS tables — retired here in favor of
// studio/lib/provider-catalog.js capabilityProviders()).

// channelConfig derivation lives in the lib now (channelConfigFromRegistryEntry)
// — the GET templates route needs the same niches/formats for the channel view,
// and both callers must feed the validator identical inputs (Task 7 review M20).

// capabilityMap = pipeline-truth baseline, refined by the BYOK vault
// (per-channel provider keys, keyed by slug). The vault is add-only: an
// unreadable vault leaves the baseline intact (the pipeline still fulfills
// its lanes), while a configured vault key can only ADD availability.
async function buildCapabilityMap(slug) {
  const map = {};
  let keys = null;
  try {
    const file = (await readRepoJSON(KEYS_FILE)) || {};
    const entry = file[slug];
    keys = entry?.enc ? decryptKeys(entry.enc) : null;
  } catch {
    keys = null; // vault unreachable -> baseline still holds (pipeline truth)
  }
  for (const cap of Object.keys(CAPABILITY_BASELINE)) {
    // Phase 1: pipeline-truth baseline — the vault refines per-provider routing in Phase 2 (capability registry).
    // Providers from the shared catalog (#104); every key in the vault passed
    // live validateKey() at save time, so "configured" implies "working".
    // REFINEMENT ONLY: a vault key can ADD availability on top of the
    // baseline and can never revoke it. Engine knowledge, not brand data.
    map[cap] = CAPABILITY_BASELINE[cap] === true || capabilityProviders(cap).some((p) => keys?.[p]);
  }
  return map;
}

const denyOwner = async (req) => {
  const user = await getUser(req);
  return user?.role === 'owner' ? user : null;
};

async function findChannelEntry(channelId) {
  // readRegistry is DB-first — the canonical channel store (Neon, with the
  // repo file as the CI feed), same accessor the other /api/channels routes use.
  const reg = await readRegistry().catch(() => null);
  const channels = Array.isArray(reg?.channels) ? reg.channels : [];
  return channels.find((c) => c.slug === channelId || c.channelId === channelId) || null;
}

export async function POST(req) {
  const user = await denyOwner(req);
  if (!user) return Response.json({ error: 'owner only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { channelId, familyId } = body || {};
  const pinnedMajor = Number(body?.pinnedMajor);
  if (!channelId || !familyId) return Response.json({ error: 'channelId and familyId are required' }, { status: 400 });
  if (!Number.isInteger(pinnedMajor) || pinnedMajor < 0) return Response.json({ error: 'pinnedMajor must be a non-negative integer' }, { status: 400 });

  // Resolve the template's validated registry meta from the loader. Families
  // without (valid) metadata are not assignable — 404, never a silent pass.
  const view = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);
  const template = view.templates.find((t) => t.familyId === familyId);
  if (!template) {
    const invalid = view.invalid.find((v) => v.familyId === familyId);
    return Response.json({ error: invalid ? `template "${familyId}" has invalid registry metadata and is not assignable` : `unknown template family "${familyId}"`, invalid: invalid?.errors || [] }, { status: 404 });
  }

  const entry = await findChannelEntry(channelId);
  if (!entry) return Response.json({ error: `unknown channel "${channelId}"` }, { status: 404 });

  // Validator gate BEFORE anything touches the DB (spec D4: blocks the save).
  const channelConfig = channelConfigFromRegistryEntry(entry);
  const capabilityMap = await buildCapabilityMap(entry.slug || channelId);
  // Phase 1 renderers all ship in-repo with the CI render lane, so renderer
  // availability is trivially true for registry-declared renderers.
  // PHASE-2 UPGRADE: track per-renderer availability in the vault/config
  // instead of asserting it here.
  capabilityMap[template.registry.renderer] = true;
  const verdict = validateAssignment(template.registry, channelConfig, capabilityMap);
  if (!verdict.ok) return Response.json({ error: 'incompatible', reasons: verdict.reasons }, { status: 422 });

  try {
    const db = await getRegistryDb();
    await db.ensureSchema();
    const result = await db.assignTemplate(channelId, familyId, pinnedMajor, user.email);
    if (!result.ok) return Response.json({ error: 'assign failed', errors: result.errors || [result.error] }, { status: 422 });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}

export async function DELETE(req) {
  const user = await denyOwner(req);
  if (!user) return Response.json({ error: 'owner only' }, { status: 403 });

  // Body first, query params as fallback.
  let { channelId, familyId } = (await req.json().catch(() => ({}))) || {};
  const q = new URL(req.url).searchParams;
  channelId = channelId || q.get('channelId') || q.get('channel');
  familyId = familyId || q.get('familyId');
  if (!channelId || !familyId) return Response.json({ error: 'channelId and familyId are required' }, { status: 400 });

  try {
    const db = await getRegistryDb();
    const result = await db.unassignTemplate(channelId, familyId, user.email);
    if (!result.ok) {
      const status = result.error === 'no_active_assignment' ? 404 : 400;
      return Response.json({ error: result.error }, { status });
    }
    return Response.json({ ok: true, channelId, familyId });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
