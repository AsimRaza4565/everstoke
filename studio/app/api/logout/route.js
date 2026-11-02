// Clears the studio session cookies AND revokes the current A1 session row.
// No auth required — even a stale or half-valid cookie must always be clearable.
import { revokeToken } from '@/lib/session-db';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  try {
    const cookies = req.headers.get('cookie') || '';
    const token = cookies.match(/qs_session=([^;]+)/)?.[1] || '';
    if (token && !token.includes('.')) await revokeToken(decodeURIComponent(token));
  } catch { }
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `qs_key=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  res.headers.append('Set-Cookie', `qs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return res;
}
