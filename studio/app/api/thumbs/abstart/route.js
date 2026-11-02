// F5 — A/B swap-testing. Start an experiment: commit 2-3 variant JPGs to
// thumbnails/tests/ + experiment state to yt-mcp/thumb-tests.json, attach
// variant A immediately. The hourly thumb-ab.yml workflow swaps when due.
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { appendAudit } from '@/lib/audit';
import { readRepoJSON, writeRepoJSON } from '@/lib/channels-registry';
import { attachThumb } from '@/lib/yt-attach';

export const dynamic = 'force-dynamic';

const DAILY_CAP = 10; // same cap as thumbs/attach — A/B starts consume thumbnails.set quota too
export const maxDuration = 60;

const STATE = 'yt-mcp/thumb-tests.json';
const DIR = 'thumbnails/tests';

// Commit a binary file to the repo via the Contents API (base64).
async function putRepoFile(path, buffer, message) {
  const { ENV } = await import('@/lib/data.mjs');
  const token = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'quarry-studio' };
  const repo = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
  const body = { message, content: buffer.toString('base64'), branch: 'main' };
  const cur = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=main`, { headers });
  if (cur.ok) body.sha = (await cur.json()).sha;
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`commit ${path} failed: HTTP ${r.status}`);
}

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, videoId, title = '', intervalHours = 48, variants = [] } = body || {};
  if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });
    if (!slug || !videoId) return Response.json({ error: 'slug and videoId required' }, { status: 400 });
    if (!Array.isArray(variants) || variants.length < 2 || variants.length > 3) {
      return Response.json({ error: 'need 2-3 variant dataURLs' }, { status: 400 });
    }
    const interval = [1, 6, 12, 24, 48, 72].includes(Number(intervalHours)) ? Number(intervalHours) : 48;
    const bufs = variants.map((d) => {
      if (!/^data:image\/jpeg;base64,/.test(d)) throw new Error('variants must be JPEG dataURLs');
      const b = Buffer.from(d.split(',')[1], 'base64');
      if (b.length > 2 * 1024 * 1024) throw new Error('variant exceeds 2MB');
      return b;
    });

    const letters = ['a', 'b', 'c'];
    for (let i = 0; i < bufs.length; i++) {
      await putRepoFile(`${DIR}/${videoId}-${letters[i]}.jpg`, bufs[i], `thumb-test: ${videoId} variant ${letters[i]}`);
    }
    const state = (await readRepoJSON(STATE)) || {};
    const now = new Date().toISOString();
    state[videoId] = {
      slug, title: String(title).slice(0, 120),
      variants: bufs.map((_, i) => `${DIR}/${videoId}-${letters[i]}.jpg`),
      intervalHours: interval,
      started: now, current: 0, ended: null,
      periods: [{ variant: 0, from: now }],
    };
    await writeRepoJSON(STATE, state, `thumb-test: ${videoId} started (${bufs.length} variants, ${interval}h)`);
    // quota guard — an A/B start consumes YouTube thumbnail quota too
    // (thumbnails.set per variant) but previously bypassed the 10/day cap
    // that the attach route enforces (issue #60)
    try {
      const { listAudit } = await import('@/lib/audit');
      const logs = await listAudit(200);
      const today = new Date().toISOString().slice(0, 10);
      const used = (logs || []).filter((l) => (l.action === 'thumbnail set' || l.action === 'thumbnail A/B started') && String(l.detail || '').startsWith(slug) && String(l.at || '').slice(0, 10) === today).length;
      if (used >= DAILY_CAP) return Response.json({ error: `daily thumbnail cap reached for ${slug} (${DAILY_CAP}/day)` }, { status: 429 });
    } catch { } // audit unavailable → allow (quota guard is best-effort, same as attach)
    await attachThumb(slug, videoId, bufs[0]);
    try { await appendAudit(user.email, 'thumbnail A/B started', `${slug} · ${videoId} · ${bufs.length} variants · ${interval}h`); } catch { }
    return Response.json({ ok: true, videoId, variants: bufs.length, intervalHours: interval });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'start failed' }, { status: 500 });
  }
}
