import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  FadeEdges,
  GradientMeshBackground,
  NoiseGrainOverlay,
  clampInterp,
  resolvePalette,
  seededRand,
  stagger,
  type Palette,
} from "../lib/primitives";

/**
 * FAMILY: kinetic-typography
 * Ten structurally distinct kinetic typography templates driven by one engine.
 * Each variant has its own layout logic, motion character, and decoration set.
 */

type KineticVariant =
  | "impact"
  | "typewriter"
  | "mask-reveal"
  | "wave"
  | "slide-cascade"
  | "focus-pull"
  | "letter-drop"
  | "outline-fill"
  | "split-flip"
  | "marquee-shout";

export interface KineticProps {
  variant: KineticVariant;
  headline: string;
  subline: string;
  paletteName: string;
}

const FONT_STACK = '"Inter", "Helvetica Neue", Arial, sans-serif';

// ---------------- shared word/char splitting helpers ----------------
const Words: React.FC<{ text: string; children: (word: string, i: number) => React.ReactNode; style?: React.CSSProperties }> = ({ text, children, style }) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.3em", ...style }}>
    {text.split(" ").map((w, i) => (
      <React.Fragment key={`w-${i}`}>{children(w, i)}</React.Fragment>
    ))}
  </div>
);

// ---------------- variant: impact ----------------
const Impact: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const words = p.headline.split(" ");
  const STEP = 6;
  const lastStart = (words.length - 1) * STEP;
  const shakeAmp = clampInterp(frame, [lastStart, lastStart + 4, lastStart + 16], [0, 16, 0]);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${Math.sin(frame * 2.7) * shakeAmp}px, ${Math.cos(frame * 3.9) * shakeAmp * 0.6}px)` }}>
        <Words text={p.headline} style={{ fontSize: Math.min(width * 0.11, 150), alignItems: "baseline" }}>
          {(word, i) => {
            const pop = spring({ frame: Math.max(0, frame - i * STEP), fps, config: { damping: 9, stiffness: 220, mass: 0.7 } });
            const split = interpolate(pop, [0, 1], [24, 0]);
            return (
              <span style={{ position: "relative", fontWeight: 900, letterSpacing: "-0.02em", color: pal.text, fontFamily: FONT_STACK, opacity: pop, transform: `scale(${interpolate(pop, [0, 1], [2.2, 1])})` }}>
                <span aria-hidden style={{ position: "absolute", inset: 0, color: pal.accent, transform: `translateX(${-split}px)`, mixBlendMode: "screen" }}>{word}</span>
                {word}
              </span>
            );
          }}
        </Words>
        <div style={{ marginTop: "1em", textAlign: "center", fontSize: Math.min(width * 0.026, 38), letterSpacing: "0.32em", textTransform: "uppercase", color: `${pal.secondary}cc`, fontFamily: FONT_STACK, opacity: clampInterp(frame, [lastStart + 8, lastStart + 18], [0, 1]), transform: `translateY(${clampInterp(frame, [lastStart + 8, lastStart + 18], [20, 0])}px)` }}>
          {p.subline}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------- variant: typewriter ----------------
const Typewriter: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();
  const cps = Math.max(8, Math.round(p.headline.length / (durationInFrames * 0.55)));
  const chars = Math.min(p.headline.length, Math.floor(frame * cps));
  const shown = p.headline.slice(0, chars);
  const caretOn = frame % 14 < 8 || chars === p.headline.length;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: "72%", borderBottom: `2px solid ${pal.primary}`, paddingBottom: 28 }}>
        <div style={{ fontSize: Math.min(width * 0.065, 96), fontWeight: 700, fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace', color: pal.text, minHeight: "1.2em", whiteSpace: "pre-wrap" }}>
          {shown}
          <span style={{ color: pal.accent, opacity: caretOn ? 1 : 0 }}>▍</span>
        </div>
        <div style={{ marginTop: 18, fontSize: Math.min(width * 0.02, 30), letterSpacing: "0.22em", textTransform: "uppercase", color: pal.muted ?? `${pal.text}99`, fontFamily: FONT_STACK, opacity: chars === p.headline.length ? clampInterp(frame - durationInFrames * 0.62, [0, 12], [0, 1]) : 0 }}>
          {p.subline}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------- variant: mask-reveal ----------------
const MaskReveal: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Words text={p.headline} style={{ flexDirection: "column", alignItems: "center", gap: "0.05em" }}>
        {(word, i) => {
          const [a, b] = stagger(i, p.headline.split(" ").length, 4, 34);
          const t = clampInterp(frame, [a, b], [0, 1]);
          return (
            <span key={i} style={{ overflow: "hidden", display: "block" }}>
              <span style={{ display: "inline-block", fontSize: Math.min(width * 0.085, 120), fontWeight: 800, fontFamily: FONT_STACK, color: i % 2 ? pal.primary : pal.text, transform: `translateY(${interpolate(t, [0, 1], [110, 0])}%)`, transition: "none" }}>{word}</span>
            </span>
          );
        }}
      </Words>
      <div style={{ marginTop: "1.4em", height: 3, width: clampInterp(frame, [30, 50], [0, Math.min(width * 0.3, 420)]), background: pal.accent }} />
    </AbsoluteFill>
  );
};

// ---------------- variant: wave ----------------
const Wave: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const chars = p.headline.split("");
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", gap: "0.02em" }}>
        {chars.map((ch, i) => {
          const phase = frame * 0.14 - i * 0.45;
          const y = Math.sin(phase) * 26;
          const scale = 1 + Math.sin(phase) * 0.12;
          return (
            <span key={i} style={{ fontSize: Math.min(width * 0.075, 108), fontWeight: 900, fontFamily: FONT_STACK, color: i % 3 === 0 ? pal.accent : pal.text, transform: `translateY(${y}px) scale(${scale})`, opacity: ch === " " ? 0 : 1 }}>
              {ch === " " ? "\u00A0" : ch}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", bottom: "18%", fontSize: Math.min(width * 0.024, 34), letterSpacing: "0.4em", textTransform: "uppercase", color: pal.secondary, fontFamily: FONT_STACK, opacity: 0.85 }}>
        {p.subline}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- variant: slide-cascade ----------------
const SlideCascade: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const words = p.headline.split(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "center", paddingLeft: "10%" }}>
      <Words text={p.headline} style={{ justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start", gap: "0.04em" }}>
        {(word, i) => {
          const s = spring({ frame: Math.max(0, frame - 6 - i * 7), fps, config: { damping: 200, mass: 1.4 } });
          return (
            <span key={i} style={{ fontSize: Math.min(width * 0.09, 128), fontWeight: 900, fontFamily: FONT_STACK, lineHeight: 1.05, transform: `translateX(${interpolate(s, [0, 1], [-width, 0])}px)`, WebkitTextStroke: i % 2 ? `2px ${pal.primary}` : undefined, color: i % 2 ? "transparent" : pal.text }}>
              {word}
            </span>
          );
        }}
      </Words>
      <div style={{ marginTop: "1.2em", paddingLeft: 6, borderLeft: `4px solid ${pal.accent}`, fontSize: Math.min(width * 0.025, 36), color: `${pal.text}bb`, fontFamily: FONT_STACK, opacity: clampInterp(frame, [words.length * 7 + 10, words.length * 7 + 22], [0, 1]) }}>
        {p.subline}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- variant: focus-pull ----------------
const FocusPull: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const mid = durationInFrames / 2;
  const blur = interpolate(frame, [mid - 16, mid - 4, mid + 4, mid + 16], [14, 0, 0, 14], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, mid, durationInFrames], [1.15, 1, 1.15]);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ filter: `blur(${blur}px)`, transform: `scale(${scale})`, textAlign: "center" }}>
        <div style={{ fontSize: Math.min(width * 0.075, 116), fontWeight: 300, fontFamily: FONT_STACK, color: pal.text, letterSpacing: "0.06em" }}>{p.headline}</div>
        <div style={{ marginTop: "0.8em", fontSize: Math.min(width * 0.022, 32), fontWeight: 400, letterSpacing: "0.5em", textTransform: "uppercase", color: pal.secondary, opacity: clampInterp(frame, [mid - 6, mid + 6], [0, 1]) }}>{p.subline}</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------- variant: letter-drop ----------------
const LetterDrop: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  let idx = 0;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Words text={p.headline} style={{ fontSize: Math.min(width * 0.09, 128), alignItems: "baseline" }}>
        {(word) => (
          <span style={{ display: "inline-flex" }}>
            {word.split("").map((ch, ci) => {
              const my = idx++;
              const s = spring({ frame: Math.max(0, frame - 4 - my * 2.2), fps, config: { damping: 11, stiffness: 160 } });
              const bounce = interpolate(s, [0, 0.7, 1], [0, -18, 0]);
              return <span key={ci} style={{ fontWeight: 800, fontFamily: FONT_STACK, color: pal.text, display: "inline-block", opacity: s, transform: `translateY(${-600 + s * 600 + bounce}px)` }}>{ch}</span>;
            })}
            <span style={{ width: "0.3em" }} />
          </span>
        )}
      </Words>
      <div style={{ marginTop: "1em", fontSize: Math.min(width * 0.024, 34), letterSpacing: "0.3em", textTransform: "uppercase", color: pal.primary, fontFamily: FONT_STACK, opacity: clampInterp(frame, [40, 52], [0, 1]) }}>{p.subline}</div>
    </AbsoluteFill>
  );
};

// ---------------- variant: outline-fill ----------------
const OutlineFill: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const fill = clampInterp(frame, [durationInFrames * 0.15, durationInFrames * 0.75], [0, 1]);
  const words = p.headline.split(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <Words text={p.headline} style={{ flexDirection: "column", gap: 0 }}>
        {(word, i) => (
          <span key={i} style={{ position: "relative", fontSize: Math.min(width * 0.105, 150), fontWeight: 900, fontFamily: FONT_STACK, lineHeight: 1.02, color: "transparent", WebkitTextStroke: `2.5px ${pal.secondary}` }}>
            <span aria-hidden style={{ position: "absolute", inset: 0, color: pal.text, clipPath: `inset(${(1 - fill) * 100}% 0 0 0)` }}>{word}</span>
            {word}
          </span>
        )}
      </Words>
      <NoiseGrainOverlay opacity={0.05} />
    </AbsoluteFill>
  );
};

// ---------------- variant: split-flip ----------------
const SplitFlip: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const words = p.headline.split(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", perspective: 1200 }}>
      <Words text={p.headline}>
        {(word, i) => {
          const s = spring({ frame: Math.max(0, frame - 5 - i * 6), fps, config: { damping: 13, stiffness: 130 } });
          const rot = interpolate(s, [0, 1], [-90, 0]);
          return (
            <span key={i} style={{ display: "inline-block", transformStyle: "preserve-3d", transform: `rotateX(${rot}deg)`, fontSize: Math.min(width * 0.085, 118), fontWeight: 800, fontFamily: FONT_STACK, color: i % 2 ? pal.accent : pal.text, textShadow: `0 12px 40px ${pal.bg}` }}>
              {word}
            </span>
          );
        }}
      </Words>
      <div style={{ marginTop: "1.1em", padding: "0.5em 1.4em", border: `1px solid ${pal.primary}66`, borderRadius: 999, fontSize: Math.min(width * 0.02, 28), letterSpacing: "0.28em", textTransform: "uppercase", color: pal.secondary, fontFamily: FONT_STACK, opacity: clampInterp(frame, [42, 54], [0, 1]) }}>
        {p.subline}
      </div>
    </AbsoluteFill>
  );
};

// ---------------- variant: marquee-shout ----------------
const MarqueeShout: React.FC<{ p: KineticProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();
  const rows = [p.headline.toUpperCase(), p.subline.toUpperCase(), p.headline.toUpperCase()];
  return (
    <AbsoluteFill style={{ justifyContent: "center", overflow: "hidden", gap: "0.1em" }}>
      {rows.map((row, r) => {
        const dir = r % 2 === 0 ? -1 : 1;
        const speed = 6 + r * 3;
        const x = ((frame * speed * dir) % (width * 2)) - (dir < 0 ? 0 : width * 2);
        return (
          <div key={r} style={{ whiteSpace: "nowrap", fontSize: r === 1 ? Math.min(width * 0.05, 70) : Math.min(width * 0.09, 130), fontWeight: 900, fontFamily: FONT_STACK, lineHeight: 1.1, color: r === 1 ? pal.accent : "transparent", WebkitTextStroke: r === 1 ? undefined : `1.5px ${pal.text}`, transform: `translateX(${dir < 0 ? -x : x - width * 2}px)`, opacity: clampInterp(frame, [r * 5, r * 5 + 10], [0, 1]) }}>
            {`${row} • `.repeat(8)}
          </div>
        );
      })}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${pal.bg}f0 0%, transparent 15%, transparent 85%, ${pal.bg}f0 100%)` }} />
    </AbsoluteFill>
  );
};

// ---------------- dispatcher ----------------
const VARIANTS: Record<KineticVariant, React.FC<{ p: KineticProps; pal: Palette }>> = {
  impact: Impact,
  typewriter: Typewriter,
  "mask-reveal": MaskReveal,
  wave: Wave,
  "slide-cascade": SlideCascade,
  "focus-pull": FocusPull,
  "letter-drop": LetterDrop,
  "outline-fill": OutlineFill,
  "split-flip": SplitFlip,
  "marquee-shout": MarqueeShout,
};

export const KineticTemplate: React.FC<KineticProps> = (props) => {
  const pal = resolvePalette(props.paletteName);
  const Variant = VARIANTS[props.variant] ?? Impact;
  return (
    <AbsoluteFill>
      <GradientMeshBackground palette={pal} blobs={props.variant === "typewriter" ? 3 : 5} />
      <FadeEdges>
        <Variant p={props} pal={pal} />
      </FadeEdges>
    </AbsoluteFill>
  );
};
void seededRand;

const familyCast = (c: React.FC<KineticProps>) => c as unknown as React.ComponentType<Record<string, unknown>>;

export const FAMILY_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  "kinetic-impact-sting": familyCast(KineticTemplate),
  "kinetic-typewriter-terminal": familyCast(KineticTemplate),
  "kinetic-mask-reveal-editorial": familyCast(KineticTemplate),
  "kinetic-wave-rhythm": familyCast(KineticTemplate),
  "kinetic-slide-cascade-bold": familyCast(KineticTemplate),
  "kinetic-focus-pull-cinematic": familyCast(KineticTemplate),
  "kinetic-letter-drop-playful": familyCast(KineticTemplate),
  "kinetic-outline-fill-poster": familyCast(KineticTemplate),
  "kinetic-split-flip-premium": familyCast(KineticTemplate),
  "kinetic-marquee-shout-hype": familyCast(KineticTemplate),
};

void Easing;
