import { getUser } from '@/lib/route-auth';
import { createJob, listJobs, DNA_STYLES, GENRE_LIST, VOICES, ghReady } from '../../../lib/hf-jobs.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const user = await getUser(req).catch(() => null);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const jobs = await listJobs().catch((e) => ({ error: e.message }));
  return Response.json({ jobs: jobs.error ? [] : jobs, error: jobs.error || null, gh: ghReady(), styles: DNA_STYLES, genres: GENRE_LIST, voices: VOICES });
}

export async function POST(req) {
  const user = await getUser(req).catch(() => null);
  if (!user || !['owner', 'staff'].includes(user.role)) return Response.json({ error: 'forbidden' }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const { topic, dna, genre, brand, subline, voice, beatCount } = body;
  if (!topic || String(topic).trim().length < 6) return Response.json({ error: 'topic too short (min 6 chars)' }, { status: 400 });
  if (!DNA_STYLES.some((s) => s.id === dna)) return Response.json({ error: 'unknown style' }, { status: 400 });
  if (genre && !GENRE_LIST.some((g) => g.id === genre)) return Response.json({ error: 'unknown genre' }, { status: 400 });
  if (!brand || String(brand).trim().length < 2) return Response.json({ error: 'brand name required' }, { status: 400 });
  try {
    const job = await createJob({ topic: topic.trim(), dna, genre: genre || 'documentary', brand: brand.trim(), subline, voice, beatCount, slug: brand });
    return Response.json({ ok: true, id: job.id, brief: job.brief });
  } catch (e) {
    return Response.json({ error: String(e.message).slice(0, 200) }, { status: 500 });
  }
}
