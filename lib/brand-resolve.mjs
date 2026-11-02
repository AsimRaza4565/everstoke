// 10-05 CHANNEL FACTORY — brand resolution for the engine.
// Legacy 4 channels keep their hand-made kits (yt-brands/brands.mjs). Channels
// added through the Studio wizard live in yt-mcp/studio-channels.json — this
// module turns a registry entry into the SAME shape the engine expects, so a
// wizard-added channel runs with zero code changes. Registry kits contain NO
// secrets (the token lives in the YT_TOKEN_<SLUG> GitHub secret).
import fs from 'node:fs';
import path from 'node:path';

import { bySlug } from '../yt-brands/brands.mjs';

const REG_PATH = path.resolve(process.cwd(), 'yt-mcp', 'studio-channels.json');
// #100 SCHEDULING OVERLAY — Studio writes per-channel cadence (docDays,
// shortDays, shortsSource) to yt-mcp/cadence.json; it merges LAST so it wins
// over both legacy kits and registry entries, without touching kit code.
const CAD_PATH = path.resolve(process.cwd(), 'yt-mcp', 'cadence.json');

// Pure: overlay cadence fields onto a resolved kit (unit-tested).
export function applyCadence(kit, cad) {
  if (!cad || !kit) return kit;
  const out = { ...kit };
  if (Array.isArray(cad.docDays) && cad.docDays.length) out.docDays = cad.docDays;
  if (Array.isArray(cad.shortDays) && cad.shortDays.length) out.shortDays = cad.shortDays;
  if (cad.shortsSource === 'clips' || cad.shortsSource === 'generated') out.shortsSource = cad.shortsSource;
  return out;
}

function cadenceFor(slug) {
  try {
    const cad = JSON.parse(fs.readFileSync(CAD_PATH, 'utf8'));
    return cad[slug] || null;
  } catch { return null; }
}

export function registryToKit(e) {
  const kit = e.kit || {};
  const label = e.label || (e.slug || 'channel').toUpperCase();
  const niche = e.niche || kit.theme || 'everyday wisdom';
  return {
    slug: e.slug,
    label,
    handle: e.handle || '',
    niche,
    cpmTier: 'registry channel',
    accent: e.accent || '#38BDF8',
    bg: kit.bg || '#0A0A0E',
    ink: kit.ink || '#F5F7FA',
    eyebrow: kit.eyebrow || `${niche.toUpperCase()} // ${label.toUpperCase()}`,
    tagline: kit.tagline || '',
    keyword: kit.keyword || niche.toLowerCase(),
    kwShort: kit.kwShort || niche.toLowerCase().split(/\s+/).slice(0, 2).join(' '),
    theme: kit.theme || niche,
    niches: kit.niches?.length ? kit.niches : [niche.toLowerCase()],
    // Fabricate the authority only from a REAL niche/theme — a skeleton
    // registry row (no niche, like the wizard's connect-first save) must yield
    // undefined so resolveBrand's merge falls through to the legacy kit's
    // authority (#101: IC titles read "everyday wisdom Wisdom" because the
    // fabricated default clobbered 'Market Wisdom').
    authority: kit.authority || ((e.niche || kit.theme) ? `${niche} Wisdom` : undefined),
    tags: kit.tags?.length ? kit.tags : parseKeywords(e.ytKeywords) || [niche.toLowerCase()],
    hashtags: kit.tags?.length ? kit.tags.slice(0, 6).map((t) => '#' + String(t).replace(/[^a-z0-9]/gi, '')).join(' ') : '',
    musicFeels: kit.musicFeels || ['inspir', 'calming'],
    musicPool: kit.musicPool || null, // explicit approved titles beat mood rotation
    voice: e.voice || kit.voice || 'am_michael',
    slots: Array.isArray(e.slots) && e.slots.length ? e.slots : ['22:35'],
    longSlot: kit.longSlot || null,
    docDay: e.docDay || kit.docDay || null,
    docDays: Array.isArray(e.docDays) && e.docDays.length ? e.docDays : (Array.isArray(kit.docDays) ? kit.docDays : null),
    shortsSource: e.shortsSource || kit.shortsSource || 'generated',
    description: kit.description || e.ytDescription || '',
    script: kit.script || { targetSeconds: 32, points: 4, lineWords: '9-12', titleStyle: 'numbered listicle + stakes', titleExamples: '"7 Habits That Quietly Set You Apart", "The Rule Nobody Talks About"' },
    active: e.active !== false,
    fromRegistry: true,
  };
}

// YouTube channel keywords come as a messy quoted/comma/space string — split
// into clean tags
function parseKeywords(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  const parts = s.includes('"') ? s.match(/"([^"]+)"/g)?.map((x) => x.replace(/"/g, '')) || [] : [];
  const rest = s.replace(/"[^"]+"/g, ' ').split(/[,\s]+/).filter((w) => w.length > 2);
  return [...new Set([...parts, ...rest])].slice(0, 12);
}

export function resolveBrand(slug) {
  const legacy = bySlug[slug] || null;
  let regEntry = null;
  try {
    const reg = JSON.parse(fs.readFileSync(REG_PATH, 'utf8'));
    const e = (reg.channels || []).find((c) => c.slug === slug);
    if (e) regEntry = registryToKit(e);
  } catch { }

  if (regEntry && legacy) {
    return applyCadence({
      ...legacy,
      ...regEntry,
      niche: regEntry.niche || legacy.niche,
      niches: (regEntry.niches?.length && regEntry.niches[0] !== regEntry.niche) ? regEntry.niches : (legacy.niches || regEntry.niches),
      tags: regEntry.tags?.length ? regEntry.tags : legacy.tags,
      voice: regEntry.voice || legacy.voice,
      slots: regEntry.slots?.length ? regEntry.slots : legacy.slots,
      // #96 cadence: registry value only when present — a registry entry lacking
      // docDays/docDay must not clobber the legacy kit's (null-spread guard)
      docDays: regEntry.docDays?.length ? regEntry.docDays : (legacy.docDays || null),
      docDay: regEntry.docDay || legacy.docDay,
      // #98 shorts source: 'generated' (default) or 'clips' — one-field flip
      shortsSource: regEntry.shortsSource || legacy.shortsSource || 'generated',
      accent: regEntry.accent || legacy.accent,
      authority: regEntry.authority || legacy.authority,
    }, cadenceFor(slug));
  }
  if (regEntry) return applyCadence(regEntry, cadenceFor(slug));
  if (legacy) return applyCadence(legacy, cadenceFor(slug));
  // Unknown slugs return null — callers must fail loudly (#72: silent
  // substitution once sent typo'd slugs to the wrong channel's kit).
}
