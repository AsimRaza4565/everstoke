// Thumbnail Studio — Pexels photo search proxy (keeps the API key server-side).
import { getUser } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not allowed' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) return Response.json({ photos: [] });
  const key = process.env.PEXELS_API_KEY || '';
  if (!key) return Response.json({ error: 'PEXELS_API_KEY not configured on the server', photos: [] }, { status: 503 });
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return Response.json({ error: `Pexels HTTP ${r.status}`, photos: [] }, { status: 502 });
    const d = await r.json();
    const photos = (d.photos || []).map((p) => ({ url: p.src?.landscape || p.src?.large, thumb: p.src?.tiny, alt: p.alt || q, photographer: p.photographer || '' }));
    return Response.json({ photos });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 100), photos: [] }, { status: 502 });
  }
}
