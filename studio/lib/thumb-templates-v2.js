// Thumbnail templates v2 — ONE parametric renderer + a JSON catalog (issue #92).
// Owner rules baked in:
//   • NO drop-shadow / blur / glow / any SVG filter — crisp edges only
//     (stroke, solid highlight boxes, solid bars are the only treatments)
//   • a new template = a data entry in thumb-catalog.json, zero code changes
//     (no-static-maps directive: channels/templates are data, not code)
// Text is converted to vector PATHS via opentype.js (same as v1) — identical
// output on Vercel, no system-font dependency, and XSS-safe by construction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { wrapByWidth, escapeXml, pickAccentWord } from './thumb-templates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// resolution order covers every font the catalog uses
const FONT_DIRS = [
  path.join(HERE, 'fonts'),
  path.join(HERE, '..', 'public', 'fonts'),
  path.join(HERE, '..', '..', 'explainer', 'public', 'fonts'),
  path.join(HERE, '..', '..', 'image-tools', 'fonts'),
  path.join(HERE, '..', '..', 'thumbnails', 'fonts'),
];

const TTF = {
  anton: 'Anton-Regular.ttf',
  archivo: 'ArchivoBlack-Regular.ttf',
  alfaslab: 'AlfaSlabOne-Regular.ttf',
  passion: 'PassionOne-Regular.ttf',
  passionBold: 'PassionOne-Bold.ttf',
  passionBlack: 'PassionOne-Black.ttf',
  barlow: 'BarlowCondensed-Medium.ttf',
  barlowBold: 'BarlowCondensed-Bold.ttf',
  bungee: 'Bungee-Regular.ttf',
  inter800: 'Inter-ExtraBold.ttf',
  playfair: 'PlayfairDisplay-Bold.ttf',
  playfairI: 'PlayfairDisplay-italic-400.woff',
  cormorantI: 'CormorantGaramond-SemiBoldItalic.ttf',
  cinzel: 'Cinzel-Bold.ttf',
  mono: 'IBMPlexMono-Regular.ttf',
  monoMed: 'IBMPlexMono-Medium.ttf',
  monoI: 'IBMPlexMono-Italic.ttf',
};

const _fonts = {};
function font(key) {
  if (!_fonts[key]) {
    const file = TTF[key];
    if (!file) throw new Error(`v2 template: unknown font "${key}"`);
    let buf = null;
    for (const dir of FONT_DIRS) {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) { buf = fs.readFileSync(p); break; }
    }
    if (!buf) throw new Error(`v2 template: font file "${file}" not found in ${FONT_DIRS[0]}`);
    _fonts[key] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return _fonts[key];
}

// ---- measurement + text -> path ----
const W = 1280, H = 720, INSET = 64;

const adv = (f, text, size, spacing = 0) =>
  f.getAdvanceWidth(text, size) + Math.max(0, text.length - 1) * spacing;

// one text run -> path element(s); opts: fill, stroke {c,w}, extra dx
function textPath(f, text, x, y, size, { fill = '#fff', stroke = null, spacing = 0 } = {}) {
  const p = f.getPath(text, x, y, size);
  const attrs = stroke && stroke.w > 0
    ? ` fill="${fill}" stroke="${stroke.c}" stroke-width="${stroke.w}" paint-order="stroke fill" stroke-linejoin="round"`
    : ` fill="${fill}"`;
  return { el: `<path d="${p.toPathData(1)}"${attrs}/>`, width: adv(f, text, size, spacing) };
}

// solid bar (underline / overline / strike / divider) — crisp rect, no blur
function bar(x, y, w, h, color) {
  return `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" fill="${color}"/>`;
}

function wrapLines(f, text, size, maxWidth, spacing = 0) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = [];
  for (const w of words) {
    const test = [...cur, w].join(' ');
    if (adv(f, test, size, spacing) <= maxWidth || cur.length === 0) cur.push(w);
    else { lines.push(cur.join(' ')); cur = [w]; }
  }
  if (cur.length) lines.push(cur.join(' '));
  return lines;
}

// largest size in [min..max] where wrapped lines fit maxWidth and stay <= maxLines
function autofit(f, text, maxWidth, { min = 64, max = 160, maxLines = 3, spacing = 0 } = {}) {
  for (let size = max; size >= min; size -= 4) {
    const lines = wrapLines(f, text, size, maxWidth, spacing);
    if (lines.length <= maxLines && lines.every((l) => adv(f, l, size, spacing) <= maxWidth)) return size;
  }
  return min;
}

// one wrapped line -> svg elements (word paths + optional highlight rect + bars)
// treat.targets[kind] is a resolved {li, wi} pair (see resolveWord), so each
// treatment fires on exactly one word of the headline.
function renderLine({ f, words, x, y, size, fg, spacing = 0, treat = {}, stroke = null, twoTone = null, lineIdx = 0 }) {
  const els = [];
  let cx = x;
  const lineColor = twoTone ? twoTone[lineIdx % twoTone.length] : fg;
  const hit = (kind, wi) => {
    const t = treat.targets && treat.targets[kind];
    return Boolean(t) && t.li === lineIdx && t.wi === wi;
  };
  words.forEach((w, wi) => {
    const isHl = hit('highlight', wi);
    const fill = isHl ? treat.hlFg : lineColor;
    const wp = f.getPath(w, cx, y, size);
    const bb = wp.getBoundingBox();
    const wpx = adv(f, w, size, 0);
    if (isHl) {
      els.push(bar(bb.x1 - treat.hlPad, bb.y1 - treat.hlPad, (bb.x2 - bb.x1) + treat.hlPad * 2, (bb.y2 - bb.y1) + treat.hlPad * 2, treat.hlBg));
    }
    const attrs = stroke && stroke.w > 0
      ? ` fill="${fill}" stroke="${stroke.c}" stroke-width="${stroke.w}" paint-order="stroke fill" stroke-linejoin="round"`
      : ` fill="${fill}"`;
    els.push(`<path d="${wp.toPathData(1)}"${attrs}/>`);
    if (treat.underline && hit('underline', wi)) {
      els.push(bar(cx, y + size * 0.14, wpx, treat.underline.h, treat.underline.c));
    }
    if (treat.overline && hit('overline', wi)) {
      els.push(bar(cx, y - size * 0.82, wpx, treat.overline.h, treat.overline.c));
    }
    if (treat.strike && hit('strike', wi)) {
      els.push(bar(cx, y - size * 0.32, wpx, treat.strike.h || size * 0.09, treat.strike.c));
    }
    cx += wpx + f.getAdvanceWidth(' ', size);
  });
  return { els, width: cx - x };
}

function photoEmbed(href, x, y, w, h) {
  if (!href) return '';
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`;
}

function applyCase(text, kase) {
  const t = String(text || '').trim();
  return kase === 'upper' ? t.toUpperCase() : t;
}

// ---- catalog ----
import catalogJson from './thumb-catalog.json' with { type: 'json' };
export const CATALOG = catalogJson.templates;
export const V2_PREFIX = 'v2/';

export function isV2Template(id) {
  return String(id || '').startsWith(V2_PREFIX) && CATALOG.some((t) => t.id === String(id).slice(V2_PREFIX.length));
}

export function v2List() {
  return CATALOG.map((t) => ({
    id: V2_PREFIX + t.id,
    label: t.label,
    desc: t.desc,
    category: t.category,
    needsPhoto: Boolean(t.needsPhoto),
    aiPreset: t.aiPreset || null,
    v2: true,
  }));
}

export function v2NeedsPhoto(id) {
  const spec = specById(id);
  return Boolean(spec?.needsPhoto);
}

function specById(id) {
  return CATALOG.find((t) => t.id === String(id).slice(V2_PREFIX.length)) || null;
}

// ---- the renderer ----
export function renderV2(id, opts = {}) {
  const spec = specById(id);
  if (!spec) throw new Error(`v2 template not found: ${id}`);
  const o = {
    title: String(opts.title || 'Untitled story').trim(),
    accent: opts.accent || null,          // brand accent overrides highlight/underline color when set
    chip: String(opts.chip || '').slice(0, 26),
    eyebrow: String(opts.eyebrow || '').slice(0, 40),
    shade: opts.shade || '#0A1128',
    brand: String(opts.brand || '').slice(0, 28),
    photoHref: opts.photoHref || '',
    faceImage: opts.faceImage || '',   // per-channel face cutout (dataURL), composited on spec.face
    accentWord: String(opts.accentWord || '').trim(),
  };
  const t = spec.title;
  const els = [];

  // background
  els.push(`<rect width="${W}" height="${H}" fill="${o.shade === '#0A1128' && spec.bg ? spec.bg : o.shade}"/>`);

  // photo zone
  const photo = spec.photo || 'none';
  if (photo === 'full' && o.photoHref) els.push(photoEmbed(o.photoHref, 0, 0, W, H));
  if (spec.scrim) els.push(`<rect width="${W}" height="${H}" fill="#000" fill-opacity="${spec.scrim}"/>`);

  // split panel (primitive: split / vs)
  if (spec.panel) {
    const side = spec.panel.side === 'left' ? 0 : W - (W * spec.panel.w) / 100;
    const wpx = (W * spec.panel.w) / 100;
    els.push(`<rect x="${Math.round(side)}" width="${Math.round(wpx)}" height="${H}" fill="${spec.panel.bg}"/>`);
  }
  if (photo === 'right' && o.photoHref) els.push(photoEmbed(o.photoHref, W * 0.5, 0, W * 0.5, H));
  if (photo === 'left' && o.photoHref) els.push(photoEmbed(o.photoHref, 0, 0, W * 0.5, H));

  // frame (serif/quote templates) — crisp rect outline
  if (spec.frame) {
    els.push(`<rect x="${spec.frame.inset}" y="${spec.frame.inset}" width="${W - spec.frame.inset * 2}" height="${H - spec.frame.inset * 2}" fill="none" stroke="${spec.frame.c}" stroke-width="${spec.frame.w}"/>`);
  }

  // kicker chip (top-left solid box + text-as-path)
  const kick = spec.kicker || (o.eyebrow ? { text: o.eyebrow, bg: '#00000000' } : null);
  if (kick && kick.text) {
    const f = font(kick.font || 'monoMed');
    const text = applyCase(kick.text, kick.case || 'as-is');
    const tw = adv(f, text, kick.size || 30, kick.spacing || 4);
    const kx = spec.panel && spec.panel.side !== 'left' ? INSET : INSET;
    if (kick.bg && kick.bg !== '#00000000') els.push(bar(kx, INSET - 10, tw + 24, (kick.size || 30) + 22, kick.bg));
    els.push(textPath(f, text, kx + (kick.bg ? 12 : 0), INSET + (kick.size || 30) - 6, kick.size || 30, { fill: kick.fg || (kick.bg && kick.bg !== '#00000000' ? o.shade : '#FFFFFF'), spacing: kick.spacing || 4 }).el);
  }

  // badge (corner) — rect or circle (VS medallion)
  if (spec.badge) {
    const f = font(spec.badge.font || 'passionBold');
    const text = applyCase(spec.badge.text, 'upper');
    const size = spec.badge.size || 64;
    if (spec.badge.shape === 'circle') {
      const cx = spec.badge.corner === 'center' ? W / 2 : W - size / 2 - 24;
      const cy = spec.badge.corner === 'center' ? H / 2 : size / 2 + 24;
      els.push(`<circle cx="${cx}" cy="${cy}" r="${size / 2 + 20}" fill="${spec.badge.bg}" stroke="${spec.badge.ring || '#0A0A0A'}" stroke-width="6"/>`);
      els.push(textPath(f, text, cx - adv(f, text, size) / 2, cy + size * 0.32, size, { fill: spec.badge.fg }).el);
    } else {
      const tw = adv(f, text, size);
      const bw = tw + 48, bh = size + 40;
      const bx = spec.badge.corner === 'tr' ? W - bw - 24 : 24;
      const by = 24;
      els.push(bar(bx, by, bw, bh, spec.badge.bg));
      els.push(textPath(f, text, bx + 24, by + size + 8, size, { fill: spec.badge.fg }).el);
    }
  }

  // title block
  const f = font(t.font);
  let title = applyCase(o.title, t.case);
  if (t.maxWords) { const w = title.split(/\s+/); if (w.length > t.maxWords) title = w.slice(0, t.maxWords).join(' '); }
  const panelInset = spec.panel ? (W * spec.panel.w) / 100 + 40 : 0;
  const x0 = spec.panel && spec.panel.side === 'left' ? (W * spec.panel.w) / 100 + 40 : INSET;
  const maxW = (spec.panel ? W - panelInset : W) - x0 - INSET;
  const size = t.size === 'auto' ? autofit(f, title, maxW, { maxLines: t.maxLines || 3 }) : t.size;
  const lines = wrapLines(f, title, size, maxW);
  const lineH = size * 1.08;
  const blockH = lines.length * lineH;
  const isCenter = t.align === 'center' || t['align-center'] === true;
const yStart = t.pos === 'center' ? (H - blockH) / 2 + size : t.pos === 'top' ? INSET + 90 + size : H - INSET - (lines.length - 1) * lineH;

  const normWord = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const keyWord = normWord(String(o.accentWord || pickAccentWord(title)));
  const wordCount = (li) => (lines[li] || '').split(' ').filter(Boolean).length;

  // Resolves a catalog `word` selector to a concrete {li, wi} target.
  //   'keyword' -> the accent word (matched by text)
  //   'first'   -> the opening word of the headline
  //   'last'    -> the closing word of the headline
  //   N         -> the Nth word (1-based) across the whole headline
  const resolveWord = (sel) => {
    if (sel === undefined || sel === null) return null;
    if (sel === 'keyword') {
      for (let li = 0; li < lines.length; li++) {
        const ws = lines[li].split(' ');
        const wi = ws.findIndex((w) => normWord(w) === keyWord);
        if (wi >= 0) return { li, wi };
      }
      return { li: 0, wi: 0 };
    }
    if (sel === 'first') return { li: 0, wi: 0 };
    if (sel === 'last') {
      const li = lines.length - 1;
      return { li, wi: Math.max(0, wordCount(li) - 1) };
    }
    let rem = Number(sel);
    if (!Number.isInteger(rem) || rem < 1) return null;
    for (let li = 0; li < lines.length; li++) {
      const c = wordCount(li);
      if (rem <= c) return { li, wi: rem - 1 };
      rem -= c;
    }
    return null;
  };

  const treat = {
    hlPad: 14,
    targets: {
      highlight: resolveWord(t.highlight && t.highlight.word),
      underline: resolveWord(t.underline && t.underline.word),
      overline: resolveWord(t.overline && t.overline.word),
      strike: resolveWord(t.strike && t.strike.word),
    },
    hlBg: t.highlight ? (o.accent || t.highlight.bg) : null,
    hlFg: t.highlight ? t.highlight.fg : null,
    underline: t.underline || null,
    overline: t.overline || null,
    strike: t.strike || null,
  };
  lines.forEach((line, li) => {
    const words = line.split(' ');
    const y = yStart + li * lineH;
    const widest = lines.reduce((a, l) => Math.max(a, adv(f, l, size)), 0);
    const x = isCenter ? x0 + (maxW - widest) / 2 : x0;
    const lineColor = Array.isArray(t.tone) ? t.tone[li % t.tone.length] : t.fg;
    const stroke = t.stroke && t.stroke.w > 0 ? { c: o.accent && t.stroke.followAccent ? o.accent : t.stroke.c, w: t.stroke.w } : null;
    const r = renderLine({ f, words, x, y, size, fg: lineColor, spacing: t.spacing || 0, treat, stroke, twoTone: null, lineIdx: li });
    els.push(...r.els);
  });

  // face cutout — the channel's own face image, composited on EVERY template
  // that declares a face slot (owner request: faces rotate across all videos)
  if (o.faceImage && spec.face) {
    const fc = spec.face;
    const d = fc.r * 2;
    const bx = fc.cx - fc.r, by = fc.cy - fc.r;
    els.push(`<clipPath id="v2faceclip"><circle cx="${fc.cx}" cy="${fc.cy}" r="${fc.r}"/></clipPath>`);
    els.push(`<image href="${o.faceImage}" x="${bx}" y="${by}" width="${d}" height="${d}" preserveAspectRatio="xMidYMid slice" clip-path="url(#v2faceclip)"/>`);
    if (fc.ring !== 'none') els.push(`<circle cx="${fc.cx}" cy="${fc.cy}" r="${fc.r}" fill="none" stroke="${fc.ring}" stroke-width="${fc.ringW || 8}"/>`);
  }

  // brand tag (bottom-left small)
  if (o.brand) {
    const bf = font('mono');
    els.push(textPath(bf, o.brand.toUpperCase().slice(0, 24), INSET, H - 28, 22, { fill: '#FFFFFF', stroke: { c: '#000000', w: 4 } }).el);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${els.join('')}</svg>`;
}

// gallery-id alias ('v2/ketchup') used by the bulk/preview routes
export function renderV2ById(prefixedId, opts = {}) {
  return renderV2(prefixedId, opts);
}
