// Self-healing sweeper for the 4 live channels.
// Every night it counts each channel's reels that go live TODAY (scheduled or
// already public). A channel short on reels gets just the missing ones re-produced
// (yt-daily --topup=N), then the FB/IG outboxes are drained so healed reels
// cross-post too. The old single-channel / 5-brand logic is gone.
// Usage: node sweeper.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { google } from 'googleapis';
import { applyChannelKeys, checkChannelKeys, dropChannelKeys } from './lib/channel-keys.mjs';
import { LEGACY_SLUGS } from './lib/registry.mjs';
import { resolveBrand } from './lib/brand-resolve.mjs';
import { loadEnv, envOf } from './lib/env.mjs';

loadEnv();





const DRY = process.argv.includes('--dry-run');
const todayUTC = new Date().toISOString().slice(0, 10);
const log = (m) => console.log(m);
const CHANNEL_SLUGS = [...LEGACY_SLUGS]; // canonical list — lib/registry.mjs (issue #76)
const brands = JSON.parse(fs.readFileSync('lib/brands.json', 'utf8'));
// 10-05 CHANNEL FACTORY: Studio-wizard channels join the sweep — they heal
// from their registry entry (slots/handle) instead of lib/brands.json.
let REG = {};
try {
  const reg = JSON.parse(fs.readFileSync(path.join('yt-mcp', 'studio-channels.json'), 'utf8'));
  for (const c of reg.channels || []) {
    if (c.active !== false && !CHANNEL_SLUGS.includes(c.slug)) {
      CHANNEL_SLUGS.push(c.slug);
      REG[c.slug] = c;
    }
  }
  if (Object.keys(REG).length) log(`[registry] ${Object.keys(REG).length} wizard channel(s) in the sweep: ${Object.keys(REG).join(', ')}`);
} catch { }

const healed = [];
const warnings = [];

function oauth(refreshToken) {
  const a = new google.auth.OAuth2(envOf('YOUTUBE_CLIENT_ID'), envOf('YOUTUBE_CLIENT_SECRET'));
  a.setCredentials({ refresh_token: refreshToken });
  return a;
}

function channelAuth(slug) {
  const raw = envOf(`YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`)
    || (fs.existsSync(path.join('yt-mcp', 'channels', slug, 'token.json'))
      ? fs.readFileSync(path.join('yt-mcp', 'channels', slug, 'token.json'), 'utf8') : '');
  const t = JSON.parse(raw || '{}');
  if (!t.refresh_token) throw new Error('no token for ' + slug);
  return oauth(t.refresh_token);
}

// Slots are UTC in brands.json, so "goes live today" = status.publishAt
// (still scheduled) or snippet.publishedAt (already public) is today's UTC date.
function goesLiveToday(v) {
  const when = (v.status && v.status.publishAt) || v.snippet.publishedAt || '';
  return when.slice(0, 10) === todayUTC;
}

// ---- 1. Per-channel reel count + top-up ------------------------------------
// 10-05 CADENCE: Sunday is the break day — nothing is produced or healed.
const sundayBreak = new Date(todayUTC + 'T00:00:00Z').getUTCDay() === 0;
if (sundayBreak) log(`🛌 Sunday break day — shorts production and healing paused network-wide`);
for (const slug of CHANNEL_SLUGS) {
  const b = brands[slug] || (REG[slug] ? { slots: REG[slug].slots || ['22:35'], handle: REG[slug].handle || '', label: REG[slug].label || slug } : null);
  if (!b) { log(`✗ [${slug}] no brand kit found — skipped`); continue; }
  const want = (b.slots || []).length;
  if (sundayBreak) continue;
  // 10-05: respect pausedUntil (feed-collapse cooldown — Quote Quarry Oct-1
  // recovery). A paused channel must NOT be healed behind the pause.
  try {
    const stPause = JSON.parse(fs.readFileSync(path.join('yt-mcp', 'state', `${slug}.json`), 'utf8'));
    if ((stPause.pausedUntil || '') >= todayUTC) {
      log(`⏸ [${slug}] paused until ${stPause.pausedUntil} — not healing`);
      continue;
    }
  } catch { }
  try {
    const y = google.youtube({ version: 'v3', auth: channelAuth(slug) });
    const ch = await y.channels.list({ part: 'snippet,contentDetails', mine: true });
    const c = ch.data.items?.[0];
    if (!c) throw new Error('channel not reachable');
    // Identity guard: a stale/mislabeled token must never heal the wrong channel.
    const handle = (c.snippet.customUrl || '').toLowerCase();
    if (b.handle && handle && handle !== b.handle.toLowerCase()) {
      warnings.push(`${slug}: token points at ${handle}, expected ${b.handle} — skipped`);
      log(`✗ [${slug}] token points at ${handle} but ${b.handle} expected — NOT healing this channel`);
      continue;
    }
    const up = await y.playlistItems.list({ part: 'contentDetails', playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: 15 });
    const ids = up.data.items.map(i => i.contentDetails.videoId).filter(Boolean);
    let count = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const vs = await y.videos.list({ part: 'snippet,status', id: ids.slice(i, i + 50).join(',') });
      count += (vs.data.items || []).filter(goesLiveToday).length;
    }
    const missing = Math.max(0, want - count);
    if (missing === 0) {
      log(`✓ [${slug}] ${count}/${want} reels go live today — healthy`);
      continue;
    }
    // #98 clips lane: flipped channels are healed by the clips publisher, not
    // yt-daily topups (a topup here would double-produce generated Shorts)
    const kit = await resolveBrand(slug).catch(() => null);
    if (kit?.shortsSource === 'clips') {
      log(`↷ [${slug}] shortsSource=clips — healing belongs to the clips lane, skipped`);
      continue;
    }
    if (DRY) {
      log(`⚠ [${slug}] ${count}/${want} reels go live today — would top-up +${missing} (dry-run)`);
      continue;
    }
    log(`⚠ [${slug}] ${count}/${want} reels go live today — re-producing ${missing}...`);
    const appliedKeys = applyChannelKeys(slug); // BYOK: this channel's own provider keys for the heal run
    // #39: heal runs must run the dead-key guard too (it only existed in the
    // pipeline) — dead keys are dropped so the SHARED key actually resumes.
    try {
      const chk = await checkChannelKeys(slug);
      if (chk.dead.length) {
        dropChannelKeys(chk.dead.map((d) => d.provider));
        const detail = chk.dead.map((d) => `${d.provider} (${d.detail})`).join('; ');
        log(`⚠ [keys] ${slug}: dead channel keys dropped — shared resuming: ${detail}`);
        warnings.push(`${slug}: dead channel keys dropped: ${chk.dead.map((d) => d.provider).join(', ')}`);
        if (envOf('NTFY_TOPIC') && !DRY) {
          await fetch(`https://ntfy.sh/${envOf('NTFY_TOPIC')}`, {
            method: 'POST', headers: { 'Title': `[${slug}] dead API keys — shared resuming` }, body: detail,
          }).catch(() => { });
        }
      }
    } catch { }
    const r = execFileSync('node', ['yt-daily.mjs', slug, '--no-episode', `--topup=${missing}`], { stdio: 'inherit', timeout: 40 * 60 * 1000 });
    // #39: restore the shared keys — without this, channel A's BYOK keys
    // leaked into channel B's heal process env
    dropChannelKeys(appliedKeys || []);
    healed.push(`${b.label} +${missing}`);
  } catch (e) {
    warnings.push(`${slug}: ${String(e.message).slice(0, 100)}`);
    log(`✗ [${slug}] sweep failed: ${String(e.message).slice(0, 100)}`);
  }
}

// ---- 2. Drain FB outbox so healed reels cross-post too ----------------------
// (IG is NOT drained here — reels are posted by ig-slot-poster.yml at fixed
// slot times; an instant IG drain at 20:15 UTC would double-post slot 3.)
// 2026-10-23 owner: platforms paused (YouTube-only) — the drain is skipped.
if (process.env.PLATFORMS_PAUSED !== '0') {
  log('FB outbox drain skipped (platforms paused — YouTube-only focus)');
} else if (healed.length && !DRY) {
  for (const s of ['fb-crosspost.mjs']) {
    try { execFileSync('node', [s], { stdio: 'inherit', timeout: 40 * 60 * 1000 }); }
    catch (e) { warnings.push(`${s}: ${String(e.message).slice(0, 80)}`); }
  }
}

// ---- 3. Daily long-form (compilation on the main channel) -------------------
let hasLong = false;
try {
  const y = google.youtube({ version: 'v3', auth: oauth(envOf('YOUTUBE_REFRESH_TOKEN')) });
  const ch = await y.channels.list({ part: 'contentDetails', mine: true });
  const pl = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const up = await y.playlistItems.list({ part: 'contentDetails', playlistId: pl, maxResults: 15 });
  const ids = up.data.items.map(i => i.contentDetails.videoId).filter(Boolean);
  const vs = await y.videos.list({ part: 'snippet', id: ids.join(',') });
  const cutoff = Date.now() - 30 * 3600000;
  hasLong = (vs.data.items || []).some(v => /compilation/i.test(v.snippet.title || '') && new Date(v.snippet.publishedAt).getTime() >= cutoff);
  log(hasLong ? '✓ Daily long-form is live.' : '⚠ No daily long-form in the last 30h.');
} catch (e) { log(`[long-form] check failed: ${String(e.message).slice(0, 80)}`); }

const utcHour = new Date().getUTCHours();
if (!hasLong && utcHour >= 13 && utcHour < 21) {
  if (DRY) {
    log('(dry-run) would re-dispatch weekly-compilation.yml');
  } else {
    log('Re-dispatching compilation workflow...');
    try {
      const token = envOf('GITHUB_PAT') || envOf('SECRET_WRITER_PAT');
      const repo = process.env.GITHUB_REPOSITORY || 'muzzamilhassan/automation';
      execFileSync('curl', ['-s', '-X', 'POST',
        '-H', `Authorization: token ${token}`,
        `https://api.github.com/repos/${repo}/actions/workflows/weekly-compilation.yml/dispatches`,
        '-d', '{"ref":"main"}'], { timeout: 30000 });
      log('✓ Long-form re-dispatched.');
    } catch (e) { log('✗ re-dispatch failed:', e.message); }
  }
}

// ---- 4. Phone alert when healing happened ----------------------------------
if (healed.length && envOf('NTFY_TOPIC') && !DRY) {
  const body = `Quarry sweeper healed: ${healed.join(', ')}. FB/IG cross-posts drained.`
    + (warnings.length ? ` Warnings: ${warnings.length}.` : '');
  try {
    await fetch(`https://ntfy.sh/${envOf('NTFY_TOPIC')}`, {
      method: 'POST', headers: { 'Title': 'Quarry Sweeper Report' }, body
    });
    log('✓ NTFY alert sent.');
  } catch { log('[ntfy] alert failed (non-fatal)'); }
}

log('\n══ SWEEP COMPLETE ══');
log(healed.length ? `  Healed: ${healed.join(', ')}` : '  All channels healthy');
// recycle flow was removed 09-18 — the dead references crashed the run after
// healing (audit F5, 2026-10-23)
warnings.forEach(w => log('  ! ' + w));
log(DRY ? '  (dry-run — nothing was changed)' : '  Sweeper done.');
