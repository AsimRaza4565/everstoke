import React, { useEffect } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

// Caption style SHOWCASE — one voice line, 7 designs, numbered. The user picks one.

const GROT = "Inter, Arial, sans-serif";
const ACCENT = "#E8C15A";
const LINE_MS = 6400; // per-style segment (voice line ~5.4s + pause)
const STYLES = [
  "BIG WORDS",
  "KARAOKE HIGHLIGHT",
  "WORD POP",
  "CLEAN NETFLIX",
  "YELLOW CLASSIC",
  "PROGRESS PILL",
  "NEON GLOW",
];

export type SWord = { w: string; t0: number; t1: number; key?: boolean };

const useFonts = () => {
  useEffect(() => {
    const h = delayRender("cap fonts");
    Promise.all([800, 900].map((w) => new Promise<void>((res) => {
      const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) });
      f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res());
    }))).then(() => continueRender(h)).catch(() => continueRender(h));
  }, []);
};

const Label: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ position: "absolute", top: 60, left: 0, right: 0, textAlign: "center" }}>
    <span style={{ fontFamily: GROT, fontWeight: 800, fontSize: 30, letterSpacing: "0.3em", color: "rgba(255,255,255,0.5)" }}>
      {`STYLE ${n} — ${STYLES[n - 1]}`}
    </span>
  </div>
);

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: "#0B1220", justifyContent: "center", alignItems: "center" }}>
    {children}
  </AbsoluteFill>
);

// 1. BIG WORDS — 2 huge uppercase words at a time, active in accent
const BigWords: React.FC<{ words: SWord[]; ms: number; f: number; fps: number }> = ({ words, ms, f, fps }) => {
  const idx = words.findIndex((w) => ms >= w.t0 && ms < w.t1 + 140);
  if (idx < 0) return null;
  const start = Math.floor(idx / 2) * 2;
  const win = words.slice(start, start + 2);
  const pop = spring({ frame: f - (words[idx].t0 / 1000) * fps, fps, config: { damping: 11, stiffness: 220 } });
  return (
    <Frame>
      <div style={{ display: "flex", gap: 28, alignItems: "baseline" }}>
        {win.map((w, i) => {
          const active = start + i === idx;
          return (
            <span key={i} style={{
              fontFamily: GROT, fontWeight: 900, fontSize: 120, lineHeight: 1, textTransform: "uppercase",
              color: active ? ACCENT : "#FFFFFF",
              transform: `scale(${active ? 1 + 0.12 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textShadow: "0 6px 30px rgba(0,0,0,0.5)",
            }}>{w.w}</span>
          );
        })}
      </div>
    </Frame>
  );
};

// 2. KARAOKE HIGHLIGHT — full phrase, spoken words turn accent, active pops
const Karaoke: React.FC<{ words: SWord[]; ms: number; f: number; fps: number }> = ({ words, ms, f, fps }) => {
  const idx = words.findIndex((w) => ms >= w.t0 && ms < w.t1 + 140);
  if (idx < 0) return null;
  const pop = spring({ frame: f - (words[idx].t0 / 1000) * fps, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <Frame>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", maxWidth: 1500, alignItems: "baseline" }}>
        {words.map((w, i) => (
          <span key={i} style={{
            fontFamily: GROT, fontWeight: 900, fontSize: 72, lineHeight: 1.15,
            color: i < idx ? ACCENT : i === idx ? "#FFFFFF" : "rgba(255,255,255,0.55)",
            background: i === idx ? ACCENT : "transparent",
            borderRadius: i === idx ? 14 : 0,
            padding: i === idx ? "2px 18px" : 0,
            transform: `scale(${i === idx ? 1 + 0.08 * Math.max(pop, 0) : 1})`,
            transformOrigin: "center bottom", display: "inline-block",
            textShadow: "0 3px 16px rgba(0,0,0,0.4)",
          }}>{w.w}</span>
        ))}
      </div>
    </Frame>
  );
};

// 3. WORD POP — 4-word window, active accent pop, upcoming ghosted (current pipeline style)
const WordPop: React.FC<{ words: SWord[]; ms: number; f: number; fps: number }> = ({ words, ms, f, fps }) => {
  const idx = words.findIndex((w) => ms >= w.t0 - 40 && ms < w.t1 + 160);
  if (idx < 0) return null;
  const winStart = Math.max(0, Math.min(idx - 1, words.length - 4));
  const win = words.slice(winStart, Math.min(winStart + 4, words.length));
  return (
    <Frame>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", background: "rgba(10,12,18,0.55)", borderRadius: 22, padding: "22px 44px" }}>
        {win.map((w, i) => {
          const gi = winStart + i;
          const active = gi === idx;
          const pop = active ? spring({ frame: f - (w.t0 / 1000) * fps, fps, config: { damping: 11, stiffness: 220 } }) : 0;
          return (
            <span key={i} style={{
              fontFamily: GROT, fontWeight: 900, fontSize: w.key ? 60 : 50, lineHeight: 1.1,
              color: active ? ACCENT : w.key ? ACCENT : "#FFFFFF",
              opacity: gi <= idx ? 1 : 0.3,
              transform: `scale(${active ? 1 + 0.14 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textTransform: w.key ? "uppercase" : "none",
              textShadow: "0 3px 16px rgba(0,0,0,0.4)",
            }}>{w.w}</span>
          );
        })}
      </div>
    </Frame>
  );
};

// 4. CLEAN NETFLIX — plain white phrase, soft shadow, no pill, gentle fade
const Netflix: React.FC<{ words: SWord[]; ms: number }> = ({ words, ms }) => {
  const idx = words.findIndex((w) => ms >= w.t0 && ms < w.t1 + 140);
  if (idx < 0) return null;
  const w0 = words[idx].t0;
  const fade = interpolate(ms - w0, [0, 180], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Frame>
      <div style={{ opacity: fade, maxWidth: 1400, textAlign: "center" }}>
        <span style={{ fontFamily: GROT, fontWeight: 800, fontSize: 62, lineHeight: 1.25, color: "#FFFFFF", textShadow: "0 2px 6px rgba(0,0,0,0.9), 0 0 22px rgba(0,0,0,0.6)" }}>
          {words.slice(Math.max(0, idx - 2), idx + 3).map((w) => w.w).join(" ")}
        </span>
      </div>
    </Frame>
  );
};

// 5. YELLOW CLASSIC — bold yellow, classic subtitle look
const Yellow: React.FC<{ words: SWord[]; ms: number }> = ({ words, ms }) => {
  const idx = words.findIndex((w) => ms >= w.t0 && ms < w.t1 + 140);
  if (idx < 0) return null;
  return (
    <Frame>
      <div style={{ maxWidth: 1400, textAlign: "center" }}>
        <span style={{ fontFamily: GROT, fontWeight: 900, fontSize: 66, lineHeight: 1.25, color: "#FFE45C", textShadow: "0 2px 5px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)" }}>
          {words.slice(Math.max(0, idx - 2), idx + 3).map((w) => w.w).join(" ")}
        </span>
      </div>
    </Frame>
  );
};

// 6. PROGRESS PILL — phrase in a pill, accent underline fills as words are spoken
const ProgressPill: React.FC<{ words: SWord[]; ms: number }> = ({ words, ms }) => {
  const idx = words.findIndex((w) => ms >= w.t0 && ms < w.t1 + 140);
  if (idx < 0) return null;
  const total = words[words.length - 1].t1;
  const prog = Math.min(ms / total, 1);
  return (
    <Frame>
      <div style={{ background: "rgba(10,12,18,0.7)", borderRadius: 24, padding: "26px 48px 20px", maxWidth: 1500 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", alignItems: "baseline" }}>
          {words.map((w, i) => (
            <span key={i} style={{
              fontFamily: GROT, fontWeight: 800, fontSize: 58, lineHeight: 1.2,
              color: i <= idx ? ACCENT : "rgba(255,255,255,0.45)",
            }}>{w.w}</span>
          ))}
        </div>
        <div style={{ marginTop: 18, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.15)" }}>
          <div style={{ width: `${prog * 100}%`, height: "100%", borderRadius: 3, background: ACCENT }} />
        </div>
      </div>
    </Frame>
  );
};

// 7. NEON GLOW — 3-word chunks, accent text with soft glow, chunk pop
const NeonGlow: React.FC<{ words: SWord[]; ms: number; f: number; fps: number }> = ({ words, ms, f, fps }) => {
  const idx = words.findIndex((w) => ms >= w.t0 && ms < w.t1 + 140);
  if (idx < 0) return null;
  const start = Math.floor(idx / 3) * 3;
  const win = words.slice(start, start + 3);
  const pop = spring({ frame: f - (words[start].t0 / 1000) * fps, fps, config: { damping: 14, stiffness: 180 } });
  return (
    <Frame>
      <div style={{ transform: `scale(${0.97 + 0.03 * Math.max(pop, 0)})` }}>
        <div style={{ display: "flex", gap: 22, justifyContent: "center" }}>
          {win.map((w, i) => {
            const active = start + i === idx;
            return (
              <span key={i} style={{
                fontFamily: GROT, fontWeight: 900, fontSize: 84, lineHeight: 1.1, textTransform: "uppercase",
                color: active ? "#FFFFFF" : ACCENT,
                textShadow: active
                  ? `0 0 18px ${ACCENT}, 0 0 46px ${ACCENT}, 0 3px 16px rgba(0,0,0,0.6)`
                  : `0 0 12px rgba(232,193,90,0.45), 0 3px 14px rgba(0,0,0,0.5)`,
                opacity: start + i <= idx ? 1 : 0.35,
              }}>{w.w}</span>
            );
          })}
        </div>
      </div>
    </Frame>
  );
};

const RENDERERS = [BigWords, Karaoke, WordPop, Netflix, Yellow, ProgressPill, NeonGlow];

export const CapShowcase: React.FC<any> = (props) => {
  const doc = props?.showcase?.words?.length ? props.showcase : (Array.isArray(props?.words) ? props : null);
  useFonts();
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!doc) return <AbsoluteFill style={{ background: "#0B1220" }} />;
  const words: SWord[] = doc.words;
  const segFrames = Math.round((LINE_MS / 1000) * fps);
  const n = STYLES.length;
  return (
    <AbsoluteFill style={{ background: "#0B1220" }}>
      {Array.from({ length: n }).map((_, i) => {
        const from = i * segFrames;
        const relF = f - from;
        const relMs = (relF / fps) * 1000;
        const R = RENDERERS[i];
        return (
          <Sequence key={i} from={from} durationInFrames={segFrames} name={`style-${i + 1}`}>
            <AbsoluteFill>
              <Label n={i + 1} />
              <R words={words} ms={relMs} f={relF} fps={fps} />
              <Audio src={staticFile(doc.audio)} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
