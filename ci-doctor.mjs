// CI Doctor — checks all channels are healthy and publishing.
// Usage: node ci-doctor.mjs
// Creates a health report and GitHub issue if problems found.
import fs from 'node:fs';
import { google } from 'googleapis';
import { LEGACY_SLUGS as SLUGS } from './lib/registry.mjs';
import { asciiHeaderValue } from './lib/ntfy-alert.mjs';
import { loadEnv } from './lib/env.mjs';

loadEnv();


const results = [];

import { validateWorkflows } from './lib/workflow-validator.mjs';

// ---- Workflow file validation (09-20) ----
// Sep 18 lesson: one orphaned YAML line silently dropped every scheduled run
// while this doctor reported green. Parse every workflow file, fail loudly.
const { valid: workflowsValid, problems: yamlProblems } = await validateWorkflows('.github/workflows');
if (!workflowsValid) {
  results.push({ slug: 'workflows', status: 'BROKEN_WORKFLOW', error: yamlProblems.join(' | ') });
  console.log('🚨 BROKEN WORKFLOW FILES:\n  ' + yamlProblems.join('\n  '));
} else {
  console.log('✅ all workflow files parse clean');
}

for (const slug of SLUGS) {
  const envName = `YT_TOKEN_${slug.toUpperCase().replace(/-/g, '_')}`;
  const tokenFile = `yt-mcp/channels/${slug}/token.json`;
  const raw = process.env[envName] || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8') : '');
  if (!raw) { results.push({ slug, status: 'NO_TOKEN' }); continue; }

  try {
    const t = JSON.parse(raw);
    const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: t.refresh_token });
    const yt = google.youtube({ version: 'v3', auth });

    const { data } = await yt.channels.list({ part: 'snippet,statistics,contentDetails', mine: true });
    const c = data.items?.[0];
    if (!c) { results.push({ slug, status: 'NO_CHANNEL' }); continue; }

    // 48h stall check — videoCount > 0 alone can't see a channel stalled for
    // weeks (issue #69). Uploads playlist latest item = last upload/schedule.
    let lastUploadHours = null;
    try {
      const up = c.contentDetails?.relatedPlaylists?.uploads;
      if (up) {
        const pl = await yt.playlistItems.list({ part: 'snippet', playlistId: up, maxResults: 1 });
        const publishedAt = pl.data.items?.[0]?.snippet?.publishedAt;
        if (publishedAt) lastUploadHours = Math.round((Date.now() - new Date(publishedAt)) / 3600000);
      }
    } catch { } // analytics-adjacent call; stall check stays best-effort

    const stale = lastUploadHours !== null && lastUploadHours > 48;
    results.push({
      slug,
      channel: c.snippet.title,
      subs: c.statistics.subscriberCount,
      totalVideos: c.statistics.videoCount,
      lastUploadHours,
      status: stale ? 'STALE' : (+c.statistics.videoCount > 0 ? 'OK' : 'NO_VIDEOS')
    });
  } catch (e) {
    results.push({ slug, status: 'ERROR', error: e.message.slice(0, 100) });
  }
}

// Report
console.log('\n=== CI DOCTOR REPORT ===');
let problems = 0;
for (const r of results) {
  const icon = r.status === 'OK' ? '✅' : '⚠️';
  console.log(`${icon} ${r.slug} | ${r.channel || 'N/A'} | subs: ${r.subs || '?'} | last upload: ${r.lastUploadHours != null ? r.lastUploadHours + 'h ago' : '?'} | status: ${r.status}`);
  if (r.status !== 'OK') problems++;
}
console.log(`\n${problems} channel(s) with issues out of ${results.length}`);

// Save report for CI to pick up
fs.writeFileSync('ci-doctor-report.json', JSON.stringify({ at: new Date().toISOString(), problems, results }, null, 2));
console.log('Report saved: ci-doctor-report.json');

// ---- Alert + fail loudly (issue #69: a watchdog that can't bark) ----
// The 10-16/17 outage proved this script finding problems changes nothing on
// its own. problems > 0 -> ntfy push + GitHub issue (deduped) + exit 1.
const bad = results.filter((r) => r.status !== 'OK');
if (bad.length) {
  const summary = bad.map((r) => `${r.slug}: ${r.status}${r.error ? ' — ' + r.error : ''}${r.lastUploadHours != null ? ` (last upload ${r.lastUploadHours}h ago)` : ''}`).join('\n');
  // 1. ntfy phone push (best-effort)
  if (process.env.NTFY_TOPIC) {
    try {
      const res = await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        // #91: the raw emoji made undici reject the header ("Cannot convert
        // argument to a ByteString", run 39055331728) — push never reached the
        // phone. The 🏥 icon still shows via the Tags shortcode on ntfy.
        headers: { Title: asciiHeaderValue('🏥 CI Doctor problems'), Priority: 'high', Tags: 'hospital' },
        body: summary.slice(0, 400),
      });
      console.log(`[alert] ntfy push: ${res.ok ? 'sent' : 'HTTP ' + res.status}`);
    } catch (e) { console.log('[alert] ntfy failed:', String(e.message).slice(0, 80)); }
  }
  // 2. GitHub issue — comment on the open doctor issue if one exists, else create
  try {
    const { execFileSync } = await import('node:child_process');
    const listing = execFileSync('gh', ['issue', 'list', '--state', 'open', '--search', 'CI Doctor in:title', '--limit', '5'], { encoding: 'utf8', timeout: 30000 });
    const first = listing.split('\n').find((l) => l.trim());
    if (first) {
      const num = first.split('\t')[0];
      execFileSync('gh', ['issue', 'comment', num, '--body', `CI Doctor problems at ${new Date().toISOString()}:\n\n${summary}`]);
      console.log(`[alert] commented on existing issue #${num}`);
    } else {
      execFileSync('gh', ['issue', 'create', '--title', '🏥 CI Doctor: channels reporting problems', '--body', `${summary}\n\n_Auto-filed by ci-doctor.mjs — see ci-doctor-report.json in the run artifacts._`]);
      console.log('[alert] GitHub issue created');
    }
  } catch (e) { console.log('[alert] GitHub issue step failed:', String(e.message).slice(0, 80)); }
  process.exitCode = 1; // red workflow = visible even if ntfy/issue both fail
} else {
  console.log('✅ no problems — nothing to alert');
}
