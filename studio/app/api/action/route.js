// Studio buttons trigger REAL runs through GitHub Actions (workflow_dispatch).
// Works the same locally and on Vercel — nothing runs on the web server itself.
// The workflows are the same ones the daily crons use, so dedupe/state rules apply.
import { ENV } from '../../../lib/data.mjs';
import { registryChannels } from '../../../lib/channels-registry.js';
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { appendAudit } from '../../../lib/audit.js';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

const SLUGS = ['quotequarry', 'investors-compass', 'money-rulebook', 'debt-free-doctrine'];

// action (+ optional slug) → workflow file + inputs
const MAP = {
  'yt-daily': (slug) => ({ workflow: `channel-${slug}.yml`, inputs: {} }),
  'deepdive': (slug) => ({ workflow: `channel-${slug}.yml`, inputs: {} }), // episodes follow docDay inside the channel run; legacy uploader disabled 10-05
  'ig-crosspost': () => ({ workflow: 'ig-slot-poster.yml', inputs: {} }),
  'tiktok': () => ({ workflow: 'tiktok-post.yml', inputs: {} }),
  'fb-crosspost': () => ({ workflow: 'fb-now.yml', inputs: { job: 'reels' } }),
  'fb-images': () => ({ workflow: 'fb-now.yml', inputs: { job: 'posters' } }),
};

export async function POST(req) {
  // 10-08 RBAC: run buttons = owner + staff; the actor goes to the audit log.
  // 10-08 P2 CLIENT ROLE: clients may run ONLY their own channel's pipeline.
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { }
  if (user.role === 'client') {
    if (!['yt-daily', 'deepdive'].includes(body.action || '')) {
      return Response.json({ error: 'your role does not allow this' }, { status: 403 });
    }
    const owned = await slugsForUser(user).catch(() => null);
    if (!owned || !owned.includes(body.slug || '')) {
      return Response.json({ error: 'not your channel' }, { status: 403 });
    }
  } else if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }
  const actor = user.email;
  const fn = MAP[body.action];
  if (!fn) return Response.json({ error: 'unknown action' }, { status: 400 });
  const slug = body.slug || '';
  if (!TOKEN) return Response.json({ error: 'server has no GITHUB_TOKEN' }, { status: 500 });
  await appendAudit(actor, 'produce', `${body.action}${slug ? ' · ' + slug : ''}`);

  // 10-08 CHANNEL FACTORY: wizard channels dispatch the generic autopilot
  // workflow with a channel input; legacy 4 keep their own workflows. The
  // episode buttons now dispatch the CHANNEL run (episodes follow docDay).
  let workflow, inputs;
  if ((body.action === 'yt-daily' || body.action === 'deepdive') && !SLUGS.includes(slug)) {
    const inRegistry = await registryChannels()
      .then((l) => l.some((c) => c.slug === slug))
      .catch(() => false);
    if (!inRegistry) return Response.json({ error: 'unknown channel' }, { status: 400 });
    workflow = 'channel-autopilot.yml';
    inputs = { channel: slug };
  } else {
    if (['yt-daily', 'deepdive'].includes(body.action) && !SLUGS.includes(slug)) {
      return Response.json({ error: 'unknown channel' }, { status: 400 });
    }
    ({ workflow, inputs } = fn(slug));
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'quarry-studio',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  if (res.status === 204) {
    return Response.json({ started: true, via: 'github-actions', workflow });
  }
  const text = await res.text();
  return Response.json({ error: `github ${res.status}: ${text.slice(0, 140)}` }, { status: 502 });
}
