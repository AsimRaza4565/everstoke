import React, { useEffect } from "react";
import { AbsoluteFill, Img, staticFile, continueRender, delayRender, useCurrentFrame } from "remotion";

// ============ THUMB LAB — 12 thumbnail designs (4 channels x 3 variants) ============
// Props: { channel: "ic"|"mr"|"dfd"|"qq", variant: "A"|"B"|"C" }
// Renders one 1280x720 still. Corner badge shows the variant letter.

const loadFonts = () => {
  useEffect(() => {
    const h = delayRender("thumb fonts");
    Promise.all([
      ...[600, 800, 900].map((w) => new Promise<void>((res) => { const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); })),
      new Promise<void>((res) => { const f = new FontFace("Playfair Display", `url(${staticFile("fonts/playfair-display.ttf")})`, { weight: "400 900" }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); }),
    ]).then(() => continueRender(h)).catch(() => continueRender(h));
  }, []);
};

const SANS = "Inter, Arial, sans-serif";
const SERIF = "'Playfair Display', Georgia, serif";
const IMG = (name: string) => staticFile(`tl/${name}.jpg`);

const CH = {
  ic: { accent: "#E8C15A", bg: "#0B1128", brand: "INVESTOR'S COMPASS" },
  mr: { accent: "#C1272D", bg: "#12080A", brand: "MONEY RULEBOOK" },
  dfd: { accent: "#4ADE80", bg: "#07120C", brand: "DEBT-FREE DOCTRINE" },
  qq: { accent: "#F5E31C", bg: "#0A0A0A", brand: "QUOTE QUARRY" },
};

const Badge: React.FC<{ v: string }> = ({ v }) => (
  <div style={{ position: "absolute", top: 24, left: 24, background: "rgba(0,0,0,0.75)", border: "2px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "6px 22px", fontFamily: SANS, fontWeight: 800, fontSize: 34, color: "#fff", zIndex: 20 }}>{v}</div>
);

const BrandChip: React.FC<{ brand: string; accent: string }> = ({ brand, accent }) => (
  <div style={{ position: "absolute", bottom: 28, left: 32, background: accent, color: "#000", borderRadius: 8, padding: "8px 18px", fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: "0.2em", zIndex: 20 }}>{brand}</div>
);

const Photo: React.FC<{ file: string; style?: React.CSSProperties; imgStyle?: React.CSSProperties }> = ({ file, style, imgStyle }) => {
  const h = delayRender("tl photo");
  useEffect(() => { const i = new Image(); i.onload = () => continueRender(h); i.onerror = () => continueRender(h); i.src = staticFile(file); }, []);
  return <Img src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover", ...imgStyle }} {...{}} />;
};

// ---------------- IC designs (navy/gold — markets) ----------------
const ICA: React.FC = () => (
  <AbsoluteFill style={{ background: CH.ic.bg }}>
    <Photo file="tl/crashchart.jpg" style={{ position: "absolute", inset: 0, opacity: 0.75 }} />
    <svg width={1280} height={720} style={{ position: "absolute", inset: 0 }}>
      <path d="M -40 150 C 300 220, 520 380, 760 470 C 950 540, 1080 560, 1330 640" fill="none" stroke="#F87171" strokeWidth={16} strokeLinecap="round" />
      <path d="M 1150 560 L 1330 640 L 1240 480" fill="none" stroke="#F87171" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div style={{ position: "absolute", top: 50, right: 60, fontFamily: SANS, fontWeight: 900, fontSize: 130, color: "#F87171", textShadow: "0 0 40px rgba(248,113,113,0.5)" }}>-38%</div>
    <div style={{ position: "absolute", bottom: 96, left: 60, fontFamily: SANS, fontWeight: 900, fontSize: 96, color: "#fff", lineHeight: 1.02 }}>WHEN IT<br />SNAPS</div>
    <BrandChip brand={CH.ic.brand} accent={CH.ic.accent} />
  </AbsoluteFill>
);

const ICB: React.FC = () => (
  <AbsoluteFill style={{ background: CH.ic.bg }}>
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
      <div style={{ width: "50%", background: "linear-gradient(160deg,#05261a,#03301f)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Photo file="tl/statue.jpg" style={{ width: 250, height: 250, borderRadius: 999, overflow: "hidden", border: `5px solid ${CH.ic.accent}`, boxShadow: "0 0 40px rgba(232,193,90,0.4)" }} />
        <div style={{ marginTop: 20, fontFamily: SANS, fontWeight: 900, fontSize: 46, color: "#34D399" }}>INVESTOR</div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, color: "rgba(255,255,255,0.6)" }}>THINKS IN YEARS</div>
      </div>
      <div style={{ width: "50%", background: "linear-gradient(200deg,#2b0505,#160303)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Photo file="tl/trader.jpg" style={{ width: 250, height: 250, borderRadius: 999, overflow: "hidden", border: "5px solid #F87171", boxShadow: "0 0 40px rgba(248,113,113,0.4)" }} />
        <div style={{ marginTop: 24, fontFamily: SANS, fontWeight: 900, fontSize: 52, color: "#F87171" }}>TRADER</div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, color: "rgba(255,255,255,0.6)" }}>THINKS IN MINUTES</div>
      </div>
    </div>
    <div style={{ position: "absolute", top: 250, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", color: "#000", borderRadius: 999, width: 110, height: 110, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 900, fontSize: 52, boxShadow: "0 0 60px rgba(255,255,255,0.55)" }}>VS</div>
    </div>
    <div style={{ position: "absolute", top: 44, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 64, color: "#fff", textShadow: "0 4px 24px rgba(0,0,0,0.8)" }}>ONE GETS WIPED OUT</div>
    <BrandChip brand={CH.ic.brand} accent={CH.ic.accent} />
  </AbsoluteFill>
);

const ICC: React.FC = () => (
  <AbsoluteFill style={{ background: CH.ic.bg }}>
    <div style={{ position: "absolute", left: -80, top: -60, width: 780, height: 840, borderRadius: 999, overflow: "hidden", border: `10px solid ${CH.ic.accent}`, boxShadow: "0 0 90px rgba(232,193,90,0.35)" }}>
      <Photo file="tl/face.jpg" imgStyle={{ filter: "grayscale(0.85) contrast(1.2)" }} />
    </div>
    <div style={{ position: "absolute", right: 70, top: 180, width: 560, fontFamily: SANS, fontWeight: 900, fontSize: 100, lineHeight: 1.02, color: "#fff" }}>HE<br />KNEW.</div>
    <div style={{ position: "absolute", right: 70, top: 450, width: 520, fontFamily: SERIF, fontWeight: 700, fontSize: 30, color: CH.ic.accent, lineHeight: 1.3 }}>Everyone laughed at his warning.<br />For exactly 72 hours.</div>
    <BrandChip brand={CH.ic.brand} accent={CH.ic.accent} />
  </AbsoluteFill>
);

// ---------------- MR designs (dark red — companies) ----------------
const MRA: React.FC = () => (
  <AbsoluteFill style={{ background: CH.mr.bg }}>
    <Photo file="tl/skyline.jpg" style={{ position: "absolute", inset: 0, opacity: 0.55 }} imgStyle={{ filter: "grayscale(0.5)" }} />
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(18,8,10,0.1) 30%, rgba(18,8,10,0.92) 78%)" }} />
    <div style={{ position: "absolute", top: 60, right: 64, fontFamily: SANS, fontWeight: 900, fontSize: 120, color: "#F87171", textShadow: "0 0 44px rgba(248,113,113,0.5)" }}>-89%</div>
    <div style={{ position: "absolute", bottom: 120, left: 60, fontFamily: SANS, fontWeight: 900, fontSize: 120, color: "#fff", letterSpacing: "-0.01em" }}>COLLAPSED</div>
    <div style={{ position: "absolute", bottom: 78, left: 64, fontFamily: SANS, fontWeight: 600, fontSize: 30, color: "rgba(255,255,255,0.75)" }}>and everyone saw it coming</div>
    <BrandChip brand={CH.mr.brand} accent={CH.mr.accent} />
  </AbsoluteFill>
);

const MRB: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", inset: 0, width: "62%", overflow: "hidden" }}>
      <Photo file="tl/face.jpg" imgStyle={{ filter: "grayscale(1) contrast(1.2) brightness(0.9)" }} />
    </div>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 40%, #000 62%)" }} />
    <div style={{ position: "absolute", right: 56, top: 130, width: 520 }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 88, lineHeight: 1.04, color: "#fff" }}>HE HID IT<br />FOR<br /><span style={{ color: CH.mr.accent }}>YEARS</span></div>
    </div>
    <div style={{ position: "absolute", right: 60, bottom: 140, width: 470, fontFamily: SANS, fontWeight: 600, fontSize: 30, color: "rgba(255,255,255,0.75)" }}>The fraud was hiding in plain sight — on page 61.</div>
    <BrandChip brand={CH.mr.brand} accent={CH.mr.accent} />
  </AbsoluteFill>
);

const MRC: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "55%", overflow: "hidden" }}>
      <Photo file="tl/skyline.jpg" />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.55))" }} />
      <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 54, color: "#fff", textShadow: "0 4px 20px #000" }}>THE EMPIRE</div>
    </div>
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "45%", overflow: "hidden" }}>
      <Photo file="tl/skyline.jpg" imgStyle={{ filter: "grayscale(1) brightness(0.4) contrast(1.3)", transform: "scaleY(-1)" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div style={{ position: "absolute", bottom: 96, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 54, color: "#F87171", textShadow: "0 4px 20px #000" }}>THE AFTERMATH</div>
    </div>
    <div style={{ position: "absolute", top: "47%", left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", color: "#000", borderRadius: 12, padding: "6px 26px", fontFamily: SANS, fontWeight: 900, fontSize: 40, boxShadow: "0 0 40px rgba(255,255,255,0.5)" }}>FROM $47B TO ZERO</div>
    </div>
    <BrandChip brand={CH.mr.brand} accent={CH.mr.accent} />
  </AbsoluteFill>
);

// ---------------- DFD designs (dark green — personal debt) ----------------
const DFDA: React.FC = () => (
  <AbsoluteFill style={{ background: CH.dfd.bg }}>
    <Photo file="tl/cards.jpg" style={{ position: "absolute", inset: 0, opacity: 0.5 }} imgStyle={{ filter: "saturate(0.6)" }} />
    <div style={{ position: "absolute", left: 90, top: 130, width: 640, transform: "rotate(-8deg)", background: "#fff", borderRadius: 18, padding: "26px 30px", boxShadow: "0 30px 70px rgba(0,0,0,0.6)" }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 40, color: "#111" }}>MINIMUM PAYMENT</div>
      <div style={{ marginTop: 8, fontFamily: SANS, fontWeight: 800, fontSize: 56, color: "#F87171" }}>$35/mo</div>
      <div style={{ marginTop: 6, fontFamily: SANS, fontWeight: 700, fontSize: 26, color: "#666" }}>payback time: 27 YEARS</div>
    </div>
    <div style={{ position: "absolute", right: 70, top: 110, background: "#F87171", color: "#000", borderRadius: 14, padding: "14px 28px", transform: "rotate(7deg)", fontFamily: SANS, fontWeight: 900, fontSize: 56, boxShadow: "0 0 50px rgba(248,113,113,0.5)" }}>THE TRAP</div>
    <div style={{ position: "absolute", bottom: 110, left: 90, fontFamily: SANS, fontWeight: 900, fontSize: 78, color: "#fff" }}>IT'S DESIGNED<br />THIS WAY</div>
    <BrandChip brand={CH.dfd.brand} accent={CH.dfd.accent} />
  </AbsoluteFill>
);

const DFDB: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Photo file="tl/cards.jpg" style={{ position: "absolute", inset: 0, opacity: 0.35, filter: "saturate(0.3) brightness(0.7)" }} />
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 45%, transparent 30%, rgba(0,0,0,0.85) 85%)" }} />
    <div style={{ position: "absolute", top: 90, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 96, color: "#F87171", textShadow: "0 0 50px rgba(248,113,113,0.45)" }}>$87,000</div>
    <div style={{ position: "absolute", top: 214, left: 0, right: 0, textAlign: "center" }}><span style={{ background: "rgba(0,0,0,0.72)", padding: "8px 24px", fontFamily: SANS, fontWeight: 800, fontSize: 44, color: "#fff", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>GONE. AND SHE PAID EVERY BILL ON TIME.</span></div>
    <div style={{ position: "absolute", bottom: 186, left: 0, right: 0, textAlign: "center" }}><span style={{ background: "rgba(0,0,0,0.72)", padding: "8px 24px", fontFamily: SERIF, fontWeight: 700, fontSize: 38, color: "#fff" }}>The math nobody teaches you.</span></div>
    <BrandChip brand={CH.dfd.brand} accent={CH.dfd.accent} />
  </AbsoluteFill>
);

const DFDC: React.FC = () => (
  <AbsoluteFill style={{ background: CH.dfd.bg }}>
    <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 66, color: "#fff" }}>KILL DEBT:<br />WHICH ONE WINS?</div>
    <div style={{ position: "absolute", top: 300, left: 80, width: 480, height: 300, borderRadius: 22, background: "rgba(74,222,128,0.1)", border: `2.5px solid ${CH.dfd.accent}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 54, color: CH.dfd.accent }}>SNOWBALL</div>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 28, color: "rgba(255,255,255,0.75)", marginTop: 10 }}>smallest first</div>
    </div>
    <div style={{ position: "absolute", top: 300, right: 80, width: 480, height: 300, borderRadius: 22, background: "rgba(96,165,250,0.1)", border: "2.5px solid #60A5FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 54, color: "#60A5FA" }}>AVALANCHE</div>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 28, color: "rgba(255,255,255,0.75)", marginTop: 10 }}>highest rate first</div>
    </div>
    <div style={{ position: "absolute", top: 400, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", color: "#000", borderRadius: 999, width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 900, fontSize: 46, boxShadow: "0 0 50px rgba(255,255,255,0.5)" }}>VS</div>
    </div>
    <div style={{ position: "absolute", bottom: 120, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 44, color: CH.dfd.accent }}>one saves your mind — one saves your money</div>
    <BrandChip brand={CH.dfd.brand} accent={CH.dfd.accent} />
  </AbsoluteFill>
);

// ---------------- QQ designs (black/yellow — stoicism) ----------------
const QQA: React.FC = () => (
  <AbsoluteFill style={{ background: CH.qq.bg }}>
    <Photo file="tl/statue.jpg" style={{ position: "absolute", right: -60, top: -40, width: 760, height: 800, opacity: 0.9 }} imgStyle={{ filter: "grayscale(1) contrast(1.2)", maskImage: "linear-gradient(90deg, transparent, #000 30%)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 30%)" }} />
    <div style={{ position: "absolute", left: 70, top: 90, fontFamily: SERIF, fontWeight: 900, fontSize: 190, color: CH.qq.accent, lineHeight: 0.8 }}>&ldquo;</div>
    <div style={{ position: "absolute", left: 80, top: 200, width: 660, fontFamily: SERIF, fontWeight: 800, fontSize: 72, lineHeight: 1.2, color: "#fff" }}>You could leave life right now. Let that decide what you do and say.</div>
    <div style={{ position: "absolute", left: 84, top: 560, fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: "0.25em", color: CH.qq.accent }}>MARCUS AURELIUS</div>
    <BrandChip brand={CH.qq.brand} accent={CH.qq.accent} />
  </AbsoluteFill>
);

const QQB: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "58%", overflow: "hidden" }}>
      <Photo file="tl/statue.jpg" imgStyle={{ filter: "grayscale(1) contrast(1.25)" }} />
    </div>
    <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "42%", overflow: "hidden" }}>
      <Photo file="tl/skyline.jpg" imgStyle={{ filter: "grayscale(1) brightness(0.7)" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
    </div>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 48%, #000 60%)" }} />
    <div style={{ position: "absolute", top: 130, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 900, fontSize: 68, color: "#fff", textShadow: "0 6px 30px #000" }}>2,000 YEARS AGO<br />THEY FACED THIS TOO</div>
    <div style={{ position: "absolute", bottom: 150, left: 0, right: 0, textAlign: "center", fontFamily: SERIF, fontWeight: 800, fontSize: 40, color: CH.qq.accent }}>The answer was written in a notebook.</div>
    <BrandChip brand={CH.qq.brand} accent={CH.qq.accent} />
  </AbsoluteFill>
);

const QQ: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <div style={{ position: "absolute", left: "50%", top: "46%", transform: "translate(-50%,-50%)", width: 560, height: 560, borderRadius: 999, background: "radial-gradient(circle, rgba(245,227,28,0.22), rgba(245,180,28,0.06) 45%, transparent 70%)" }} />
    <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", width: 300, height: 380, borderRadius: 8, overflow: "hidden", boxShadow: "0 0 90px rgba(245,227,28,0.35)" }}>
      <Photo file="tl/candle.jpg" />
    </div>
    <div style={{ position: "absolute", top: 110, left: 0, right: 0, textAlign: "center", fontFamily: SERIF, fontWeight: 800, fontSize: 92, color: "#fff", letterSpacing: "0.06em" }}>MEMENTO MORI</div>
    <div style={{ position: "absolute", top: 230, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 600, fontSize: 30, color: "rgba(255,255,255,0.6)", letterSpacing: "0.35em" }}>REMEMBER. YOU. WILL. DIE.</div>
    <div style={{ position: "absolute", bottom: 140, left: 0, right: 0, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: 30, color: CH.qq.accent, letterSpacing: "0.3em" }}>THE PHILOSOPHER'S SECRET WEAPON</div>
    <BrandChip brand={CH.qq.brand} accent={CH.qq.accent} />
  </AbsoluteFill>
);

const MAP: Record<string, React.FC> = {
  "ic-A": ICA, "ic-B": ICB, "ic-C": ICC,
  "mr-A": MRA, "mr-B": MRB, "mr-C": MRC,
  "dfd-A": DFDA, "dfd-B": DFDB, "dfd-C": DFDC,
  "qq-A": QQA, "qq-B": QQB, "qq-C": QQ,
};

export const ThumbLab: React.FC<any> = (props) => {
  loadFonts();
  const key = `${props?.channel || "ic"}-${props?.variant || "A"}`;
  const D = MAP[key] || ICA;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <D />
      <Badge v={props?.variant || "A"} />
    </AbsoluteFill>
  );
};

// ---------------- OverlayThumb: AI background + crisp text/brand overlay ----------------
export const OverlayThumb: React.FC<any> = (props) => {
  loadFonts();
  const { bg, headline, sub, brand, accent, badge } = props;
  const h = delayRender("overlay bg");
  useEffect(() => { const i = new Image(); i.onload = () => continueRender(h); i.onerror = () => continueRender(h); i.src = staticFile(bg); }, []);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Img src={staticFile(bg)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.78) 100%)" }} />
      <div style={{ position: "absolute", bottom: 118, left: 54, right: 54 }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 104, lineHeight: 1.02, color: "#fff", textShadow: "0 6px 30px rgba(0,0,0,0.85)" }}>{headline}</div>
        {sub ? <div style={{ marginTop: 20, fontFamily: SANS, fontWeight: 700, fontSize: 34, color: accent, textShadow: "0 3px 16px rgba(0,0,0,0.8)" }}>{sub}</div> : null}
      </div>
      <div style={{ position: "absolute", bottom: 28, left: 32, background: accent, color: "#000", borderRadius: 8, padding: "8px 18px", fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: "0.2em" }}>{brand}</div>
      {badge ? <div style={{ position: "absolute", top: 24, left: 24, background: "rgba(0,0,0,0.75)", border: "2px solid rgba(255,255,255,0.35)", borderRadius: 10, padding: "6px 22px", fontFamily: SANS, fontWeight: 800, fontSize: 34, color: "#fff" }}>{badge}</div> : null}
    </AbsoluteFill>
  );
};

// ---------------- TSThumb: Think School style (face right, bold caps left, yellow highlight) ----------------
export const TSThumb: React.FC<any> = (props) => {
  loadFonts();
  const { bg, face, line1, line2, chip, accent, arrowTo } = props;
  const h = delayRender("ts images");
  useEffect(() => {
    let n = 0;
    const done = () => { n += 1; if (n >= 2) continueRender(h); };
    for (const f of [bg, face]) { const i = new Image(); i.onload = done; i.onerror = done; i.src = staticFile(f); }
  }, []);
  const ANTON = "'Anton', 'Inter', Arial, sans-serif";
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#0b0b0b" }}>
      <Img src={staticFile(bg)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35, filter: "saturate(0.8)" }} />
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.25) 75%)" }} />
      {/* face panel right */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "46%", overflow: "hidden", borderLeft: `6px solid ${accent}`, boxShadow: "-20px 0 60px rgba(0,0,0,0.6)" }}>
        <Img src={staticFile(face)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", transform: `scale(${1.04 + 0.01 * Math.sin(f / 30)})` }} />
      </div>
      {/* red arrow */}
      {arrowTo ? (
        <svg width={1280} height={720} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <path d={`M 300 560 C 450 500, 560 480, ${arrowTo} 430`} fill="none" stroke="#FF3B30" strokeWidth={10} strokeLinecap="round" />
          <circle cx={arrowTo} cy={430} r={13} fill="#FF3B30" />
        </svg>
      ) : null}
      {/* title */}
      <div style={{ position: "absolute", left: 54, top: 150, width: 660 }}>
        <div style={{ fontFamily: ANTON, fontSize: 92, lineHeight: 1.08, color: "#fff", letterSpacing: "0.01em" }}>{line1}</div>
        <div style={{ display: "inline-block", marginTop: 18, background: accent, color: "#000", padding: "6px 20px", fontFamily: ANTON, fontSize: 78, lineHeight: 1.15, transform: "rotate(-1.5deg)" }}>{line2}</div>
      </div>
      <div style={{ position: "absolute", bottom: 28, left: 32, background: accent, color: "#000", borderRadius: 8, padding: "8px 18px", fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: "0.2em" }}>{chip}</div>
    </AbsoluteFill>
  );
};
