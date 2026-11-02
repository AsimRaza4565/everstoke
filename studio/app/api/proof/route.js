// Public "live proof" feed for /proof — the sales page.
// NO auth (public marketing surface). Heavily cached at this layer because
// YouTube API quota and GitHub rate limits must not scale with page visitors;
// lib/data.mjs adds its own shorter memos underneath.
import { brands, state, ytChannels } from '../../../lib/data.mjs';

export const dynamic = 'force-dynamic';

let memo = null;
let memoAt = 0;
const TTL = 15 * 60 * 1000;

export async function GET() {
  if (memo && Date.now() - memoAt < TTL) return Response.json(memo);
  try {
    const [yt, st] = await Promise.all([ytChannels(), state()]);
    const b = brands();
    const todayStr = new Date().toISOString().slice(0, 10);
    const channels = Object.entries(b)
      .filter(([, k]) => k.active)
      .map(([slug, k]) => {
        const y = yt.find((c) => c.slug === slug) || null;
        const s = st[slug] || {};
        const recent = (s.lastVideos || [])
          .slice(0, 3)
          .map((v) => ({ title: v.title, publishAt: v.publishAt, videoId: v.videoId || null }));
        return {
          slug,
          label: k.label,
          handle: k.handle || '',
          niche: k.niche || '',
          accent: k.accent || '#38BDF8',
          subs: y?.subs ?? null,
          views: y?.views ?? null,
          videos: y?.videos ?? null,
          lastRun: s.lastRunDate || null,
          flowPaused: (s.pausedUntil || '') >= todayStr,
          recent,
        };
      });
    const out = {
      updated: new Date().toISOString(),
      cadence: '1 Short/day + 1 documentary/week per channel · Sunday break day',
      totals: {
        subs: channels.reduce((a, c) => a + (c.subs || 0), 0),
        views: channels.reduce((a, c) => a + (c.views || 0), 0),
        videos: channels.reduce((a, c) => a + (c.videos || 0), 0),
      },
      channels,
    };
    memo = out;
    memoAt = Date.now();
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e.message.slice(0, 80), channels: [] }, { status: 200 });
  }
}
