// Thumbnail Studio — live preview render. Owner/staff only (proxy gates too).
// Stateless: photo comes in as a URL (fetched server-side) or a dataURL,
// render happens in-process via sharp, JPEG goes back as a dataURL.
import sharp from 'sharp';
import { getUser } from '@/lib/route-auth';
import { buildThumbSvg, wrapForTemplate, pickAccentWord, TEMPLATES } from '@/lib/thumb-templates';
import { renderV2ById, isV2Template, v2NeedsPhoto } from '@/lib/thumb-templates-v2';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not allowed' }, { status: 401 });
  // the header (and the proxy rules) say owner/staff only — actually enforce it
  // (clients previously reached this server-side URL fetch; issue #60)
  if (!['owner', 'staff'].includes(user.role)) return Response.json({ error: 'owner/staff only' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const { template = 'clean', title = '', accentWord = '', accent = '#E8C15A', chip = '', eyebrow = '', shade = '#0A1128', brand = '', photoUrl = '', photoDataUrl = '' } = body || {};
    if (!TEMPLATES[template] && !isV2Template(template)) return Response.json({ error: 'unknown template' }, { status: 400 });
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/; // same guard as thumbs/branding — colors interpolate into SVG attrs raw (issue #59)
    if (!HEX_COLOR.test(accent) || !HEX_COLOR.test(shade)) return Response.json({ error: 'accent/shade must be #RRGGBB' }, { status: 400 });

    let photoHref = '';
    if (photoDataUrl && photoDataUrl.startsWith('data:image/')) {
      photoHref = photoDataUrl;
    } else if (photoUrl && /^https:\/\//.test(photoUrl)) {
      const r = await fetch(photoUrl, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return Response.json({ error: `photo fetch failed: HTTP ${r.status}` }, { status: 400 });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) return Response.json({ error: 'photo too large' }, { status: 400 });
      photoHref = `data:image/jpeg;base64,${buf.toString('base64')}`;
    } else if (TEMPLATES[template]?.needsPhoto || (isV2Template(template) && v2NeedsPhoto(template))) {
      return Response.json({ error: 'this template needs a photo' }, { status: 400 });
    }

    const svg = isV2Template(template)
      ? renderV2ById(template, { title, accentWord, accent, chip, eyebrow, shade, brand, photoHref })
      : buildThumbSvg(template, { title, accentWord, accent, chip, eyebrow, shade, brand, photoHref });
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    const words = String(title || '').trim().split(/\s+/).filter(Boolean).length;
    return Response.json({
      image: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      bytes: jpeg.length,
      words,
      lines: wrapForTemplate(template, title),
      accentWordSuggested: pickAccentWord(title),
      checklist: {
        wordsOk: words > 0 && words <= 7,
        photoOk: Boolean(photoHref) || template === 'poster',
        sizeOk: jpeg.length < 2 * 1024 * 1024,
      },
    });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'render failed' }, { status: 500 });
  }
}
