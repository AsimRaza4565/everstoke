// Shared YouTube thumbnail attach + token helpers (server-side, Vercel-safe).
// Tokens: per-channel refresh tokens already live on Vercel (YT_TOKEN_*) or in
// yt-mcp/channels/<slug>/token.json locally.
import { ENV } from '@/lib/data.mjs';

export async function accessTokenForSlug(slug) {
  const { ytTokenRaw } = await import('@/lib/data.mjs');
  const raw = await ytTokenRaw(slug);
  if (!raw) throw new Error('no YouTube token for ' + slug);
  const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
  if (!r.ok) throw new Error('token refresh failed: HTTP ' + r.status);
  return (await r.json()).access_token;
}

// YouTube thumbnails.set — 50 quota units per call. Buffer must be JPEG/PNG ≤2MB.
export async function attachThumb(slug, videoId, buffer) {
  if (buffer.length > 2 * 1024 * 1024) throw new Error('thumbnail exceeds YouTube 2MB');
  const at = await accessTokenForSlug(slug);
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'image/jpeg', 'Content-Length': String(buffer.length) },
    body: buffer,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`YouTube rejected: HTTP ${r.status} ${t.slice(0, 120)}`);
  }
  return true;
}

// Analytics daily rows for one video (views + avg watch %). CTR metrics are
// YPP-only (parser rejects them for non-partner channels) — unlock when channels
// monetize by adding ',impressions,impressionsCtrRatio' to metrics.
export async function videoDaily(slug, videoId, startDate, endDate) {
  const at = await accessTokenForSlug(slug);
  const u = `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${startDate}&endDate=${endDate}&metrics=${encodeURIComponent('views,averageViewPercentage')}&dimensions=day&filters=video%3D%3D${encodeURIComponent(videoId)}`;
  const r = await fetch(u, { headers: { Authorization: `Bearer ${at}` } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.rows || []).map((row) => ({ day: row[0], views: row[1], avgPct: row[2] }));
}
