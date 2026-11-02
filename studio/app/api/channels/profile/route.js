// Saves/updates the profile of a connected channel (label, niche, sub-niches, style,
// voice, slots). Supports both wizard-added channels and existing living channels.
import { requireRole } from '@/lib/route-auth';
import { readRegistry, upsertChannel } from '@/lib/channels-registry';
import { STYLE_BY_ID } from '@/lib/styles-catalog';
import { brands } from '@/lib/data.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!(await requireRole(req, ['owner', 'staff', 'client']))) return Response.json({ error: 'not signed in' }, { status: 401 });

  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });

  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  let entry = (reg.channels || []).find((c) => c.slug === slug);
  if (!entry) {
    // Check legacy living brands
    const bAll = brands() || {};
    const b = bAll[slug];
    if (b) {
      entry = {
        slug,
        label: b.label || slug.toUpperCase(),
        handle: b.handle || '',
        niche: b.niche || '',
        style: b.style || 'cinematic',
        voice: b.voice || 'am_michael',
        accent: b.accent || '#38BDF8',
        slots: Array.isArray(b.slots) ? b.slots : ['22:35'],
        docDay: b.docDay || 'Tue',
        kit: {
          eyebrow: b.eyebrow || '',
          tagline: b.tagline || '',
          tags: Array.isArray(b.tags) ? b.tags : [],
          niches: Array.isArray(b.niches) ? b.niches : (b.niche ? [b.niche] : []),
          description: b.description || '',
        },
        autopilot: true,
      };
    }
  }

  if (!entry) return Response.json({ error: 'channel not found' }, { status: 404 });
  return Response.json({ ok: true, channel: entry });
}

export async function POST(req) {
  if (!(await requireRole(req, ['owner']))) return Response.json({ error: 'not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { slug } = body;
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });

  let reg;
  try {
    reg = await readRegistry();
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  let entry = (reg.channels || []).find((c) => c.slug === slug);
  if (!entry) {
    // If not in registry yet, initialize from living brands so existing channels can be edited!
    const bAll = brands() || {};
    const b = bAll[slug] || {};
    entry = {
      slug,
      label: b.label || slug.toUpperCase(),
      handle: b.handle || '',
      niche: b.niche || '',
      style: b.style || 'cinematic',
      voice: b.voice || 'am_michael',
      accent: b.accent || '#38BDF8',
      slots: Array.isArray(b.slots) ? b.slots : ['22:35'],
      docDay: b.docDay || 'Tue',
      active: true,
      autopilot: true,
      kit: {
        eyebrow: b.eyebrow || '',
        tagline: b.tagline || '',
        tags: Array.isArray(b.tags) ? b.tags : [],
        niches: Array.isArray(b.niches) ? b.niches : (b.niche ? [b.niche] : []),
        description: b.description || '',
      },
    };
    reg.channels = reg.channels || [];
    reg.channels.push(entry);
  }

  if (body.label) entry.label = String(body.label).slice(0, 60);
  if (body.niche != null) entry.niche = String(body.niche).slice(0, 120);
  if (body.style != null) entry.style = STYLE_BY_ID[body.style] ? body.style : '';
  if (body.voice != null) entry.voice = String(body.voice).slice(0, 40);
  if (body.accent != null) entry.accent = /^#[0-9a-fA-F]{6}$/.test(body.accent) ? body.accent : entry.accent;

  // 10-09 ACTIVATION CONSENT: autopilot starts ONLY on explicit consent
  if (body.startAutopilot === true) {
    entry.autopilot = true;
    entry.autopilotStartedAt = new Date().toISOString();
    entry.consentedAt = entry.autopilotStartedAt;
    entry.consent = {
      at: entry.autopilotStartedAt,
      niche: String(body.niche || entry.niche || '').slice(0, 120),
      style: entry.style || '',
      slots: entry.slots || [],
      docDay: entry.docDay || '',
    };
  } else if (body.startAutopilot === false) {
    entry.autopilot = false;
  }

  if (body.docDay != null) {
    entry.docDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(body.docDay) ? body.docDay : (entry.docDay || 'Tue');
  }
  if (body.slots != null) {
    entry.slots = String(body.slots)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  // 10-16 PRODUCT SCALE: sub-niches handling
  const incomingSubNiches = Array.isArray(body.subNiches)
    ? body.subNiches
    : typeof body.subNiches === 'string'
      ? body.subNiches.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

  // Kit configuration
  if (body.kit && typeof body.kit === 'object') {
    const k = body.kit;
    const s = (v, n) => (v != null ? String(v).slice(0, n) : undefined);
    const resolvedNiches = incomingSubNiches || (Array.isArray(k.niches) ? k.niches.slice(0, 12).map((x) => String(x).slice(0, 80)) : undefined);

    entry.kit = {
      ...(entry.kit || {}),
      ...(s(k.eyebrow, 70) != null ? { eyebrow: s(k.eyebrow, 70) } : {}),
      ...(s(k.tagline, 90) != null ? { tagline: s(k.tagline, 90) } : {}),
      ...(s(k.keyword, 60) != null ? { keyword: s(k.keyword, 60) } : {}),
      ...(s(k.kwShort, 40) != null ? { kwShort: s(k.kwShort, 40) } : {}),
      ...(s(k.theme, 80) != null ? { theme: s(k.theme, 80) } : {}),
      ...(resolvedNiches ? { niches: resolvedNiches } : {}),
      ...(s(k.authority, 80) != null ? { authority: s(k.authority, 80) } : {}),
      ...(Array.isArray(k.tags) ? { tags: k.tags.slice(0, 20).map((x) => String(x).slice(0, 50)) } : {}),
      ...(Array.isArray(k.musicFeels) ? { musicFeels: k.musicFeels.slice(0, 5).map((x) => String(x).slice(0, 30)) } : {}),
      ...(s(k.description, 900) != null ? { description: s(k.description, 900) } : {}),
      ...(k.script && typeof k.script === 'object' ? { script: k.script } : {}),
      ...(s(k.longSlot, 5) != null ? { longSlot: s(k.longSlot, 5) } : {}),
    };
  } else if (incomingSubNiches) {
    entry.kit = { ...(entry.kit || {}), niches: incomingSubNiches };
  }

  entry.profileSavedAt = new Date().toISOString();

  try {
    await upsertChannel(entry, `studio: profile for ${slug}`);
    return Response.json({ ok: true, entry });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
