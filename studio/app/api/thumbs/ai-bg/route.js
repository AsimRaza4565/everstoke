// F6 — AI background generation via the Agnes gateway (free, 10 RPM).
// Generates NO-TEXT art (all templates draw text themselves — the proven
// OverlayThumb pattern that avoids AI text clipping). ~15s per 2K image.
import sharp from 'sharp';
import { getUser } from '@/lib/route-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STYLES = {
  cinematic: 'cinematic dramatic lighting, moody atmosphere, rich contrast, photorealistic, high detail, 16:9 composition, subject placed to the right leaving calmer space on the left',
  luxury: 'quiet luxury aesthetic, elegant premium materials, soft golden light, dark refined background, photorealistic, 16:9 composition with negative space on the left',
  statue: 'dramatic classical marble statue scene, museum lighting, deep shadows, epic composition, photorealistic, 16:9 frame with calm space on the left',
  illustration: 'premium illustrated storybook scene, painterly texture, sophisticated muted palette, 16:9 composition with calm space on the left',
};

export async function POST(req) {
  const user = await getUser(req);
  if (!user) return Response.json({ error: 'not allowed' }, { status: 401 });
  const key = process.env.AGNES_API_KEY || '';
  if (!key) return Response.json({ error: 'AGNES_API_KEY not configured on the server' }, { status: 503 });
  try {
    const body = await req.json().catch(() => ({}));
    const subject = String(body.prompt || '').trim().slice(0, 300);
    if (!subject) return Response.json({ error: 'prompt required' }, { status: 400 });
    const style = STYLES[body.style] ? body.style : 'cinematic';
    const prompt = `${subject}. ${STYLES[style]}. Absolutely no text, no letters, no words, no captions, no watermarks anywhere in the image.`;

    const r = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      // b64_json: image comes back INLINE (16s typical) — the url mode needs a
      // second download that times out when the free tier queues.
      body: JSON.stringify({ model: 'agnes-image-2.5-flash', prompt, size: '2K', ratio: '16:9', response_format: 'b64_json' }),
      signal: AbortSignal.timeout(55000),
    });
    if (!r.ok) return Response.json({ error: `Agnes HTTP ${r.status}: ${(await r.text()).slice(0, 100)}` }, { status: 502 });
    const d = await r.json();
    const item = d.data?.[0] || {};
    let photoBuf = null;
    if (item.b64_json) {
      photoBuf = Buffer.from(item.b64_json, 'base64');
    } else if (item.url) {
      const ir = await fetch(item.url, { signal: AbortSignal.timeout(25000) });
      if (!ir.ok) return Response.json({ error: 'generated image download failed' }, { status: 502 });
      photoBuf = Buffer.from(await ir.arrayBuffer());
    }
    if (!photoBuf) return Response.json({ error: 'no image in response' }, { status: 502 });
    // Downscale to editor-friendly size (still > 1280 wide for crisp 720p output).
    const jpeg = await sharp(photoBuf)
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    return Response.json({ image: `data:image/jpeg;base64,${jpeg.toString('base64')}`, bytes: jpeg.length });
  } catch (e) {
    return Response.json({ error: e.message?.slice(0, 140) || 'generation failed' }, { status: 200 });
  }
}
