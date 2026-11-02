// Reporting: shared state + collection from platform APIs.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { google } from 'googleapis';

const envStr = (() => { try { return fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : ''; } catch (e) { return ''; } })();
const envOf = (k) => process.env[k] || (envStr.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1]?.trim() || '';

const STATE_DIR = 'state';
const LOG_FILE = 'logs/posts-log.json';
export const PKT_OFFSET_MIN = 300; // UTC+5, no DST

export function pktDate(d = new Date()) {
  const pkt = new Date(d.getTime() + PKT_OFFSET_MIN * 60000);
  return pkt.toISOString().slice(0, 10);
}

function ytClient() {
  const oauth2Client = new google.auth.OAuth2(
    envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'), 'http://localhost:3000/oauth2callback');
  oauth2Client.setCredentials({ refresh_token: envOf('YOUTUBE_REFRESH_TOKEN') });
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// Posts log (what was posted where, published or failed)
// ---------------------------------------------------------------------------
export function logPost(entry) {
  try {
    fs.mkdirSync('logs', { recursive: true });
    const log = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')) : [];
    log.push({ ts: new Date().toISOString(), ...entry });
    fs.writeFileSync(LOG_FILE, JSON.stringify(log.slice(-3000), null, 1));
  } catch (e) { console.log('[reporting] logPost failed:', e.message); }
}

export function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); } catch (e) { return []; }
}
