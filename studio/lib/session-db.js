// 10-09 A1 SESSION HARDENING — opaque, revocable, DB-backed sessions.
// The cookie holds a random 64-hex token; ONLY its SHA-256 hash is stored in
// Neon (sessions table). Kill the row = that device is out everywhere,
// instantly. Every lookup also updates last_used (throttled to 1/minute).
import crypto from 'node:crypto';
import { db, dbReady } from './db.mjs';

const DAY_MS = 86400000;

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// returns the opaque token for the cookie (hash stored server-side)
export async function createSession({ email, role, name = '', userAgent = '', ip = '', days = 30 }) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + days * DAY_MS);
  if (!dbReady) return { token, fallback: { email, role, name, exp: Date.now() + days * DAY_MS } };
  await db`
    INSERT INTO sessions (token_hash, email, role, name, user_agent, ip, expires_at)
    VALUES (${sha256(token)}, ${email}, ${role}, ${name}, ${String(userAgent).slice(0, 200)}, ${String(ip).slice(0, 60)}, ${expires})`.catch(() => { });
  return { token, fallback: null };
}

// resolves the signed-in user from the opaque cookie token (or null)
export async function userByToken(token) {
  if (!token || token.includes('.') || !dbReady) return null;
  const h = sha256(token);
  const rows = await db`
    SELECT id, email, role, name, revoked, expires_at
    FROM sessions WHERE token_hash = ${h}
    LIMIT 1`.catch(() => []);
  const s = rows[0];
  if (!s) return null;
  if (s.revoked || new Date(s.expires_at) < new Date()) return null;
  // touch last_used at most once per minute (no write per request)
  db`UPDATE sessions SET last_used = now() WHERE id = ${s.id} AND last_used < now() - interval '60 seconds'`.catch(() => { });
  return { email: s.email, role: s.role, name: s.name || s.email, session_id: s.id };
}

export async function revokeToken(token) {
  if (!token || !dbReady) return;
  await db`UPDATE sessions SET revoked = TRUE WHERE token_hash = ${sha256(token)}`.catch(() => { });
}

export async function revokeAllForEmail(email) {
  if (!dbReady) return 0;
  const rows = await db`UPDATE sessions SET revoked = TRUE WHERE email = ${email} AND revoked = FALSE RETURNING id`;
  return rows.length;
}

export async function listSessions(email) {
  if (!dbReady) return [];
  try {
    const rows = await db`
      SELECT id, user_agent, ip, created_at, last_used, expires_at, revoked
      FROM sessions WHERE email = ${email} AND revoked = FALSE AND expires_at > now()
      ORDER BY last_used DESC LIMIT 20`;
    return rows.map((r) => ({
      id: r.id,
      device: String(r.user_agent || '').slice(0, 60),
      ip: r.ip || '',
      created: r.created_at,
      lastUsed: r.last_used,
      expires: r.expires_at,
    }));
  } catch {
    return [];
  }
}

// shared brute-force throttle — counts failed logins per IP across ALL servers
export async function recentFailures(ip, minutes = 15) {
  if (!dbReady || !ip) return 0;
  try {
    const rows = await db`
      SELECT count(*) AS n FROM login_attempts
      WHERE ip = ${ip} AND ok = FALSE AND at > now() - (${minutes} || ' minutes')::interval`;
    return Number(rows[0]?.n || 0);
  } catch {
    return 0;
  }
}

export async function recordLoginAttempt(ip, ok) {
  if (!dbReady || !ip) return;
  try {
    await db`INSERT INTO login_attempts (ip, ok) VALUES (${ip}, ${ok})`;
    await db`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`;
  } catch { }
}
