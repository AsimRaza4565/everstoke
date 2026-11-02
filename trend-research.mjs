// Trend research — finds what's going viral RIGHT NOW in a brand's niche and sub-niches.
// search.list (own 100-calls/day bucket) over the last 14 days, ordered by
// views, US region -> pulls full stats/tags -> extracts hot keywords.
// 10-16 PRODUCT SCALE: sub-niche aware rotation — cycles through channel sub-niches
// so every day / slot targets a distinct content pillar instead of repeating static topics.
import fs from 'node:fs';
import { google } from 'googleapis';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'your', 'you', 'this', 'that', 'with', 'how', 'why', 'what', 'is', 'are', 'on', 'my', 'it', 'be', 'not', 'do', 'dont', 'if', 'they', 'their', 'from', 'at', 'as', 'was', 'will', 'no', 'ever', 'best', 'top', 'vs', 'new', '2024', '2025', '2026']);

export async function researchTrend(slug, auth, seeds, cacheDays = 1) {
  const file = `yt-mcp/trends-${slug}.json`;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.at < cacheDays * 86400000) return c;
  } catch { }

  const yt = google.youtube({ version: 'v3', auth });
  const after = new Date(Date.now() - 14 * 86400000).toISOString();

  // 10-16 PRODUCT SCALE: Rotate starting sub-niche by day of year so each day's
  // research targets a fresh pillar from the channel's sub-niches.
  const rawSubNiches = (Array.isArray(seeds) ? seeds : [seeds]).map((s) => String(s || '').trim()).filter(Boolean);
  if (!rawSubNiches.length) rawSubNiches.push('daily motivation');

  const daySlot = Math.floor(Date.now() / 86400000);
  const startIdx = daySlot % rawSubNiches.length;
  const queries = [];

  for (let i = 0; i < rawSubNiches.length; i++) {
    const sn = rawSubNiches[(startIdx + i) % rawSubNiches.length];
    queries.push(sn);
    queries.push(`${sn} explained`);
    queries.push(`${sn} rules`);
    queries.push(`${sn} habits`);
  }

  let ids = null;
  let usedQuery = '';
  let lastErr = null;
  for (const q of queries) {
    try {
      const search = await yt.search.list({
        part: 'snippet', q, order: 'viewCount', publishedAfter: after,
        maxResults: 10, type: 'video', regionCode: 'US', relevanceLanguage: 'en'
      });
      const found = search.data.items.map(i => i.id.videoId).filter(Boolean);
      if (found.length >= 3) { ids = found; usedQuery = q; break; }
      if (found.length && !ids) { ids = found; usedQuery = q; } // keep best-effort
    } catch (e) {
      lastErr = e;
      console.log(`[trend] q="${q}" failed: ${String(e.message).slice(0, 60)}`);
      // quota exhausted / key dead -> every remaining query will fail too; stop now
      if (String(e.message).includes('quotaExceeded') || String(e.message).includes('403')) break;
    }
  }
  if (!ids?.length) throw new Error(lastErr ? `trend search failed: ${String(lastErr.message).slice(0, 60)}` : 'no trend results for any seed');

  const vids = await yt.videos.list({ part: 'snippet,statistics', id: ids.join(',') });
  const videos = vids.data.items.map(v => ({
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    views: Number(v.statistics.viewCount || 0),
    tags: v.snippet.tags || [],
    videoId: v.id
  })).sort((a, b) => b.views - a.views);

  // hot keyword frequency from viral titles + tags
  const freq = {};
  for (const v of videos) {
    const words = (v.title + ' ' + v.tags.slice(0, 10).join(' ')).toLowerCase().match(/[a-z][a-z' ]{2,}/g) || [];
    for (const w of words.join(' ').split(/\s+/)) {
      const t = w.trim();
      if (t.length < 4 || STOP.has(t)) continue;
      freq[t] = (freq[t] || 0) + 1;
    }
  }
  const hotKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0]);
  const activeSubNiche = rawSubNiches.find((sn) => usedQuery.toLowerCase().includes(sn.toLowerCase())) || rawSubNiches[startIdx];

  const trend = {
    at: Date.now(),
    seed: usedQuery,
    activeSubNiche,
    hotKeywords,
    viralChannels: [...new Set(videos.map(v => v.channel))].slice(0, 8),
    videos: videos.slice(0, 10).map(v => ({ title: v.title, channel: v.channel, views: v.views, videoId: v.videoId }))
  };
  fs.writeFileSync(file, JSON.stringify(trend, null, 2));
  return trend;
}
