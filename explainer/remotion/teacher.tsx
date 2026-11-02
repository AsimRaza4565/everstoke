import React, { useEffect } from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

// ============ TEACHER v2 — Vox-style teaching explainer, richer hand-drawn layer ============
// NEW: self-drawing doodle ICONS (dollar/people/growth/clock/bulb...), word-by-word
// headline pops, stamp badges, count-up board numbers, crossover "HERE" marker,
// scattered doodle confetti, torn-paper strips. Safe zones: content y=130..930.

const PAPER = "#FAF5EE";
const INK = "#1F1B16";
const RED = "#C1272D";
const GOLD = "#E8B84B";
const TEAL = "#1D6F5C";
const SERIF = "'Playfair Display', Georgia, serif";
const GROT = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, monospace";

export type TBeat = {
  layout: "hook" | "say" | "board" | "cutout" | "quote" | "end";
  kicker?: string; headline?: string; sub?: string;
  big?: string; label?: string;
  quote?: string; persona?: string; personaCredit?: string;
  photos?: string[]; credits?: string[]; icons?: string[];
  stamp?: string;
  curve?: { from: number; to: number; years: number; labelA: string; labelB: string };
  text: string; audio?: string | null;
  words?: Array<{ w: string; t0: number; t1: number }>;
  startMs: number; ms: number; i: number;
};

export type TDoc = { title: string; brand?: string; eyebrow?: string; music?: string; beats: TBeat[]; totalMs: number; fps: number; width?: number; height?: number };

const loadFonts = () => {
  useEffect(() => {
    const h = delayRender("teacher fonts");
    Promise.all([
      new Promise<void>((res) => { const f = new FontFace("Playfair Display", `url(${staticFile("fonts/playfair-display.ttf")})`, { weight: "400 900" }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); }),
      ...[600, 800, 900].map((w) => new Promise<void>((res) => { const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); })),
      new Promise<void>((res) => { const f = new FontFace("JetBrains Mono", `url(${staticFile("fonts/jetbrains-mono.ttf")})`, { weight: "400 700" }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); }),
    ]).then(() => continueRender(h)).catch(() => continueRender(h));
  }, []);
};

const Content: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = durationInFrames > 24
    ? interpolate(f, [0, 5, durationInFrames - 6, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return <AbsoluteFill style={{ opacity: fade }}>{children}</AbsoluteFill>;
};

const Furniture: React.FC<{ beat: TBeat; total: number; eyebrow: string; brand: string }> = ({ beat, total, eyebrow, brand }) => (
  <>
    <div style={{ position: "absolute", top: 52, left: 130, fontFamily: MONO, fontWeight: 700, fontSize: 22, letterSpacing: "0.28em", color: RED }}>{eyebrow}</div>
    <div style={{ position: "absolute", top: 52, right: 130, display: "flex", gap: 10 }}>
      {(() => {
        const shown = Math.min(total, 16);
        const filled = total <= shown ? beat.i + 1 : Math.round(((beat.i + 1) / total) * shown);
        return Array.from({ length: shown }).map((_, i) => (
          <div key={i} style={{ width: 26, height: 5, borderRadius: 3, background: i < filled ? RED : "rgba(31,27,22,0.2)" }} />
        ));
      })()}
    </div>
    <div style={{ position: "absolute", bottom: 46, left: 130, right: 130, height: 2, background: "rgba(31,27,22,0.16)" }} />
    <div style={{ position: "absolute", bottom: 30, left: 130, fontFamily: MONO, fontWeight: 700, fontSize: 19, letterSpacing: "0.26em", color: "rgba(31,27,22,0.6)" }}>{brand}</div>
  </>
);

const Grain: React.FC = () => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05, mixBlendMode: "multiply", pointerEvents: "none" }}>
    <filter id="tgrain2"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" /></filter>
    <rect width="100%" height="100%" filter="url(#tgrain2)" />
  </svg>
);

// scattered doodle confetti: plus marks + dots, stepped wiggle
const DoodleField: React.FC<{ seed?: number }> = ({ seed = 7 }) => {
  const f = useCurrentFrame();
  const items = [];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const spots: Array<[number, number, number]> = [
    [340, 200, 26], [1560, 250, 18], [520, 880, 20], [1420, 850, 26],
    [980, 180, 16], [240, 620, 16], [1690, 640, 20], [820, 920, 14],
  ];
  spots.forEach(([x, y, sz], i) => {
    const isPlus = i % 2 === 0;
    const wob = Math.sin(Math.floor(f / 2) * 0.08 + i) * 3;
    items.push(
      isPlus ? (
        <svg key={i} width={sz} height={sz} viewBox="0 0 20 20" style={{ position: "absolute", left: x, top: y + wob, opacity: 0.28 }}>
          <path d="M10 2 V18 M2 10 H18" stroke={TEAL} strokeWidth={3} strokeLinecap="round" />
        </svg>
      ) : (
        <svg key={i} width={sz} height={sz} viewBox="0 0 20 20" style={{ position: "absolute", left: x, top: y + wob, opacity: 0.25 }}>
          <circle cx="10" cy="10" r="4.5" fill="none" stroke={GOLD} strokeWidth={3.5} />
        </svg>
      )
    );
  });
  return <>{items}</>;
};

// ---------------- self-drawing ICONS ----------------
const ICON_PATHS: Record<string, string[]> = {
  dollar: ["M50 8 C 30 8, 24 26, 38 36 C 52 46, 76 42, 74 62 C 72 82, 48 92, 26 84", "M50 2 V98"], // S curve + bar
  person: ["M50 14 a16 16 0 1 1 -0.1 0", "M18 88 C 20 62, 80 62, 82 88"],
  people: ["M32 26 a12 12 0 1 1 -0.1 0", "M8 78 C 10 58, 52 58, 54 78", "M70 24 a11 11 0 1 1 -0.1 0", "M52 76 C 58 60, 90 60, 92 76"],
  growth: ["M10 80 C 30 70, 40 50, 52 44 C 66 38, 74 26, 88 14", "M70 14 L 90 12 L 88 32"],
  clock: ["M50 10 a40 40 0 1 1 -0.1 0", "M50 28 V50 L 68 62"],
  bulb: ["M50 14 a28 28 0 1 1 -0.1 0", "M50 70 V80", "M38 84 H62"],
  calendar: ["M14 24 H 86 V 88 H 14 Z", "M14 42 H 86", "M32 12 V32", "M68 12 V32", "M32 58 H42", "M58 58 H68", "M32 72 H42"],
  swap: ["M20 34 C 40 14, 62 14, 80 30", "M72 18 L 84 32 L 64 34", "M80 66 C 60 86, 38 86, 20 70", "M28 82 L 16 68 L 36 66"],
  alert: ["M50 12 L 92 86 H 8 Z", "M50 40 V62", "M50 72 V78"],
  coins: ["M16 40 a34 12 0 0 1 68 0", "M16 40 V56 a34 12 0 0 0 68 0 V40", "M16 58 V74 a34 12 0 0 0 68 0 V58"],
  house: ["M12 50 L 50 16 L 88 50", "M24 44 V86 H 76 V44", "M42 86 V62 H 58 V86"],
};

const DrawIcon: React.FC<{ kind: string; size?: number; delay?: number; color?: string; x?: number | string; y?: number; style?: React.CSSProperties }> = ({ kind, size = 96, delay = 0, color = INK, x, y, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 } });
  const paths = ICON_PATHS[kind] || ICON_PATHS.dollar;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: x !== undefined || y !== undefined ? "absolute" : "relative", left: x as number, top: y, ...style }}>
      {paths.map((d, i) => {
        const seg = (d.length) * 1.35;
        const local = interpolate(p, [i / paths.length, (i + 0.85) / paths.length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return <path key={i} d={d} fill="none" stroke={color} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={seg} strokeDashoffset={seg * (1 - local)} />;
      })}
    </svg>
  );
};

const IconRow: React.FC<{ kinds: string[]; delay?: number; color?: string }> = ({ kinds, delay = 6, color }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", gap: 46, justifyContent: "center", alignItems: "flex-end" }}>
      {kinds.slice(0, 3).map((k, i) => {
        const pop = spring({ frame: f - delay - i * 7 - 12, fps, config: { damping: 12, stiffness: 150 } });
        return (
          <div key={i} style={{ transform: `scale(${Math.max(pop, 0.01)}) rotate(${(i - 1) * 6}deg)`, transformOrigin: "center bottom" }}>
            <DrawIcon kind={k} size={i === 1 ? 116 : 88} delay={delay + i * 7} color={color || (i === 1 ? RED : INK)} />
          </div>
        );
      })}
    </div>
  );
};

// stamp badge: rotated chip that thumps in
const Stamp: React.FC<{ text: string; delay?: number; color?: string; style?: React.CSSProperties }> = ({ text, delay = 10, color = TEAL, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 9, stiffness: 210 } });
  return (
    <div style={{ position: "absolute", transform: `scale(${Math.max(p, 0.01)}) rotate(-7deg)`, ...style }}>
      <div style={{ border: `5px solid ${color}`, color, borderRadius: 12, padding: "10px 26px", fontFamily: MONO, fontWeight: 700, fontSize: 34, letterSpacing: "0.14em", background: "rgba(250,245,238,0.85)", boxShadow: "0 8px 20px rgba(31,27,22,0.15)" }}>
        {text}
      </div>
    </div>
  );
};

// word-by-word serif headline pop
const PopHeadline: React.FC<{ text: string; size?: number; color?: string; delay?: number; align?: string; markedWord?: string }> = ({ text, size = 92, color = INK, delay = 2, align = "center", markedWord }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = String(text || "").split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", gap: "0 22px", fontFamily: SERIF, fontWeight: 800, fontSize: size, lineHeight: 1.16, color }}>
      {words.map((w, i) => {
        const p = spring({ frame: f - delay - i * 2, fps, config: { damping: 200 } });
        const isMarked = markedWord && w.toLowerCase().replace(/[^a-z]/g, "") === markedWord.toLowerCase();
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 26}px) rotate(${((i * 7) % 3 - 1) * 0.7}deg)` }}>
            {isMarked ? <span style={{ background: GOLD, padding: "0 12px", borderRadius: 6 }}>{w}</span> : w}
          </span>
        );
      })}
    </div>
  );
};

// cutout photo card: white border, rotation, drop shadow, tape corners, Ken Burns
const Cutout: React.FC<{ file: string; x: number; y: number; w: number; rot: number; delay?: number; credit?: string }> = ({ file, x, y, w, rot, delay = 0, credit }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 14, stiffness: 140 } });
  const kbf = interpolate(f, [0, 130], [1, 1.1], { extrapolateRight: "extend" });
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `rotate(${rot}deg) scale(${Math.max(s, 0.01)})`, transformOrigin: "center" }}>
      <div style={{ background: "#FFFFFF", padding: 16, boxShadow: "0 24px 50px rgba(31,27,22,0.28)" }}>
        <div style={{ overflow: "hidden", height: w * 0.72 }}>
          <Img src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${kbf})` }} />
        </div>
        {credit ? <div style={{ paddingTop: 8, fontFamily: MONO, fontSize: 15, color: "rgba(31,27,22,0.55)" }}>{credit}</div> : null}
      </div>
      <div style={{ position: "absolute", top: -14, left: "12%", width: 90, height: 28, background: "rgba(232,184,75,0.65)", transform: "rotate(-6deg)" }} />
      <div style={{ position: "absolute", top: -12, right: "10%", width: 90, height: 28, background: "rgba(232,184,75,0.65)", transform: "rotate(5deg)" }} />
    </div>
  );
};

const GreaseCircle: React.FC<{ delay?: number; size?: number; color?: string; style?: React.CSSProperties }> = ({ delay = 0, size = 260, color = RED, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 } });
  const C = 2 * Math.PI * (size / 2);
  return (
    <svg width={size * 1.15} height={size * 1.15} viewBox={`0 0 ${size * 1.15} ${size * 1.15}`} style={{ position: "absolute", ...style, pointerEvents: "none" }}>
      <ellipse cx={size * 0.575} cy={size * 0.575} rx={size / 2} ry={size * 0.44} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${C * 1.02} ${C}`} strokeDashoffset={C * (1 - p)} transform={`rotate(-8 ${size * 0.575} ${size * 0.575})`} />
    </svg>
  );
};

const GreaseArrow: React.FC<{ delay?: number; w?: number; color?: string; style?: React.CSSProperties }> = ({ delay = 0, w = 220, color = TEAL, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 } });
  const L = w * 1.4;
  return (
    <svg width={w} height={w * 0.45} viewBox={`0 0 ${w} ${w * 0.45}`} style={{ position: "absolute", ...style, pointerEvents: "none" }}>
      <path d={`M 8 ${w * 0.3} C ${w * 0.35} ${w * 0.05}, ${w * 0.65} ${w * 0.42}, ${w - 26} ${w * 0.18}`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - p)} />
      <path d={`M ${w - 34} ${w * 0.04} L ${w - 8} ${w * 0.18} L ${w - 38} ${w * 0.34}`} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={60} strokeDashoffset={60 * (1 - Math.max(0, p - 0.7) / 0.3)} />
    </svg>
  );
};

const Marked: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({ children, color = GOLD, delay = 8 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 } });
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{ position: "absolute", left: -8, right: -8, top: "12%", bottom: "8%", background: color, transform: `scaleX(${p})`, transformOrigin: "left center", borderRadius: 6, zIndex: 0 }} />
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
    </span>
  );
};

// ---------------- scenes ----------------
const Hook: React.FC<{ b: TBeat }> = ({ b }) => {
  return (
    <Content>
      <div style={{ position: "absolute", top: 230, left: 150, width: 980 }}>
        <PopHeadline text={b.headline || ""} size={88} align="left" markedWord={(b.headline || "").split(" ").slice(-2)[0]} />
      </div>
      {b.photos?.[0] ? <Cutout file={b.photos[0]} x={1210} y={220} w={520} rot={3} delay={12} credit={b.credits?.[0]} /> : null}
      <GreaseCircle delay={30} size={300} style={{ left: 1150, top: 500 }} />
      <div style={{ position: "absolute", bottom: 330, left: 150, width: 900, fontFamily: GROT, fontWeight: 600, fontSize: 38, color: "rgba(31,27,22,0.75)" }}>
        {b.sub}
      </div>
      <div style={{ position: "absolute", bottom: 180, left: 150 }}>
        <IconRow kinds={b.icons?.length ? b.icons : ["coins", "clock", "growth"]} delay={16} />
      </div>
    </Content>
  );
};

const Say: React.FC<{ b: TBeat }> = ({ b }) => {
  return (
    <Content>
      <div style={{ position: "absolute", top: 220, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontWeight: 700, fontSize: 28, letterSpacing: "0.3em", color: TEAL }}>
        {b.kicker || "HERE IS THE IDEA"}
      </div>
      <div style={{ position: "absolute", top: 330, left: 190, right: 190, textAlign: "center" }}>
        <PopHeadline text={b.headline || ""} size={94} />
      </div>
      {b.sub ? (
        <div style={{ position: "absolute", top: 640, left: 340, right: 340, textAlign: "center", fontFamily: GROT, fontWeight: 600, fontSize: 40, color: "rgba(31,27,22,0.72)" }}>
          <Marked>{b.sub}</Marked>
        </div>
      ) : null}
      <div style={{ position: "absolute", top: 790, left: 0, right: 0 }}>
        <IconRow kinds={b.icons?.length ? b.icons : ["dollar", "bulb", "growth"]} delay={18} />
      </div>
      {b.stamp ? <Stamp text={b.stamp} delay={26} style={{ right: 210, top: 250 }} /> : null}
    </Content>
  );
};

// the whiteboard: drawn curves + crossover marker + count-up total
const Board: React.FC<{ b: TBeat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = spring({ frame: f - 6, fps, config: { damping: 200 }, durationInFrames: 66 });
  const c = b.curve || { from: 100, to: 300, years: 30, labelA: "SAVE", labelB: "INVEST" };
  const W = 1250, H = 520, X0 = 240, Y0 = 830;
  const straight = (p: number) => Y0 - H * 0.5 * p;
  const curve = (p: number) => Y0 - H * 0.94 * Math.pow(p, 1.9);
  const path = (fn: (p: number) => number) => {
    let d = "";
    for (let i = 0; i <= 50; i++) {
      const p = (i / 50) * draw;
      d += `${i === 0 ? "M" : "L"} ${X0 + (W - 60) * p} ${fn(p)} `;
    }
    return d;
  };
  // crossover where curve passes the straight line: 0.5 = 0.94 p^1.9 -> p ≈ 0.737
  const pX = Math.pow(0.5 / 0.94, 1 / 1.9);
  const xX = X0 + (W - 60) * pX * draw;
  const yX = curve(pX * draw);
  const crossP = spring({ frame: f - 40, fps, config: { damping: 12, stiffness: 160 } });
  const endPop = spring({ frame: f - 58, fps, config: { damping: 12, stiffness: 170 } });
  // count-up total (preserves $ prefix and K/M suffix in the right places)
  const rawBig = String(b.big || "$760K");
  const numMatch = rawBig.match(/[^0-9.]*([0-9.]+)(.*)/);
  const prefix = numMatch ? numMatch[0].slice(0, numMatch[0].length - numMatch[1].length - numMatch[2].length).trim() : "";
  const target = numMatch ? Number(numMatch[1]) : 760;
  const suffix = numMatch ? numMatch[2] : "K";
  const shown = Math.round(interpolate(Math.min(endPop, 1), [0, 1], [target * 0.4, target], { extrapolateLeft: "clamp" }));
  return (
    <Content>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontWeight: 700, fontSize: 28, letterSpacing: "0.3em", color: TEAL }}>
        {b.kicker || "WATCH WHAT HAPPENS"}
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <line x1={X0} y1={Y0} x2={X0 + W - 40} y2={Y0} stroke="rgba(31,27,22,0.5)" strokeWidth={3} />
        <line x1={X0} y1={Y0} x2={X0} y2={Y0 - H - 20} stroke="rgba(31,27,22,0.5)" strokeWidth={3} />
        <path d={path(straight)} fill="none" stroke="rgba(31,27,22,0.55)" strokeWidth={6} strokeDasharray="2 14" strokeLinecap="round" />
        <path d={path(curve)} fill="none" stroke={RED} strokeWidth={9} strokeLinecap="round" />
        {crossP > 0.1 ? (
          <circle cx={xX} cy={yX} r={46 * Math.max(crossP, 0.01)} fill="none" stroke={TEAL} strokeWidth={6} strokeDasharray="10 12" strokeLinecap="round" />
        ) : null}
      </svg>
      <div style={{ position: "absolute", left: 300, top: straight(1) - 64, display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontWeight: 700, fontSize: 26, color: "rgba(31,27,22,0.6)" }}>
        {c.labelA}
      </div>
      {crossP > 0.5 ? (
        <div style={{ position: "absolute", left: xX - 20, top: yX - 110, opacity: Math.min(1, crossP * 2), transform: `rotate(-6deg)` }}>
          <div style={{ background: TEAL, color: "#FFF", borderRadius: 10, padding: "8px 20px", fontFamily: MONO, fontWeight: 700, fontSize: 28, letterSpacing: "0.12em" }}>HERE</div>
        </div>
      ) : null}
      <div style={{ position: "absolute", left: X0 + (W - 60) - 430, top: 180, opacity: endPop, transform: `scale(${Math.max(endPop, 0.01)})`, transformOrigin: "left top" }}>
        <div style={{ fontFamily: GROT, fontWeight: 900, fontSize: 96, color: RED, lineHeight: 1 }}>{prefix}{shown}{suffix}</div>
        <div style={{ width: 430, marginTop: 14, fontFamily: GROT, fontWeight: 600, fontSize: 30, color: INK, lineHeight: 1.35 }}>{b.label}</div>
      </div>
      <div style={{ position: "absolute", left: X0, top: Y0 + 22, fontFamily: MONO, fontWeight: 700, fontSize: 26, color: "rgba(31,27,22,0.6)" }}>0 YEARS</div>
      <div style={{ position: "absolute", left: X0 + (W - 60) - 220, top: Y0 + 22, fontFamily: MONO, fontWeight: 700, fontSize: 26, color: "rgba(31,27,22,0.6)" }}>{c.years} YEARS</div>
      <DrawIcon kind="person" size={54} delay={20} color="rgba(31,27,22,0.55)" x={255} y={straight(1) - 130} />
      <DrawIcon kind="growth" size={54} delay={34} color={RED} x={X0 + (W - 60) - 60} y={curve(1) - 40} />
    </Content>
  );
};

const Collage: React.FC<{ b: TBeat }> = ({ b }) => {
  return (
    <Content>
      {b.photos?.[0] ? <Cutout file={b.photos[0]} x={170} y={210} w={600} rot={-3} delay={2} credit={b.credits?.[0]} /> : null}
      {b.photos?.[1] ? <Cutout file={b.photos[1]} x={1150} y={430} w={600} rot={2.5} delay={14} credit={b.credits?.[1]} /> : null}
      <div style={{ position: "absolute", top: 300, left: 830, width: 900, textAlign: "center" }}>
        <PopHeadline text={b.headline || ""} size={72} />
      </div>
      {b.sub ? (
        <div style={{ position: "absolute", top: 660, left: 880, width: 700, textAlign: "center", fontFamily: GROT, fontWeight: 600, fontSize: 36, color: "rgba(31,27,22,0.72)" }}>
          {b.sub}
        </div>
      ) : null}
      <GreaseArrow delay={22} w={230} style={{ left: 770, top: 470 }} />
      <div style={{ position: "absolute", bottom: 200, left: 880, width: 700 }}>
        <IconRow kinds={b.icons?.length ? b.icons : ["person", "swap", "people"]} delay={26} />
      </div>
    </Content>
  );
};

const Quote: React.FC<{ b: TBeat }> = ({ b }) => {
  return (
    <Content>
      {b.persona ? (
        <div style={{ position: "absolute", left: 170, top: 190, width: 560, transform: "rotate(-2deg)" }}>
          <div style={{ background: "#FFF", padding: 16, boxShadow: "0 26px 55px rgba(31,27,22,0.3)" }}>
            <div style={{ overflow: "hidden", height: 620 }}>
              <Img src={staticFile(b.persona)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
            </div>
            <div style={{ paddingTop: 8, fontFamily: MONO, fontSize: 15, color: "rgba(31,27,22,0.55)" }}>{b.personaCredit || ""}</div>
          </div>
        </div>
      ) : null}
      <div style={{ position: "absolute", left: 830, top: 190, fontFamily: SERIF, fontWeight: 900, fontSize: 190, color: RED, lineHeight: 1 }}>&ldquo;</div>
      <div style={{ position: "absolute", left: 840, top: 300, width: 950, fontFamily: SERIF, fontWeight: 800, fontSize: 76, lineHeight: 1.25, color: INK }}>
        <Marked color="rgba(232,184,75,0.75)" delay={10}>{b.quote}</Marked>
      </div>
      <div style={{ position: "absolute", left: 845, top: 640, display: "flex", alignItems: "center", gap: 18 }}>
        <DrawIcon kind="bulb" size={52} delay={22} color={TEAL} />
        <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: "0.24em", color: TEAL }}>{b.label || ""}</div>
      </div>
      <GreaseCircle delay={28} size={280} style={{ left: 1150, top: 700 }} />
    </Content>
  );
};

const End: React.FC<{ b: TBeat }> = ({ b }) => {
  return (
    <Content>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ marginTop: -60 }}>
          <PopHeadline text={b.headline || "Now you know."} size={104} />
          <div style={{ marginTop: 36, fontFamily: GROT, fontWeight: 600, fontSize: 40, color: "rgba(31,27,22,0.7)" }}>
            {b.sub || "Follow for the next 5-minute lesson."}
          </div>
          <div style={{ marginTop: 60 }}>
            <IconRow kinds={b.icons?.length ? b.icons : ["bulb", "growth", "clock"]} delay={14} />
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

// ---------------- captions (locked style 2) ----------------
const CapWindow = 4;
const Captions: React.FC<{ b: TBeat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (f / fps) * 1000;
  const words = b.words || [];
  if (!words.length) return null;
  const idx = words.findIndex((w) => ms >= w.t0 - 40 && ms < w.t1 + 150);
  if (idx < 0) return null;
  const winStart = Math.max(0, Math.min(idx - 1, words.length - CapWindow));
  const win = words.slice(winStart, Math.min(winStart + CapWindow, words.length));
  const pop = spring({ frame: f - (words[idx].t0 / 1000) * fps, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <div style={{ position: "absolute", bottom: 170, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", alignItems: "baseline", whiteSpace: "nowrap" }}>
        {win.map((w, i) => {
          const gi = winStart + i;
          const active = gi === idx;
          return (
            <span key={i} style={{
              fontFamily: GROT, fontWeight: 900, fontSize: 58, lineHeight: 1.1,
              color: gi < idx ? RED : active ? "#FFFFFF" : "rgba(31,27,22,0.45)",
              background: active ? RED : "transparent",
              borderRadius: active ? 14 : 0,
              padding: active ? "4px 20px" : 0,
              transform: `scale(${active ? 1 + 0.06 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textShadow: active ? "none" : "0 3px 14px rgba(250,245,238,0.85)",
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
  );
};

// ---------------- composition ----------------
export const Teacher: React.FC<any> = (input) => {
  const doc = input?.teacher?.beats?.length ? input.teacher : (Array.isArray(input?.beats) && input.beats.length ? input : null);
  loadFonts();
  const { fps, durationInFrames } = useVideoConfig();
  if (!doc) return <AbsoluteFill style={{ background: PAPER }} />;
  const total = doc.beats.length;
  const eyebrow = doc.eyebrow || "THE 5-MINUTE LESSON";
  const brand = doc.brand || eyebrow;
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Grain />
      <DoodleField />
      <AbsoluteFill style={doc.width && doc.width !== 1920 ? { width: 1920, height: 1080, transform: `scale(${doc.width / 1920})`, transformOrigin: "top left" } : undefined}>
        {doc.beats.map((b: TBeat) => {
          const from = Math.round((b.startMs / 1000) * fps);
          const dur = Math.max(Math.ceil((b.ms / 1000) * fps), 2);
          const comp = b.layout === "hook" ? <Hook b={b} />
            : b.layout === "board" ? <Board b={b} />
            : b.layout === "cutout" ? <Collage b={b} />
            : b.layout === "quote" ? <Quote b={b} />
            : b.layout === "end" ? <End b={b} />
            : <Say b={b} />;
          return (
            <Sequence key={`t${b.i}`} from={from} durationInFrames={dur} name={`t${b.i}-${b.layout}`}>
              {comp}
              <Furniture beat={b} total={total} eyebrow={eyebrow} brand={brand} />
              <Captions b={b} />
            </Sequence>
          );
        })}
        {doc.beats.filter((b: TBeat) => b.audio).map((b: TBeat) => (
          <Sequence key={`ta${b.i}`} from={Math.round((b.startMs / 1000) * fps)} durationInFrames={Math.ceil((b.ms / 1000) * fps)}>
            <Audio src={staticFile(b.audio!)} />
          </Sequence>
        ))}
        {doc.music ? (
          <Audio src={staticFile(doc.music)} loop
            volume={(f: number) => interpolate(f, [0, 30, durationInFrames - 45, durationInFrames - 1], [0, 0.15, 0.15, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
