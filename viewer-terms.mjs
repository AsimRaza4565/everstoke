// Viewer search terms — the legal version of the Studio "Research" tab.
// YouTube Analytics API (yt-analytics.readonly): what your own viewers typed
// into YouTube search that led them to YOUR videos, last 28 days, per channel.
// Dimension = insightTrafficSourceDetail with insightTrafficSourceType==YT_SEARCH
// (verified 10-03 — 'searchTerm' as a dimension is NOT supported by the API).
// Saved to yt-mcp/terms-<slug>.json (cached 3 days like trends).
import fs from 'node:fs';

export async function viewerTerms(slug, auth, cacheDays = 3, nicheWords = []) {
  const file = `yt-mcp/terms-${slug}.json`;
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - c.at < cacheDays * 86400000) return c;
  } catch { }

  // Plain fetch — the googleapis client 500s on this report combo; the exact
  // hand-built request is proven (verified 10-03 on all 4 channels).
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const qs = new URLSearchParams({
    ids: 'channel==MINE',
    startDate: start,
    endDate: end,
    metrics: 'views',
    dimensions: 'insightTrafficSourceDetail',
    sort: '-views',
    maxResults: '25',
    filters: 'insightTrafficSourceType==YT_SEARCH',
  });
  const at = await auth.getAccessToken();
  const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, {
    headers: { Authorization: `Bearer ${at.token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`analytics ${res.status}: ${body.slice(0, 100)}`);
  }
  const data = await res.json();
  const rows = (data.rows || []).map((r) => ({ term: String(r[0]).slice(0, 60), views: Number(r[1] || 0) }));
  if (!rows.length) throw new Error('no search terms returned (new channel or no YT_SEARCH traffic)');

  // Prefer on-niche terms: viewer words that overlap the channel's niches/tags
  // jump the queue; generic long-tail noise (sports, celebrity one-offs) sinks.
  const words = nicheWords.map((w) => String(w).toLowerCase());
  const scored = rows
    .map((r) => ({
      ...r,
      score: r.views + (words.some((w) => w && r.term.toLowerCase().includes(w)) ? 100 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const out = { at: Date.now(), terms: scored.slice(0, 10).map(({ term, views }) => ({ term, views })) };
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  return out;
}
