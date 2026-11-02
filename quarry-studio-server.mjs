// Quarry Studio backend — token exchange + direct-post publishing.
// The ONLY place the TikTok client secret lives (never in the public site).
// Run: node quarry-studio-server.mjs   (port 8787)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';

loadEnv();

const PORT = 8787;
const TOKEN_FILE = 'quarry-studio-token.json';

// New app keys take priority: put the NEW app's key/secret in .env as TIKTOK_APP_KEY / TIKTOK_APP_SECRET
const CLIENT_KEY = process.env.TIKTOK_APP_KEY || process.env.TIKTOK_CLIENT_KEY || '';
const CLIENT_SECRET = process.env.TIKTOK_APP_SECRET || process.env.TIKTOK_CLIENT_SECRET || '';
const REDIRECT_URI = 'https://muzzamilhassan.github.io/quarrystudio/callback.html';
let account = null; // { access_token, refresh_token, open_id, scope, expires_in, at }

// #61: the persisted token is LOADED at startup — a server restart no longer
// forces re-consent (the file was written but never read back)
try {
  if (fs.existsSync(TOKEN_FILE)) account = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
} catch (e) { console.warn('[quarry-studio] token file unreadable:', String(e.message).slice(0, 80)); }
const persist = () => { try { fs.writeFileSync(TOKEN_FILE, JSON.stringify(account, null, 2)); } catch { } };

// #61: TikTok access tokens live 24h — refresh from the stored refresh token
// instead of failing with auth errors after a day
async function refreshAccount() {
  if (!account?.refresh_token) return false;
  try {
    const body = new URLSearchParams({
      client_key: CLIENT_KEY, client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token', refresh_token: account.refresh_token,
    });
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const data = await res.json();
    if (!data.access_token) throw new Error(JSON.stringify(data).slice(0, 200));
    account = { ...account, ...data, at: Date.now() };
    persist();
    console.log('[quarry-studio] TikTok token refreshed');
    return true;
  } catch (e) {
    console.warn('[quarry-studio] token refresh failed:', String(e.message).slice(0, 120));
    return false;
  }
}

// fresh = refreshed within the last 23h of its 24h lifetime (or unknown age)
async function ensureFresh() {
  if (!account?.access_token) throw new Error('not connected');
  const age = Date.now() - (account.at || 0);
  if (age > 23 * 3600 * 1000) await refreshAccount();
  if (!account.access_token) throw new Error('not connected');
}

// #61: CORS allowlist + Origin check — the old `*` with no auth let any
// website fire a cross-origin POST at /api/publish and push arbitrary bytes
// to the connected account.
const ALLOWED_ORIGINS = ['https://muzzamilhassan.github.io', /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true; // same-machine tools (curl) send no Origin
  return ALLOWED_ORIGINS.some((a) => (typeof a === 'string' ? a === o : a.test(o)));
}
const cors = (req) => ({
  'Access-Control-Allow-Origin': originAllowed(req) ? (req.headers.origin || '*') : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
});

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
const json = (res, code, obj, req) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors(req) }); res.end(JSON.stringify(obj)); };

async function exchangeToken(code) {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY, client_secret: CLIENT_SECRET, code,
    grant_type: 'authorization_code', redirect_uri: REDIRECT_URI,
  });
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data).slice(0, 200));
  account = { ...data, at: Date.now() };
  persist();
  return account;
}

async function directPost(videoBuf, title, privacy) {
  await ensureFresh();
  const upload = async () => {
    const size = videoBuf.length;
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: title.slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_stitch: false, disable_comment: false },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
      }),
    });
    const init = await initRes.json();
    if (!init.data?.upload_url) throw new Error('init failed: ' + JSON.stringify(init).slice(0, 200));
    // #61: the PUT response is checked — a failed upload used to surface as success
    const putRes = await fetch(init.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${size - 1}/${size}` },
      body: videoBuf,
    });
    if (!putRes.ok) throw new Error(`video upload failed: HTTP ${putRes.status} ${String(await putRes.text()).slice(0, 120)}`);
    return init.data.publish_id;
  };
  let publishId;
  try {
    publishId = await upload();
  } catch (e) {
    // auth-related failure -> refresh once and retry the whole chain
    if (/401|token/i.test(String(e.message)) && (await refreshAccount())) publishId = await upload();
    else throw e;
  }
  const stRes = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publish_id: publishId }),
  });
  const st = await stRes.json();
  // #61: fail closed — an unknown status is PROCESSING (check again), never PUSHED
  const status = st.data?.status;
  if (status !== 'PUBLISHED' && status !== 'PUSHED' && !st.data?.fail_reason && status !== 'PROCESSING') {
    return { publish_id: publishId, status: 'PROCESSING', fail: '' };
  }
  return { publish_id: publishId, status: status || 'PROCESSING', fail: st.data?.fail_reason || '' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!originAllowed(req)) return json(res, 403, { error: 'origin not allowed' }, req);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)); return res.end(); }

  if (url.pathname === '/api/status') {
    return json(res, 200, { connected: !!account?.access_token, open_id: account?.open_id || null, scope: account?.scope || null }, req);
  }
  if (url.pathname === '/api/token' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const acc = await exchangeToken(body.code);
      return json(res, 200, { connected: true, open_id: acc.open_id, display_name: null }, req);
    } catch (e) { return json(res, 500, { error: e.message }, req); }
  }
  if (url.pathname === '/api/publish' && req.method === 'POST') {
    try {
      const videoBuf = await readBody(req);
      const title = url.searchParams.get('title') || 'My video';
      const privacy = url.searchParams.get('privacy') || 'SELF_ONLY';
      const r = await directPost(videoBuf, title, privacy);
      return json(res, 200, r, req);
    } catch (e) { return json(res, 500, { error: e.message }, req); }
  }
  if (url.pathname === '/api/config') {
    return json(res, 200, { client_key: CLIENT_KEY, redirect_uri: REDIRECT_URI }, req);
  }
  json(res, 404, { error: 'not found' }, req);
});
server.listen(PORT, () => console.log(`[quarry-studio] backend on http://localhost:${PORT} — client_key ${CLIENT_KEY ? 'loaded' : 'MISSING (set TIKTOK_APP_KEY/SECRET in .env)'}${account ? `, token restored (${account.open_id})` : ', not connected'}`));
