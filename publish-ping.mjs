// Publish Ping — the positive buzz. Runs ~10 min after the day's publish
// slots (publish-ping.yml, cron 22:45 UTC). For every video the pipeline
// scheduled for TODAY: verify on YouTube that it is actually public, then
// ntfy the phone. A scheduled video that failed to flip public gets a
// warning buzz instead — silence on a healthy day stays possible.
//   node publish-ping.mjs [--dry]   (--dry logs instead of buzzing)
// Generic over channels: iterates yt-mcp/state/*.json, tokens from
// YT_TOKEN_<SLUG> env or yt-mcp/channels/<slug>/token.json (CI: env only).
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './lib/env.mjs';
loadEnv();

const DRY = process.argv.includes('--dry');
// 24h lookback, not same-UTC-date: GitHub cron delivery can be hours late
// (observed 4-8h on this repo) — a same-date match made late runs silent
// no-ops. Anything published in the last 24h is buzz-worthy.
const DAY_MS = 24 * 3600 * 1000;
const log = (m) => console.log(m);

async function ntfy(title, body) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) { log('[ping] no NTFY_TOPIC — nothing sent'); return; }
  if (DRY) { log(`[ping] (dry) would send: ${title} — ${body}`); return; }
  const r = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST', headers: { Title: title, Tags: 'fire' }, body,
  }).catch(() => null);
  log(r && r.ok ? '[ping] ✓ ntfy sent' : '[ping] ⚠ ntfy delivery failed');
}

async function accessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || '',
      client_secret: process.env.YOUTUBE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('token exchange failed ' + r.status);
  return (await r.json()).access_token;
}

function channelToken(slug) {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = path.join(process.cwd(), 'yt-mcp', 'channels', slug, 'token.json');
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  return raw ? JSON.parse(raw).refresh_token : null;
}

const stateDir = path.join(process.cwd(), 'yt-mcp', 'state');
const slugs = fs.existsSync(stateDir)
  ? fs.readdirSync(stateDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : [];

let live = 0, problems = 0;
for (const slug of slugs) {
  const st = JSON.parse(fs.readFileSync(path.join(stateDir, `${slug}.json`), 'utf8'));
  const due = (st.lastVideos || []).filter((v) => {
    const at = v.publishAt ? new Date(v.publishAt).getTime() : NaN;
    return v && v.videoId && Number.isFinite(at) && at > Date.now() - DAY_MS;
  });
  if (!due.length) { log(`[${slug}] nothing published in the last 24h — quiet`); continue; }
  const refresh = channelToken(slug);
  if (!refresh) { log(`[${slug}] no token — skipped`); continue; }
  const tok = await accessToken(refresh);
  for (const v of due) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${v.videoId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const item = (await r.json()).items?.[0];
    const privacy = item?.status?.privacyStatus || 'not found';
    if (privacy === 'public') {
      await ntfy(`✓ ${slug} is LIVE`, `${item.snippet.title}\nhttps://youtube.com/shorts/${v.videoId}`);
      live++;
    } else if (new Date(v.publishAt) > new Date()) {
      log(`[${slug}] ${v.videoId} not due yet (slot ${v.publishAt}) — quiet`);
    } else {
      await ntfy(`⚠ ${slug}: video did not go public`, `${v.title} (${v.videoId}) is "${privacy}" after its slot ${v.publishAt}. Check Studio → Content.`);
      problems++;
    }
  }
}
log(`[ping] done — ${live} live ✓, ${problems} problem(s)`);
