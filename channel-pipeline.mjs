// Quarry Channel Pipeline — one command = everything for one channel.
// Produces Shorts → YouTube, cross-posts FB Reels, IG Reels, niche posters.
// Adding a new platform later = add one step here. No workflow changes needed.
//
// Usage: node channel-pipeline.mjs <slug> [--no-episode] [--force]
// Each step is independent: if one fails, the rest continue.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const slug = process.argv[2];
const FORCE = process.argv.includes('--force');
const SKIP_EPISODE = process.argv.includes('--no-episode');
const NO_UPLOAD = process.argv.includes('--no-upload');
// --topup=N: heal/backfill mode (sweeper semantics) — produce the first N slots
// even if today already ran; yt-daily marks the NEXT day done so the morning
// cron can't double-produce the healed reels.
const topupArg = process.argv.find(a => a.startsWith('--topup'));
const TOPUP_N = topupArg ? Math.max(0, Number(topupArg.split('=')[1]) || 0) : 0;
// 10-05 CHANNEL FACTORY: registry channels (Studio wizard) resolve from
// yt-mcp/studio-channels.json when lib/brands.json has no entry.
// #100: resolve through brand-resolve for EVERY channel — the cadence overlay
// (yt-mcp/cadence.json: docDays/shortDays/shortsSource) merges there; reading
// lib/brands.json directly would bypass scheduling for legacy channels.
const { resolveBrand } = await import('./lib/brand-resolve.mjs');
const { isDocDay, docDaysOf } = await import('./lib/doc-days.mjs');
let b = await resolveBrand(slug);
if (!b) { console.error(`[pipeline] unknown slug: ${slug}`); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
// 09-20: per-channel state files are the source of truth (lib/state.mjs)
import { loadAllStates } from './lib/state.mjs';
// 10-09 BYOK: this channel's own provider keys (encrypted yt-mcp/channel-keys.json)
// replace the shared keys for the rest of the run — children inherit process.env.
import { applyChannelKeys, checkChannelKeys, dropChannelKeys } from './lib/channel-keys.mjs';
// #99 shared YouTube quota budget + #91-style alerts that always report outcome
import { evaluate } from './lib/quota-ledger.mjs';
import { sendAlert } from './lib/ntfy-alert.mjs';
const loadState = () => loadAllStates();

const log = (msg) => console.log(`[${slug}] ${msg}`);
const results = { shorts: false, episode: false, fbReels: false, igReels: false, poster: false };
const errors = [];

function run(script, args = [], timeout = 900000) {
  log(`▶ ${script} ${args.join(' ')}`);
  try {
    const r = spawnSync('node', [script, ...args], { stdio: 'inherit', timeout });
    if (r.error) {
      log(`✖ ${script} error: ${r.error.message}`);
      errors.push(`${script}: ${r.error.message}`);
    }
    return r.status === 0;
  } catch (e) { errors.push(`${script}: ${e.message}`); return false; }
}

// ---- Load state ----
const state = loadState();
const _keysApplied = applyChannelKeys(slug);
if (_keysApplied) {
  // BYOK health check: a dead channel key must NOT silently degrade production —
  // drop it from env (shared key takes over) and alert the owner/client.
  const _check = await checkChannelKeys(slug);
  if (_check.dead.length) {
    dropChannelKeys(_check.dead.map((d) => d.provider));
    for (const d of _check.dead) log(`[keys] WARN ${d.provider} key DEAD (${d.detail}) - dropped, shared key covering`);
    if (process.env.NTFY_TOPIC) {
      fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Title: `[${slug}] dead API key - shared key covering` },
        body: `Channel keys failed validation: ${_check.dead.map((d) => `${d.provider} (${d.detail})`).join('; ')}. Replace them in Studio > API Keys.`,
      }).catch(() => { });
    }
  }
  const _alive = _check.ok.filter((x) => _keysApplied.includes(x));
  log(_alive.length ? `[keys] channel overrides active: ${_alive.join(', ')}` : '[keys] channel keys all failed validation - using shared keys');
} else {
  log('[keys] using shared keys');
}
const shortsDone = state[slug]?.lastRunDate === today;
const episodeDone = state[slug]?.deepdiveDate === today;

// 2026-10-23 OWNER DIRECTIVE: YouTube-only focus — all non-YouTube platform
// publishing (FB/IG/TikTok) is paused until YouTube work is fully finished.
// Default is PAUSED; to resume later set PLATFORMS_PAUSED=0 in the workflow
// env (or locally) — no other change needed.
const PLATFORMS_PAUSED = process.env.PLATFORMS_PAUSED !== '0';

// ---- Phase 0: shared YouTube quota budget (#99) — every channel draws on ONE
// 10,000 units/day pool (one OAuth client, ~1,700/upload). Fail closed BEFORE
// any render/LLM spend when one more upload would breach the daily budget.
async function quotaGate(label) {
  const q = evaluate(loadState());
  if (q.allowed) return true;
  log(`[quota] ${label} skipped — shared pool ${q.usedUnits}/${q.dailyLimit} units today (${q.uploadsToday} uploads) — resets midnight PT`);
  await sendAlert({ text: `${slug}: ${label} skipped — YouTube API daily budget reached (${q.usedUnits}/${q.dailyLimit} units, ${q.uploadsToday} uploads today). Resets midnight PT.`, title: `[${slug}] daily upload budget reached` });
  return false;
}

// ---- Phase 0.5: #102 TEMPLATE PREFLIGHT — enforce only for assigned channels ----
// Channels WITH an active registry assignment (Phase 1: the pilot only) get
// their pinned template resolved against catalog registry data + compatibility
// validated BEFORE any generation spend; a blocked verdict ntfy-alerts and
// exits non-zero. Everyone else takes the legacy path — zero new code (D5).
// ROLLBACK: flip this constant to false (or delete this block) — the pipeline
// is then byte-for-byte today's behavior; the preflight module isn't imported.
const TEMPLATE_PREFLIGHT_ENABLED = true;
if (TEMPLATE_PREFLIGHT_ENABLED) {
  const { runPreflight, capabilityMapFromAppliedProviders } = await import('./lib/template-preflight.mjs');
  const { TEMPLATES_DATA } = await import('./studio/lib/templates-catalog.js');
  const { REGISTRY_META } = await import('./studio/lib/template-registry.data.js');
  const { getRegistryDb } = await import('./studio/lib/template-registry-db.js');
  // Same raw channel registry entry the Studio assign route validated against
  // at save time (yt-mcp/studio-channels.json is the CI feed of the Neon
  // registry). Absent/unreadable -> null -> empty config -> assigned channels
  // fail closed on niche_mismatch; legacy channels are unaffected (no lookup).
  let channelEntry = null;
  try {
    const reg = JSON.parse(fs.readFileSync(path.join('yt-mcp', 'studio-channels.json'), 'utf8'));
    channelEntry = (reg.channels || []).find((c) => c.slug === slug) || null;
  } catch { channelEntry = null; }
  let pre;
  try {
    pre = await runPreflight({
      channelId: slug,
      registryDb: await getRegistryDb(),
      catalog: TEMPLATES_DATA,
      meta: REGISTRY_META,
      channelEntry,
      capabilityMap: capabilityMapFromAppliedProviders(_keysApplied),
    });
  } catch (e) {
    // FIX ROUND 1 (spec D5 governs): anything that is NOT a known blocked
    // assignment falls back to today's exact path — an unreachable or
    // unconfigured registry DB must never halt production (the Oct 21-23 P0
    // class: all channels dark, workflows green). This catch covers the
    // db-layer construction (getRegistryDb throws without DATABASE_URL);
    // getActiveAssignment failures are converted inside runPreflight.
    pre = {
      mode: 'legacy',
      verdict: null,
      warning: 'registry db unavailable — legacy path, no template enforcement',
      warning_detail: String(e && e.message ? e.message : e).slice(0, 160),
    };
  }
  if (pre.warning) {
    // ONE visibility warning, labeled WARNING (not a block) — then proceed
    // exactly as today.
    log(`[template] WARN ${pre.warning}${pre.warning_detail ? ` (${pre.warning_detail})` : ''}`);
    await sendAlert({
      text: `${slug}: WARNING — ${pre.warning}${pre.warning_detail ? ` (${pre.warning_detail})` : ''}. No template enforcement ran; production proceeded on the legacy path.`,
      title: `[${slug}] template preflight warning - legacy path`,
    });
  }
  if (pre.mode === 'enforce') {
    if (!pre.verdict.ok) {
      const codes = pre.verdict.reasons.map((r) => r.code).join(', ');
      log(`✗ template preflight BLOCKED — generation stopped before any spend (${codes})`);
      await sendAlert({
        text: `${slug}: generation BLOCKED by template preflight — ${codes}. Fix the mismatch in Studio > Templates, or unassign the channel there.`,
        title: `[${slug}] template preflight blocked generation`,
      });
      process.exit(1);
    }
    const v = pre.verdict;
    // Phase-1 run record = these log lines + the job console output (the
    // pipeline keeps no structured run record of its own — AC-7/AC-13
    // "present and logged in Phase 1"; the JSON line is machine-readable).
    log(`[template] enforce: ${v.template_id} @ v${v.resolved_version}${v.pinned_version && v.pinned_version !== v.resolved_version ? ` (auto-adopted from pinned v${v.pinned_version})` : ''}${v.major_update_available ? ' — MAJOR update available (re-pin in Studio to adopt)' : ''}`);
    log(`[template] ${JSON.stringify({ template_id: v.template_id, resolved_version: v.resolved_version, variation_rules: v.metaSummary.variation_rules, safety: v.metaSummary.safety })}`);
  }
  // legacy mode (with or without warning): nothing else changed (spec D5)
}

// ---- Phase 1: YouTube Shorts ----
// #98 SHORTS SOURCE: kit field shortsSource 'generated' (default, yt-daily
// research->script->render) or 'clips' (publisher posts one queued doc clip).
// Flipping a channel = one kit field; rolling back = flip it back.
const shortsSource = b.shortsSource || 'generated';
if (NO_UPLOAD) {
  log(`Phase 1 — Shorts skipped (--no-upload test mode)`);
} else if (shortsSource === 'clips') {
  log(`Phase 1 — Clips lane (shortsSource=clips) for ${b.label}...`);
  if (await quotaGate('Shorts (clips)')) {
    if (run('longvideo/shorts-clips.mjs', ['post-next', slug])) { results.shorts = true; log(`✓ Clip Short processed`); }
    else { errors.push('Clip Short posting failed'); log(`✗ Clip posting failed`); }
  } else { errors.push('Shorts skipped — daily quota budget'); }
} else if ((!shortsDone || FORCE || TOPUP_N > 0) && (await quotaGate('Shorts production'))) {
  // #98 REGRESSION FIX (2026-10-23 audit): the #98 restructure dropped this
  // produce body — generated channels logged the skip text and produced
  // NOTHING since Oct 21 (caught by the 3-day audit; doctor STALE flags +
  // ntfy alerts were firing the whole time).
  log(`Phase 1 — Producing ${TOPUP_N > 0 ? `topup ${TOPUP_N}/${b.slots.length}` : b.slots.length} Shorts for ${b.label}...`);
  const ok = run('yt-daily.mjs', [slug, '--no-episode', ...(FORCE ? ['--force'] : []), ...(TOPUP_N > 0 ? [`--topup=${TOPUP_N}`] : [])]);
  if (ok) { results.shorts = true; log(`✓ Shorts queued`); }
  else { errors.push('Shorts production failed'); log(`✗ Shorts failed`); }
} else if (!shortsDone && !FORCE && TOPUP_N === 0) {
  // quota gate said no — already logged + alerted inside quotaGate
  errors.push('Shorts skipped — daily quota budget');
} else {
  log(`Shorts already produced today — skipping`);
  results.shorts = true;
}

// ---- Phase 1b: Proof-of-publication (09-20) ----
// 09-19 lesson: a dead token printed "✓ Shorts queued / Errors: 0" while
// nothing was uploaded. Verify the claimed uploads REALLY exist on YouTube.
// (Clips lane self-verifies inside post-next — running it twice would double
// alert on the same upload.)
if (results.shorts && shortsSource !== 'clips') {
  if (run('verify-run.mjs', [slug])) log(`✓ Uploads verified on YouTube`);
  else errors.push('Upload verification failed — check ntfy alert');
}

// ---- Phase 2: Facebook Reels (cross-post from outbox) ----
if (PLATFORMS_PAUSED) {
  log(`Phase 2 — FB Reels skipped (platforms paused — YouTube-only focus)`);
} else {
  log(`Phase 2 — Cross-posting to Facebook...`);
  if (run('fb-crosspost.mjs')) { results.fbReels = true; log(`✓ FB Reels done`); }
  else errors.push('FB cross-post failed');
}

// ---- Phase 3: Instagram Reels ----
// IG has no scheduling API, so posting here meant reels went live whenever the
// run finished. They are now posted by ig-slot-poster.yml 3x/day at fixed slot
// times, pulling the produced reels from the run's saved outbox cache.
// ---- Phase 2b: TikTok — PAUSED (10-17 owner decision) ----
// Zernio removed (issue #89 comment + owner go): publishing moves to the
// Everstoke Studio TikTok app once its developer approval lands (docs staged in
// tt-lf/ + artifacts by Phase 6; quarry-studio-server + tiktok-app-site are
// the future publisher). Until then this phase is intentionally a no-op.


log(`Phase 3 — IG reels: handled by ig-slot-poster (3x/day at slot times)`);

// ---- Phase 4: Niche poster to FB page ----
if (PLATFORMS_PAUSED) {
  log(`Phase 4 — FB poster skipped (platforms paused — YouTube-only focus)`);
} else {
  log(`Phase 4 — Posting niche poster...`);
  if (run('fb-images.mjs', [slug])) { results.poster = true; log(`✓ Poster done`); }
  else errors.push('Poster failed');
}

// ---- Phase 5: Long-form episode (docDays only) ----
const isDoc = isDocDay(b);
if (!SKIP_EPISODE && (isDoc || FORCE || NO_UPLOAD) && (!episodeDone || FORCE || NO_UPLOAD) && (NO_UPLOAD || await quotaGate('Episode'))) {
  log(`Phase 5 — Producing episode${NO_UPLOAD ? ' (test render: --no-upload)' : ''}...`);
  const ok = run('yt-deepdive.mjs', [slug, ...(FORCE || NO_UPLOAD ? ['--force'] : []), ...(NO_UPLOAD ? ['--no-upload'] : [])], 2700000);
  if (ok) { results.episode = true; log(`✓ Episode done`); }
  else errors.push('Episode failed');
} else if (SKIP_EPISODE) {
  log(`Episode skipped (--no-episode or paused)`);
} else if (!isDoc && !FORCE && !NO_UPLOAD) {
  log(`Episode skipped today (docDays: [${docDaysOf(b).join(', ') || 'none'}] — today is not a scheduled doc day)`);
}

// ---- Phase 6: Stage doc render for TikTok clips (docDay only) ----
// Ported from channel-quotequarry.yml, which had this as QQ-only YAML logic —
// MR/IC/DFD docs never reached the TikTok queue (issue #77). Generic per-slug:
// the channel workflows upload tt-lf/lf-<slug>.* as artifacts named lf-<slug> /
// lf-meta-<slug>, which longvideo/tiktok-clips.mjs consumes per run.
try {
  const epFile = path.join('demos', `deepdive-${slug}`, 'episode.mp4');
  if (fs.existsSync(epFile)) {
    fs.mkdirSync('tt-lf', { recursive: true });
    fs.copyFileSync(epFile, path.join('tt-lf', `lf-${slug}.mp4`));
    let title = '';
    try {
      const files = fs.readdirSync(path.join('fb-outbox', slug)).filter(f => f.endsWith('.json')).reverse();
      for (const f of files) {
        const j = JSON.parse(fs.readFileSync(path.join('fb-outbox', slug, f), 'utf8'));
        if (j.kind === 'episode' && j.title) { title = j.title; break; }
      }
    } catch { }
    if (!title) title = `${b.label} documentary`;
    const keyword = (b.tags && b.tags[0]) || b.niche || 'documentary';
    fs.writeFileSync(path.join('tt-lf', `lf-meta-${slug}.json`), JSON.stringify({ title, keyword }, null, 2));
    // #96: SRT alongside the render — word-accurate cues for the clips lane (#97)
    const srtSrc = path.join('demos', `deepdive-${slug}`, 'episode.srt');
    if (fs.existsSync(srtSrc)) fs.copyFileSync(srtSrc, path.join('tt-lf', `lf-srt-${slug}.srt`));
    log(`✓ staged doc render for TikTok clips: "${title}" (keyword: ${keyword})`);
  } else {
    log('no doc rendered today (not docDay) — nothing staged for TikTok');
  }
} catch (e) {
  log(`⚠ TikTok staging failed (non-fatal): ${String(e.message).slice(0, 90)}`);
}

// ---- Phase 5b: doc-day clips (clips source only) ----
// The doc rendered THIS run (deepdiveDate === today): feed it to the clipper
// from the local files (its GitHub artifacts don't exist until the workflow's
// upload steps run after this job) and give the publisher its turn — Phase 1
// ran before the doc existed. Once per doc day (createdAt guard); post-next's
// own guards handle short-days and duplicates.
try {
  const feedDir = path.join('tt-lf', `clipfeed-${slug}`);
  // yt-deepdive (child) wrote deepdiveDate after this pipeline loaded state — reload
  const freshState = loadState();
  const docToday = freshState[slug]?.deepdiveDate === today;
  const fedToday = freshState[slug]?.clipQueue && String(freshState[slug].clipQueue.createdAt || '').slice(0, 10) === today;
  if (shortsSource === 'clips' && docToday && !fedToday && fs.existsSync(path.join('tt-lf', `lf-${slug}.mp4`))) {
    log(`Phase 5b — doc-day clips: feeding today's doc to the clipper...`);
    fs.mkdirSync(feedDir, { recursive: true });
    fs.copyFileSync(path.join('tt-lf', `lf-${slug}.mp4`), path.join(feedDir, 'video.mp4'));
    if (fs.existsSync(path.join('tt-lf', `lf-srt-${slug}.srt`))) fs.copyFileSync(path.join('tt-lf', `lf-srt-${slug}.srt`), path.join(feedDir, 'episode.srt'));
    fs.copyFileSync(path.join('tt-lf', `lf-meta-${slug}.json`), path.join(feedDir, 'meta.json'));
    // --max 4: 2 doc-days/week × 4 clips = 8/week supply for 7 short-days
    // (#101) — 2/doc starved the queue ~3 days a week at daily Shorts cadence
    if (run('longvideo/shorts-clips.mjs', ['ensure-queue', slug, '--local', feedDir, '--max', '4'])) {
      run('longvideo/shorts-clips.mjs', ['post-next', slug]);
    } else { errors.push('Doc-day clip feed failed'); log(`✗ doc-day clip feed failed`); }
  }
} catch (e) {
  log(`⚠ Phase 5b doc-day clips failed (non-fatal): ${String(e.message).slice(0, 90)}`);
}

// ---- Summary ----
log(`══ PIPELINE COMPLETE ══`);
log(`  Shorts: ${results.shorts ? '✓' : '✗'}`);
log(`  FB Reels: ${results.fbReels ? '✓' : '✗'}`);
log(`  IG Reels: 📅 via ig-slot-poster (3x/day)`);
log(`  Poster: ${results.poster ? '✓' : '✗'}`);
log(`  Episode: ${results.episode ? '✓' : (SKIP_EPISODE ? '⏸ paused' : (!isDocDay(b) ? '📅 docDay only' : '✗'))}`);
log(`  Errors: ${errors.length}`);
if (errors.length) errors.forEach(e => log(`    ! ${e}`));

// Always exit 0 — individual failures are logged, not fatal
process.exit(0);
