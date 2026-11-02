import { authToken } from '@/lib/auth-token';
import { signSessionCookie } from '@/lib/session';
import { createSession, recentFailures, recordLoginAttempt } from '@/lib/session-db';
import { accessList } from '@/lib/access';

export const dynamic = 'force-dynamic';

// 10-09 A1: password login = OWNER session. Throttle is now SHARED (Neon
// login_attempts table) — 5 wrong tries per IP in 15 minutes locks the IP for
// 10 minutes across all servers.
export async function POST(req) {
  const ip = ((req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim() || 'local').slice(0, 60);
  const expected = process.env.STUDIO_PASSWORD;
  if (!expected) {
    return Response.json({ error: 'Server has no STUDIO_PASSWORD set — add it in the hosting dashboard.' }, { status: 500 });
  }

  const fails = await recentFailures(ip);
  if (fails >= 5) {
    return Response.json({ error: 'Too many attempts — locked for 10 minutes.' }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({}));
  if (!password || password !== expected) {
    await recordLoginAttempt(ip, false);
    const left = Math.max(0, 5 - (fails + 1));
    return Response.json({ error: `Wrong password.${left ? ` ${left} tries left this window.` : ' Locked for 10 minutes.'}` }, { status: 401 });
  }
  await recordLoginAttempt(ip, true);

  const ua = (req.headers.get('user-agent') || '').slice(0, 200);
  // #58: fail closed — without STUDIO_PASSWORD the session signer refuses
  if (!process.env.STUDIO_PASSWORD) {
    return Response.json({ error: 'login is unavailable: STUDIO_PASSWORD is not configured on the server' }, { status: 503 });
  }
  // the owner's REAL email comes from the invite list (sessions/audit show it;
  // the email='owner' placeholder broke the sessions list guard)
  const ownerUser = (await accessList().catch(() => [])).find((u) => u.role === 'owner') || { email: 'owner', role: 'owner', name: 'Owner' };
  const { token } = await createSession({ email: ownerUser.email, role: 'owner', name: ownerUser.name || 'Owner', userAgent: ua, ip });
  const legacy = await authToken(expected);
  console.log(`[audit] password sign-in: ${ownerUser.email} (owner)`);

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const res = Response.json({ ok: true, role: 'owner' });
  const maxAge = 60 * 60 * 24 * 30;
  // legacy cookie kept for backward compatibility; A1 opaque session is primary
  res.headers.append('Set-Cookie', `qs_key=${legacy}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  if (token) {
    // signed claims wrapper: the Edge gate verifies cheaply, the routes
    // resolve the real (revocable) session from the opaque token inside
    const expMs = Date.now() + maxAge * 1000;
    const cookieValue = await signSessionCookie({ t: token, e: ownerUser.email, r: 'owner', n: ownerUser.name || 'Owner', x: expMs });
    res.headers.append('Set-Cookie', `qs_session=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  }
  return res;
}
