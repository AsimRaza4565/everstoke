// Server-side store for wizard channels — PHASE R2: Neon Postgres is the
// source of truth (channels table). The repo file yt-mcp/studio-channels.json
// is kept in sync as the ENGINE's feed (autopilot discovery reads it from the
// repo). The OAuth refresh token is stored TWICE: as the YT_TOKEN_<SLUG>
// GitHub secret (CI) and encrypted (AES-256-GCM, STUDIO_PASSWORD key) as
// token_enc in the DB / registry (dashboard read-back). Repo must stay PRIVATE.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ENV } from './data.mjs';
import { db, dbReady } from './db.mjs';

const REG_PATH = 'yt-mcp/studio-channels.json';
const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
const ROOT = path.resolve(process.cwd(), '..');
const CLOUD = ENV.FORCE_GITHUB === '1' || !fs.existsSync(path.resolve(ROOT, 'yt-mcp'));

export const REGISTRY_MODE = dbReady ? 'db' : CLOUD ? 'cloud' : 'local';

const ghHeaders = (extra = {}) => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'quarry-studio',
  'X-GitHub-Api-Version': '2022-11-28',
  ...extra,
});

export function hasGithubToken() {
  return Boolean(TOKEN);
}

// ---------- encrypted token at rest (dashboard read-back for wizard channels) ----------

function encKey() {
  return crypto.createHash('sha256').update(String(process.env.STUDIO_PASSWORD || ENV.YOUTUBE_CLIENT_SECRET || 'quarry-connect')).digest();
}

export function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptJSON(s) {
  try {
    const [iv, tag, ct] = String(s).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

// ---------- row <-> entry mapping ----------

function rowToEntry(r) {
  return {
    slug: r.slug,
    ownerEmail: r.owner_email || '',
    label: r.label || r.slug,
    handle: r.handle || '',
    channelId: r.channel_id || '',
    niche: r.niche || '',
    style: r.style || '',
    voice: r.voice || '',
    accent: r.accent || '#38BDF8',
    slots: r.slots || [],
    docDay: r.doc_day || '',
    autopilot: r.autopilot !== false,
    kit: r.kit || {},
    ytDescription: r.yt_description || '',
    ytKeywords: r.yt_keywords || '',
    tokenEnc: r.token_enc || null,
    tokenSecret: r.token_secret || '',
    tokenSecretSaved: Boolean(r.token_secret),
    subs: Number(r.subs || 0),
    connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null,
    consentedAt: r.consented_at ? new Date(r.consented_at).toISOString() : null,
    consent: r.consent || null,
    autopilotStartedAt: r.autopilot_started_at ? new Date(r.autopilot_started_at).toISOString() : null,
    status: r.status || '',
    active: true,
    fromRegistry: true,
  };
}

// ---------- generic repo JSON (topics queues, state files, team mirror) ----------

export async function readRepoJSON(repoPath) {
  if (!CLOUD) {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, repoPath), 'utf8'));
    } catch {
      return null;
    }
  }
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`github ${res.status} reading ${repoPath}`);
  return JSON.parse(await res.text());
}

export async function writeRepoJSON(repoPath, data, message) {
  const body = JSON.stringify(data, null, 2) + '\n';
  if (!CLOUD) {
    fs.mkdirSync(path.dirname(path.join(ROOT, repoPath)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, repoPath), body);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${repoPath}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(body, 'utf8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} committing ${repoPath}: ${(await res.text()).slice(0, 120)}`);
  return { ok: true, mode: 'cloud' };
}

// ---------- registry (DB first, repo JSON fallback + repo sync for the engine) ----------

async function readRegistryRepo() {
  if (!CLOUD) {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), 'utf8'));
    } catch {
      return { channels: [] };
    }
  }
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw' }),
  });
  if (res.status === 404) return { channels: [] };
  if (!res.ok) throw new Error(`github ${res.status} reading registry`);
  return JSON.parse(await res.text());
}

export async function readRegistry() {
  if (dbReady) {
    try {
      const rows = await db`SELECT * FROM channels ORDER BY slug`;
      return { channels: rows.map(rowToEntry) };
    } catch (e) {
      console.error('[registry] db read failed — repo fallback:', String(e.message).slice(0, 80));
    }
  }
  return readRegistryRepo();
}

// keeps the engine's discovery file in sync with the DB truth
async function syncRegistryRepo(entries, message) {
  if (CLOUD || dbReady) {
    try {
      await writeRepoJSON(REG_PATH, { channels: entries }, message || 'registry sync (db → repo)');
    } catch (e) {
      console.error('[registry] repo sync failed:', String(e.message).slice(0, 100));
    }
  }
}

export async function registryChannels() {
  const reg = await readRegistry();
  return (reg.channels || []).filter((c) => c.active !== false);
}

export async function upsertChannel(entry, message) {
  if (dbReady) {
    try {
      await db`
        INSERT INTO channels (slug, owner_email, label, handle, channel_id, niche, style, voice, accent, slots, doc_day, autopilot, kit, yt_description, yt_keywords, token_enc, token_secret, subs, connected_at, status, consented_at, consent, autopilot_started_at)
        VALUES (${entry.slug}, ${entry.ownerEmail || ''}, ${entry.label || entry.slug}, ${entry.handle || ''}, ${entry.channelId || ''}, ${entry.niche || ''}, ${entry.style || ''}, ${entry.voice || ''}, ${entry.accent || '#38BDF8'}, ${entry.slots || []}, ${entry.docDay || ''}, ${entry.autopilot !== false}, ${db.json(entry.kit || {})}, ${entry.ytDescription || ''}, ${entry.ytKeywords || ''}, ${entry.tokenEnc || null}, ${entry.tokenSecret || ''}, ${Number(entry.subs || 0)}, ${entry.connectedAt ? new Date(entry.connectedAt) : new Date()}, ${entry.status || ''}, ${entry.consentedAt ? new Date(entry.consentedAt) : null}, ${entry.consent ? db.json(entry.consent) : null}, ${entry.autopilotStartedAt ? new Date(entry.autopilotStartedAt) : null})
        ON CONFLICT (slug) DO UPDATE SET
          owner_email = EXCLUDED.owner_email, label = EXCLUDED.label, handle = EXCLUDED.handle,
          channel_id = EXCLUDED.channel_id, niche = EXCLUDED.niche, style = EXCLUDED.style,
          voice = EXCLUDED.voice, accent = EXCLUDED.accent, slots = EXCLUDED.slots,
          doc_day = EXCLUDED.doc_day, autopilot = EXCLUDED.autopilot, kit = EXCLUDED.kit,
          yt_description = EXCLUDED.yt_description, yt_keywords = EXCLUDED.yt_keywords,
          token_enc = COALESCE(EXCLUDED.token_enc, channels.token_enc),
          token_secret = EXCLUDED.token_secret, subs = EXCLUDED.subs,
          connected_at = EXCLUDED.connected_at, status = EXCLUDED.status,
          consented_at = COALESCE(EXCLUDED.consented_at, channels.consented_at),
          consent = COALESCE(EXCLUDED.consent, channels.consent),
          autopilot_started_at = COALESCE(EXCLUDED.autopilot_started_at, channels.autopilot_started_at)`;
      const reg = await readRegistry();
      await syncRegistryRepo(reg.channels, message || `studio: connect channel ${entry.slug}`);
      return { ok: true, mode: 'db' };
    } catch (e) {
      console.error('[registry] db upsert failed — repo fallback:', String(e.message).slice(0, 100));
    }
  }
  // repo fallback (original logic)
  const reg = await readRegistryRepo();
  const channels = (reg.channels || []).filter((c) => c.slug !== entry.slug);
  channels.push(entry);
  channels.sort((a, b) => a.slug.localeCompare(b.slug));
  return writeRegistry({ channels }, message || `studio: connect channel ${entry.slug}`);
}

export async function removeChannel(slug, message) {
  if (dbReady) {
    try {
      await db`DELETE FROM channels WHERE slug = ${slug}`;
    } catch (e) {
      console.error('[registry] db delete failed:', String(e.message).slice(0, 100));
    }
  }
  const reg = await readRegistryRepo();
  const channels = (reg.channels || []).filter((c) => c.slug !== slug);
  if (CLOUD || dbReady) {
    try {
      await writeRepoJSON(REG_PATH, { channels }, message || `registry: removed ${slug}`);
    } catch { }
  }
  return { ok: true };
}

// 10-08 FLOW CONTROL — flip the engine-facing autopilot flag (DB + repo sync)
export async function setChannelAutopilot(slug, on, message) {
  if (dbReady) {
    try {
      await db`UPDATE channels SET autopilot = ${on} WHERE slug = ${slug}`;
    } catch (e) {
      console.error('[registry] db autopilot update failed:', String(e.message).slice(0, 100));
    }
  }
  try {
    const reg = await readRegistryRepo();
    const channels = (reg.channels || []).map((c) => (c.slug === slug ? { ...c, autopilot: on } : c));
    if (CLOUD || dbReady) await writeRepoJSON(REG_PATH, { channels }, message || `flow: autopilot ${on ? 'ON' : 'OFF'} for ${slug}`);
  } catch { }
  return { ok: true };
}

export async function writeRegistry(registry, message) {
  const body = JSON.stringify(registry, null, 2) + '\n';
  if (!CLOUD) {
    fs.writeFileSync(path.join(ROOT, 'yt-mcp', 'studio-channels.json'), body);
    return { ok: true, mode: 'local' };
  }
  const cur = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}?ref=main`, {
    headers: ghHeaders(),
  });
  const sha = cur.ok ? (await cur.json()).sha : undefined;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${REG_PATH}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      content: Buffer.from(body, 'utf8').toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`github ${res.status} committing registry: ${(await res.text()).slice(0, 120)}`);
  return { ok: true, mode: 'cloud' };
}

// Encrypts with the repo's Actions secret public key (libsodium sealed box) —
// the same mechanism `gh secret set` uses.
export async function writeTokenSecret(secretName, tokenJson) {
  if (!TOKEN) throw new Error('no GITHUB_TOKEN on the server');
  const mod = await import('libsodium-wrappers');
  const sodium = mod.default ?? mod;
  await sodium.ready;
  const pkRes = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/public-key`, {
    headers: ghHeaders(),
  });
  if (!pkRes.ok) throw new Error(`github ${pkRes.status} reading secrets public key`);
  const pk = await pkRes.json();
  const sealed = sodium.crypto_box_seal(Buffer.from(tokenJson, 'utf8'), Buffer.from(pk.key, 'base64'));
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/secrets/${secretName}`, {
    method: 'PUT',
    headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ encrypted_value: Buffer.from(sealed).toString('base64'), key_id: pk.key_id }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`github ${res.status} writing ${secretName}: ${(await res.text()).slice(0, 120)}`);
  }
  return { ok: true };
}

// Local mode only — mirror of what oauth-reauth.mjs writes (gitignored folder).
export function writeLocalTokenFile(slug, tokenJson) {
  if (CLOUD) return { ok: false };
  const dir = path.join(ROOT, 'yt-mcp', 'channels', slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'token.json'), tokenJson);
  return { ok: true };
}
