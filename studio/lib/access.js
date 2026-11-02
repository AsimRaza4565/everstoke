// 10-08 ROLE-BASED ACCESS — the invite list + Google identity check.
// access.json (yt-mcp/access.json, committed to the repo) lists WHO may sign
// in and with which role:
//   { "users": [ { "email": "x@gmail.com", "role": "owner|staff|client", "name": "..." } ] }
// Adding a teammate = one line in the file (or the Settings → Team screen).
// Fallback: the bundled lib/access.json (owner) so the owner can always log in
// even if GitHub is unreachable.
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from './data.mjs';
import { db, dbReady } from './db.mjs';
import { readRepoJSON, registryChannels } from './channels-registry.js';
const FALLBACK = path.join(process.cwd(), 'lib', 'access.json');

function accessListSync() {
  try {
    return JSON.parse(fs.readFileSync(FALLBACK, 'utf8')).users || [];
  } catch {
    return [];
  }
}

export async function accessList() {
  // R2: Neon users table is the source of truth; repo file + bundled file are fallbacks
  if (dbReady) {
    try {
      const rows = await db`SELECT email, role, name FROM users`;
      if (rows.length) return rows.map((r) => ({ email: r.email, role: r.role, name: r.name || '' }));
    } catch { }
  }
  try {
    const repo = await readRepoJSON('yt-mcp/access.json');
    if (repo?.users?.length) return repo.users;
  } catch { }
  return accessListSync();
}

export async function roleForEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  const users = await accessList();
  const u = users.find((u) => String(u.email || '').toLowerCase() === e);
  return u ? (u.role || 'staff') : null;
}

// 10-08 P2 CLIENT ROLE: which channel slugs may this dashboard user see?
// owner/staff → null (= everything). client → only channels whose ownerEmail
// matches their login (ownership recorded at connect time). Legacy channels
// have no ownerEmail → owner/staff only.
export async function slugsForUser(user) {
  if (!user) return [];
  if (user.role !== 'client') return null;
  const list = await registryChannels();
  return list
    .filter((e) => (e.ownerEmail || '').toLowerCase() === String(user.email || '').toLowerCase())
    .map((e) => e.slug);
}

// Stage C (F8): can this user act on this channel slug? owner/staff = any;
// client = only channels bound to their email (registry ownerEmail).
export async function canAccessChannelSlug(user, slug) {
  if (!user || !slug) return false;
  if (['owner', 'staff'].includes(user.role)) return true;
  if (user.role === 'client') return (await slugsForUser(user).catch(() => [])).includes(slug);
  return false;
}

// Verifies a Google id_token server-side via Google's tokeninfo endpoint
// (Google checks the signature for us) and confirms it was issued to OUR client.
export async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) return null;
    const d = await r.json();
    const clientId = ENV.YOUTUBE_CLIENT_ID || '';
    if (clientId && d.aud !== clientId) return null;
    if (d.email_verified !== 'true' && d.email_verified !== true) return null;
    return { email: String(d.email || '').toLowerCase(), name: d.name || '', picture: d.picture || '' };
  } catch {
    return null;
  }
}
