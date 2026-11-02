// One-shot OAuth for a single missing channel: receives ONE Google account,
// identifies it via YouTube, and only places it if it's the wanted slug.
// Usage: node oauth-one.mjs <slug>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
import { loadEnv } from './lib/env.mjs';
loadEnv();

const WANT = process.argv[2];
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT = 'http://localhost:3000/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];
const MATCH = {
  'quotequarry': ['quotequarry'],
  'investors-compass': ['investorscompass', "investor's compass", 'investors compass'],
  'money-rulebook': ['moneyrulebook', 'money rulebook'],
  'debt-free-doctrine': ['debtfreedoctrine', 'debt-free doctrine', 'debt free doctrine'],
};

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
let got = false;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/oauth2callback' || got) { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  if (!code) { res.writeHead(400); res.end(); return; }
  got = true;
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>Checking…</h2></body></html>');
  try {
    const { tokens } = await oAuth2.getToken(code);
    const a = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    a.setCredentials({ access_token: tokens.access_token });
    const r = await google.youtube({ version: 'v3', auth: a }).channels.list({ part: 'snippet', mine: true });
    const c = r.data.items?.[0];
    const ident = { title: c?.snippet?.title || '?', handle: (c?.snippet?.customUrl || '').toLowerCase() };
    const hay = (ident.handle + ' ' + ident.title).toLowerCase();
    const slug = Object.entries(MATCH).find(([, hints]) => hints.some(h => hay.includes(h)))?.[0] || null;
    console.log(`got account: "${ident.title}" (${ident.handle || 'no handle'}) → ${slug || 'unknown'}`);
    if (slug === WANT) {
      const dir = path.join(HERE, 'yt-mcp', 'channels', WANT);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || SCOPES.join(' '),
        token_type: 'Bearer',
        expiry_date: Date.now() + 3600 * 1000 // real access-token lifetime (consumers pass refresh_token only)
      }, null, 2));
      console.log(`=== CORRECT — ${WANT} token placed ===`);
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ That was ' + WANT + '! All set.</h2></body></html>');
      setTimeout(() => process.exit(0), 500);
    } else {
      console.log(`=== WRONG ACCOUNT — that was "${ident.title}". Please pick a DIFFERENT account. ===`);
      res.end('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>❌ That was ' + (slug || 'an unknown account') + ', not ' + WANT + '.</h2><p>A new window will open — pick a different account.</p></body></html>');
      setTimeout(() => process.exit(2), 1500);
    }
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
});

server.listen(3000, () => {
  const url = oAuth2.generateAuthUrl({
    access_type: 'offline', scope: SCOPES, prompt: 'consent',
    redirect_uri: REDIRECT, state: '0'
  });
  console.log('=== One-shot OAuth for: ' + WANT + ' ===');
  console.log('AUTH URL: ' + url);
});
