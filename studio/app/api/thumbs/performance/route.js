// F7 — per-video performance board: 28-day views + average watch % for the
// channel's recent uploads, ranked. (CTR unlocks at YPP — see abresults.)
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { videoDaily } from '@/lib/yt-attach';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (slug && !(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  if (!slug) return Response.json({ error: 'slug required' }, { status: 400 });
  try {
    const { ytTokenRaw } = await import('@/lib/data.mjs');
    const raw = await ytTokenRaw(slug);
    if (!raw) return Response.json({ videos: [], error: 'no token' });
    const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
    });
    const at = (await tr.json()).access_token;
    const h = { Authorization: `Bearer ${at}` };
    const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: h })).json();
    const up = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!up) return Response.json({ videos: [] });
    const items = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=10&playlistId=${up}`, { headers: h })).json();
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
    const videos = [];
    for (const i of (items.items || [])) {
      const vid = i.snippet.resourceId.videoId;
      const days = await videoDaily(slug, vid, start, end);
      const views = days.reduce((a, r2) => a + r2.views, 0);
      const pctN = days.filter((r2) => r2.avgPct);
      videos.push({
        videoId: vid,
        title: i.snippet.title,
        publishedAt: i.snippet.publishedAt,
        thumb: i.snippet.thumbnails?.medium?.url || '',
        views28: views,
        viewsPerDay: days.length ? Math.round((views / days.length) * 10) / 10 : 0,
        avgPct: pctN.length ? Math.round((pctN.reduce((a, r2) => a + r2.avgPct, 0) / pctN.length) * 10) / 10 : null,
      });
    }
    videos.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
    return Response.json({ videos, metric: 'views/day + avg watch %, last 28 days (CTR unlocks at YPP)' });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140), videos: [] }, { status: 500 });
  }
}
