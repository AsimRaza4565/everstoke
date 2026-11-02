import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// Style variant renderers: Vox Investigative (paper collage) + Kinetic Motion Poster.
// Reuse the same beats as the Documentary style — only the LOOK changes.
// Vox signature: cream paper, stepped motion (on 2s), yellow highlighter, red circle, grain.
// Poster signature: pure black, giant white type stamped hard, neon #FF3366, rapid cuts.

export type Style = "documentary" | "vox" | "poster";

const VOX = { bg: "#FAF5EE", ink: "#1A1A1A", sub: "#6B6455", accent: "#E63946", hl: "rgba(255,225,53,0.6)", display: "Georgia, 'Times New Roman', serif" };
const POSTER = { bg: "#000000", ink: "#FFFFFF", sub: "#999999", accent: "#FF3366", display: "Inter, Arial, sans-serif" };

export const paletteFor = (style: Style) => (style === "vox" ? VOX : style === "poster" ? POSTER : null);

// stepped frame: holds every 2nd frame — the stop-motion "on 2s" feel
export function useSteppedFrame(step = 2) {
  const f = useCurrentFrame();
  return Math.floor(f / step) * step;
}

// procedural paper grain — zero asset downloads
export const PaperGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.16 }) => (
  <svg style={{ position: "absolute", width: "100%", height: "100%", opacity, mixBlendMode: "multiply", pointerEvents: "none" }}>
    <filter id="voxPaperNoise">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" result="noise" />
      <feDiffuseLighting in="noise" lightingColor="#fff" surfaceScale="1.4">
        <feDistantLight azimuth="45" elevation="60" />
      </feDiffuseLighting>
    </filter>
    <rect width="100%" height="100%" filter="url(#voxPaperNoise)" fill="#f7f4ea" />
  </svg>
);

// yellow highlighter bar sweeping across a line
export const Highlighter: React.FC<{ progress: number; width: number; top: number; left: number }> = ({ progress, width, top, left }) => (
  <div style={{
    position: "absolute", top, left, height: 54, width: interpolate(progress, [0, 1], [0, width], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    backgroundColor: "rgba(255,225,53,0.55)", mixBlendMode: "multiply", borderRadius: 2, transform: "rotate(-0.6deg)",
  }} />
);

// red grease-pencil circle drawing itself
export const GreaseCircle: React.FC<{ progress: number; cx: number; cy: number; rx: number; ry: number }> = ({ progress, cx, cy, rx, ry }) => {
  const circ = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  const off = interpolate(progress, [0, 1], [circ, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#E63946" strokeWidth={6}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} transform={`rotate(-4 ${cx} ${cy})`} />
    </svg>
  );
};

type SP = { b: any; fps: number; dur: number; words: { s: string; hot?: boolean }[] };


// On-screen text is a SHORT phrase; the voice reads the full paragraph.
const screenPhrase = (text: string, max = 88) => {
  const first = (text.split(/(?<=[.!?])\s+/)[0] || text).trim();
  if (first.length <= max) return first;
  const trimmed = first.slice(0, max);
  return trimmed.slice(0, trimmed.lastIndexOf(" ")) + "…";
};

// ---------------- VOX scenes ----------------
const VoxShell: React.FC<{ children: React.ReactNode; dur: number }> = ({ children, dur }) => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 6, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: VOX.bg, fontFamily: VOX.display }}>
      <AbsoluteFill style={{ opacity: fade }}>{children}</AbsoluteFill>
      <PaperGrain />
      <div style={{ position: "absolute", bottom: 46, left: 90, right: 90, height: 2, background: "rgba(26,26,26,0.18)" }} />
      <div style={{ position: "absolute", bottom: 34, left: 90, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 18, letterSpacing: "0.24em", color: VOX.sub }}>
        SILENT BRIEFING
      </div>
    </AbsoluteFill>
  );
};

export const VoxHook: React.FC<SP> = ({ b, fps, dur, words }) => {
  const f = useSteppedFrame(2);
  const full = words.map((w) => w.s).join(" ");
  const phrase = screenPhrase(full, 80);

  // deterministic line split: max 4 words per line (mirrors the voice cadence)
  const ws = phrase.split(/\s+/);
  const lines: string[][] = [];
  for (let i = 0; i < ws.length; i += 4) lines.push(ws.slice(i, i + 4));

  const revealLines = Math.max(1, Math.ceil(interpolate(f, [6, 40], [0, lines.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const size = lines.length >= 4 ? 62 : lines.length === 3 ? 72 : 84;

  return (
    <VoxShell dur={dur}>
      <div style={{ position: "absolute", top: 150, left: 110, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: VOX.accent }}>
        CASE FILE // 001
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 120px", paddingTop: 40 }}>
        <div style={{ textAlign: "center", width: "100%" }}>
          {lines.slice(0, revealLines).map((line, li) => {
            const lineIn = spring({ frame: f - li * 8, fps: 24, config: { damping: 200 } });
            return (
              <div key={li} style={{ fontFamily: VOX.display, fontWeight: 700, fontSize: size, lineHeight: 1.25, color: VOX.ink, opacity: lineIn, transform: `translateY(${(1 - lineIn) * 24}px)` }}>
                {line.join(" ")}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 260, left: "50%", transform: "translateX(-50%)", width: 140, height: 6, background: VOX.accent }} />
    </VoxShell>
  );
};

export const VoxStatement: React.FC<SP> = ({ b, dur, words }) => {
  const f = useSteppedFrame(2);
  const text = words.map((w) => w.s).join(" ");
  const phrase = screenPhrase(text, 88);
  const show = phrase.split(/\s+/).map((s) => ({ s }));
  return (
    <VoxShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 130px" }}>
        <div style={{ position: "relative", textAlign: "center" }}>
          <div style={{ fontFamily: VOX.display, fontWeight: 700, fontSize: phrase.length > 75 ? 46 : 58, lineHeight: 1.4, color: VOX.ink, maxWidth: 1400, margin: "0 auto" }}>
            {show.map((w, i) => (
              <span key={i} style={{ position: "relative" }}>{w.s}{" "}</span>
            ))}
          </div>
          <Highlighter progress={interpolate(f, [show.length * 3, show.length * 3 + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} width={1400} top="55%" left="12%" />
        </div>
      </AbsoluteFill>
    </VoxShell>
  );
};

export const VoxNumber: React.FC<SP> = ({ b, dur }) => {
  const f = useSteppedFrame(2);
  const draw = interpolate(f, [8, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pop = spring({ frame: f - 30, fps: 24, config: { damping: 14 } });
  return (
    <VoxShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", textAlign: "center" }}>
          <GreaseCircle progress={draw} cx={480} cy={250} rx={430} ry={170} />
          <div style={{ fontFamily: VOX.display, fontWeight: 700, fontSize: 210, color: VOX.ink, transform: `scale(${Math.max(pop, 0.01)})`, padding: "80px 140px" }}>
            {b.big}
          </div>
          <div style={{ marginTop: 40, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 34, color: VOX.sub, maxWidth: 1200, marginLeft: "auto", marginRight: "auto" }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </VoxShell>
  );
};

export const VoxChapter: React.FC<SP> = ({ b, dur }) => {
  const f = useSteppedFrame(2);
  const slide = spring({ frame: f, fps: 24, config: { damping: 200 } });
  return (
    <VoxShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `translateX(${(1 - slide) * -200}px)`, opacity: slide, fontFamily: VOX.display, fontWeight: 700, fontSize: 300, color: "transparent", WebkitTextStroke: `3px ${VOX.accent}` }}>
          {String(b.n || 1).padStart(2, "0")}
        </div>
        <div style={{ position: "absolute", left: 200, bottom: 420 }}>
          <div style={{ fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 26, letterSpacing: "0.3em", color: VOX.sub, marginBottom: 20 }}>PART {String(b.n || 1).padStart(2, "0")}</div>
          <div style={{ fontFamily: VOX.display, fontWeight: 700, fontSize: 96, color: VOX.ink }}>{b.chapterTitle}</div>
        </div>
      </AbsoluteFill>
    </VoxShell>
  );
};

export const VoxEnd: React.FC<SP> = ({ b, dur }) => {
  const stamp = spring({ frame: useSteppedFrame(4), fps: 24, config: { damping: 12 } });
  return (
    <VoxShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 140px" }}>
        <div style={{ transform: `rotate(-3deg) scale(${Math.max(stamp, 0.01)})`, border: `10px solid ${VOX.accent}`, color: VOX.accent, fontFamily: VOX.display, fontWeight: 700, fontSize: 90, padding: "30px 60px", letterSpacing: "0.1em" }}>
          SILENT BRIEFING
        </div>
        <div style={{ marginTop: 60, fontFamily: VOX.display, fontWeight: 700, fontSize: 52, color: VOX.ink, lineHeight: 1.4 }}>
          {b.text || "Follow for the next case file."}
        </div>
      </AbsoluteFill>
    </VoxShell>
  );
};

// ---------------- POSTER scenes ----------------
const PosterShell: React.FC<{ children: React.ReactNode; dur: number }> = ({ children, dur }) => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 3, dur - 4, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: POSTER.bg, fontFamily: POSTER.display }}>
      <AbsoluteFill style={{ opacity: fade }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const StampWords: React.FC<{ words: { s: string; hot?: boolean }[]; size: number; dur: number; cut?: number }> = ({ words, size, dur, cut }) => {
  const fontSize = words.length > 10 ? Math.round(size * 0.62) : words.length > 7 ? Math.round(size * 0.8) : size;
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const showN = Math.max(1, Math.ceil(interpolate(f, [2, Math.max(dur * 0.55, 10)], [Math.min(3, words.length), words.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const shown = words.slice(0, cut ? Math.min(cut, showN) : showN);
  return (
    <div style={{ textAlign: "center", padding: "0 80px" }}>
      {shown.map((w, i) => {
        const s = spring({ frame: f - i * 3, fps, config: { damping: 11, stiffness: 220 } });
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.18em", fontFamily: POSTER.display, fontWeight: 900, fontSize, lineHeight: 1.06, letterSpacing: "-0.02em", color: w.hot ? POSTER.accent : POSTER.ink, transform: `scale(${Math.max(s, 0.01)})`, textTransform: "uppercase" }}>
            {w.s}{" "}
          </span>
        );
      })}
    </div>
  );
};

export const PosterHook: React.FC<SP> = ({ b, fps, dur, words }) => {
  const line = words.map((w) => w.s).join(" ");
  
  return (
    <PosterShell dur={dur}>
      <div style={{ position: "absolute", top: 170, left: 120, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 28, letterSpacing: "0.3em", color: POSTER.accent }}>
        {b.eyebrow || "CASE 001"}
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <StampWords words={words.slice(0, 5)} size={104} dur={dur} />
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 200, left: 120, right: 120, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 30, color: POSTER.sub, lineHeight: 1.5 }}>
        {line.slice(0, 90)}…
      </div>
    </PosterShell>
  );
};

export const PosterStatement: React.FC<SP> = ({ b, fps, dur, words }) => {
  const text = words.map((w) => w.s).join(" ");
  const punch = words.slice(0, Math.min(words.length, 6));
  const pSize = punch.length > 4 ? 84 : 104;
  return (
    <PosterShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 60px" }}>
        <div style={{ width: "100%" }}><StampWords words={punch} size={pSize} dur={dur} /></div>
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 150, left: 100, right: 100, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 28, color: POSTER.sub, textAlign: "center", lineHeight: 1.5 }}>
        {text.slice(0, 110)}{text.length > 110 ? "…" : ""}
      </div>
    </PosterShell>
  );
};

export const PosterNumber: React.FC<SP> = ({ b, fps, dur }) => {
  const f = useCurrentFrame();
  const { fps: realFps } = useVideoConfig();
  const s = spring({ frame: f - 6, fps: realFps, config: { damping: 10, stiffness: 180 } });
  return (
    <PosterShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", transform: `scale(${Math.max(s, 0.01)})` }}>
          <div style={{ fontFamily: POSTER.display, fontWeight: 900, fontSize: 300, color: POSTER.accent, lineHeight: 1 }}>{b.big}</div>
          <div style={{ marginTop: 40, fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 36, color: POSTER.sub, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </PosterShell>
  );
};

export const PosterChapter: React.FC<SP> = ({ b, fps, dur }) => {
  const f = useCurrentFrame();
  const { fps: realFps } = useVideoConfig();
  const s = spring({ frame: f - 4, fps: realFps, config: { damping: 12, stiffness: 200 } });
  return (
    <PosterShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `rotate(-4deg) scale(${Math.max(s, 0.01)})`, border: `12px solid ${POSTER.accent}`, padding: "30px 80px" }}>
          <div style={{ fontFamily: POSTER.display, fontWeight: 900, fontSize: 200, color: POSTER.ink, textAlign: "center" }}>
            {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ fontFamily: "Consolas, monospace", fontWeight: 700, fontSize: 30, color: POSTER.accent, textAlign: "center", letterSpacing: "0.3em", marginTop: 10 }}>
            PART {String(b.n || 1).padStart(2, "0")}
          </div>
        </div>
      </AbsoluteFill>
    </PosterShell>
  );
};

export const PosterEnd: React.FC<SP> = ({ b, dur }) => {
  const f = useCurrentFrame();
  const { fps: realFps } = useVideoConfig();
  const s = spring({ frame: f - 6, fps: realFps, config: { damping: 11, stiffness: 200 } });
  return (
    <PosterShell dur={dur}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 130px" }}>
        <div style={{ transform: `scale(${Math.max(s, 0.01)})` }}>
          <div style={{ fontFamily: POSTER.display, fontWeight: 900, fontSize: 130, color: POSTER.accent, lineHeight: 1.05, textTransform: "uppercase" }}>
            {b.text || "Follow for more"}
          </div>
        </div>
      </AbsoluteFill>
    </PosterShell>
  );
};

// ---------------- dispatch ----------------
export const VOXbg = VOX.bg;
export const POSTERbg = POSTER.bg;

export const styleRenderers = (style: Style) => {
  if (style === "vox") {
    return { hook: VoxHook, statement: VoxStatement, number: VoxNumber, chapter: VoxChapter, end: VoxEnd };
  }
  if (style === "poster") {
    return { hook: PosterHook, statement: PosterStatement, number: PosterNumber, chapter: PosterChapter, end: PosterEnd };
  }
  return null; // documentary uses the built-in scenes
};
