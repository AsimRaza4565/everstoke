// Onboard a new YouTube channel to the yutu MCP setup.
// Usage: node add-yt-channel.mjs <channel-slug>   e.g. node add-yt-channel.mjs silentwealth
//
// Runs the OAuth consent flow on http://localhost:3000 (redirect URI already
// whitelisted on the existing Google OAuth client in .env) and saves a
// Go-format token to yt-mcp/channels/<slug>/token.json, then prints the JSON
// block to paste into .mcp.json.
//
// IMPORTANT: on the Google consent screen, pick the Google account, then
// choose the BRAND CHANNEL you want this token to control (the channel
// chooser appears when your Gmail manages multiple channels).
import fs from 'node:fs';
import http from 'node:http';
import { exec } from 'node:child_process';
import { google } from 'googleapis';
import { loadEnv } from './lib/env.mjs';

loadEnv();

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
  console.error('Usage: node add-yt-channel.mjs <channel-slug>   (e.g. silentwealth)');
  process.exit(1);
}

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
  ],
  prompt: 'consent'
});

console.log(`\nOnboarding channel "${slug}"`);
console.log('\n1. Opening browser — approve access AND pick the right brand channel:\n');
console.log(authUrl);
exec(`start "" "${authUrl}"`);
console.log('\n2. Waiting for the callback on http://localhost:3000 ...\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== '/oauth2callback') { res.end('waiting...'); return; }
    const code = url.searchParams.get('code');
    if (!code) { res.end('no code received'); return; }
    res.end('<html><body style="font-family:sans-serif"><h2>✅ Authorized! You can close this tab.</h2></body></html>');

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify + identify the channel this token controls
    const yt = google.youtube({ version: 'v3', auth: oauth2Client });
    const { data } = await yt.channels.list({ part: 'id,snippet', mine: true });
    const ch = data.items?.[0];
    if (!ch) throw new Error('No channel authorized — did you skip the channel chooser?');

    // Go oauth2 token format (what yutu's YUTU_CACHE_TOKEN expects)
    const dir = `yt-mcp/channels/${slug}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/token.json`, JSON.stringify({
      access_token: tokens.access_token,
      token_type: tokens.token_type || 'Bearer',
      refresh_token: tokens.refresh_token,
      expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3500e3).toISOString()
    }, null, 2));
    server.close();

    const exe = 'C:\\\\Users\\\\Revnix\\\\AppData\\\\Roaming\\\\npm\\\\node_modules\\\\@eat-pray-ai\\\\yutu\\\\node_modules\\\\@eat-pray-ai\\\\yutu-win32-x64\\\\bin\\\\yutu.exe';
    const cred = 'C:\\\\Users\\\\Revnix\\\\Documents\\\\youtube-automation\\\\yt-mcp\\\\client_secret.json';
    const tok = `C:\\\\Users\\\\Revnix\\\\Documents\\\\youtube-automation\\\\yt-mcp\\\\channels\\\\${slug}\\\\token.json`;

    console.log('\n=== SUCCESS ===');
    console.log(`Channel: ${ch.snippet.title} (${ch.id})`);
    console.log(`Token saved: ${dir}/token.json`);
    console.log('\n3. Paste this block into .mcp.json (inside "mcpServers"):\n');
    console.log(`    "yt-${slug}": {`);
    console.log('      "type": "stdio",');
    console.log(`      "command": "${exe}",`);
    console.log('      "args": ["mcp"],');
    console.log('      "env": {');
    console.log(`        "YUTU_CREDENTIAL": "${cred}",`);
    console.log(`        "YUTU_CACHE_TOKEN": "${tok}",`);
    console.log('        "YUTU_LOG_LEVEL": "ERROR"');
    console.log('      },');
    console.log('      "enabled": true,');
    console.log('      "timeoutMs": 60000');
    console.log('    },');
    console.log('\n4. Restart ZCode, then test: node yt-mcp/smoke-test.mjs yt-mcp/channels/' + slug + '/token.json\n');
    process.exit(0);
  } catch (e) {
    console.error('Callback error:', e.message);
    res.end('error — see terminal');
  }
});
server.listen(3000);
