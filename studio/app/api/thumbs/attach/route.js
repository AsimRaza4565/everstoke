// Thumbnail Studio — attach a rendered thumbnail to a video (thumbnails.set).
// Direct from Vercel: per-channel YT tokens already live in Vercel envs.
// Quota guard: max 10 attaches per channel per day (counted from audit log).
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { appendAudit, listAudit } from '@/lib/audit';
import { ENV } from '@/lib/data.mjs';

export const dynamic = 'force-dynamic';

const DAILY_CAP = 10;

async function accessTokenForSlug(slug) {
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

export async function POST(req) {
  const user = await getUser(req);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'not allowed' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, videoId, imageDataUrl } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
    if (!slug || !videoId || !/^data:image\/(jpeg|png);base64,/.test(String(imageDataUrl || ''))) {
      return Response.json({ error: 'slug, videoId and a rendered image are required' }, { status: 400 });
    }
    // Quota guard — count today's attaches for this channel from the audit log.
    try {
      const logs = await listAudit(200);
      const today = new Date().toISOString().slice(0, 10);
      const used = (logs || []).filter((l) => l.action === 'thumbnail set' && String(l.detail || '').startsWith(slug + ' · ') && String(l.at || '').slice(0, 10) === today).length;
      if (used >= DAILY_CAP) return Response.json({ error: `daily attach cap reached for ${slug} (${DAILY_CAP}/day)` }, { status: 429 });
    } catch { } // audit unavailable → allow (quota guard is best-effort)

    const at = await accessTokenForSlug(slug);
    const buf = Buffer.from(String(imageDataUrl).split(',')[1], 'base64');
    if (buf.length > 2 * 1024 * 1024) return Response.json({ error: 'thumbnail exceeds YouTube 2MB — reduce quality' }, { status: 400 });
    const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'image/jpeg', 'Content-Length': String(buf.length) },
      body: buf,
    });
    if (!r.ok) {
      const t = await r.text();
      return Response.json({ error: `YouTube rejected: HTTP ${r.status} ${t.slice(0, 120)}` }, { status: 400 });
    }
    try { await appendAudit(user.email, 'thumbnail set', `${slug} · ${videoId} · ${(buf.length / 1024).toFixed(0)}KB`); } catch { }
    return Response.json({ ok: true, videoId, bytes: buf.length });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'attach failed' }, { status: 500 });
  }
}
