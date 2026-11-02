// Super Admin — /api/users: every user with their channels, keys status,
// sessions and last activity, in one owner-only payload.
import { getUser } from '@/lib/route-auth';
import { db, dbReady } from '@/lib/db.mjs';
import { registryChannels, readRepoJSON } from '@/lib/channels-registry';
import { listAudit } from '@/lib/audit';
import { decryptKeys } from '@/lib/keys-vault';

export const dynamic = 'force-dynamic';

const KEYS_FILE = 'yt-mcp/channel-keys.json';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || user.role !== 'owner') return Response.json({ error: 'owner only' }, { status: 403 });
  try {
    // users (Neon is source of truth; repo mirror + bundled file are fallbacks)
    let users = [];
    if (dbReady) {
      try {
        users = await db`SELECT email, role, name, created_at FROM users ORDER BY created_at, email`;
        users = users.map((u) => ({ email: u.email, role: u.role, name: u.name || '', createdAt: u.created_at }));
      } catch { }
    }
    if (!users.length) {
      const repo = (await readRepoJSON('yt-mcp/access.json'))?.users || [];
      users = repo.map((u) => ({ email: u.email, role: u.role || 'client', name: u.name || '' }));
    }

    const registry = await registryChannels();
    const keysFile = (await readRepoJSON(KEYS_FILE)) || {};
    const audit = await listAudit(300);

    // active sessions per email (all users — owner view)
    const sessCounts = {};
    if (dbReady) {
      try {
        const rows = await db`SELECT email, COUNT(*)::int AS n FROM sessions WHERE revoked = FALSE AND expires_at > now() GROUP BY email`;
        for (const r of rows) sessCounts[r.email] = r.n;
      } catch { }
    }

    // channels bound to each user (registry ownerEmail); legacy 4 = owner's own
    const byEmail = new Map();
    const bound = (email) => {
      if (!byEmail.has(email)) byEmail.set(email, []);
      return byEmail.get(email);
    };
    for (const e of registry) {
      if (e.ownerEmail) bound(String(e.ownerEmail).toLowerCase()).push({ slug: e.slug, label: e.label || e.slug });
    }

    const list = users.map((u) => {
      const email = String(u.email).toLowerCase();
      const myChannels = bound(email);
      const mySlugs = new Set(myChannels.map((c) => c.slug));
      // keys summary: provider NAMES only (values stay encrypted, never returned)
      const keyProviders = {};
      for (const c of myChannels) {
        const entry = keysFile[c.slug];
        if (!entry?.enc) continue;
        const keys = decryptKeys(entry.enc) || {};
        const set = Object.keys(keys).filter((p) => keys[p]);
        if (set.length) keyProviders[c.slug] = set;
      }
      const lastAction = audit.find((a) => String(a.actor || '').toLowerCase() === email) || null;
      const recentActivity = audit
        .filter((a) => String(a.actor || '').toLowerCase() === email)
        .slice(0, 8)
        .map((a) => ({ at: a.at, action: a.action, detail: a.detail }));
      return {
        email: u.email,
        role: u.role,
        name: u.name,
        createdAt: u.createdAt || null,
        channels: myChannels,
        keysFiles: Object.keys(keyProviders),
        sessionsActive: sessCounts[email] || 0,
        lastAction: lastAction ? { at: lastAction.at, action: lastAction.action, detail: lastAction.detail } : null,
        recentActivity,
      };
    });

    // unbound registry channels (connected but no ownerEmail) — owner awareness
    const unbound = registry.filter((e) => !e.ownerEmail).map((e) => ({ slug: e.slug, label: e.label || e.slug }));
    const legacy = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'].map((s) => ({ slug: s }));

    return Response.json({
      users: list,
      unboundChannels: unbound,
      legacyOwnerChannels: legacy,
      totalSessions: Object.values(sessCounts).reduce((a, b) => a + b, 0),
      auditWindow: 300,
    });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'failed', users: [] }, { status: 500 });
  }
}
