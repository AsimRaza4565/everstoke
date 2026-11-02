// 10-08 ROLE-BASED ACCESS — Google sign-in for named users (Phase R1).
// Starts the basic-profile OAuth flow (openid email profile — NON-sensitive
// scopes). The redirect URI /api/auth/google/callback must be registered in
// the Google Cloud Console (one time).
import { ENV } from '@/lib/data.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const clientId = ENV.YOUTUBE_CLIENT_ID;
  if (!clientId) return Response.json({ error: 'server has no Google client configured' }, { status: 500 });
  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID().replace(/-/g, '');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const res = Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.headers.append('Set-Cookie', `qs_gstate=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  return res;
}
