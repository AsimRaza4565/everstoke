// Real daily Excel reports — listed from the repo's /reports folder.
// LOCAL mode: the folder on disk. CLOUD (Vercel): the GitHub contents API.
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from '../../../lib/data.mjs';
import { requireRole } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';

const REPO = ENV.GITHUB_REPO || 'muzzamilhassan/automation';
const GH_TOKEN = ENV.GITHUB_TOKEN || ENV.GITHUB_PAT || '';

export async function GET(req) {
  // operator business reports — owner/staff only (issue #60: the route had no
  // auth, so any signed-in role could list report files)
  if (!(await requireRole(req, ['owner', 'staff']))) return Response.json({ error: 'not signed in' }, { status: 401 });
  const cloud = process.env.FORCE_GITHUB === '1' || !fs.existsSync(path.resolve(process.cwd(), '..', 'yt-mcp'));
  try {
    if (!cloud) {
      const dir = path.resolve(process.cwd(), '..', 'reports');
      const rows = fs.existsSync(dir)
        ? fs.readdirSync(dir)
            .filter((f) => f.endsWith('.xlsx'))
            .map((f) => {
              const st = fs.statSync(path.join(dir, f));
              return { name: f, when: st.mtime.toISOString().slice(0, 10), size: st.size };
            })
        : [];
      rows.sort((a, b) => b.name.localeCompare(a.name));
      return Response.json({ reports: rows });
    }
    if (!GH_TOKEN) return Response.json({ reports: [] });
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/reports`, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'quarry-studio',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return Response.json({ reports: [] });
    const list = await res.json();
    const rows = (Array.isArray(list) ? list : [])
      .filter((f) => f.name.endsWith('.xlsx'))
      .map((f) => ({ name: f.name, when: (f.metadata?.time || '').slice(0, 10) || '—', size: f.size }))
      .sort((a, b) => b.name.localeCompare(a.name));
    return Response.json({ reports: rows });
  } catch {
    return Response.json({ reports: [] });
  }
}
