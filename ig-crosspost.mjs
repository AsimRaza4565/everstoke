// Cross-posts produced Shorts to the mapped Instagram accounts as Reels.
// Chain: uguu.se public hosting -> IG media container (REELS) -> publish.
// Usage: node ig-crosspost.mjs                       # scan fb-outbox/
//        node ig-crosspost.mjs <video.mp4> <slug>    # post one file now
import fs from 'node:fs';
import path from 'node:path';
import { hostImagePublicly } from './threads-publisher.mjs';

import { loadEnv } from './lib/env.mjs';
loadEnv();
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || '';

const PAGE_MAP = {
  'quotequarry': '114550268199751',  // Reliq North — owns IG @quotequarry8 (Strategic Silence had NO IG: QQ reels could never post)
  'investors-compass': '116157974886564',
  'money-rulebook': '1077306835630491',
  'debt-free-doctrine': '106473735839651'
};
const HASHTAGS = {
  'quotequarry': '#stoicism #dailymotivation #mindset #wisdom #selfimprovement',
  'investors-compass': '#investingpsychology #stockmarket #wealthbuilding #investing #moneymindset',
  'money-rulebook': '#moneyrules #personalfinance #financialfreedom #moneytips #wealth',
  'debt-free-doctrine': '#debtfree #moneytips #financialfreedom #debtpayoff #moneymindset'
};

let tokensCache = null;
async function getPageToken(pageId) {
  if (!tokensCache) {
    tokensCache = {};
    const res = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{username,id}&limit=500&access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`);
    const data = await res.json();
    for (const p of data.data || []) tokensCache[p.id] = { token: p.access_token, igId: p.instagram_business_account?.id || null };
  }
  return tokensCache[pageId] || {};
}

function seoCaption(meta) {
  const hash = HASHTAGS[meta.slug] || '#motivation #mindset #success';
  return `${meta.title}\n\n${String(meta.description || '').slice(0, 800)}\n\nFollow for daily content. ${hash}`.slice(0, 2100);
}

async function postIgReel(slug, videoBuffer, meta) {
  const pageId = PAGE_MAP[slug];
  const { token: pageToken, igId } = await getPageToken(pageId);
  if (!pageToken || !igId) { console.log(`  ✗ IG: no linked account for ${slug}`); return null; }

  console.log('  [ig] hosting video publicly...');
  const hosted = await hostImagePublicly(videoBuffer, 'video/mp4', 'reel.mp4');
  if (!hosted) { console.log('  ✗ IG: hosting failed'); return null; }

  const createRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: meta.kind === 'episode' ? 'VIDEO' : 'REELS', video_url: hosted, caption: seoCaption(meta), share_to_feed: true })
  });
  const createData = await createRes.json();
  if (!createData.id) { console.log('  ✗ IG container failed:', JSON.stringify(createData).slice(0, 140)); return null; }
  const creationId = createData.id;

  let status = 'IN_PROGRESS';
  for (let i = 0; i < 60; i++) { // #64: 6 min — longer encodes were dropped for the slot at 3 min
    await new Promise(r => setTimeout(r, 6000));
    const stRes = await fetch(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(pageToken)}`);
    status = (await stRes.json()).status_code;
    if (status === 'FINISHED' || status === 'ERROR') break;
    console.log(`  [ig] processing... (${status})`);
  }
  if (status !== 'FINISHED') { console.log('  ✗ IG: container not FINISHED —', status); return null; }

  const pubRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish?creation_id=${creationId}&access_token=${encodeURIComponent(pageToken)}`, { method: 'POST' });
  let pubData = await pubRes.json();
  // #62: the publish POST may have landed while its response was lost — one
  // retry against the SAME container (re-publishing a published container
  // errors, it cannot duplicate) instead of recreating container + hosting
  if (!pubData.id) {
    await new Promise(r => setTimeout(r, 4000));
    pubData = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish?creation_id=${creationId}&access_token=${encodeURIComponent(pageToken)}`, { method: 'POST' }).then(r => r.json());
  }
  if (pubData.id) { console.log(`  ✓ IG Reel PUBLISHED → @${(await getPageToken(pageId), '')}${meta.slug} (post ${pubData.id})`); return pubData.id; }
  console.log('  ✗ IG publish failed:', JSON.stringify(pubData).slice(0, 140));
  return null;
}

// ---------- main ----------
const oneFile = process.argv[2];
if (oneFile && !oneFile.startsWith('--')) {
  const slug = process.argv[3];
  const metaFile = oneFile.replace(/\.mp4$/, '.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    : { title: 'Daily Investing Wisdom', description: 'Investing psychology and market wisdom for long-term wealth.', slug };
  await postIgReel(slug, fs.readFileSync(oneFile), meta);
  process.exit(0);
}

// ---------- slot mode: post ONE queued reel per channel (ig-slot-poster.yml) ----------
// IG has no scheduling API, so instead of posting everything the moment a run
// finishes, the slot poster calls this 3x/day. Posted stamps are tracked in
// yt-mcp/ig-state.json because the outbox cache is immutable between slots.
const SLOT_STATE_FILE = 'yt-mcp/ig-state.json';
const loadSlotState = () => { try { return JSON.parse(fs.readFileSync(SLOT_STATE_FILE, 'utf8')); } catch { return {}; } };
const saveSlotState = (s) => { fs.mkdirSync(path.dirname(SLOT_STATE_FILE), { recursive: true }); fs.writeFileSync(SLOT_STATE_FILE, JSON.stringify(s, null, 2)); };

if (process.argv.includes('--one')) {
  const st = loadSlotState();
  for (const dir of fs.existsSync('fb-outbox') ? fs.readdirSync('fb-outbox') : []) {
    const d = path.join('fb-outbox', dir);
    if (!fs.statSync(d).isDirectory()) continue;
    const posted = new Set(st[dir]?.posted || []);
    const pending = fs.readdirSync(d)
      .filter(f => (f.endsWith('.json') || f.endsWith('.fb-done')) && !f.endsWith('.done'))
      .filter(f => !posted.has(f.replace(/\.json.*$/, '')))
      .sort(); // stamps are Date.now() based → oldest first
    const metaFile = pending[0] ? path.join(d, pending[0]) : null;
    if (!metaFile) { console.log(`[ig] ${dir}: nothing pending for this slot`); continue; }
    const stampKey = pending[0].replace(/\.json.*$/, '');
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const videoPath = path.resolve(meta.videoFile);
    if (!fs.existsSync(videoPath)) { console.log(`[ig] ${dir}: missing video for ${stampKey} — skipped`); continue; }
    let id = null;
    // #62 idempotency: a lost media_publish response or a crash between post
    // and mark must not double-publish — recent IG media captions are checked
    // first (the caption carries the same meta text every run).
    try {
      const { token: dedupToken, igId: dedupIg } = await getPageToken(PAGE_MAP[meta.slug] || '');
      if (dedupToken && dedupIg) {
        const mRes = await fetch(`https://graph.facebook.com/v21.0/${dedupIg}/media?fields=caption&limit=15&access_token=${encodeURIComponent(dedupToken)}`);
        const mJson = await mRes.json();
        const want = meta.title || '';
        const hit = (mJson.data || []).find((x) => want && String(x.caption || '').includes(want));
        if (hit) {
          console.log(`  = [ig] already published (media ${hit.id}) — marking done`);
          st[dir] = st[dir] || { posted: [] };
          st[dir].posted.push(stampKey);
          if (st[dir].posted.length > 12) st[dir].posted = st[dir].posted.slice(-12);
          saveSlotState(st);
          try { fs.renameSync(metaFile, metaFile + '.done'); } catch (e) { console.log(`  ⚠ [ig] mark rename failed: ${e.message} — state marks it posted`); }
          continue;
        }
      }
    } catch { }
    for (let a = 1; a <= 2 && !id; a++) {
      try { id = await postIgReel(meta.slug, fs.readFileSync(videoPath), meta); }
      catch (e) { console.log(`  ✗ attempt ${a} network error: ${e.message}`); if (a < 2) await new Promise(r => setTimeout(r, 5000)); }
    }
    if (id) {
      st[dir] = st[dir] || { posted: [] };
      st[dir].posted.push(stampKey);
      if (st[dir].posted.length > 12) st[dir].posted = st[dir].posted.slice(-12);
      saveSlotState(st);
      try { fs.renameSync(metaFile, metaFile + '.done'); } catch (e) { console.log(`  ⚠ [ig] mark rename failed: ${e.message} — state marks it posted`); }
      console.log(`[ig] ${dir}: slot reel posted (${stampKey})`);
    } else {
      console.log(`[ig] ${dir}: post failed — retrying at next slot`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  process.exit(0);
}

const jobs = [];
for (const dir of fs.existsSync('fb-outbox') ? fs.readdirSync('fb-outbox') : []) {
  const d = path.join('fb-outbox', dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith('.json')) jobs.push(path.join(d, f));          // not yet posted anywhere
    if (f.endsWith('.fb-done')) jobs.push(path.join(d, f));       // FB done, IG pending
  }
}
if (!jobs.length) { console.log('[ig] outbox empty — nothing to cross-post'); process.exit(0); }

for (const metaFile of jobs) {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const videoPath = path.resolve(meta.videoFile);
  if (!fs.existsSync(videoPath)) continue;
  let id = null;
  for (let a = 1; a <= 2 && !id; a++) {
    try {
      id = await postIgReel(meta.slug, fs.readFileSync(videoPath), meta);
    } catch (e) {
      console.log(`  ✗ attempt ${a} network error: ${e.message}`);
      if (a < 2) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (id) fs.renameSync(metaFile, metaFile + '.done');
  await new Promise(r => setTimeout(r, 3000));
}
console.log('[ig] cross-post pass complete');
