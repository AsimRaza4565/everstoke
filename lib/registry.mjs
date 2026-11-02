// Channel registry — the ONE place that answers "what channels exist and where do they publish?".
// Merges the legacy 4-brand kit (lib/brands.json) with Studio wizard channels
// (yt-mcp/studio-channels.json), same merge semantics sweeper.mjs uses:
// legacy slugs win collisions; wizard channels join unless active === false.
// Pure data access — no env reads, no side effects at import, NO silent fallback
// (unknown slugs resolve to undefined; contrast lib/brand-resolve.mjs which
// falls back to quotequarry — that guard-bypass bug is tracked in #72).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Canonical slug order for the legacy fleet (report tables, health checks).
export const LEGACY_SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

// Canonical FB page destinations (single source of truth — was duplicated 3×
// with live drift: yt-daily.mjs still mapped quotequarry to the retired
// Strategic Silence page while fb-crosspost + daily-excel had the 09-20 swap
// to Reliq North. See issue #38).
const FB_DESTINATIONS = {
  'quotequarry': '114550268199751',       // Reliq North (8.6k followers, 09-20 swap)
  'investors-compass': '116157974886564', // Silent Wealth
  'money-rulebook': '1077306835630491',   // Eon Ventures
  'debt-free-doctrine': '106473735839651' // The Boundaries Club
};

function loadLegacy() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'brands.json'), 'utf8'));
  } catch {
    return {};
  }
}

function loadRegistryEntries() {
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8'));
    return reg.channels || [];
  } catch {
    return [];
  }
}

// Pure merge — exported for tests. Legacy wins slug collisions; wizard
// channels join unless active === false; each result carries `source`.
export function mergeChannels(legacyBrands, registryEntries) {
  const out = [];
  const seen = new Set();
  for (const slug of LEGACY_SLUGS) {
    if (legacyBrands[slug]) {
      out.push({ slug, source: 'legacy', ...legacyBrands[slug] });
      seen.add(slug);
    }
  }
  // legacy kit files may contain non-fleet brands (16 total) — include them too
  for (const [slug, kit] of Object.entries(legacyBrands)) {
    if (!seen.has(slug) && kit && kit.active !== false) {
      out.push({ slug, source: 'legacy', ...kit });
      seen.add(slug);
    }
  }
  for (const entry of registryEntries || []) {
    if (!entry || !entry.slug || seen.has(entry.slug) || entry.active === false) continue;
    out.push({ source: 'registry', ...entry });
    seen.add(entry.slug);
  }
  return out;
}

let cache = null; // { at, channels } — per-process memo; scripts are short-lived
function channels() {
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = { at: Date.now(), channels: mergeChannels(loadLegacy(), loadRegistryEntries()) };
  }
  return cache.channels;
}

export function listChannels(options = {}) {
  const source = typeof options === 'string' ? options : options?.source;
  const all = channels();
  if (source === 'legacy') return all.filter(c => c.source === 'legacy');
  if (source === 'registry') return all.filter(c => c.source === 'registry');
  return all;
}

export function fbPageId(slug) {
  if (FB_DESTINATIONS[slug]) return FB_DESTINATIONS[slug];
  const entry = channels().find((c) => c.slug === slug);
  return entry?.destinations?.fbPageId || undefined;
}

export function getChannel(slug) {
  const c = channels().find((ch) => ch.slug === slug);
  if (!c) return undefined;
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = path.join(ROOT, 'yt-mcp', 'channels', slug, 'token.json');
  return {
    ...c,
    destinations: {
      fbPageId: fbPageId(slug),
      igHandle: c.igHandle || c.destinations?.igHandle || undefined,
      threadsHandle: c.threadsHandle || c.destinations?.threadsHandle || undefined,
      tiktok: c.tiktok || c.destinations?.tiktok || undefined,
    },
    ytAuth: {
      envName,
      tokenFile,
    }
  };
}
