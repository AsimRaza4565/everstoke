// OAuth re-authorization for QUOTE QUARRY only (its refresh token was revoked,
// most likely when the other 3 channels were re-authed on the same account+client).
// Saves yt-mcp/channels/quotequarry/token.json — the secret push happens separately.
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
import { loadEnv } from './lib/env.mjs';
loadEnv();

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:3000/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];
const SLUGS = ['quotequarry'];
let idx = 0;

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/oauth2callback') { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  const slug = SLUGS[idx];
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ Quote Quarry authorized! You can close this window.</h2></body></html>');
  try {
    const { tokens } = await oAuth2.getToken(code);
    if (!tokens.refresh_token) throw new Error('no refresh_token returned — redo with prompt=consent');
    const dir = path.join(HERE, 'yt-mcp', 'channels', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3650 * 86400000
    }, null, 2));
    console.log(`✓ ${slug} — token saved to yt-mcp/channels/${slug}/token.json`);
    console.log('=== QUOTE QUARRY RE-AUTHORIZED ===');
    server.close();
    process.exit(0);
  } catch (e) { console.error('ERROR:', e.message); }
});

server.listen(3000, () => {
  const url = oAuth2.generateAuthUrl({
    access_type: 'offline', scope: SCOPES, prompt: 'consent',
    redirect_uri: REDIRECT, state: '0'
  });
  console.log('=== OAuth Server on :3000 ===');
  console.log('AUTH URL: ' + url);
  try { execSync(`start "" "${url}"`, { shell: 'cmd.exe', timeout: 5000 }); } catch (e) { console.log('auto-open failed, use the AUTH URL above'); }
});
