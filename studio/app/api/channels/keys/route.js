// BYOK — per-channel provider API keys. Owner-only surface (the proxy also
// gates: /api/channels/keys matches the owner-only /api/channels/* rule).
// Keys are validated live BEFORE save, stored encrypted (AES-256-GCM) in
// yt-mcp/channel-keys.json (committed — git history = free audit trail), and
// only ever returned masked. Clients get their own surface later (/client).
import { getUser } from '@/lib/route-auth';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';
import { canAccessChannelSlug } from '@/lib/access';
import { PROVIDERS, encryptKeys, decryptKeys, maskKey, validateKey } from '@/lib/keys-vault';

export const dynamic = 'force-dynamic';

const FILE = 'yt-mcp/channel-keys.json';

const loadFile = async () => (await readRepoJSON(FILE)) || {};

const deny = (req) => getUser(req).then((u) => (!u ? Response.json({ error: 'not signed in' }, { status: 401 }) : null));



export async function GET(req) {
  const user = await getUser(req);
  const d = await deny(req);
  if (d) return d;
  const slug = new URL(req.url).searchParams.get('slug') || '';
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const file = await loadFile();
  const entry = slug ? file[slug] : null;
  const keys = entry?.enc ? decryptKeys(entry.enc) : null;
  const providers = {};
  for (const [p, meta] of Object.entries(PROVIDERS)) {
    providers[p] = {
      label: meta.label,
      url: meta.url,
      hint: meta.hint,
      set: Boolean(keys?.[p]),
      masked: keys?.[p] ? maskKey(keys[p]) : null,
    };
  }
  return Response.json({ slug, updated: entry?.updated || null, updatedBy: entry?.updatedBy || null, providers });
}

export async function POST(req) {
  const user = await getUser(req);
  const d = await deny(req);
  if (d) return d;
  const body = await req.json().catch(() => ({}));
  const { slug, provider, key } = body || {};
  if (!slug || !PROVIDERS[provider]) return Response.json({ error: 'channel slug and a known provider are required' }, { status: 400 });
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const v = await validateKey(provider, key);
  if (!v.ok) return Response.json({ error: `key rejected: ${v.detail}` }, { status: 400 });
  const file = await loadFile();
  const prev = file[slug]?.enc ? decryptKeys(file[slug].enc) || {} : {};
  file[slug] = {
    enc: encryptKeys({ ...prev, [provider]: String(key).trim() }),
    updated: new Date().toISOString(),
    updatedBy: user?.email || 'owner',
  };
  await writeRepoJSON(FILE, file, `api-keys: ${slug} ${provider} set`);
  try { await appendAudit(user?.email || 'owner', 'api-key set', `${slug} · ${provider} (${maskKey(key)})`); } catch { }
  return Response.json({ ok: true, slug, provider, masked: maskKey(key) });
}

export async function DELETE(req) {
  const user = await getUser(req);
  const d = await deny(req);
  if (d) return d;
  const body = await req.json().catch(() => ({}));
  const { slug, provider } = body || {};
  if (!slug || !PROVIDERS[provider]) return Response.json({ error: 'channel slug and a known provider are required' }, { status: 400 });
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
  const file = await loadFile();
  const prev = file[slug]?.enc ? decryptKeys(file[slug].enc) || {} : {};
  delete prev[provider];
  file[slug] = { enc: encryptKeys(prev), updated: new Date().toISOString(), updatedBy: user?.email || 'owner' };
  await writeRepoJSON(FILE, file, `api-keys: ${slug} ${provider} removed`);
  try { await appendAudit(user?.email || 'owner', 'api-key removed', `${slug} · ${provider}`); } catch { }
  return Response.json({ ok: true, slug, provider });
}
