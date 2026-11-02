// A1 SESSION MANAGEMENT — list your active devices / sign out everywhere.
// GET    /api/sessions        → active sessions for the signed-in user
// DELETE /api/sessions?all=1  → revoke every session of this user
import { getUser } from '@/lib/route-auth';
import { revokeAllForEmail, listSessions } from '@/lib/session-db';
import { dbReady } from '@/lib/db.mjs';
import { appendAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user || !user.email?.includes('@') || !dbReady) return Response.json({ sessions: [] });
  return Response.json({ sessions: await listSessions(user.email), current: user.session_id || 0 });
}

export async function DELETE(req) {
  const user = await getUser(req);
  if (!user || !user.email?.includes('@') || !dbReady) return Response.json({ error: 'not signed in' }, { status: 401 });
  const n = await revokeAllForEmail(user.email);
  await appendAudit(user.email, 'sign-out-everywhere', `${n} session(s) revoked`);
  return Response.json({ ok: true, revoked: n });
}
