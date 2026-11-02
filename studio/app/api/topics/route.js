// 10-05 PHASE B — TOPIC DESK API.
// GET  /api/topics?slug=  → research candidates (trend videos + real viewer
//                            search terms) + the channel's approved queue
// POST /api/topics        → { slug, action: 'add'|'remove', ... }
// The queue (yt-mcp/topics-<slug>.json, committed to the repo) is consumed by
// yt-daily BEFORE auto-research — one approved topic per slot per day.
import { getUser } from '@/lib/route-auth';
import { trend, terms } from '../../../lib/data.mjs';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { slugsForUser } from '@/lib/access';
import { appendAudit } from '../../../lib/audit.js';

export const dynamic = 'force-dynamic';

const queuePath = (slug) => `yt-mcp/topics-${slug}.json`;

// 10-08 P2 CLIENT ROLE: clients may only touch their own channels' queues
async function guard(req, slug) {
  const user = await getUser(req);
  if (!user) return 'not signed in';
  const owned = await slugsForUser(user).catch(() => null);
  if (owned && !owned.includes(slug)) return 'not your channel';
  return null;
}

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });
  const denied = await guard(req, slug);
  if (denied) return Response.json({ error: denied, trends: [], terms: [], queue: [] }, { status: 403 });

  const [tr, tm, queueFile] = await Promise.all([
    trend(slug).catch(() => null),
    terms(slug).catch(() => null),
    readRepoJSON(queuePath(slug)).catch(() => null),
  ]);

  return Response.json({
    slug,
    trends: (tr?.videos || []).map((v) => ({ title: v.title, channel: v.channel, views: v.views })),
    hotKeywords: tr?.hotKeywords || [],
    terms: tm?.terms || [],
    queue: queueFile?.queue || [],
    researchAt: tr?.at || null,
  });
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff', 'client'].includes(user.role)) return Response.json({ error: 'not signed in' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { slug, action } = body;
  if (!slug) return Response.json({ error: 'missing slug' }, { status: 400 });
  const denied = await guard(req, slug);
  if (denied) return Response.json({ error: denied }, { status: 403 });

  const file = queuePath(slug);
  const q = (await readRepoJSON(file).catch(() => null)) || { at: 0, queue: [] };
  const queue = Array.isArray(q.queue) ? q.queue : [];

  if (action === 'add') {
    const items = (body.topics || [])
      .map((t) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: ['seed', 'search', 'custom'].includes(t.kind) ? t.kind : 'custom',
        text: String(t.text || '').slice(0, 200),
        addedAt: new Date().toISOString(),
      }))
      .filter((t) => t.text);
    if (!items.length) return Response.json({ error: 'nothing to add' }, { status: 400 });
    // dedupe against queue by text
    const seen = new Set(queue.map((t) => t.text.toLowerCase()));
    const fresh = items.filter((t) => !seen.has(t.text.toLowerCase()));
    await writeRepoJSON(file, { at: Date.now(), queue: [...queue, ...fresh] }, `topic desk: +${fresh.length} for ${slug}`);
    await appendAudit(user.email, 'topic-approve', fresh.map((t) => t.text.slice(0, 40)).join(' | ').slice(0, 140) + ` → ${slug}`);
    return Response.json({ ok: true, added: fresh.length, queue: [...queue, ...fresh] });
  }

  if (action === 'remove') {
    const next = queue.filter((t) => t.id !== body.id);
    await writeRepoJSON(file, { at: Date.now(), queue: next }, `topic desk: -1 for ${slug}`);
    await appendAudit(user.email, 'topic-remove', `${slug}`);
    return Response.json({ ok: true, queue: next });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
