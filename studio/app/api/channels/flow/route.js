// 10-08 FLOW CONTROL — the per-channel Autopilot ON/OFF switch.
// PATCH { slug, on: true|false }
// OFF writes BOTH: registry autopilot=false (autopilot discovery + sweeper
// skip) AND state pausedUntil=2099-12-31 (yt-daily/yt-deepdive hard-stop even
// if invoked directly). ON clears both. Already-scheduled videos still publish
// (they live on YouTube) — pause never recalls anything.
import { getUser } from '@/lib/route-auth';
import { slugsForUser } from '@/lib/access';
import { readRepoJSON, writeRepoJSON, setChannelAutopilot } from '@/lib/channels-registry';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const FAR = '2099-12-31';

export async function PATCH(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const actor = user.email;

  const body = await req.json().catch(() => ({}));
  const { slug, on } = body;
  if (!slug || typeof on !== 'boolean') return Response.json({ error: 'need slug + on(boolean)' }, { status: 400 });

  // 10-08 P2 CLIENT ROLE: clients may pause/resume ONLY their own channels
  // (parse the body FIRST — referencing `slug` before this destructure threw
  // a TDZ ReferenceError and every client PATCH became a 500; issue #46)
  if (user.role === 'client') {
    const owned = await slugsForUser(user).catch(() => null);
    if (!owned || !owned.includes(slug)) return Response.json({ error: 'not your channel' }, { status: 403 });
  } else if (!['owner', 'staff'].includes(user.role)) {
    return Response.json({ error: 'not signed in' }, { status: 401 });
  }

  // 1. registry flag (wizard channels; legacy 4 simply have no entry) —
  // setChannelAutopilot updates the DB and syncs the engine's discovery file
  let registryTouched = false;
  try {
    const reg = (await readRepoJSON('yt-mcp/studio-channels.json')) || { channels: [] };
    if ((reg.channels || []).some((c) => c.slug === slug)) {
      await setChannelAutopilot(slug, on);
      registryTouched = true;
    }
  } catch (e) {
    return Response.json({ error: `registry: ${e.message}` }, { status: 502 });
  }

  // 2. engine hard-stop in the channel state (merge with the live state file —
  // CI keeps real publishing data in there, never overwrite blind)
  try {
    const stPath = `yt-mcp/state/${slug}.json`;
    const st = (await readRepoJSON(stPath)) || {};
    if (on) delete st.pausedUntil;
    else st.pausedUntil = FAR;
    await writeRepoJSON(stPath, st, `flow: ${slug} ${on ? 'resumed' : 'paused'} (${actor})`);
  } catch (e) {
    return Response.json({ error: `state: ${e.message}` }, { status: 502 });
  }

  console.log(`[audit] ${actor} → autopilot ${on ? 'ON' : 'OFF'} for ${slug}${registryTouched ? '' : ' (legacy channel)'}`);
  await appendAudit(actor, on ? 'flow-resume' : 'flow-pause', slug);
  return Response.json({ ok: true, slug, on });
}
