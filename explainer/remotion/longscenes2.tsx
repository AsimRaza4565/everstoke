import React, { useEffect } from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

// ============ DOCUMENTARY V2 — themed layout engine with safe zones ============
// Rules baked in:
//  - TOP band (0-110) and BOTTOM band (900+) are furniture-only; content never enters
//  - on-screen text: max ~90 chars per beat (2 lines), auto-sized, ellipsized
//  - layouts rotate: hero / split-left / split-right / stat / chapter / end
//  - brand strip + hairline live below content, never overlapped
//  - doc.theme picks the look: "investing" | "vox" | "poster"

export type Theme = {
  bg: string; ink: string; sub: string; accent: string; accent2: string;
  line: string; dot: string; furn: string; ghost: string; photoTint: string;
  display: string; body: string; mono: string;
  displayWeight: number; upper: boolean; grain: boolean;
  subStyle: "bar" | "marker" | "none"; highlight: string;
  capColor: string;
  brand: string; eyebrow: string; badge: string;
};

const SERIF = "'Playfair Display', Georgia, serif";
const GROT = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace";

export const THEMES: Record<string, Theme> = {
  investing: {
    bg: "#0B1220", ink: "#F2EEE3", sub: "#8B98AC", accent: "#E8C15A", accent2: "#58C08A",
    line: "rgba(242,238,227,0.14)", dot: "rgba(242,238,227,0.18)", furn: "rgba(242,238,227,0.55)",
    ghost: "rgba(232,193,90,0.5)", photoTint: "rgba(11,18,32,0.32)",
    display: GROT, body: GROT, mono: MONO,
    displayWeight: 900, upper: false, grain: false,
    subStyle: "bar", highlight: "transparent", capColor: "#FFD97A",
    brand: "INVESTOR'S COMPASS", eyebrow: "MARKET WISDOM // INVESTOR'S COMPASS", badge: "IC",
  },
  vox: {
    bg: "#FAF5EE", ink: "#1A1A1A", sub: "#6B645A", accent: "#C1272D", accent2: "#1D6F5C",
    line: "rgba(26,26,26,0.16)", dot: "rgba(26,26,26,0.22)", furn: "rgba(26,26,26,0.6)",
    ghost: "rgba(193,39,45,0.35)", photoTint: "rgba(26,26,26,0.22)",
    display: SERIF, body: GROT, mono: MONO,
    displayWeight: 800, upper: false, grain: true,
    subStyle: "marker", highlight: "#FFE45C", capColor: "#FF8A7A",
    brand: "QUARRY EXPLAINS", eyebrow: "THE BIG IDEA // QUARRY EXPLAINS", badge: "QX",
  },
  poster: {
    bg: "#0A0A0A", ink: "#FFFFFF", sub: "#9AA0A6", accent: "#FF3366", accent2: "#3D7BFF",
    line: "rgba(255,255,255,0.16)", dot: "rgba(255,255,255,0.22)", furn: "rgba(255,255,255,0.5)",
    ghost: "rgba(255,51,102,0.45)", photoTint: "rgba(10,10,10,0.38)",
    display: "'Archivo Black', Inter, Arial, sans-serif", body: GROT, mono: MONO,
    displayWeight: 400, upper: true, grain: false,
    subStyle: "none", highlight: "transparent", capColor: "#FF5C82",
    brand: "SIGNAL LAB", eyebrow: "TECH DECODED // SIGNAL LAB", badge: "SL",
  },
};

const ThemeCtx = React.createContext<Theme>(THEMES.investing);
const useT = () => React.useContext(ThemeCtx);

export type V2Beat = {
  layout: "hero" | "chapter" | "split" | "stat" | "end";
  kicker?: string; headline?: string; sub?: string; big?: string; label?: string;
  n?: number; chapterTitle?: string; chapterCount?: number; total?: number;
  photo?: string; photoSide?: "left" | "right";
  words?: Array<{ w: string; t0: number; t1: number; key?: boolean }>;
  cues?: Array<{ t0: number; t1: number; text: string }>;
  startMs: number; ms: number; audio: string | null; i: number;
};

export type V2Doc = { title: string; theme?: string; brand?: string; eyebrow?: string; beats: V2Beat[]; totalMs: number; fps: number };

const loadFonts = () => {
  const h = delayRender("lv2 fonts");
  const wants: Array<[string, string, string]> = [
    ...[400, 600, 800, 900].map((w) => [`Inter`, `fonts/inter-${w}.ttf`, String(w)] as [string, string, string]),
    ["Playfair Display", "fonts/playfair-display.ttf", "400 900"],
    ["JetBrains Mono", "fonts/jetbrains-mono.ttf", "400 700"],
    ["Archivo Black", "fonts/archivo-black.ttf", "400"],
  ];
  Promise.all(wants.map(([fam, file, weight]) => new Promise<void>((res) => {
    const f = new FontFace(fam, `url(${staticFile(file)})`, { weight });
    f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res());
  }))).then(() => continueRender(h)).catch(() => continueRender(h));
};

const usePop = (delay = 0) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping: 200 } });
};

// clamp on-screen text: max ~2 lines at the chosen size, ellipsis at word boundary
function fitText(text: string, maxChars: number) {
  const t = (text || "").trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

// content frame: everything renders inside these safe bounds
const SAFE = { top: 130, bottom: 150, x: 150 };

const Content: React.FC<{ children: React.ReactNode; beat: V2Beat }> = ({ children, beat }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = durationInFrames > 24
    ? interpolate(f, [0, 5, durationInFrames - 6, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return (
    <AbsoluteFill style={{ opacity: fade, paddingTop: SAFE.top, paddingBottom: SAFE.bottom, paddingLeft: SAFE.x, paddingRight: SAFE.x }}>
      {children}
    </AbsoluteFill>
  );
};

const Furniture: React.FC<{ beat: V2Beat; total: number; kicker: string }> = ({ beat, total, kicker }) => {
  const T = useT();
  return (
    <>
      <div style={{ position: "absolute", top: 52, left: 130, fontFamily: T.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.28em", color: T.accent }}>
        {kicker}
      </div>
      <div style={{ position: "absolute", top: 52, right: 130, display: "flex", gap: 10 }}>
        {(() => {
          const shown = Math.min(total, 16);
          const filled = total <= shown ? beat.i + 1 : Math.round(((beat.i + 1) / total) * shown);
          return Array.from({ length: shown }).map((_, i) => (
            <div key={i} style={{ width: 26, height: 5, borderRadius: 3, background: i < filled ? T.accent : T.dot }} />
          ));
        })()}
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 130, right: 130, height: 2, background: T.line }} />
      <div style={{ position: "absolute", bottom: 30, left: 130, fontFamily: T.mono, fontWeight: 700, fontSize: 19, letterSpacing: "0.26em", color: T.furn }}>
        {T.brand}
      </div>
    </>
  );
};

// paper grain for the vox look — deterministic feTurbulence, multiply blend
const Grain: React.FC = () => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05, mixBlendMode: "multiply", pointerEvents: "none" }}>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
);

const Photo: React.FC<{ file: string; side: "left" | "right"; width: string }> = ({ file, side, width }) => {
  const T = useT();
  return (
    <div style={{ position: "absolute", top: 170, bottom: 320, [side]: SAFE.x, width, overflow: "hidden", borderRadius: 22, boxShadow: "0 26px 60px rgba(0,0,0,0.45)" }}>
      <Img src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent, ${T.photoTint})` }} />
    </div>
  );
};

const Kicker: React.FC<{ text: string; center?: boolean }> = ({ text, center }) => {
  const T = useT();
  return (
    <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: center ? "0.32em" : "0.22em", color: T.accent, textTransform: T.upper ? "uppercase" : "none" }}>
      {text}
    </div>
  );
};

const Headline: React.FC<{ text: string; size: number }> = ({ text, size }) => {
  const T = useT();
  return (
    <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: size, lineHeight: 1.18, letterSpacing: T.upper ? "0.01em" : "-0.01em", color: T.ink, textTransform: T.upper ? "uppercase" : "none" }}>
      {text}
    </div>
  );
};

const Sub: React.FC<{ text: string; align?: string; size?: number }> = ({ text, align, size = 36 }) => {
  const T = useT();
  const base: React.CSSProperties = {
    marginTop: 34, fontFamily: T.body, fontWeight: 600, fontSize: size, lineHeight: 1.4,
    color: T.ink, textTransform: T.upper ? "uppercase" : "none", display: "inline-block",
  };
  if (T.subStyle === "marker") Object.assign(base, { background: T.highlight, padding: "8px 18px", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" });
  if (T.subStyle === "bar") Object.assign(base, { borderLeft: `6px solid ${T.accent}`, paddingLeft: 30, color: T.sub });
  return <div style={base}>{text}</div>;
};

// ---------------- layouts ----------------
const HeroLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kIn = spring({ frame: f - 4, fps, config: { damping: 200 } });
  const hIn = spring({ frame: f - 10, fps, config: { damping: 200 } });
  const len = (b.headline || "").length;
  const size = len > 66 ? 68 : 88;
  return (
    <Content beat={b}>
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", opacity: kIn }}>
        <Kicker text={b.kicker || ""} center />
      </div>
      <div style={{ position: "absolute", top: 330, left: 140, right: 140, textAlign: "center", opacity: hIn, transform: `translateY(${(1 - hIn) * 30}px)` }}>
        <Headline text={fitText(b.headline || "", 76)} size={size} />
        {b.sub ? (
          <div style={{ marginTop: 32 }}>
            <Sub text={fitText(b.sub, 62)} size={34} />
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const SplitLayout: React.FC<{ b: V2Beat; side: "left" | "right" }> = ({ b, side }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tIn = spring({ frame: f - 6, fps, config: { damping: 200 } });
  const textW = 900, imgW = 620;
  // photo sits OPPOSITE the text column — they must never overlap
  const textSide = side === "left" ? "left" : "right";
  const photoSide = side === "left" ? "right" : "left";
  return (
    <Content beat={b}>
      {b.photo ? <Photo file={b.photo} side={photoSide} width={imgW} /> : null}
      <div style={{ position: "absolute", top: 280, [textSide]: SAFE.x, width: textW, textAlign: textSide, opacity: tIn, transform: `translateY(${(1 - tIn) * 30}px)` }}>
        <div style={{ marginBottom: 30 }}>
          <Kicker text={b.kicker || `PART ${String(b.n || 1).padStart(2, "0")}`} />
        </div>
        <Headline text={fitText(b.headline || "", 88)} size={(b.headline || "").length > 66 ? 66 : 78} />
        {b.sub ? (
          <div style={{ marginTop: 30, display: "inline-block" }}>
            <Sub text={fitText(b.sub, 80)} size={36} />
          </div>
        ) : null}
      </div>
    </Content>
  );
};

const StatLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const o = interpolate(useCurrentFrame(), [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", width: "100%", opacity: o }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: b.big && b.big.length > 6 ? 210 : 280, lineHeight: 1, color: T.accent, letterSpacing: "-0.02em" }}>
            {b.big}
          </div>
          <div style={{ marginTop: 46, fontFamily: T.body, fontWeight: 600, fontSize: 44, lineHeight: 1.35, color: T.ink, maxWidth: 1300, marginLeft: "auto", marginRight: "auto" }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const ChapterLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numS = spring({ frame: f, fps, config: { damping: 200 } });
  const tS = spring({ frame: f - 8, fps, config: { damping: 200 } });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
          <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 340, color: "transparent", WebkitTextStroke: `4px ${T.ghost}`, lineHeight: 1, transform: `translateX(${(1 - numS) * -140}px)` }}>
            {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ width: 4, alignSelf: "stretch", background: T.line, margin: "60px 0" }} />
          <div style={{ maxWidth: 850, opacity: tS, transform: `translateX(${(1 - tS) * 50}px)` }}>
            <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.3em", color: T.accent, marginBottom: 26 }}>
              CHAPTER {String(b.n || 1).padStart(2, "0")}
            </div>
            <div style={{ fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 88, lineHeight: 1.15, color: T.ink, textTransform: T.upper ? "uppercase" : "none" }}>
              {b.chapterTitle}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

const EndLayout: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 6, fps, config: { damping: 13, stiffness: 160 } });
  return (
    <Content beat={b}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 150px" }}>
        <div style={{ transform: `scale(${Math.max(s, 0.01)})` }}>
          <div style={{ width: 110, height: 110, borderRadius: 26, background: T.accent, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 58, color: T.bg }}>
            {T.badge}
          </div>
          <div style={{ marginTop: 46, fontFamily: T.display, fontWeight: T.displayWeight, fontSize: 92, color: T.ink, textTransform: T.upper ? "uppercase" : "none" }}>
            {T.brand}
          </div>
          <div style={{ marginTop: 36, fontFamily: T.body, fontWeight: 600, fontSize: 42, color: T.sub, lineHeight: 1.4 }}>
            {b.headline || "Follow for daily breakdowns."}
          </div>
        </div>
      </AbsoluteFill>
    </Content>
  );
};

// STYLE 2 — KARAOKE HIGHLIGHT (user pick 09-16): full phrase shown, spoken words
// turn accent, active word pops inside an accent box, upcoming words dimmed.
const CapWindow = 4; // ONE line at a time (user requirement) — 4 words max, never wraps
const Captions: React.FC<{ b: V2Beat }> = ({ b }) => {
  const T = useT();
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
              color: gi < idx ? T.capColor : active ? "#FFFFFF" : "rgba(255,255,255,0.55)",
              background: active ? T.capColor : "transparent",
              borderRadius: active ? 14 : 0,
              padding: active ? "4px 20px" : 0,
              transform: `scale(${active ? 1 + 0.06 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textShadow: "0 3px 16px rgba(0,0,0,0.4)",
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
  );
};

// ---------------- composition ----------------
export const DocV2: React.FC<any> = (input) => {
  const doc = input?.docv2?.beats?.length ? input.docv2 : (Array.isArray(input?.beats) && input.beats.length ? input : null);
  const { fps, durationInFrames } = useVideoConfig();
  useEffect(() => { loadFonts(); }, []);
  const base = THEMES[doc?.theme] || THEMES.investing;
  const T: Theme = { ...base, brand: doc?.brand || base.brand, eyebrow: doc?.eyebrow || base.eyebrow };
  if (!doc) return <AbsoluteFill style={{ background: T.bg }} />;
  const total = doc.beats.length;

  const vw = doc.width || 1920;
  const vh = doc.height || 1080;
  const sc = vw / 1920;
  const stage = sc === 1 ? null : { width: 1920, height: 1080, transform: `scale(${sc})`, transformOrigin: "top left" as const };
  return (
    <ThemeCtx.Provider value={T}>
      <AbsoluteFill style={{ background: T.bg }}>
        {T.grain ? <Grain /> : null}
        <AbsoluteFill style={stage || undefined}>
        {doc.beats.map((b: V2Beat, i: number) => {
          const from = Math.round((b.startMs / 1000) * fps);
          const dur = Math.max(Math.ceil((b.ms / 1000) * fps), 2);
          const comp = b.layout === "hero" ? <HeroLayout b={b} /> : b.layout === "chapter" ? <ChapterLayout b={b} /> : b.layout === "stat" ? <StatLayout b={b} /> : b.layout === "end" ? <EndLayout b={b} /> : <SplitLayout b={b} side={(b.photoSide || (i % 2 === 0 ? "left" : "right")) as "left" | "right"} />;
          return (
            <Sequence key={`${b.layout}-${b.i}`} from={from} durationInFrames={dur} name={`b${b.i}-${b.layout}`}>
              {comp}
              <Furniture beat={{ ...b, i }} total={total} kicker={T.eyebrow} />
              {b.words && b.words.length ? <Captions b={b} /> : null}
            </Sequence>
          );
        })}
        {doc.beats.filter((b: V2Beat) => b.audio).map((b: V2Beat) => (
          <Sequence key={`a${b.i}`} from={Math.round((b.startMs / 1000) * fps)} durationInFrames={Math.ceil((b.ms / 1000) * fps)}>
            <Audio src={staticFile(b.audio!)} />
          </Sequence>
        ))}
        {doc.music ? (
          <Audio
            src={staticFile(doc.music)}
            loop
            volume={(f: number) => interpolate(f, [0, 30, durationInFrames - 45, durationInFrames - 1], [0, 0.15, 0.15, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        ) : null}
        </AbsoluteFill>
      </AbsoluteFill>
    </ThemeCtx.Provider>
  );
};
