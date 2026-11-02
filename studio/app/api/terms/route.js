// Real "what viewers typed into YouTube search" terms, per channel — the data
// the Analytics page's search card renders. Written to yt-mcp/terms-<slug>.json
// by the CI engine (viewer-terms.mjs, verified 10-03). No dummy fallbacks.
import { terms } from '../../../lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';

export const dynamic = 'force-dynamic';

const SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  // clients only see channels linked to their account (issue #60 — this route
  // previously had no auth at all; a client could read another client's
  // channel's viewer search terms)
  const owned = user.role === 'client' ? ((await slugsForUser(user).catch(() => null)) || []) : null;
  const slug = new URL(req.url).searchParams.get('slug') || 'all';
  const wanted = (slug === 'all' ? SLUGS : [slug]).filter((s) => !owned || owned.includes(s));
  if (!wanted.length) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const merged = new Map();
  const perChannel = {};
  let any = false;
  for (const s of wanted) {
    try {
      const d = await terms(s);
      const rows = (d?.rows || d?.terms || []).map((r) => ({
        term: String(r.term || r[0] || ''),
        views: Number(r.views ?? r[1] ?? 0),
      })).filter((r) => r.term);
      perChannel[s] = rows;
      if (rows.length) any = true;
      for (const r of rows) merged.set(r.term, (merged.get(r.term) || 0) + r.views);
    } catch {
      perChannel[s] = [];
    }
  }
  const all = [...merged.entries()]
    .map(([term, views]) => ({ term, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);
  return Response.json({ slug, terms: slug === 'all' ? all : perChannel[slug] || [], hasData: any });
}
