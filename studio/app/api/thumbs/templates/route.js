// GET /api/thumbs/templates — registry metadata for the /thumbs gallery UI.
import { getUser } from '@/lib/route-auth';
import { TEMPLATES } from '@/lib/thumb-templates';
import { v2List } from '@/lib/thumb-templates-v2';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  const templates = Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    label: t.label,
    desc: t.desc,
    category: t.category,
    needsPhoto: Boolean(t.needsPhoto),
    aiPreset: t.aiPreset || null,
  }));
  return Response.json({ templates: [...templates, ...v2List()] });
}
