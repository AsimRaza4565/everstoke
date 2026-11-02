// F10 — bulk redesign: apply one look (template + accent + chip + eyebrow) to
// many videos at once. Each video's CURRENT YouTube thumbnail becomes the
// background photo, its own title is re-laid-out by the template, and the
// result attaches back. Daily attach cap (10/channel/day) respected — the
// batch is clamped to whatever the channel has left today, rest is reported.
import sharp from 'sharp';
import { getUser } from '@/lib/route-auth';
import { canAccessChannelSlug } from '@/lib/access';
import { appendAudit, listAudit } from '@/lib/audit';
import { buildThumbSvg, TEMPLATES } from '@/lib/thumb-templates';
import { renderV2ById, isV2Template } from '@/lib/thumb-templates-v2';
import { readRepoJSON } from '@/lib/channels-registry';
import { readRepoBinary } from '@/lib/repo-files';
import { attachThumb, accessTokenForSlug } from '@/lib/yt-attach';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAILY_CAP = 10;

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const { slug, videoIds = [], template = 'poster', accent = '#E8C15A', chip = '', eyebrow = '', shade = '#0A1128', brand = '' } = body || {};
    if (!slug || !Array.isArray(videoIds) || !videoIds.length) return Response.json({ error: 'slug and videoIds required' }, { status: 400 });
    if (!TEMPLATES[template] && !isV2Template(template)) return Response.json({ error: 'unknown template' }, { status: 400 });
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/; // same guard as thumbs/branding — colors interpolate into SVG attrs raw (issue #59)
    if (!HEX_COLOR.test(accent) || !HEX_COLOR.test(shade)) return Response.json({ error: 'accent/shade must be #RRGGBB' }, { status: 400 });
    if (!(await canAccessChannelSlug(user, slug))) return Response.json({ error: 'this channel is not linked to your account' }, { status: 403 });

    // daily attach quota for this channel (audit-log counted)
    let used = 0;
    try {
      const logs = await listAudit(200);
      const today = new Date().toISOString().slice(0, 10);
      used = (logs || []).filter((l) => l.action === 'thumbnail set' && String(l.detail || '').startsWith(slug + ' · ') && String(l.at || '').slice(0, 10) === today).length;
    } catch { }
    const remaining = Math.max(0, DAILY_CAP - used);
    const batch = videoIds.slice(0, remaining);

    // 10-18 ROTATION + FACES (issue #92 follow-up, owner request): per-channel
    // template rotation and face library from thumb-branding.json — video i
    // gets rotation[i % len] and faces[i % len]; falls back to the single
    // body.template when no rotation is configured.
    let rotation = []; let faceFiles = [];
    try {
      const branding = (await readRepoJSON('yt-mcp/thumb-branding.json')) || {};
      const entry = branding[slug] || {};
      rotation = Array.isArray(entry.templateRotation) ? entry.templateRotation.filter((id) => TEMPLATES[id] || isV2Template(id)) : [];
      faceFiles = Array.isArray(entry.faces) ? entry.faces : [];
    } catch { }
    const skipped = videoIds.length - batch.length;

    // titles for the batch (one videos.list call)
    const at = await accessTokenForSlug(slug);
    const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batch.join(',')}`, { headers: { Authorization: `Bearer ${at}` } });
    const vj = await vr.json();
    const titles = {};
    for (const it of vj.items || []) titles[it.id] = it.snippet.title || '';

    const results = [];
    for (let videoIdx = 0; videoIdx < batch.length; videoIdx++) {
      const videoId = batch[videoIdx];
      try {
        const title = (titles[videoId] || '').replace(/\s*[|#].*$/, '').trim() || 'Untitled';
        // background = the video's current thumbnail (maxres, fallback hq)
        let buf = null;
        for (const q of ['maxresdefault', 'hqdefault']) {
          const r = await fetch(`https://i.ytimg.com/vi/${videoId}/${q}.jpg`, { signal: AbortSignal.timeout(10000) });
          if (r.ok) {
            const b = Buffer.from(await r.arrayBuffer());
            if (b.length > 5000) { buf = b; break; } // hqdefault returns a 120px gray placeholder when maxres is missing
          }
        }
        if (!buf) { results.push({ videoId, ok: false, error: 'no current thumbnail' }); continue; }
        const photoHref = `data:image/jpeg;base64,${buf.toString('base64')}`;
        const tpl = rotation.length ? rotation[videoIdx % rotation.length] : template;
        let faceImage = null;
        if (faceFiles.length) {
          const fb = await readRepoBinary(faceFiles[videoIdx % faceFiles.length]);
          if (fb) faceImage = `data:image/jpeg;base64,${fb.toString('base64')}`;
        }
        const renderOpts = { title, accent, chip, eyebrow, shade, brand, photoHref, faceImage };
        const svg = isV2Template(tpl)
          ? renderV2ById(tpl, renderOpts)
          : buildThumbSvg(tpl, renderOpts);
        const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
        await attachThumb(slug, videoId, jpeg);
        try { await appendAudit(user.email, 'thumbnail set', `${slug} · ${videoId} · bulk ${(jpeg.length / 1024).toFixed(0)}KB`); } catch { }
        results.push({ videoId, ok: true, kb: Math.round(jpeg.length / 1024), template: tpl.split('/').pop(), title: title.slice(0, 50) });
      } catch (e) {
        results.push({ videoId, ok: false, error: e.message?.slice(0, 100) });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return Response.json({ ok: true, processed: batch.length, okCount, failed: batch.length - okCount, skipped, remaining: Math.max(0, remaining - batch.length), results });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'bulk failed' }, { status: 500 });
  }
}
