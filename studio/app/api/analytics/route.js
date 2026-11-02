// Real per-channel YouTube analytics (28 days) via the Analytics API —
// needs the yt-analytics.readonly scope (re-auth completed 10-03).
// Plain-fetch requests (the googleapis client 500s on some report combos).
// Cached 1 hour — analytics data updates daily anyway.
import fs from 'node:fs';
import path from 'node:path';
import { ENV, ytTokenRaw } from '../../../lib/data.mjs';
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';

export const dynamic = 'force-dynamic';

const SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];
const cache = { at: 0, data: null };

async function accessToken(slug) {
  // 10-08: env (legacy) → local file → encrypted registry token (wizard channels)
  const raw = await ytTokenRaw(slug);
  if (!raw) throw new Error(`no token for ${slug}`);
  const t = JSON.parse(raw);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ENV.YOUTUBE_CLIENT_ID,
      client_secret: ENV.YOUTUBE_CLIENT_SECRET,
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('no access token');
  return d.access_token;
}

async function report(at, params) {
  const qs = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  if (!res.ok) throw new Error(`analytics ${res.status}: ${(await res.text()).slice(0, 80)}`);
  return (await res.json()).rows || [];
}

function durSeconds(iso) {
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

async function channelAnalytics(slug, auth) {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const base = { startDate: start, endDate: end };

  const totalsRows = await report(auth, { ...base, metrics: 'views,estimatedMinutesWatched,subscribersGained,averageViewPercentage' });
  const [views = 0, watchMinutes = 0, subsGained = 0, avgWatched = 0] = (totalsRows[0] || []).map(Number);

  let daily = [];
  try {
    const rows = await report(auth, { ...base, metrics: 'views', dimensions: 'day' });
    daily = rows.map((r) => ({ date: r[0], views: Number(r[1] || 0) }));
  } catch { }

  // Shorts vs long-form: per-video views, classified by duration (<=61s = Short)
  let shortsViews = 0, longViews = 0;
  try {
    const rows = await report(auth, { ...base, metrics: 'views', dimensions: 'video', sort: '-views', maxResults: '100' });
    const ids = rows.map((r) => r[0]).filter(Boolean);
    if (ids.length) {
      // videos.list breaks on very long id lists — chunk by 50
      const shortIds = new Set();
      for (let i = 0; i < ids.length; i += 50) {
        const vres = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.slice(i, i + 50).join(',')}`, {
          headers: { Authorization: `Bearer ${auth}` },
        });
        if (!vres.ok) continue;
        const vd = await vres.json();
        for (const v of vd.items || []) if (durSeconds(v.contentDetails.duration) <= 61) shortIds.add(v.id);
      }
      for (const r of rows) {
        if (shortIds.has(r[0])) shortsViews += Number(r[1] || 0);
        else longViews += Number(r[1] || 0);
      }
    }
  } catch (e) { console.error('[split] failed:', String(e.message).slice(0, 120)); }

  // audience: gender / age / top countries
  const dim = async (dimension) => {
    try {
      const rows = await report(auth, { ...base, metrics: 'views', dimensions: dimension, sort: '-views', maxResults: '10' });
      return rows.map((r) => ({ key: String(r[0]), views: Number(r[1] || 0) }));
    } catch { return []; }
  };
  const [gender, age, countries] = await Promise.all([dim('gender'), dim('ageGroup'), dim('country')]);

  return { slug, range: 28, totals: { views, watchHours: Math.round((watchMinutes / 60) * 10) / 10, subsGained }, avgWatched: Math.round(avgWatched * 10) / 10, daily, split: { shortsViews, longViews }, audience: { gender, age, countries } };
}

export async function GET(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || 'all';
  const fresh = url.searchParams.get('fresh') === '1';
  // 10-08 CHANNEL FACTORY: wizard channels join the analytics panel
  let allSlugs = [...SLUGS];
  try {
    const { registryChannels } = await import('../../../lib/channels-registry.js');
    for (const e of await registryChannels()) if (!SLUGS.includes(e.slug)) allSlugs.push(e.slug);
  } catch { }
  // 10-08 P2 CLIENT ROLE: clients only ever get their own channels' numbers.
  // Resolve the requester's scope BEFORE touching the cache — the cache is
  // keyed on that scope so it can never leak data across users/roles
  // (issue #47: one module-level cache returned client aggregates to the
  // owner, owner aggregates to clients, and null to users whose scope
  // differed from whoever populated it).
  const user = await getUser(req).catch(() => null);
  const owned = user ? await slugsForUser(user).catch(() => null) : null;
  if (owned) allSlugs = allSlugs.filter((s) => owned.includes(s));
  const scopeKey = [...allSlugs].sort().join(',');

  if (!fresh && cache.data && cache.scope === scopeKey && Date.now() - cache.at < 3600_000) {
    const d = cache.data;
    return Response.json(slug === 'all' ? d.all : d.channels[slug] || null);
  }
  const channels = {};
  const all = { slug: 'all', range: 28, totals: { views: 0, watchHours: 0, subsGained: 0 }, daily: [], split: { shortsViews: 0, longViews: 0 }, audience: { gender: [], age: [], countries: [] } };
  for (const s of allSlugs) {
    try {
      const at = await accessToken(s);
      const c = await channelAnalytics(s, at);
      channels[s] = c;
      all.totals.views += c.totals.views;
      all.totals.watchHours += c.totals.watchHours;
      all.totals.subsGained += c.totals.subsGained;
      all.split.shortsViews += c.split.shortsViews;
      all.split.longViews += c.split.longViews;
    } catch (e) {
      channels[s] = { slug: s, range: 28, error: String(e.message).slice(0, 100), totals: { views: 0, watchHours: 0, subsGained: 0 }, daily: [], split: { shortsViews: 0, longViews: 0 }, audience: { gender: [], age: [], countries: [] } };
    }
  }
  // aggregate daily across channels (aligned by date)
  const byDate = new Map();
  for (const c of Object.values(channels)) {
    for (const d of c.daily) {
      const cur = byDate.get(d.date) || 0;
      byDate.set(d.date, cur + d.views);
    }
  }
  all.daily = [...byDate.entries()].map(([date, views]) => ({ date, views })).sort((a, b) => a.date.localeCompare(b.date));
  // aggregate audience across channels
  const agg = (list) => {
    const m = new Map();
    for (const c of Object.values(channels)) for (const a of c.audience[list] || []) m.set(a.key, (m.get(a.key) || 0) + a.views);
    return [...m.entries()].map(([key, views]) => ({ key, views })).sort((a, b) => b.views - a.views).slice(0, 10);
  };
  all.audience = { gender: agg('gender'), age: agg('age'), countries: agg('countries') };
  all.totals.watchHours = Math.round(all.totals.watchHours * 10) / 10;
  // per-channel slim map so one request can feed per-channel charts (Overview)
  const slim = {};
  for (const c of Object.values(channels)) {
    if (c.error) continue;
    slim[c.slug] = { totals: c.totals, avgWatched: c.avgWatched, daily: c.daily };
  }
  all.channels = slim;
  // view-weighted average-watched across channels
  const wv = Object.values(slim);
  const wViews = wv.reduce((a, c) => a + c.totals.views, 0);
  all.avgWatched = wViews
    ? Math.round((wv.reduce((a, c) => a + c.avgWatched * c.totals.views, 0) / wViews) * 10) / 10
    : 0;

  cache.at = Date.now();
  cache.scope = scopeKey;
  cache.data = { channels, all };
  return Response.json(slug === 'all' ? all : channels[slug] || null);
}
