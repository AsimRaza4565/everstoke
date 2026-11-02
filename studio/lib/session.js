// 10-09 A1 SESSION COOKIE — signed claims + opaque token, verifiable in the
// Edge proxy (cheap HMAC gate) AND resolvable to a revocable DB session in
// every route (the truth lives in Neon sessions table).
//   cookie = hex(json{ t, e, r, n, x }).hmac(hexjson)
//   t = opaque session token (DB-backed, revocable) · e = email · r = role
//   n = name · x = expiry ms
// Legacy pre-A1 cookies (HMAC json without t) still parse via parseSession.
import { hmacToken } from './auth-token';

// #58: key material is STUDIO_PASSWORD ONLY. The old fallback chain
// (YOUTUBE_CLIENT_SECRET — held by every CI workflow — and the in-repo
// 'quarry-connect' constant) let anyone with repo read or a workflow secret
// mint valid sessions. No password configured -> null -> every sign/parse
// fails closed (login routes return 503 with a clear message).
const KEY = () => process.env.STUDIO_PASSWORD || null;
const hex = (str) => [...new TextEncoder().encode(str)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return new TextDecoder().decode(bytes);
};

// claims: { t: opaqueToken, e: email, r: role, n: name, x: expiryMs }
export async function signSessionCookie(claims) {
  const k = KEY();
  if (!k) throw new Error('STUDIO_PASSWORD not configured — Studio login is unavailable');
  const body = hex(JSON.stringify(claims));
  return `${body}.${await hmacToken(body, k)}`;
}

// returns { t, e, r, n, x } for the DB-backed format, or null.
// #58: legacy claims (no opaque token) are no longer honored — a forged
// owner-role legacy cookie used to pass every proxy-gated route without any
// DB check. Re-login required once after this change.
export async function parseSessionCookie(val) {
  try {
    const k = KEY();
    if (!k) return null;
    const m = /^([0-9a-f]+)\.([0-9a-f]{64})$/.exec(String(val || ''));
    if (!m) return null;
    if ((await hmacToken(m[1], k)) !== m[2]) return null;
    const claims = JSON.parse(unhex(m[1]));
    if (!claims?.e || !claims?.r || !claims?.t) return null;
    return claims;
  } catch {
    return null;
  }
}

// LEGACY (pre-A1) format — hex(json{email,role,exp}).hmac — kept so existing
// cookies keep working until their natural 30-day expiry.
export async function signSession(payload) {
  const k = KEY();
  if (!k) throw new Error('STUDIO_PASSWORD not configured');
  const body = hex(JSON.stringify(payload));
  return `${body}.${await hmacToken(body, k)}`;
}

export async function parseSession(cookieVal) {
  try {
    const k = KEY();
    if (!k) return null;
    const m = /^([0-9a-f]+)\.([0-9a-f]{64})$/.exec(String(cookieVal || ''));
    if (!m) return null;
    if ((await hmacToken(m[1], k)) !== m[2]) return null;
    const payload = JSON.parse(unhex(m[1]));
    if (!payload?.email || !payload?.role || Number(payload.exp) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
