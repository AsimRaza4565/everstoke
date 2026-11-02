// F9 — per-channel thumbnail brand defaults (accent, shade, chip, eyebrow,
// default template). Stored encrypted-free (non-secret branding) in
// yt-mcp/thumb-branding.json via the repo. Owner/staff: any channel;
// clients: their bound channel. The /thumbs editor loads these as defaults.
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { TEMPLATES } from '@/lib/thumb-templates';
import { isV2Template } from '@/lib/thumb-templates-v2';

export const dynamic = 'force-dynamic';

const FILE = 'yt-mcp/thumb-branding.json';

const loadFile = async () => (await readRepoJSON(FILE)) || {};

const clean = (b) => ({
  accent: /^#[0-9a-fA-F]{6}$/.test(b.accent || '') ? b.accent : null,
  shade: /^#[0-9a-fA-F]{6}$/.test(b.shade || '') ? b.shade : null,
  chip: String(b.chip || '').slice(0, 24),
  eyebrow: String(b.eyebrow || '').slice(0, 40),
  // accept any template the gallery actually offers (was hardcoded to 3 of
  // the 28 — other saves silently nulled out while the UI claimed success;
  // issue #71)
  template: TEMPLATES[b.template] || isV2Template(b.template) ? b.template : null,
  // template rotation: each bulk-rendered video picks templates[i % len]
  templateRotation: Array.isArray(b.templateRotation)
    ? b.templateRotation.filter((id) => TEMPLATES[id] || isV2Template(id)).slice(0, 10)
    : undefined,
});

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const entry = (await loadFile())[slug] || {};
  return Response.json({ slug, branding: clean(entry) });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { slug, ...branding } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const file = await loadFile();
  file[slug] = { ...(file[slug] || {}), ...clean(branding), updated: new Date().toISOString(), updatedBy: user.email };
  await writeRepoJSON(FILE, file, `thumb-branding: ${slug} updated`);
  try { await appendAudit(user.email, 'thumb branding set', slug); } catch { }
  return Response.json({ ok: true, slug, branding: clean(file[slug]) });
}
