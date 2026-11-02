// OAuth re-authorization v2 — account-agnostic.
// The Google account picker shows number-named accounts, so the user just
// clicks Allow on ANY 4 accounts in ANY order. Each incoming token is
// identified by calling YouTube channels.list (real channel title/handle),
// then written into the correct yt-mcp/channels/<slug>/token.json.
// Usage: node oauth-reauth.mjs   (prints AUTH URL — open it in a browser)
import http from 'node:http';
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
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];
const NEEDED = 4;

// slug → matching hints (customUrl OR channel title, lowercased)
const MATCH = {
  'quotequarry': ['quotequarry'],
  'investors-compass': ['investorscompass', "investor's compass", 'investors compass'],
  'money-rulebook': ['moneyrulebook', 'money rulebook'],
  'debt-free-doctrine': ['debtfreedoctrine', 'debt-free doctrine', 'debt free doctrine'],
};

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const pending = [];

function identify(token) {
  const a = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  a.setCredentials({ access_token: token.access_token });
  return google.youtube({ version: 'v3', auth: a }).channels.list({ part: 'snippet', mine: true })
    .then(r => {
      const c = r.data.items?.[0];
      return { title: c?.snippet?.title || '?', handle: (c?.snippet?.customUrl || '').toLowerCase(), channelId: c?.id || '?' };
    })
    .catch(e => ({ title: 'API error: ' + String(e.message).slice(0, 50), handle: '', channelId: '?' }));
}

function slugFor(ident) {
  const hay = (ident.handle + ' ' + ident.title).toLowerCase().replace(/[^a-z0-9' ]/g, ' ');
  for (const [slug, hints] of Object.entries(MATCH)) {
    if (hints.some(h => hay.includes(h))) return slug;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/oauth2callback') { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  if (!code) { res.writeHead(400); res.end('missing code'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>✅ Received ${pending.length + 1} of ${NEEDED}</h2><p>${pending.length + 1 < NEEDED ? 'Opening the next window…' : 'Identifying channels…'}</p></body></html>`);
  try {
    const { tokens } = await oAuth2.getToken(code);
    const slot = pending.length;
    fs.mkdirSync(path.join(HERE, 'yt-mcp', 'channels', '_pending'), { recursive: true });
    fs.writeFileSync(path.join(HERE, 'yt-mcp', 'channels', '_pending', `token-${slot}.json`), JSON.stringify(tokens, null, 2));
    pending.push(tokens);
    console.log(`[${pending.length}/${NEEDED}] received (saved to _pending/token-${slot}.json)`);
    if (pending.length === NEEDED) {
      console.log('Identifying the 4 accounts…');
      const idents = [];
      for (let i = 0; i < pending.length; i++) {
        const ident = await identify(pending[i]);
        idents.push({ slot: i, ...ident });
        console.log(`  slot ${i}: "${ident.title}" (${ident.handle || 'no handle'})`);
      }
      const used = new Set(); const placed = []; const unknown = [];
      for (const ident of idents) {
        const slug = slugFor(ident);
        if (!slug || used.has(slug)) { unknown.push(ident); continue; }
        used.add(slug);
        const dir = path.join(HERE, 'yt-mcp', 'channels', slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({
          access_token: pending[ident.slot].access_token,
          refresh_token: pending[ident.slot].refresh_token,
          scope: pending[ident.slot].scope || SCOPES.join(' '),
          token_type: 'Bearer',
          expiry_date: Date.now() + 3600 * 1000 // real access-token lifetime
        }, null, 2));
        placed.push(`${slug}  <-  "${ident.title}" (${ident.handle})`);
      }
      console.log('=== PLACED ===');
      for (const p of placed) console.log('  ' + p);
      if (unknown.length) {
        console.log('=== UNKNOWN ACCOUNTS (not one of our channels — redo needed for: ' +
          Object.keys(MATCH).filter(s => !used.has(s)).join(', ') + ') ===');
        for (const u of unknown) console.log('  "' + u.title + '" (' + u.handle + ')');
        process.exit(1);
      }
      console.log('=== ALL 4 CHANNELS RE-AUTHORIZED ===');
      server.close();
      process.exit(0);
    }
  } catch (e) { console.error('ERROR:', e.message); }
});

server.listen(3000, () => {
  const url = oAuth2.generateAuthUrl({
    access_type: 'offline', scope: SCOPES, prompt: 'consent',
    redirect_uri: REDIRECT, state: '0'
  });
  console.log('=== OAuth Server on :3000 ===');
  console.log('AUTH URL: ' + url);
});
