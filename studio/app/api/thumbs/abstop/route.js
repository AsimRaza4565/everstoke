// F5 — stop an A/B test (keeps the currently-live variant).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { appendAudit } from '@/lib/audit';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { videoId } = body || {};
  if (!videoId) return Response.json({ error: 'videoId required' }, { status: 400 });
  const t0 = (await readRepoJSON('yt-mcp/thumb-tests.json'))?.[videoId];
  if (t0 && !(await canAccessChannelSlug(user, t0.slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const state = (await readRepoJSON('yt-mcp/thumb-tests.json')) || {};
  if (!state[videoId]) return Response.json({ error: 'no test for this video' }, { status: 404 });
  state[videoId].ended = new Date().toISOString();
  await writeRepoJSON('yt-mcp/thumb-tests.json', state, `thumb-test: ${videoId} stopped`);
  try { await appendAudit(user.email, 'thumbnail A/B stopped', `${state[videoId].slug} · ${videoId}`); } catch { }
  return Response.json({ ok: true, videoId });
}
