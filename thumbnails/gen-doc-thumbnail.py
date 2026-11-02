# Documentary thumbnail generator — "editorial cutout" style
# Reference feel: light paper background, B&W subject cutout with soft oval
# feather, glowing blue data streams at the base, dark mini data-cards,
# serif kicker line + giant accent word + letter-spaced subtitle.
# Local demo tool — nothing is uploaded anywhere.
# Usage:  python gen-doc-thumbnail.py --all   |   --demo theranos
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance, ImageOps
import argparse
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
_fnt_local = os.path.join(HERE, "fonts")
_fnt_shared = os.path.join(HERE, "..", "image-tools", "fonts")
FONTS = _fnt_local if os.path.isdir(_fnt_local) else _fnt_shared
W, H = 1280, 720
PAPER = (243, 241, 236)
INK = (18, 18, 20)
KICK = (58, 62, 68)
SUBT = (72, 80, 92)
BLUE = (24, 98, 226)          # reference royal blue

DEMOS = {
    "theranos": {
        "photo": "assets/holmes.jpg", "mask": "oval",
        "kicker": "THE MONEY RULEBOOK DOCUMENTARIES",
        "serif": "THE FALL OF", "big": "THERANOS",
        "subtitle": ["$9B SCAM", "SILICON VALLEY", "ELIZABETH HOLMES"],
        "monogram": "MR", "cards": ["VALUED AT\n$9 BILLION", "INVESTORS LOST\n$1 BILLION"],
    },
    "lehman": {
        "photo": "assets/lehman.jpg", "mask": "block",
        "kicker": "DEBT-FREE DOCTRINE DOCUMENTARIES",
        "serif": "THE FALL OF", "big": "LEHMAN",
        "subtitle": ["2008 CRASH", "$613B BANKRUPTCY", "WALL STREET"],
        "monogram": "DFD", "cards": ["DEBT\n$613B", "LOST JOBS\n25,000"],
    },
    "marcus": {
        "photo": "assets/marcus.jpg", "mask": "key",
        "kicker": "QUOTE QUARRY DOCUMENTARIES",
        "serif": "THE MIND OF", "big": "MARCUS",
        "subtitle": ["MEDITATIONS", "ROMAN EMPEROR", "STOIC PHILOSOPHY"],
        "monogram": "QQ", "cards": ["RULES OF\nPOWER", "WRITTEN\n~170 AD"],
    },
    "nobel": {
        "photo": "assets/nobel.png", "mask": "oval", "crop": (0.08, 0.06, 0.92, 0.94),
        "kicker": "INVESTOR'S COMPASS DOCUMENTARIES",
        "serif": "WHEN GENIUS", "big": "FAILED",
        "subtitle": ["NOBEL PRIZE", "WALL STREET", "1998 CRISIS"],
        "monogram": "IC", "cards": ["NOBEL PRIZES\n2", "LOST IN WEEKS\n$4.6B"],
    },
}


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def tracked(draw, xy, text, fnt, fill, tracking=0, anchor="left"):
    # letter-spaced text; anchor: left | right
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x, y = xy
    if anchor == "right":
        x -= total
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += w + tracking
    return total


def fit_font(draw, text, name, start, max_width, tracking=0):
    size = start
    while size > 40:
        f = font(name, size)
        widths = [draw.textlength(ch, font=f) for ch in text]
        if sum(widths) + tracking * (len(text) - 1) <= max_width:
            return f
        size -= 6
    return font(name, 40)


def paper_base():
    base = Image.new("RGB", (W, H), PAPER)
    # soft paper fiber streaks
    d = ImageDraw.Draw(base)
    random.seed(7)
    for _ in range(260):
        y = random.randint(0, H)
        x = random.randint(0, W)
        ln = random.randint(30, 160)
        shade = random.randint(228, 238)
        d.line((x, y, x + ln, y + random.randint(-2, 2)), fill=(shade, shade - 2, shade - 5), width=1)
    base = base.filter(ImageFilter.GaussianBlur(0.6))
    # gentle light from top-left
    glow = Image.new("L", (W, H), 0)
    dg = ImageDraw.Draw(glow)
    dg.ellipse((-300, -260, 620, 380), fill=26)
    base = Image.composite(Image.new("RGB", (W, H), (255, 255, 252)), base, glow.filter(ImageFilter.GaussianBlur(120)))
    return base


def vignette(img):
    mask = Image.radial_gradient("L").resize((W, H))
    mask = ImageOps.invert(mask).point(lambda p: int(p * 0.14))
    return Image.composite(Image.new("RGB", (W, H), (210, 206, 198)), img, mask)


def prep_portrait(spec):
    photo = Image.open(os.path.join(HERE, spec["photo"])).convert("RGB")
    mode = spec["mask"]
    if "crop" in spec:
        fx0, fy0, fx1, fy1 = spec["crop"]
        w0, h0 = photo.size
        photo = photo.crop((int(w0 * fx0), int(h0 * fy0), int(w0 * fx1), int(h0 * fy1)))
    if mode == "alpha":
        photo = photo.resize((560, 552))
        return photo.convert("RGBA")
    if mode == "key":
        # tighter crop: skip pedestal / empty top so the subject fills the frame
        w0, h0 = photo.size
        photo = photo.crop((int(w0 * 0.10), int(h0 * 0.04), int(w0 * 0.94), int(h0 * 0.86)))
    target_h = 660
    ratio = target_h / photo.height
    photo = photo.resize((int(photo.width * ratio), target_h), Image.LANCZOS)
    # keep NATURAL COLOR (user rejected B&W 09-19) — only gentle contrast/color lift
    photo = ImageEnhance.Contrast(photo).enhance(1.06)
    photo = ImageEnhance.Color(photo).enhance(1.06)
    if mode == "key":
        # remove a smooth studio background: estimate the bg PER ROW from the
        # left/right edge strips (handles gradient backdrops), key on distance
        px = photo.load()
        w, h = photo.size
        m = Image.new("L", photo.size, 0)
        dm = m.load()
        for yy in range(h):
            strip = [px[xx, yy] for xx in list(range(0, 12)) + list(range(w - 12, w))]
            bg = tuple(sorted(c[i] for c in strip)[len(strip) // 2] for i in range(3))
            for xx in range(w):
                p = px[xx, yy]
                dist = math.sqrt((p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2)
                dm[xx, yy] = 0 if dist < 24 else (255 if dist > 52 else int((dist - 24) * 255 / 28))
        m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(2.0))
        # trim far-out backdrop remnants: intersect with a generous soft oval
        ov = Image.new("L", photo.size, 0)
        ImageDraw.Draw(ov).ellipse((-30, -16, photo.width + 30, photo.height + 12), fill=255)
        ov = ov.filter(ImageFilter.GaussianBlur(30))
        m = Image.composite(m, Image.new("L", photo.size, 0), ov)
    elif mode == "block":
        m = Image.new("L", photo.size, 0)
        dm = ImageDraw.Draw(m)
        dm.rectangle((28, 24, photo.width - 28, photo.height - 6), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(26))
    else:  # oval — inset so corners/top edge of the PHOTO itself fade out fully
        m = Image.new("L", photo.size, 0)
        dm = ImageDraw.Draw(m)
        dm.ellipse((14, 10, photo.width - 14, photo.height - 6), fill=255)
        m = m.filter(ImageFilter.GaussianBlur(30))
    rgba = photo.convert("RGBA")
    rgba.putalpha(m)
    return rgba


def data_streams(img, spec):
    """Glowing blue vertical data lines rising from the subject base + particles."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    random.seed(11)
    for _ in range(46):
        x = random.randint(50, 610)
        base_y = random.randint(690, 716)
        hgt = random.randint(50, 300)
        alpha = random.randint(70, 150)
        col = BLUE + (alpha,)
        d.line((x, base_y, x, base_y - hgt), fill=col, width=2)
        d.ellipse((x - 3, base_y - hgt - 3, x + 3, base_y - hgt + 3), fill=BLUE + (alpha + 50,))
        # little branch ticks
        if random.random() < 0.5:
            ty = base_y - random.randint(20, max(30, hgt - 10))
            d.line((x, ty, x + random.randint(-18, 18), ty), fill=BLUE + (alpha - 30,), width=1)
    glow = layer.filter(ImageFilter.GaussianBlur(5))
    img_rgba = img.convert("RGBA")
    img_rgba.alpha_composite(glow)
    img_rgba.alpha_composite(layer)
    # faint dot grid at the very base
    d2 = ImageDraw.Draw(img_rgba)
    for gx in range(40, 640, 17):
        for gy in range(660, 720, 15):
            if random.random() < 0.5:
                d2.ellipse((gx, gy, gx + 2, gy + 2), fill=BLUE + (random.randint(40, 90),))
    return img_rgba.convert("RGB")


def data_card(img, xy, size, label, accent):
    """Small dark rounded card with a mini chart + tiny label."""
    x, y = xy
    w, h = size
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((x, y, x + w, y + h), radius=10, fill=(10, 16, 30, 235))
    img = Image.alpha_composite(img.convert("RGBA"), card)
    d = ImageDraw.Draw(img)
    random.seed(hash(label) % 1000)
    chart_top = y + 12
    # mini bars or line — kept BELOW the label lines (labels end ~y+38)
    if random.random() < 0.5:
        bx = x + 12
        for i in range(7):
            bh = random.randint(10, h - 56)
            d.rectangle((bx, y + h - 14 - bh, bx + 7, y + h - 14), fill=accent + (235,))
            bx += 12
    else:
        pts = []
        for i in range(8):
            pts.append((x + 12 + i * (w - 24) / 7, y + h - 16 - random.randint(6, h - 58)))
        d.line(pts, fill=accent + (235,), width=2, joint="curve")
    f = font("Inter-SemiBold.ttf", 11)
    ty = y + 10
    for line in label.split("\n"):
        tracked(d, (x + 12, ty), line, f, (235, 238, 244), tracking=1)
        ty += 14
    return img.convert("RGB")


def digits_column(img):
    """Faint tiny numeric columns on the far left, like a data terminal."""
    d = ImageDraw.Draw(img)
    random.seed(4)
    f = font("Inter-Regular.ttf", 9)
    for col in range(3):
        x = 14 + col * 16
        y = 430
        while y < 716:
            num = str(random.randint(0, 9))
            d.text((x, y), num, font=f, fill=(90, 120, 190))
            y += 12
    return img


def roundel(img, cx, cy, text, accent):
    d = ImageDraw.Draw(img)
    r = 23
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=accent, width=3)
    f = font("Inter-SemiBold.ttf", 15)
    tw = d.textlength(text, font=f)
    d.text((cx - tw / 2, cy - 9), text, font=f, fill=INK)
    return img


def render(name, spec, accent=BLUE, out=None):
    random.seed()
    img = vignette(paper_base())
    portrait = prep_portrait(spec)
    px = 40 if spec["mask"] != "alpha" else 70
    py = H - portrait.height - (0 if spec["mask"] != "alpha" else 60)
    img.paste(portrait, (px, py), portrait)
    # user order 09-19: NO data lines, NO digit columns, NO dark cards — photo + type only

    d = ImageDraw.Draw(img)
    CX = 940  # type column center, like the reference
    # kicker top, centered (measure without drawing, then draw once)
    f_kick = font("Inter-SemiBold.ttf", 21)
    kw = sum(d.textlength(c, font=f_kick) for c in spec["kicker"]) + 7 * (len(spec["kicker"]) - 1)
    tracked(d, (CX + kw / 2, 42), spec["kicker"], f_kick, KICK, tracking=7, anchor="right")
    f_kick2 = font("Inter-Regular.ttf", 16)
    pw2 = sum(d.textlength(c, font=f_kick2) for c in "P R E S E N T S") + 4 * 14
    tracked(d, (CX + pw2 / 2, 74), "P R E S E N T S", f_kick2, (120, 126, 134), tracking=4, anchor="right")
    # serif line, centered
    f_serif = fit_font(d, spec["serif"], "Cinzel-Bold.ttf", 92, 600, tracking=2)
    sw = sum(d.textlength(c, font=f_serif) for c in spec["serif"]) + 2 * (len(spec["serif"]) - 1)
    tracked(d, (CX + sw / 2, 172), spec["serif"], f_serif, INK, tracking=2, anchor="right")
    # big word, centered
    f_big = fit_font(d, spec["big"], "Anton-Regular.ttf", 218, 580, tracking=0)
    bw = sum(d.textlength(c, font=f_big) for c in spec["big"])
    bbox = f_big.getbbox(spec["big"])
    bh = bbox[3] - bbox[1]
    by = 262 + (168 - bh) / 2 - bbox[1]
    d.text((CX - bw / 2, by), spec["big"], font=f_big, fill=accent)
    # roundel centered above subtitle
    roundel(img, CX, 548, spec["monogram"], accent)
    f_sub = font("Inter-SemiBold.ttf", 15)
    seg = "   •   ".join(spec["subtitle"])
    sw2 = sum(d.textlength(c, font=f_sub) for c in seg) + 3 * (len(seg) - 1)
    tracked(d, (CX + sw2 / 2, 596), seg, f_sub, SUBT, tracking=3, anchor="right")

    # global grain
    noise = Image.effect_noise((W, H), 14).convert("L")
    grain = Image.merge("RGB", (noise, noise, noise))
    img = Image.blend(img, Image.composite(grain, img, Image.new("L", (W, H), 26)), 0.35)
    img = ImageEnhance.Contrast(img).enhance(1.03)

    out = out or os.path.join(HERE, "demos", f"{name}.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print("saved", out)


if __name__ == "__main__":
    import json
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--spec", default=None, help="path to spec json {out,photo,kicker,serif,big,subtitle,monogram,mask,accent}")
    a = ap.parse_args()
    if a.spec:
        with open(a.spec, "r", encoding="utf-8") as f:
            s = json.load(f)
        acc = tuple(s.get("accent", BLUE))
        render_spec = {
            "photo": s["photo"], "mask": s.get("mask", "oval"),
            "kicker": s["kicker"], "serif": s["serif"], "big": s["big"],
            "subtitle": s.get("subtitle", []), "monogram": s.get("monogram", ""),
            "cards": ["", ""],
        }
        out = s.get("out", "demos/spec.png")
        if not os.path.isabs(out):
            out = os.path.join(HERE, out)
        render("spec", render_spec, accent=acc, out=out)
    elif a.all or not a.demo:
        for k in DEMOS:
            render(k, DEMOS[k])
    else:
        render(a.demo, DEMOS[a.demo])
