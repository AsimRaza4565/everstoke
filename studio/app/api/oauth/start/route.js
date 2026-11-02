// Starts the Google login for "Add Channel".
// Same Google client + scopes the CLI oauth-reauth.mjs uses, but the redirect
// comes back to Studio instead of localhost. Google's own chooser handles the
// "several YouTube channels on one Gmail" case: the user picks ONE channel
// per login; run the wizard again for each extra channel.
// ?mode=link → mints a COPYABLE connect link (signed, expires in 15 min)
// whose callback works in ANY browser — even one without a Studio session.
import { ENV } from '@/lib/data.mjs';
import { requireRole } from '@/lib/route-auth';
import { hmacToken } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

export const YT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export async function GET(req) {
  // minting connect links touches channel keys — owner only
  if (!(await requireRole(req, ['owner']))) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }
  const clientId = ENV.YOUTUBE_CLIENT_ID;
  const clientSecret = ENV.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json(
      { error: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set on the server.' },
      { status: 500 },
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/oauth/callback`;
  const linkMode = new URL(req.url).searchParams.get('mode') === 'link';

  // link mode: signed expiring state (L.<expiry>.<hmac>) — the callback can
  // verify it in ANY browser; no cookie, no server-side storage.
  // #58: fail closed — without STUDIO_PASSWORD the link cannot be signed
  if (!process.env.STUDIO_PASSWORD) {
    return Response.json({ error: 'connect links are unavailable: STUDIO_PASSWORD is not configured on the server' }, { status: 503 });
  }
  const state = linkMode
    // #58: connect links sign with STUDIO_PASSWORD only — never CI-held secrets
    ? `L.${Date.now() + 15 * 60 * 1000}.${await hmacToken(String(Date.now() + 15 * 60 * 1000), process.env.STUDIO_PASSWORD)}`
    : crypto.randomUUID().replace(/-/g, '');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YT_SCOPES.join(' '),
    access_type: 'offline',
    // select_account → always show the Google chooser (needed when one Gmail
    // owns several channels/mails), consent → always issue a refresh token.
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });

  const res = Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, redirectUri, mode: linkMode ? 'link' : 'session' });
  if (!linkMode) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.headers.append('Set-Cookie', `qs_oauth=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
  }
  return res;
}
