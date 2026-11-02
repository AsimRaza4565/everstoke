// Threads Publisher — Threads API (graph.threads.net) integration.
// Mirrors the youtube-shorts-publisher.mjs pattern: local OAuth capture,
// long-lived token file, and a publishToThreads() export used by the engine.
//
// One-time setup (needs the Threads product on the existing Meta app):
//   1. developers.facebook.com -> your app -> Threads API (Settings)
//      -> note the "Threads app ID" and "Threads app secret" (NOT the FB app id)
//      -> put them in .env as THREADS_APP_ID / THREADS_APP_SECRET
//      -> Redirect Callback URLs: http://localhost:3001/callback
//   2. node threads-publisher.mjs auth   (opens browser, saves token file)
//
// Usage:
//   node threads-publisher.mjs auth                    # one-time OAuth flow
//   node threads-publisher.mjs test                    # verify token via GET /me
//   node threads-publisher.mjs refresh                 # refresh long-lived token (60-day lifetime)
//   node threads-publisher.mjs post --text "Hello" [--image post.jpg] [--video reel.mp4]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { exec } from 'node:child_process';

const TOKEN_PATH = 'threads-oauth-tokens.json';
const API = 'https://graph.threads.net/v1.0';
const PORT = 3001;
// Meta requires an HTTPS redirect URI in the Threads product settings, so the
// one-time OAuth consent goes through a public HTTPS tunnel (THREADS_REDIRECT_URI).
const LOCAL_REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = 'threads_basic,threads_content_publish';
const TEXT_LIMIT = 480; // Threads accepts up to 500 chars of text/caption

import { loadEnv, envOf } from './lib/env.mjs';
loadEnv();
const REDIRECT_URI = envOf('THREADS_REDIRECT_URI') || LOCAL_REDIRECT;
// Threads OAuth uses the Threads-specific app credentials (found under the
// app's Threads API product settings), NOT the Facebook app ID/secret.
const APP_ID = envOf('THREADS_APP_ID') || envOf('FACEBOOK_APP_ID');
const APP_SECRET = envOf('THREADS_APP_SECRET') || envOf('FACEBOOK_APP_SECRET');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function clip(text, limit = TEXT_LIMIT) {
  const s = String(text || '').trim();
  return s.length <= limit ? s : s.substring(0, limit).replace(/\s+\S*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
function readTokenFile() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    }
  } catch (e) { }
  return null;
}

async function refreshLongLivedToken(token) {
  const res = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`);
  const data = await res.json();
  if (!data.access_token) throw new Error(JSON.stringify(data));
  return data; // { access_token, token_type, expires_in }
}

// Resolution order: CI env vars -> local token file (auto-refreshed when stale)
async function getThreadsToken() {
  const envToken = envOf('THREADS_ACCESS_TOKEN');
  if (envToken) {
    // #64: the CI secret cannot auto-refresh (no writable token file) and
    // hard-expires in 60 days — say so loudly every run instead of failing
    // silently at day 61.
    console.warn('[Threads] CI THREADS_ACCESS_TOKEN in use — it hard-expires 60 days after creation; regenerate it before then (local auth can auto-refresh instead).');
    return { token: envToken, userId: envOf('THREADS_USER_ID'), persistent: false };
  }

  const file = readTokenFile();
  if (!file || !file.access_token) return null;

  // Auto-refresh when < 10 days of the 60-day lifetime remain (local runs only,
  // where we can persist the new token back to the file)
  const expiresAt = file.expires_at || 0;
  if (!APP_SECRET || !expiresAt) {
    // #64: refresh requires BOTH — warn instead of silently hard-expiring
    console.warn('[Threads] token auto-refresh disabled: needs APP_SECRET and expires_at in the token file — the token WILL hard-expire without refresh.');
  }
  if (APP_SECRET && expiresAt && expiresAt - Date.now() < 10 * 24 * 3600 * 1000) {
    try {
      const refreshed = await refreshLongLivedToken(file.access_token);
      file.access_token = refreshed.access_token;
      file.expires_at = Date.now() + (refreshed.expires_in || 60 * 24 * 3600) * 1000;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(file, null, 2));
      console.log('[Threads] Long-lived token auto-refreshed and saved.');
    } catch (e) {
      console.warn('[Threads] Token refresh failed (will try existing token):', JSON.stringify(e.message || e));
    }
  }

  return { token: file.access_token, userId: file.user_id, persistent: true };
}

// ---------------------------------------------------------------------------
// Public media hosting — the Threads AND Instagram Graph APIs only accept
// public media URLs (no multipart upload), both locally and in GitHub Actions.
// uguu.se needs no API key, serves raw bytes with a proper image content-type
// (tmpfiles.org "direct" links redirect to an HTML viewer — Meta rejects them),
// and files live ~3 hours: plenty, since Meta fetches the media when the
// container is created, before publish.
// Exported for reuse by run-content-machine.mjs for Instagram posting.
// ---------------------------------------------------------------------------
export async function hostImagePublicly(buffer, mime, filename) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const form = new FormData();
      form.append('files[]', new Blob([buffer], { type: mime }), filename);
      const res = await fetch('https://uguu.se/upload', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(45000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const url = data?.files?.[0]?.url;
      if (!url) continue;

      // Verify the link serves the actual bytes with an image/video content-type
      const check = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const ctype = check.headers.get('content-type') || '';
      if (check.ok && (ctype.startsWith('image/') || ctype.startsWith('video/'))) return url;
    } catch (e) {
      await sleep(2000);
    }
  }
  return null;
}

async function pollVideoContainer(containerId, token) {
  // 09-21: video processing can take minutes AND transient API errors (rate
  // limits) must not abort — only an explicit FAILED status does.
  for (let i = 0; i < 120; i++) { // #64: 6 min — longer encodes were silently dropped for the day at 3 min
    try {
      const res = await fetch(`${API}/${containerId}?fields=status_code&access_token=${token}`);
      const data = await res.json();
      if (data.status_code === 'FINISHED') return true;
      if (data.status_code === 'FAILED') return false;
    } catch { }
    await sleep(3000);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Publishing — used by run-content-machine.mjs and the CLI below
// ---------------------------------------------------------------------------
export async function publishToThreads({ imageBuffer, videoBuffer, text } = {}) {
  const cfg = await getThreadsToken();
  if (!cfg || !cfg.token || !cfg.userId) {
    console.log('[Threads] Skipped: no token configured (run: node threads-publisher.mjs auth)');
    return null;
  }

  console.log(`[Threads] Publishing ${imageBuffer ? 'image post' : videoBuffer ? 'video post' : 'text post'}...`);

  try {
    let mediaUrl = null;
    let mediaType = 'TEXT';

    if (imageBuffer) {
      mediaUrl = await hostImagePublicly(imageBuffer, 'image/jpeg', 'post.jpg');
      if (mediaUrl) mediaType = 'IMAGE';
    } else if (videoBuffer) {
      mediaUrl = await hostImagePublicly(videoBuffer, 'video/mp4', 'reel.mp4');
      if (mediaUrl) mediaType = 'VIDEO';
    }

    const caption = clip(text);
    if (!caption && mediaType === 'TEXT') {
      console.log('[Threads] Skipped: nothing to post (no text, no media).');
      return null;
    }

    let containerId = null;
    if (mediaUrl) {
      const params = new URLSearchParams({
        access_token: cfg.token,
        media_type: mediaType,
        [mediaType === 'VIDEO' ? 'video_url' : 'image_url']: mediaUrl
      });
      if (caption) params.set('text', caption);
      const res = await fetch(`${API}/${cfg.userId}/threads`, { method: 'POST', body: params });
      const data = await res.json();
      containerId = data.id;
      if (!containerId) console.warn('      [Threads] Container failed:', JSON.stringify(data));
    }

    // Media hosting/container failed and we have text -> fall back to a text post
    if (!containerId && caption) {
      mediaType = 'TEXT';
      const params = new URLSearchParams({ access_token: cfg.token, media_type: 'TEXT', text: caption });
      const res = await fetch(`${API}/${cfg.userId}/threads`, { method: 'POST', body: params });
      const data = await res.json();
      containerId = data.id;
      if (!containerId) {
        console.error('      ✗ Threads text container failed:', JSON.stringify(data));
        return null;
      }
    }
    if (!containerId) return null;

    if (mediaType === 'VIDEO') {
      const ready = await pollVideoContainer(containerId, cfg.token);
      if (!ready) {
        console.warn('      [Threads] Video container never finished processing.');
        return null;
      }
    }

    const pubRes = await fetch(`${API}/${cfg.userId}/threads_publish?creation_id=${containerId}&access_token=${cfg.token}`, {
      method: 'POST'
    });
    const pubData = await pubRes.json();
    if (pubData.id) {
      console.log(`      ✓ Threads Post Live! ID: ${pubData.id}`);
      return pubData.id;
    }
    console.error('      ✗ Threads publish failed:', JSON.stringify(pubData));
    return null;
  } catch (e) {
    console.warn('      [Threads] Error:', e.message);
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
    console.error('[ERROR] THREADS_APP_ID / THREADS_APP_SECRET missing in .env (Threads API product settings in the Meta app — not the Facebook app credentials).');
    process.exit(1);
  }

  const authUrl = `https://threads.net/oauth/authorize?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&response_type=code`;

  console.log('\n======================================================');
  console.log('🔑 ONE-TIME THREADS AUTHENTICATION');
  console.log('======================================================');
  console.log('Opening browser for Threads authorization...');
  console.log(`If it does not open automatically, visit:\n${authUrl}\n`);
  console.log('NOTE: uses the Threads app ID from the Meta app\'s Threads API settings');
  console.log(`with ${REDIRECT_URI} listed under Redirect Callback URLs.`);

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      if (!urlObj.pathname.startsWith('/callback')) return;

      const code = urlObj.searchParams.get('code');
      const err = urlObj.searchParams.get('error_description') || urlObj.searchParams.get('error');

      // Prefetches / stray hits land here without a code — keep waiting instead of dying
      if (!code) {
        console.log(`[Notice] Callback hit without a code (URL: ${req.url}). Still waiting for authorization...`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#94a3b8"><p>Waiting for a valid Threads authorization — complete the consent in the other tab and this page will finish automatically.</p></body></html>');
        return;
      }
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Threads authorization failed: ${err}`);
        console.error('[ERROR] Authorization failed:', err);
        server.close();
        process.exit(1);
      }

      // 1. Exchange the code for a short-lived token
      const exRes = await fetch(`https://graph.threads.net/oauth/access_token?grant_type=authorization_code&client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`);
      const exData = await exRes.json();
      if (!exData.access_token) throw new Error(JSON.stringify(exData));

      // 2. Exchange for a long-lived token (~60 days)
      const llRes = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${APP_SECRET}&access_token=${exData.access_token}`);
      const llData = await llRes.json();
      if (!llData.access_token) throw new Error(JSON.stringify(llData));

      // 3. Resolve the Threads user id / username
      const meRes = await fetch(`${API}/me?fields=id,username&access_token=${llData.access_token}`);
      const meData = await meRes.json();
      if (!meData.id) throw new Error(JSON.stringify(meData));

      const tokenFile = {
        access_token: llData.access_token,
        user_id: meData.id,
        username: meData.username,
        obtained_at: Date.now(),
        expires_at: Date.now() + (llData.expires_in || 60 * 24 * 3600) * 1000
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenFile, null, 2));

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff"><div><h1 style="color:#4ade80">✓ Threads connected as @${meData.username}!</h1><p style="color:#94a3b8">Token saved to ${TOKEN_PATH}. You can close this tab.</p></div></body></html>`);

      console.log(`✓ Threads connected: @${meData.username} (user id ${meData.id})`);
      console.log(`✓ Long-lived token saved to ${TOKEN_PATH} (valid ~60 days — refresh with: node threads-publisher.mjs refresh)`);
      console.log('\nFor GitHub Actions publishing, also add these repository secrets:');
      console.log(`  THREADS_ACCESS_TOKEN = <token from ${TOKEN_PATH}>`);
      console.log(`  THREADS_USER_ID = ${meData.id}`);
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

  server.timeout = 10 * 60 * 1000;
  server.listen(PORT, () => openBrowser(authUrl));

  // Don't hang forever if the user never completes consent
  setTimeout(() => {
    console.log('[TIMEOUT] No callback received within 30 minutes. Re-run: node threads-publisher.mjs auth');
    try { server.close(); } catch (e) { }
    process.exit(1);
  }, 30 * 60 * 1000);
}

async function runTest() {
  const cfg = await getThreadsToken();
  if (!cfg) {
    console.log('No Threads token found. Run: node threads-publisher.mjs auth');
    process.exit(1);
  }
  const res = await fetch(`${API}/${cfg.userId}?fields=id,username&access_token=${cfg.token}`);
  const data = await res.json();
  if (data.id) {
    console.log(`✓ Threads token valid — connected as @${data.username} (user id ${data.id})`);
  } else {
    console.error('✗ Threads token invalid:', JSON.stringify(data));
    process.exit(1);
  }
}

async function runRefresh() {
  const file = readTokenFile();
  if (!file) {
    console.error(`No ${TOKEN_PATH} found. Run auth first.`);
    process.exit(1);
  }
  const refreshed = await refreshLongLivedToken(file.access_token);
  file.access_token = refreshed.access_token;
  file.expires_at = Date.now() + (refreshed.expires_in || 60 * 24 * 3600) * 1000;
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(file, null, 2));
  console.log(`✓ Token refreshed for @${file.username}. New expiry in ~${Math.round((refreshed.expires_in || 0) / 86400)} days.`);
  console.log('If you set THREADS_ACCESS_TOKEN as a GitHub secret, update it with the new value.');
}

async function runPostCli() {
  const args = process.argv.slice(2);
  const pick = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const text = pick('--text') || '';
  const image = pick('--image');
  const video = pick('--video');
  if (!text && !image && !video) {
    console.log('Usage: node threads-publisher.mjs post --text "..." [--image file.jpg] [--video file.mp4]');
    process.exit(1);
  }
  const imageBuffer = image ? fs.readFileSync(image) : null;
  const videoBuffer = (!imageBuffer && video) ? fs.readFileSync(video) : null;
  const id = await publishToThreads({ imageBuffer, videoBuffer, text });
  process.exit(id ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, '/').endsWith('/threads-publisher.mjs');
if (invokedDirectly) {
  const cmd = process.argv[2] || 'help';
  if (cmd === 'auth') runAuth();
  else if (cmd === 'test') runTest();
  else if (cmd === 'refresh') runRefresh();
  else if (cmd === 'post') runPostCli();
  else {
    console.log('Commands: auth | test | refresh | post --text "..." [--image f.jpg] [--video f.mp4]');
  }
}
