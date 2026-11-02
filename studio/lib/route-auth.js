import { authToken } from './auth-token';
import { parseSessionCookie, parseSession } from './session';
import { userByToken } from './session-db';
import { dbReady } from './db.mjs';

// resolves the signed-in user: { email, role, name, session_id } — or null.
// A1: qs_session carries signed claims; the opaque token inside is validated
// against the Neon sessions table (revocation = instant). Legacy HMAC cookies
// are still honored until their natural expiry.
export async function getUser(req) {
  // dev convenience mirrors proxy.js: gate open outside Vercel without a password
  if (!process.env.STUDIO_PASSWORD && !process.env.VERCEL) {
    return { email: 'owner', role: 'owner', name: 'Owner (dev)', session_id: 0 };
  }

  const cookies = req.headers.get('cookie') || '';
  const m = cookies.match(/qs_session=([^;]+)/);
  if (m) {
    const raw = decodeURIComponent(m[1]);
    const claims = await parseSessionCookie(raw);
    if (claims) {
      // opaque token → the DB decides (revocation, expiry, freshest role)
      const s = await userByToken(claims.t);
      if (s) return { email: s.email, role: s.role, name: s.name || claims.n || s.email, session_id: s.id };
      // DB unreachable → trust the signed claims rather than lock the owner out
      if (dbReady) return null;
      return { email: claims.e, role: claims.r, name: claims.n || claims.e, session_id: 0 };
    }
    // legacy HMAC session (pre-A1) — valid until natural expiry
    const legacy = await parseSession(raw);
    if (legacy) return { email: legacy.email, role: legacy.role, name: legacy.name || legacy.email, session_id: 0 };
  }
  if (process.env.STUDIO_PASSWORD) {
    const legacy = await authToken(process.env.STUDIO_PASSWORD);
    if (cookies.includes(`qs_key=${legacy}`)) return { email: 'owner', role: 'owner', name: 'Owner', session_id: 0 };
  }
  return null;
}

export async function getRole(req) {
  const u = await getUser(req);
  return u?.role || null;
}

export async function requireRole(req, roles) {
  const role = await getRole(req);
  return roles.includes(role) ? role : null;
}

// legacy helper — any signed-in role
export async function isAuthed(req) {
  return Boolean(await getRole(req));
}
