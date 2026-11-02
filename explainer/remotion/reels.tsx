import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { continueRender, delayRender } from "remotion";
import { useFadeEdge } from "./theme";

const inkOf = (theme: ReelTheme, over?: boolean) => (over ? "#FAF7F0" : theme.ink);
const subOf = (theme: ReelTheme, over?: boolean) => (over ? "rgba(250,247,240,0.78)" : theme.sub);

// Stock video backdrop: fills the frame, dark scrim keeps text readable.
const BeatBackdrop: React.FC<{ file: string }> = ({ file }) => (
  <AbsoluteFill>
    <OffthreadVideo src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <AbsoluteFill style={{ background: "rgba(10,8,6,0.62)" }} />
  </AbsoluteFill>
);

// ---------------------------------------------------------------- themes (one per niche)
export type ReelTheme = {
  bg: string; ink: string; sub: string; accent: string; accent2: string;
  display: string; body: string; mono: string; brand: string; niche: string;
};

export const REEL_THEMES: Record<string, ReelTheme> = {
  // "old money" — ink + gold + serif (money psychology)
  money: {
    bg: "#0E1512", ink: "#F5EFE0", sub: "#8FA396", accent: "#D9A441", accent2: "#58C08A",
    display: "Georgia, 'Times New Roman', serif", body: "Inter, Arial, sans-serif", mono: "Consolas, 'Courier New', monospace",
    brand: "SILENT WEALTH", niche: "MONEY PSYCHOLOGY",
  },
  // dark + crimson + serif (dark psychology)
  psych: {
    bg: "#131010", ink: "#F2EAE4", sub: "#9A8A82", accent: "#C43D2B", accent2: "#D9A441",
    display: "Georgia, 'Times New Roman', serif", body: "Inter, Arial, sans-serif", mono: "Consolas, 'Courier New', monospace",
    brand: "MIND GAMES", niche: "DARK PSYCHOLOGY",
  },
  // deep navy + cyan + clean sans (body science)
  body: {
    bg: "#0B1220", ink: "#EAF2F8", sub: "#7E93A8", accent: "#35B6D9", accent2: "#58C08A",
    display: "Inter, Arial, sans-serif", body: "Inter, Arial, sans-serif", mono: "Consolas, 'Courier New', monospace",
    brand: "BODY LOG", niche: "HUMAN BODY FACTS",
  },
  // newspaper cream + red stamp (business breakdowns) — light theme
  biz: {
    bg: "#F7F3EA", ink: "#17140F", sub: "#8A8177", accent: "#C43D2B", accent2: "#2E7D5B",
    display: "Inter, Arial, sans-serif", body: "Inter, Arial, sans-serif", mono: "Consolas, 'Courier New', monospace",
    brand: "BIZ LEDGER", niche: "HOW THEY MAKE MONEY",
  },
};

export type ReelBeat =
  | { type: "hook"; eyebrow?: string; text: string }
  | { type: "point"; n?: string; title: string; sub?: string }
  | { type: "stat"; value: string; label: string; pct?: number }
  | { type: "card"; label: string; value: string; sub?: string }
  | { type: "steps"; title?: string; items: { chip: string; text: string }[] }
  | { type: "flow"; items: string[] }
  | { type: "cta"; text: string };

export type ReelDoc = {
  spec: { id: string; themeKey: string; beats: ReelBeat[] };
  timeline: { i: number; startMs: number; ms: number; audio: string | null }[];
  totalMs: number;
  fps: number;
};

const loadInter = () => {
  const handle = delayRender("reel fonts");
  const weights = [400, 600, 800, 900];
  Promise.all(
    weights.map(
      (w) =>
        new Promise<void>((res, rej) => {
          const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) });
          f.load().then((l) => { document.fonts.add(l); res(); }).catch(rej);
        })
    )
  )
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
};

// ---------------------------------------------------------------- primitives
const usePop = (delay = 0, damping = 16) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 150 } });
};

const Counter: React.FC<{ to: number; delay?: number; duration?: number; decimals?: number; format?: (n: number) => string }> = ({
  to, delay = 10, duration = 70, decimals = 0, format,
}) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [delay, delay + duration], [0, to], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return <>{format ? format(v) : decimals > 0 ? v.toFixed(decimals) : Math.max(Math.floor(v), 0).toLocaleString()}</>;
};

// ---------------------------------------------------------------- beat renderers
type BeatProps = { beat: any; theme: ReelTheme; beatMs?: number; index: number; total: number; over?: boolean };

const HookBeat: React.FC<BeatProps> = ({ beat, theme, beatMs, over }) => {
  const o = useFadeEdge(beatMs);
  const s = usePop(4, 18);
  const words = String(beat.text).split(" ");
  const mid = Math.ceil(words.length / 2);
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
      <div style={{ position: "absolute", top: 480, fontFamily: theme.mono, fontWeight: 700, fontSize: 30, letterSpacing: "0.34em", color: theme.accent }}>
        {beat.eyebrow || theme.niche}
      </div>
      <div style={{ textAlign: "center", transform: `scale(${s})`, marginTop: 40 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 104, lineHeight: 1.12, color: inkOf(theme, over), letterSpacing: "-0.01em" }}>
          {words.slice(0, mid).join(" ")}
        </div>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 104, lineHeight: 1.12, color: theme.accent, letterSpacing: "-0.01em" }}>
          {words.slice(mid).join(" ")}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 560, width: 110, height: 10, background: theme.accent }} />
    </AbsoluteFill>
  );
};

const PointBeat: React.FC<BeatProps> = ({ beat, theme, beatMs, index, over }) => {
  const o = useFadeEdge(beatMs);
  const nS = usePop(2, 18);
  const tS = usePop(10, 16);
  const sS = usePop(22, 16);
  return (
    <AbsoluteFill style={{ opacity: o, justifyContent: "center", padding: "0 90px" }}>
      <div style={{
        position: "absolute", top: 380, right: 70, fontFamily: theme.display, fontWeight: 700, fontSize: 300,
        color: "transparent", WebkitTextStroke: `4px ${theme.accent}`, opacity: over ? 0.4 : 0.28, lineHeight: 1,
        transform: `translateY(${(1 - nS) * 50}px)`,
      }}>
        {beat.n || String(index).padStart(2, "0")}
      </div>
      <div style={{ marginTop: -140 }}>
        <div style={{ opacity: tS, transform: `translateY(${(1 - tS) * 40}px)`, fontFamily: theme.display, fontWeight: 700, fontSize: 92, lineHeight: 1.1, color: inkOf(theme, over) }}>
          {beat.title}
        </div>
        {beat.sub ? (
          <div style={{ marginTop: 40, opacity: sS, transform: `translateY(${(1 - sS) * 30}px)`, fontFamily: theme.body, fontWeight: 600, fontSize: 46, lineHeight: 1.35, color: subOf(theme, over), borderLeft: `8px solid ${theme.accent}`, paddingLeft: 36 }}>
            {beat.sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const StatBeat: React.FC<BeatProps> = ({ beat, theme, beatMs, over }) => {
  const o = useFadeEdge(beatMs);
  const frame = useCurrentFrame();
  // split "$4.8B" -> prefix "$", number "4.8", suffix "B" (decimals preserved)
  const m = String(beat.value).match(/^([^0-9]*)([0-9][0-9.,]*)(.*)$/);
  const prefix = m ? m[1] : "";
  const numStr = m ? m[2] : "0";
  const suffix = m ? m[3] : "";
  const numeric = parseFloat(numStr.replace(/,/g, "")) || 0;
  const decimals = (numStr.split(".")[1] || "").length;
  const s = usePop(4, 16);
  const barW = interpolate(frame, [26, 96], [0, Math.min(Math.max(beat.pct ?? numeric, 5), 100)], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
      <div style={{ transform: `scale(${s})`, textAlign: "center" }}>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 230, color: theme.accent, lineHeight: 1 }}>
          <Counter to={numeric} decimals={decimals} format={(n) => `${prefix}${decimals > 0 ? n.toFixed(decimals) : Math.floor(n).toLocaleString()}${suffix}`} />
        </div>
        <div style={{ marginTop: 44, fontFamily: theme.body, fontWeight: 600, fontSize: 46, lineHeight: 1.35, color: inkOf(theme, over) }}>
          {beat.label}
        </div>
        <div style={{ marginTop: 60, height: 26, borderRadius: 13, background: over ? "rgba(255,255,255,0.18)" : (theme.light ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)"), overflow: "hidden" }}>
          <div style={{ width: `${barW}%`, height: "100%", borderRadius: 13, background: theme.accent }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CardBeat: React.FC<BeatProps> = ({ beat, theme, beatMs, over }) => {
  const o = useFadeEdge(beatMs);
  const s = usePop(4, 15);
  const border = over ? "4px solid rgba(250,247,240,0.35)" : (theme.light ? `4px solid ${theme.ink}` : `4px solid rgba(255,255,255,0.14)`);
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center", padding: "0 70px" }}>
      <div style={{ width: "100%", background: over ? "rgba(0,0,0,0.25)" : (theme.light ? "transparent" : "rgba(255,255,255,0.04)"), border, borderRadius: 34, padding: "80px 60px", textAlign: "center", transform: `scale(${s})` }}>
        <div style={{ fontFamily: theme.mono, fontWeight: 700, fontSize: 34, letterSpacing: "0.24em", color: theme.accent }}>{beat.label}</div>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 190, color: inkOf(theme, over), lineHeight: 1.05, marginTop: 30 }}>{beat.value}</div>
        {beat.sub ? (
          <div style={{ marginTop: 30, fontFamily: theme.body, fontWeight: 600, fontSize: 42, color: subOf(theme, over) }}>{beat.sub}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const StepsBeat: React.FC<BeatProps> = ({ beat, theme, beatMs, over }) => {
  const o = useFadeEdge(beatMs);
  return (
    <AbsoluteFill style={{ opacity: o, justifyContent: "center", padding: "0 90px" }}>
      {beat.title ? (
        <div style={{ position: "absolute", top: 430, fontFamily: theme.mono, fontWeight: 700, fontSize: 32, letterSpacing: "0.2em", color: theme.accent }}>
          {beat.title}
        </div>
      ) : null}
      <div style={{ marginTop: 120 }}>
        {(beat.items || []).map((it: { chip: string; text: string }, i: number) => {
          const s = usePop(14 + i * 22, 16);
          return (
            <div key={i} style={{ display: "flex", gap: 34, marginBottom: 54, opacity: s, transform: `translateX(${(1 - s) * 70}px)`, alignItems: "flex-start" }}>
              <div style={{
                fontFamily: theme.mono, fontWeight: 700, fontSize: 30, color: theme.accent, whiteSpace: "nowrap",
                border: `3px solid ${theme.accent}`, borderRadius: 12, padding: "10px 22px", marginTop: 4,
              }}>{it.chip}</div>
              <div style={{ fontFamily: theme.body, fontWeight: 600, fontSize: 46, lineHeight: 1.3, color: inkOf(theme, over), paddingTop: 6 }}>{it.text}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const FlowBeat: React.FC<BeatProps> = ({ beat, theme, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const items: string[] = beat.items || ["A", "B"];
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center", padding: "0 60px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 46, width: "100%" }}>
        {items.map((t, i) => {
          const s = usePop(10 + i * 24, 15);
          const last = i === items.length - 1;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, opacity: s, transform: `translateX(${(1 - s) * 80}px)` }}>
              <div style={{
                flex: 1, textAlign: "center", fontFamily: theme.display, fontWeight: 700, fontSize: 64,
                color: last ? theme.bg : theme.ink,
                background: last ? theme.accent : "transparent",
                border: last ? "none" : `4px solid ${theme.sub}`, borderRadius: 24, padding: "44px 20px",
              }}>{t}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CtaBeat: React.FC<BeatProps> = ({ beat, theme, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const s = usePop(4, 15);
  const p = usePop(24, 16);
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
      <div style={{ textAlign: "center", transform: `scale(${s})` }}>
        <div style={{ width: 120, height: 120, borderRadius: 28, background: theme.accent, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: theme.display, fontWeight: 700, fontSize: 64, color: theme.bg }}>
          {theme.brand[0]}
        </div>
        <div style={{ marginTop: 50, fontFamily: theme.display, fontWeight: 700, fontSize: 88, color: theme.ink }}>{theme.brand}</div>
        <div style={{ marginTop: 46, fontFamily: theme.body, fontWeight: 600, fontSize: 44, color: theme.sub }}>{beat.text}</div>
        <div style={{ marginTop: 70, display: "flex", justifyContent: "center" }}>
          <div style={{
            fontFamily: theme.mono, fontWeight: 700, fontSize: 36, letterSpacing: "0.18em",
            background: theme.accent, color: theme.bg, borderRadius: 999, padding: "26px 70px",
            transform: `scale(${p})`,
          }}>FOLLOW</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const RENDERERS: Record<string, React.FC<BeatProps>> = {
  hook: HookBeat, point: PointBeat, stat: StatBeat, card: CardBeat,
  steps: StepsBeat, flow: FlowBeat, cta: CtaBeat,
};

// ---------------------------------------------------------------- main composition
export const Reel: React.FC<any> = (input) => {
  const doc: ReelDoc = input?.reel ?? input;
  const theme = REEL_THEMES[doc?.spec?.themeKey] || REEL_THEMES.money;
  const { fps } = useVideoConfig();
  const timeline = doc?.timeline || [];
  const beats = doc?.spec?.beats || [];

  React.useEffect(() => { loadInter(); }, []);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {timeline.map((t) => {
        const beat = beats[t.i] || { type: "point", title: "" };
        const R = RENDERERS[beat.type] || PointBeat;
        const from = Math.round((t.startMs / 1000) * fps);
        const dur = Math.max(Math.ceil((t.ms / 1000) * fps), 2);
        const over = !!t.broll;
        return (
          <Sequence key={t.i} from={from} durationInFrames={dur} name={`b${t.i}-${beat.type}${over ? "-video" : ""}`}>
            {t.broll ? <BeatBackdrop file={t.broll} /> : null}
            <R beat={beat} theme={theme} beatMs={t.ms} index={t.i} total={timeline.length} over={over} />
          </Sequence>
        );
      })}
      {timeline.filter((t) => t.audio).map((t) => (
        <Sequence key={`a${t.i}`} from={Math.round((t.startMs / 1000) * fps)} durationInFrames={Math.ceil((t.ms / 1000) * fps)}>
          <Audio src={staticFile(t.audio!)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
