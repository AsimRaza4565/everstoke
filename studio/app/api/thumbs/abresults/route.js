// F5/F7 — A/B results + per-video performance. Metrics: views/day and
// average watch % (impressions CTR is YPP-only; upgrade when channels monetize).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug, slugsForUser } from '@/lib/access';
import { readRepoJSON } from '@/lib/channels-registry';
import { videoDaily } from '@/lib/yt-attach';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';
  if (slug && !(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  // no-slug listing previously leaked EVERY channel's A/B analytics to any
  // client role — clients now see only their own channels' tests (issue #60)
  const owned = user.role === 'client' ? ((await slugsForUser(user).catch(() => null)) || []) : null;
  try {
    const state = (await readRepoJSON('yt-mcp/thumb-tests.json')) || {};
    const tests = [];
    for (const [videoId, t] of Object.entries(state)) {
      if (slug && t.slug !== slug) continue;
      if (owned && !owned.includes(t.slug)) continue;
      const start = (t.periods?.[0]?.from || t.started || '').slice(0, 10);
      const end = new Date().toISOString().slice(0, 10);
      const days = start ? await videoDaily(t.slug, videoId, start, end) : [];
      // split days into variants: variant changes at each period boundary and
      // every intervalHours after start.
      const startMs = new Date(t.periods?.[0]?.from || t.started).getTime();
      const per = (t.intervalHours || 48) * 3600000;
      const byVariant = {};
      const letter = (i) => ['A', 'B', 'C'][i] || String(i);
      for (const row of days) {
        const idx = Math.floor((new Date(row.day + 'T12:00:00Z').getTime() - startMs) / per) % t.variants.length;
        const key = letter(idx);
        byVariant[key] = byVariant[key] || { views: 0, days: 0, pctSum: 0, pctN: 0 };
        byVariant[key].views += row.views;
        byVariant[key].days += 1;
        if (row.avgPct) { byVariant[key].pctSum += row.avgPct; byVariant[key].pctN += 1; }
      }
      const variants = Object.entries(byVariant).map(([k, v]) => ({
        variant: k, views: v.views, days: v.days,
        viewsPerDay: v.days ? Math.round((v.views / v.days) * 10) / 10 : 0,
        avgPct: v.pctN ? Math.round((v.pctSum / v.pctN) * 10) / 10 : null,
      }));
      tests.push({
        videoId, slug: t.slug, title: t.title, started: t.started, ended: t.ended,
        intervalHours: t.intervalHours, current: ['A', 'B', 'C'][t.current] || t.current,
        variantsCount: t.variants.length, variantMetrics: variants,
      });
    }
    tests.sort((a, b) => String(b.started).localeCompare(String(a.started)));
    return Response.json({ tests, metric: 'views/day + avg watch % (CTR unlocks when the channel joins YPP)' });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'failed', tests: [] }, { status: 500 });
  }
}
