// Pinterest Publisher — Pinterest API v5 (api.pinterest.com).
// Mirrors threads-publisher.mjs: one-time OAuth capture, token file for local
// runs + env token for CI, public image hosting (Pinterest PULLS from a URL).
//
// One-time setup (Pinterest API apps get instant Trial access — NO review —
// for the developer's own account, enough for ~150 requests/day):
//   1. pinterest.com account (business account recommended)
//   2. developers.pinterest.com -> Create app -> copy App ID + App secret
//      -> .env as PINTEREST_APP_ID / PINTEREST_APP_SECRET
//      -> app settings: add redirect URI (TIKTOK-style tunnel URL, set via
//         PINTEREST_REDIRECT_URI)
//   3. node pinterest-publisher.mjs auth   (opens browser, saves token file)
//
// Usage:
//   node pinterest-publisher.mjs auth
//   node pinterest-publisher.mjs test
//   node pinterest-publisher.mjs post --image post.jpg --title "..." --desc "..."
// Imported by run-content-machine.mjs: publishToPinterest({ imageBuffer, title, description })
//
// Token model: v5 access tokens last ~1 year (refresh_token also provided;
// refresh via CLI if ever needed). Pin images must be PUBLIC URLs — the
// shared hostImagePublicly() (uguu.se) covers local runs and GitHub Actions.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';

const TOKEN_PATH = 'pinterest-oauth-tokens.json';
const PORT = 3003;
const LOCAL_REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';
const API = 'https://api.pinterest.com/v5';
const BOARD_NAME = 'Daily Wisdom Quotes';
const TITLE_LIMIT = 100;   // Pinterest hard limits
const DESC_LIMIT = 500;

import { loadEnv, envOf } from './lib/env.mjs';
loadEnv();
const APP_ID = envOf('PINTEREST_APP_ID');
const APP_SECRET = envOf('PINTEREST_APP_SECRET');
const REDIRECT_URI = envOf('PINTEREST_REDIRECT_URI') || LOCAL_REDIRECT;
const PIN_LINK = envOf('PINTEREST_PIN_LINK') || '';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function clip(text, limit) {
  const s = String(text || '').trim();
  return s.length <= limit ? s : s.substring(0, limit - 1).trimEnd() + '…';
}

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
function readTokenFile() {
  try {
    if (fs.existsSync(TOKEN_PATH)) return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch (e) { }
  return null;
}

async function refreshTokens(refreshToken) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data).substring(0, 300));
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    obtained_at: Date.now()
  };
}

async function getPinterestToken() {
  const envToken = envOf('PINTEREST_ACCESS_TOKEN');
  if (envToken) return envToken;
  const file = readTokenFile();
  return file ? file.access_token : null;
}

// ---------------------------------------------------------------------------
// Board + pin helpers
// ---------------------------------------------------------------------------
async function getOrCreateBoard(token) {
  // Find BOARD_NAME among the first pages of boards, else create it
  let url = `${API}/boards?page_size=100`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const hit = (data.items || []).find(b => b.name === BOARD_NAME);
    if (hit) return hit.id;
    url = data.bookmark ? `${API}/boards?page_size=100&bookmark=${encodeURIComponent(data.bookmark)}` : null;
  }
  const create = await fetch(`${API}/boards`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BOARD_NAME, description: 'Daily motivational quotes and timeless wisdom.' })
  });
  const created = await create.json();
  if (created.id) {
    console.log(`[Pinterest] Created board "${BOARD_NAME}" (${created.id})`);
    return created.id;
  }
  throw new Error('board lookup/create failed: ' + JSON.stringify(created).substring(0, 200));
}

// ---------------------------------------------------------------------------
// Publishing — used by run-content-machine.mjs and the CLI below
// ---------------------------------------------------------------------------
export async function publishToPinterest({ imageBuffer, title, description, link } = {}) {
  const token = await getPinterestToken();
  if (!token) {
    console.log('[Pinterest] Skipped: no token (run: node pinterest-publisher.mjs auth)');
    return null;
  }
  try {
    console.log('[Pinterest] Publishing pin...');
    const { hostImagePublicly } = await import('./threads-publisher.mjs');
    const imageUrl = await hostImagePublicly(imageBuffer, 'image/jpeg', 'pin.jpg');
    if (!imageUrl) {
      console.warn('      [Pinterest] Skipped: public image hosting failed.');
      return null;
    }

    const boardId = await getOrCreateBoard(token);
    const body = {
      board_id: boardId,
      title: clip(title, TITLE_LIMIT),
      description: clip(description, DESC_LIMIT),
      media_source: { source_type: 'image_url', url: imageUrl }
    };
    const destLink = link || PIN_LINK;
    if (destLink) body.link = destLink;

    const res = await fetch(`${API}/pins`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.id) {
      console.log(`      ✓ Pinterest Pin Live! ID: ${data.id}`);
      return data.id;
    }
    console.warn('      [Pinterest] Pin failed:', JSON.stringify(data).substring(0, 250));
    return null;
  } catch (e) {
    console.warn('      [Pinterest] Error:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

async function runAuth() {
  if (!APP_ID || !APP_SECRET) {
    console.error('[ERROR] PINTEREST_APP_ID / PINTEREST_APP_SECRET missing in .env (developers.pinterest.com -> your app).');
    process.exit(1);
  }
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://www.pinterest.com/oauth/?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${state}`;

  console.log('\n======================================================');
  console.log('🔑 ONE-TIME PINTEREST AUTHENTICATION');
  console.log('======================================================');
  console.log('Opening browser for Pinterest authorization...');
  console.log(`If it does not open automatically, visit:\n${authUrl}\n`);

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      if (!urlObj.pathname.startsWith('/callback')) return;
      const code = urlObj.searchParams.get('code');
      const err = urlObj.searchParams.get('error');

      if (!code) {
        console.log(`[Notice] Callback hit without a code (URL: ${req.url}). Still waiting...`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><p>Waiting for a valid Pinterest authorization — complete the consent in the other tab.</p></body></html>');
        return;
      }
      if (err) throw new Error(err);

      const exRes = await fetch(`${API}/oauth/token`, {
        method: 'POST',
        headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
      });
      const ex = await exRes.json();
      if (!ex.access_token) throw new Error(JSON.stringify(ex).substring(0, 300));

      fs.writeFileSync(TOKEN_PATH, JSON.stringify({
        access_token: ex.access_token,
        refresh_token: ex.refresh_token,
        obtained_at: Date.now()
      }, null, 2));

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff"><div><h1 style="color:#4ade80">✓ Pinterest connected!</h1><p style="color:#94a3b8">Token saved to ${TOKEN_PATH}. You can close this tab.</p></div></body></html>`);

      console.log(`✓ Pinterest connected (token valid ~1 year)`);
      console.log(`✓ Saved to ${TOKEN_PATH}`);
      console.log('\nFinish CI wiring with this GitHub repo secret:');
      console.log(`  PINTEREST_ACCESS_TOKEN = <access_token from ${TOKEN_PATH}>`);
      server.close();
      setTimeout(() => process.exit(0), 500);
    } catch (e) {
      console.error('[ERROR] Token exchange failed:', e.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Token exchange failed: ' + e.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => openBrowser(authUrl));
  setTimeout(() => {
    console.log('[TIMEOUT] No callback received within 30 minutes. Re-run: node pinterest-publisher.mjs auth');
    try { server.close(); } catch (e) { }
    process.exit(1);
  }, 30 * 60 * 1000);
}

async function runTest() {
  const token = await getPinterestToken();
  if (!token) {
    console.log('No Pinterest token found. Run: node pinterest-publisher.mjs auth');
    process.exit(1);
  }
  const res = await fetch(`${API}/user_account`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.username) {
    console.log(`✓ Pinterest token valid — connected as ${data.username} (${data.account_type || 'account'})`);
  } else {
    console.error('✗ Pinterest token invalid:', JSON.stringify(data).substring(0, 200));
    process.exit(1);
  }
}

async function runRefresh() {
  const file = readTokenFile();
  if (!file || !file.refresh_token) {
    console.error(`No refresh token in ${TOKEN_PATH}. Run auth first.`);
    process.exit(1);
  }
  const fresh = await refreshTokens(file.refresh_token);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(fresh, null, 2));
  console.log('✓ Token refreshed and saved.');
}

async function runPostCli() {
  const args = process.argv.slice(2);
  const pick = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const image = pick('--image');
  if (!image) {
    console.log('Usage: node pinterest-publisher.mjs post --image f.jpg --title "..." --desc "..."');
    process.exit(1);
  }
  const id = await publishToPinterest({
    imageBuffer: fs.readFileSync(image),
    title: pick('--title') || '',
    description: pick('--desc') || '',
    link: pick('--link') || ''
  });
  process.exit(id ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, '/').endsWith('/pinterest-publisher.mjs');
if (invokedDirectly) {
  const cmd = process.argv[2] || 'help';
  if (cmd === 'auth') runAuth();
  else if (cmd === 'test') runTest();
  else if (cmd === 'refresh') runRefresh();
  else if (cmd === 'post') runPostCli();
  else console.log('Commands: auth | test | refresh | post --image f.jpg --title "..." --desc "..."');
}
