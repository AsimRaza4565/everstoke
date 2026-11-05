// BYOK vault v2 admin surface (issue #104 Phase 2, Task 4).
// GET  = the provider catalog (studio/lib/provider-catalog.js — single source
//        of truth), per-provider key status (pipeline env + per-channel vault,
//        masked only), the active routing rows (Task 3 provider_routes), and
//        with ?channel=<slug> the effective resolved chain per capability.
//        Read surface: owner + staff (writes are owner-only in-route).
// POST = action'd writes, all owner-only:
//   set-route       { channelId|null, capability, providerId, priority }   → Task 3 setRoute (actor from the session)
//   deactivate-route{ channelId|null, capability, providerId }             → Task 3 deactivateRoute
//   test-key        { providerId, key }                                   → live probe, nothing stored
//
// Key storage deliberately reuses the EXISTING vault path (POST /api/channels/keys
// — live validate-before-save, AES-256-GCM, masked read-back); this route never
// writes keys. AC-P2-9: no key material ever appears in any response here —
// masked values and provider rejection details only.
import { getUser } from '@/lib/route-auth';
import { readRegistry, readRepoJSON } from '@/lib/channels-registry';
import { PROVIDERS as CATALOG, capabilityProviders, CAPABILITY_BASELINE } from '@/lib/provider-catalog';
import { PROVIDERS as VAULT_PROVIDERS, validateKey, maskKey, decryptKeys } from '@/lib/keys-vault';
import { getProviderRouting } from '@/lib/provider-routing';

export const dynamic = 'force-dynamic';

const KEYS_FILE = 'yt-mcp/channel-keys.json';

// Presentation labels for catalog ids the legacy vault map doesn't cover
// (the vault map carries the other ten). UI text only — capability data
// always comes from the catalog itself.
const LABELS = {
  cloudflare: 'Cloudflare Workers AI',
  tavily: 'Tavily',
  serper: 'Serper',
  'edge-tts-local': 'Edge TTS (local)',
  'whisper-local': 'Whisper (local)',
};

// Providers the vault has a storage slot for (keys-vault PROVIDERS ∩ catalog).
// The rest are probed but live in the pipeline env until a vault slot exists.
const vaultKeyed = (id) => Boolean(VAULT_PROVIDERS[id]);

// Probes for the three catalog providers keys-vault.validateKey() doesn't know
// yet — same shape ({ok, detail}), same 12s ceiling, minimal real calls.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);
const bad = (msg) => ({ ok: false, detail: String(msg || 'rejected').slice(0, 140) });

async function probeKey(providerId, key) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, detail: 'empty key' };
  try {
    switch (providerId) {
      case 'cloudflare': // verify via /user/tokens/verify (the AI surface needs an account id on top)
      case 'tavily':
      case 'serper':
        return await probeCatalogOnly(providerId, k);
      default:
        return validateKey(providerId, k); // existing test-on-save path (gemini/groq/cerebras/mistral/hf/openai/openrouter/elevenlabs)
    }
  } catch (e) {
    return bad(e.message);
  }
}

async function probeCatalogOnly(providerId, k) {
  let r;
  if (providerId === 'cloudflare') {
    r = await withTimeout(fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${k}` } }), 12000);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success === true) return { ok: true, detail: '' };
    return bad(j.errors?.[0]?.message || `HTTP ${r.status}`);
  }
  if (providerId === 'tavily') {
    r = await withTimeout(fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: k, query: 'everstoke vault probe', max_results: 1 }),
    }), 12000);
  } else { // serper
    r = await withTimeout(fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'everstoke vault probe' }),
    }), 12000);
  }
  if (r.ok) return { ok: true, detail: '' };
  const j = await r.json().catch(() => ({}));
  return bad(j.detail?.error || j.message || j.error || `HTTP ${r.status}`);
}

// Masked per-provider channel-key index: { providerId: [{slug, masked, updated, updatedBy}] }.
// Decrypt happens server-side; only maskKey output crosses the boundary (AC-P2-9).
async function vaultKeyIndex() {
  const out = {};
  try {
    const file = (await readRepoJSON(KEYS_FILE)) || {};
    for (const [slug, entry] of Object.entries(file)) {
      const keys = entry?.enc ? decryptKeys(entry.enc) : null;
      if (!keys) continue;
      for (const [p, key] of Object.entries(keys)) {
        (out[p] ||= []).push({ slug, masked: maskKey(key), updated: entry.updated || null, updatedBy: entry.updatedBy || null });
      }
    }
  } catch {
    return {}; // vault unreadable → statuses render "not configured", nothing leaks
  }
  return out;
}

async function findChannelEntry(channelId) {
  const reg = await readRegistry().catch(() => null);
  const channels = Array.isArray(reg?.channels) ? reg.channels : [];
  const entry = channelId ? channels.find((c) => c.slug === channelId || c.channelId === channelId) || null : null;
  return { channels, entry };
}

// Safe projection — never spread registry rows (they carry token_enc/token_secret/kit).
const safeChannel = (c) => ({ slug: c.slug, label: c.label || c.slug, niche: c.niche || '', active: c.active !== false });

export async function GET(req) {
  const user = await getUser(req);
  const role = user?.role;
  if (!role || !['owner', 'staff'].includes(role)) return Response.json({ error: 'not signed in' }, { status: 401 });

  const channelParam = new URL(req.url).searchParams.get('channel') || '';

  const capabilities = Object.keys(CAPABILITY_BASELINE).map((cap) => ({
    cap,
    baseline: CAPABILITY_BASELINE[cap] === true,
    providers: capabilityProviders(cap),
  }));

  const catalog = Object.values(CATALOG).map((p) => ({
    id: p.id,
    label: LABELS[p.id] || VAULT_PROVIDERS[p.id]?.label || p.id,
    capabilities: p.capabilities,
    envVars: p.envVars,
    envVar: p.envVars[0] || null,
    envSet: p.envVars.some((v) => Boolean(process.env[v])),
    local: p.envVars.length === 0,
    baseUrl: p.baseUrl,
    models: p.models,
    freeTier: p.freeTier,
    licenseClass: p.licenseClass,
    notes: p.notes,
    vaultKey: vaultKeyed(p.id),
  }));

  // The registry is fetched for every GET (the page needs the channel list for
  // its add-key flow); `entry` is only resolved when ?channel= names one.
  const [{ channels: registry, entry }, keys] = await Promise.all([findChannelEntry(channelParam), vaultKeyIndex()]);
  const channels = registry.map(safeChannel);

  let routes = [];
  let routesError = null;
  let resolved = null;
  let resolvedError = null;
  try {
    const routing = await getProviderRouting();
    await routing.ensureSchema();
    routes = await routing.listRoutes();
    const channelSlug = (entry?.slug) || channelParam; // channelId-shaped queries resolve to the stored slug
    if (channelParam) {
      resolved = {};
      for (const cap of Object.keys(CAPABILITY_BASELINE)) {
        resolved[cap] = await routing.resolveCapability(cap, channelSlug);
      }
    }
  } catch (e) {
    // Read degrades fail-soft (pipeline truth still holds); writes stay fail-closed.
    routesError = resolvedError = e.message;
  }

  const payload = { role, catalog, capabilities, routes, keys, channels };
  if (channelParam) {
    payload.channelId = entry?.slug || channelParam;
    payload.channelKnown = Boolean(entry);
    payload.resolved = resolved;
    if (resolvedError) payload.resolvedError = resolvedError;
  }
  if (routesError) payload.routesError = routesError;
  return Response.json(payload);
}

const denyOwner = async (req) => {
  const user = await getUser(req);
  return user?.role === 'owner' ? user : null;
};

export async function POST(req) {
  const user = await denyOwner(req);
  if (!user) return Response.json({ error: 'owner only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const { channelId, capability, providerId } = body || {};

  if (action === 'test-key') {
    const key = String(body?.key || '');
    if (!providerId || !CATALOG[providerId]) return Response.json({ ok: false, detail: 'unknown provider' }, { status: 400 });
    if (CATALOG[providerId].envVars.length === 0) return Response.json({ ok: false, detail: 'local lane — needs no key' }, { status: 400 });
    const v = await probeKey(providerId, key);
    return Response.json({ ok: v.ok, providerId, ...(v.ok ? {} : { detail: v.detail }) });
  }

  if (action !== 'set-route' && action !== 'deactivate-route') {
    return Response.json({ error: 'unknown action — set-route, deactivate-route or test-key' }, { status: 400 });
  }

  if (!capability || !Object.prototype.hasOwnProperty.call(CAPABILITY_BASELINE, capability)) {
    return Response.json({ error: 'unknown capability' }, { status: 400 });
  }
  if (!providerId || !CATALOG[providerId]) return Response.json({ error: 'unknown provider' }, { status: 400 });
  if (!capabilityProviders(capability).includes(providerId)) {
    return Response.json({ error: `provider "${providerId}" does not cover capability "${capability}"` }, { status: 400 });
  }
  if (CATALOG[providerId].envVars.length === 0) {
    return Response.json({ error: 'provider is a local baseline lane — always available, no route needed' }, { status: 400 });
  }

  // channelId null/absent = workspace default; a string must be a real channel.
  let channel = null;
  if (channelId !== null && channelId !== undefined && channelId !== '') {
    const { entry } = await findChannelEntry(String(channelId));
    if (!entry) return Response.json({ error: `unknown channel "${channelId}"` }, { status: 404 });
    channel = entry.slug || String(channelId);
  }

  try {
    const routing = await getProviderRouting();
    await routing.ensureSchema();
    if (action === 'set-route') {
      const priority = Number(body?.priority);
      if (!Number.isInteger(priority) || priority < 0) {
        return Response.json({ error: 'priority must be a non-negative integer' }, { status: 400 });
      }
      const result = await routing.setRoute({ channelId: channel, capability, providerId, priority, actor: user.email || 'owner' });
      if (!result.ok) return Response.json({ error: 'invalid route', errors: result.errors }, { status: 400 });
      return Response.json({ ok: true, action, channelId: channel ?? null, capability, providerId, priority, updated: result.updated });
    }
    const result = await routing.deactivateRoute({ channelId: channel, capability, providerId, actor: user.email || 'owner' });
    if (!result.ok) {
      return Response.json({ error: result.error === 'no_active_route' ? 'no active route for that provider' : 'invalid route', errors: result.errors }, { status: result.error === 'no_active_route' ? 404 : 400 });
    }
    return Response.json({ ok: true, action, channelId: channel ?? null, capability, providerId });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
