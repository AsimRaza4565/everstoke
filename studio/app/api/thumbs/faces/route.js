// Per-channel face library (issue #92 follow-up, owner request 10-18):
// GET    ?slug            -> faces as dataURLs (for the /thumbs picker)
// POST   {slug, dataUrl}  -> store as yt-mcp/branding-assets/<slug>/face-<ts>.jpg
//                            (max 10), record path in thumb-branding.json faces[]
// DELETE ?slug&idx        -> remove from faces[] (+ repo file)
// Faces rotate across every video thumbnail the channel renders (bulk picks
// faces[i % faces.length]; the v2 renderer composites a circular cutout).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { writeRepoBinary, readRepoBinary, deleteRepoBinary } from '@/lib/repo-files';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FILE = 'yt-mcp/thumb-branding.json';
const ASSET_DIR = 'yt-mcp/branding-assets';
const MAX_FACES = 10;

const loadFile = async () => (await readRepoJSON(FILE)) || {};

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const faces = (await loadFile())[slug]?.faces || [];
  const out = [];
  for (const file of faces) {
    try {
      const buf = await readRepoBinary(file);
      if (buf) out.push({ file, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` });
    } catch { }
  }
  return Response.json({ slug, faces: out });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '');
  const dataUrl = String(body.dataUrl || '');
  if (!slug) return Response.json({ error: 'slug required' }, { status: 400 });
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const m = dataUrl.match(/^data:image\/(jpeg|png);base64,([\s\S]+)$/);
  if (!m) return Response.json({ error: 'dataUrl must be a base64 jpeg/png' }, { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) return Response.json({ error: 'image exceeds 3MB' }, { status: 400 });

  const file = await loadFile();
  const faces = file[slug]?.faces || [];
  if (faces.length >= MAX_FACES) return Response.json({ error: `face library full (${MAX_FACES} max) — remove one first` }, { status: 400 });

  const name = `face-${Date.now()}.jpg`;
  const repoPath = `${ASSET_DIR}/${slug}/${name}`;
  await writeRepoBinary(repoPath, buf, `branding: face added for ${slug} by ${user.email}`);
  const next = [...faces, repoPath];
  file[slug] = { ...(file[slug] || {}), faces: next, updated: new Date().toISOString(), updatedBy: user.email };
  await writeRepoJSON(FILE, file, `thumb-branding: face library ${slug} (${next.length})`);
  try { await appendAudit(user.email, 'face library add', `${slug} · ${buf.length} bytes`); } catch { }
  return Response.json({ ok: true, slug, faces: next, bytes: buf.length });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';
  const idx = Number(url.searchParams.get('idx'));
  if (!slug || Number.isNaN(idx)) return Response.json({ error: 'slug and idx required' }, { status: 400 });
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const file = await loadFile();
  const faces = file[slug]?.faces || [];
  if (idx < 0 || idx >= faces.length) return Response.json({ error: 'bad idx' }, { status: 400 });
  const [removed] = faces.splice(idx, 1);
  if (removed) await deleteRepoBinary(removed, `branding: face removed for ${slug} by ${user.email}`).catch(() => { });
  file[slug] = { ...(file[slug] || {}), faces, updated: new Date().toISOString(), updatedBy: user.email };
  await writeRepoJSON(FILE, file, `thumb-branding: face removed ${slug}`);
  try { await appendAudit(user.email, 'face library remove', `${slug} idx ${idx}`); } catch { }
  return Response.json({ ok: true, slug, faces });
}
