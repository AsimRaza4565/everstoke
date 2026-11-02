import React, { useEffect } from "react";
import { AbsoluteFill, Audio, Video, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";
import { styleRenderers, VOXbg, POSTERbg, type Style } from "./stylepacks";

// INVESTOR'S COMPASS brand palette — dark navy + gold, documentary look
export const LV = {
  bg: "#0A1128", ink: "#F2EEE3", sub: "#7E8BA0", accent: "#E8C15A", accent2: "#58C08A",
  display: "Inter, Arial, sans-serif", mono: "Consolas, 'Courier New', monospace",
  brand: "INVESTOR'S COMPASS", eyebrow: "MARKET WISDOM // INVESTOR'S COMPASS",
};

const loadInter = () => {
  const handle = delayRender("lv fonts");
  Promise.all(
    [400, 600, 800, 900].map(
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

const usePop = (delay = 0, damping = 16) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 150 } });
};

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)", pointerEvents: "none" }} />
);

// Stock footage backdrop: loops behind the beat, dark scrim keeps text readable
const BeatBackdrop: React.FC<{ file: string }> = ({ file }) => (
  <AbsoluteFill>
    <Video loop src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <AbsoluteFill style={{ background: "rgba(8,10,20,0.68)" }} />
  </AbsoluteFill>
);

const Frame: React.FC<{ children: React.ReactNode; eyebrow?: string; over?: boolean }> = ({ children, eyebrow, over }) => (
  <AbsoluteFill style={{ background: over ? "transparent" : LV.bg, padding: "80px 130px", fontFamily: LV.display }}>
    {eyebrow ? (
      <div style={{ position: "absolute", top: 76, left: 130, fontFamily: LV.mono, fontWeight: 700, fontSize: 24, letterSpacing: "0.3em", color: LV.sub }}>
        {eyebrow}
      </div>
    ) : null}
    {children}
    <Vignette />
    <div style={{ position: "absolute", bottom: 64, left: 130, right: 130, height: 2, background: "rgba(242,238,227,0.12)" }} />
    <div style={{ position: "absolute", bottom: 52, left: 130, fontFamily: LV.mono, fontWeight: 700, fontSize: 20, letterSpacing: "0.24em", color: LV.sub }}>
      {LV.brand}
    </div>
  </AbsoluteFill>
);

const StaggerWords: React.FC<{ text: string; size: number; color?: string; hot?: string[]; start?: number; lineH?: number; speed?: number }> = ({
  text, size, color = LV.ink, hot = [], start = 10, lineH = 1.24, speed = 2.4,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = String(text).split(/\s+/).filter(Boolean);
  return (
    <div style={{ fontFamily: LV.display, fontWeight: 800, fontSize: size, lineHeight: lineH, letterSpacing: "-0.015em", color }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - start - i * speed, fps, config: { damping: 200 } });
        const clean = w.replace(/[^A-Za-z0-9$%]/g, "").toLowerCase();
        const isHot = hot.some((h) => clean === h.toLowerCase());
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.26em", opacity: s, transform: `translateY(${(1 - s) * 26}px)`, color: isHot ? LV.accent : undefined }}>
            {w}{" "}
          </span>
        );
      })}
    </div>
  );
};

// ---- premium animated icons (stroke draw-in, chosen by sentence topic) ----
const ICON_PATHS: Record<string, string[]> = {
  coins: ["M18 50 a32 32 0 1 0 64 0 a32 32 0 1 0 -64 0", "M50 30 v40", "M38 38 c0 -6 24 -6 24 0 c0 8 -24 4 -24 12 c0 8 24 4 24 12 c0 6 -24 6 -24 0"],
  chart: ["M14 82 L38 54 L56 66 L86 26", "M70 26 L86 26 L86 42", "M14 90 H88"],
  down: ["M14 30 L38 58 L56 46 L86 82", "M70 82 L86 82 L86 66", "M14 90 H88"],
  bank: ["M50 10 L90 34 H10 Z", "M18 40 V74 M38 40 V74 M62 40 V74 M82 40 V74", "M10 82 H90", "M12 34 H88"],
  clock: ["M50 14 a36 36 0 1 0 0.1 0", "M50 32 V52 L66 62"],
  warn: ["M50 12 L92 84 H8 Z", "M50 40 V60", "M50 70 V72"],
  shield: ["M50 8 L86 22 V50 C86 72 70 84 50 92 C30 84 14 72 14 50 V22 Z", "M36 50 L47 61 L66 40"],
  doc: ["M28 8 H60 L76 24 V92 H28 Z", "M60 8 V24 H76", "M38 44 H66", "M38 58 H66", "M38 72 H56"],
};
const ICON_KEYS: [RegExp, string][] = [
  [/crash|collaps|fall|drop|lost|lose|debt|broke|ruin|worst|failed/i, "down"],
  [/\$|money|dollar|cash|billion|million|profit|paid|price|worth|fee|rich|wealth/i, "coins"],
  [/\bwarn|danger|trap|fraud|fake|illegal|lie|manipulat|trap\b/i, "warn"],
  [/protect|safe|insurance|guarantee|secure|shield/i, "shield"],
  [/bank|wall street|firm|fund|leverage|loan|credit|mortgage|bond/i, "bank"],
  [/year|hour|time|month|decade|second|minute|early|late|slow/i, "clock"],
  [/contract|agree|sign|document|legal|rule|file/i, "doc"],
  [/stock|market|invest|trading|share|portfolio|buy|sell|grow|gain/i, "chart"],
];
const iconFor = (text: string) => {
  for (const [re, key] of ICON_KEYS) if (re.test(text)) return key;
  return "chart";
};

const AnimatedIcon: React.FC<{ text: string; size?: number; delay?: number }> = ({ text, size = 150, delay = 6 }) => {
  const frame = useCurrentFrame();
  const key = iconFor(text || "");
  const paths = ICON_PATHS[key] || ICON_PATHS.chart;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
      {paths.map((d, i) => {
        const p = interpolate(frame, [delay + i * 8, delay + 26 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <path key={i} d={d} fill="none" stroke={LV.accent} strokeWidth={key === "coins" && i === 0 ? 5 : 6}
            strokeLinecap="round" strokeLinejoin="round" pathLength={1}
            strokeDasharray={1} strokeDashoffset={1 - p} opacity={p > 0 ? 0.95 : 0} />
        );
      })}
    </svg>
  );
};

export type LongBeat = {
  type: "hook" | "chapter" | "statement" | "number" | "panel" | "end";
  text?: string;
  big?: string;
  label?: string;
  rows?: { label: string; value: string }[];
  n?: number;
  chapterTitle?: string;
  startMs: number;
  ms: number;
  audio: string | null;
};

// ---------------------------------------------------------------- scenes
const HookScene: React.FC<{ b: LongBeat; over?: boolean }> = ({ b, over }) => {
  const o = usePop(2, 20);
  const full = String(b.text || "");
  const firstSentence = (full.split(/(?<=[.!?])\s+/)[0] || full).trim();
  const words = firstSentence.split(/\s+/).length;
  const size = words > 16 ? 44 : words > 12 ? 52 : 62;
  return (
    <Frame eyebrow={LV.eyebrow}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 120px" }}>
        <div style={{ transform: `scale(${o})`, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 54 }}>
            <AnimatedIcon text={full} size={170} />
          </div>
          <StaggerWords text={firstSentence} size={size} start={10} hot={["won", "$37", "billion", "crash"]} />
        </div>
        <div style={{ position: "absolute", bottom: 220, left: "50%", transform: "translateX(-50%)", width: 120, height: 8, background: LV.accent }} />
      </AbsoluteFill>
    </Frame>
  );
};

const ChapterScene: React.FC<{ b: LongBeat; over?: boolean }> = ({ b, over }) => {
  const o = usePop(2, 20);
  const tS = usePop(10, 18);
  return (
    <Frame over={over}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 44 }}>
          <div style={{
            fontFamily: LV.display, fontWeight: 900, fontSize: 330, color: "transparent",
            WebkitTextStroke: `4px rgba(232,193,90,0.4)`, letterSpacing: "-0.04em",
            transform: `translateX(${(1 - o) * -140}px)`, lineHeight: 1,
          }}>
            {String(b.n || 1).padStart(2, "0")}
          </div>
          <div style={{ maxWidth: 980 }}>
            <div style={{ fontFamily: LV.mono, fontWeight: 700, fontSize: 26, letterSpacing: "0.3em", color: LV.sub, marginBottom: 24, opacity: tS }}>
              CHAPTER {String(b.n || 1).padStart(2, "0")}
            </div>
            <div style={{ fontFamily: LV.display, fontWeight: 900, fontSize: 92, lineHeight: 1.08, color: LV.ink, opacity: tS, transform: `translateY(${(1 - tS) * 36}px)` }}>
              {b.chapterTitle}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

const StatementScene: React.FC<{ b: LongBeat; over?: boolean }> = ({ b, over }) => {
  const o = usePop(2, 20);
  return (
    <Frame eyebrow={LV.eyebrow} over={over}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 70px" }}>
        <div style={{ opacity: o, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 46 }}>
            <AnimatedIcon text={b.text || ""} size={b.text && b.text.length > 150 ? 100 : 140} />
          </div>
          <StaggerWords text={b.text || ""} size={b.text && b.text.length > 165 ? 30 : b.text.length > 125 ? 38 : b.text.length > 90 ? 44 : 50} start={16} />
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

const NumberScene: React.FC<{ b: LongBeat; over?: boolean }> = ({ b, over }) => {
  const o = usePop(2, 20);
  const s = usePop(14, 15);
  return (
    <Frame eyebrow={LV.eyebrow} over={over}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 30 }}>
            <AnimatedIcon text={b.label || ""} size={120} />
          </div>
          <div style={{ fontFamily: LV.display, fontWeight: 900, fontSize: 250, color: LV.accent, lineHeight: 1, letterSpacing: "-0.02em", transform: `scale(${s})` }}>
            {b.big}
          </div>
          <div style={{ marginTop: 46, fontFamily: LV.display, fontWeight: 600, fontSize: 44, lineHeight: 1.3, color: LV.ink, maxWidth: 1300, marginLeft: "auto", marginRight: "auto" }}>
            {b.label}
          </div>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

const PanelScene: React.FC<{ b: LongBeat; over?: boolean }> = ({ b, over }) => {
  const o = useFade();
  return (
    <Frame eyebrow={LV.eyebrow} over={over}>
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1440, background: "rgba(255,255,255,0.04)", border: "3px solid rgba(232,193,90,0.4)", borderRadius: 26, padding: "50px 60px" }}>
          {(b.rows || []).map((r, i) => {
            const s = usePopDelay(10 + i * 16);
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 0", borderBottom: i < (b.rows || []).length - 1 ? "1px solid rgba(242,238,227,0.12)" : "none", opacity: s, transform: `translateX(${(1 - s) * 50}px)` }}>
                <div style={{ fontFamily: LV.mono, fontWeight: 700, fontSize: 34, color: LV.sub, letterSpacing: "0.08em" }}>{r.label}</div>
                <div style={{ fontFamily: LV.display, fontWeight: 900, fontSize: 56, color: LV.accent }}>{r.value}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

const EndScene: React.FC<{ b: LongBeat; over?: boolean }> = ({ b, over }) => {
  const o = usePop(2, 18);
  const p = usePop(26, 16);
  return (
    <Frame over={over}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 120px" }}>
        <div style={{ transform: `scale(${o})` }}>
          <div style={{ width: 110, height: 110, borderRadius: 26, background: LV.accent, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: LV.display, fontWeight: 900, fontSize: 60, color: LV.bg }}>IC</div>
          <div style={{ marginTop: 44, fontFamily: LV.display, fontWeight: 900, fontSize: 84, color: LV.ink }}>{LV.brand}</div>
          <div style={{ marginTop: 34, fontFamily: LV.display, fontWeight: 600, fontSize: 44, color: LV.sub, lineHeight: 1.35 }}>{b.text || "Follow for daily market wisdom."}</div>
          <div style={{ marginTop: 60, display: "flex", justifyContent: "center" }}>
            <div style={{ fontFamily: LV.mono, fontWeight: 700, fontSize: 34, letterSpacing: "0.2em", background: LV.accent, color: LV.bg, borderRadius: 999, padding: "24px 64px", transform: `scale(${p})` }}>SUBSCRIBE</div>
          </div>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};

const RENDERERS: Record<string, React.FC<{ b: LongBeat; over?: boolean }>> = {
  hook: HookScene, chapter: ChapterScene, statement: StatementScene,
  number: NumberScene, panel: PanelScene, end: EndScene,
};

const useFade = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  return interpolate(frame, [0, 8, durationInFrames - 6, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};
const usePopDelay = (delay: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 170 } });
};

export const LongVideo: React.FC<any> = (input) => {
  const doc = input?.longvideo?.beats?.length ? input.longvideo : (Array.isArray(input?.beats) && input.beats.length ? input : null);
  const { fps, durationInFrames } = useVideoConfig();
  useEffect(() => { loadInter(); }, []);
  if (!doc) return <AbsoluteFill style={{ background: LV.bg }} />;

  const style: "documentary" | "vox" | "poster" = doc.style || "documentary";
  const pack = styleRenderers(style);
  const rootBg = style === "vox" ? VOXbg : style === "poster" ? POSTERbg : LV.bg;

  return (
    <AbsoluteFill style={{ background: rootBg }}>
      {style === "documentary" && doc.bgTrack ? (
        <AbsoluteFill>
          <Video src={staticFile(doc.bgTrack)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <AbsoluteFill style={{ background: "rgba(8,10,20,0.25)" }} />
        </AbsoluteFill>
      ) : null}
      {doc.beats.map((b: LongBeat) => {
        const from = Math.round((b.startMs / 1000) * fps);
        const dur = Math.max(Math.ceil((b.ms / 1000) * fps), 2);
        const words = String(b.text || b.label || b.chapterTitle || "")
          .split(/\s+/).filter(Boolean)
          .map((s: string) => ({ s, hot: /[0-9$%]/.test(s) }));

        if (pack) {
          const R = (pack as any)[b.type] || (pack as any).statement;
          return (
            <Sequence key={`${b.type}-${b.startMs}`} from={from} durationInFrames={dur} name={`b${b.startMs}-${b.type}`}>
              <R b={b} fps={fps} dur={dur} words={words} />
            </Sequence>
          );
        }

        const R = RENDERERS[b.type] || StatementScene;
        const over = !!(b.broll || doc.bgTrack);
        return (
          <Sequence key={`${b.type}-${b.startMs}`} from={from} durationInFrames={dur} name={`b${b.startMs}-${b.type}`}>
            {!doc.bgTrack && b.broll ? <BeatBackdrop file={b.broll} /> : null}
            <R b={b} over={over} />
          </Sequence>
        );
      })}
      {doc.beats.filter((b: LongBeat) => b.audio).map((b: LongBeat) => (
        <Sequence key={`a${b.startMs}`} from={Math.round((b.startMs / 1000) * fps)} durationInFrames={Math.ceil((b.ms / 1000) * fps)}>
          <Audio src={staticFile(b.audio!)} />
        </Sequence>
      ))}
      <Audio src={staticFile("lv-music.mp3")} volume={(f) => {
        if (durationInFrames < 300) return 0;
        return interpolate(f, [0, 60, durationInFrames - 120, durationInFrames - 15], [0, 0.05, 0.05, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      }} />
    </AbsoluteFill>
  );
};
