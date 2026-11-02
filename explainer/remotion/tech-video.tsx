import React, { useEffect } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

// ============ TECH VIDEO — data-driven "Dark Mode Minimalist Tech" explainer ============
// The AI fits any topic into a fixed vocabulary of scene templates:
//   title | terminal | counter | bars | clash | code | end
// Props: { scenes, starts, durs, sceneWords, sceneAudio, music }
// (starts/durs are SECONDS, converted here with fps; scene frames are sequence-relative)

const BG = "#000000";
const PANEL = "#111318";
const CYAN = "#22D3EE";
const GREEN = "#34D399";
const PURPLE = "#C084FC";
const YELLOW = "#FDE047";
const RED = "#F87171";
const WHITE = "#F8FAFC";
const DIM = "rgba(248,250,252,0.55)";
const SANS = "Inter, Arial, sans-serif";
const MONO = "'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace";
const ACCENTS = [CYAN, YELLOW, RED, GREEN, PURPLE, CYAN, GREEN, YELLOW];

const loadFonts = () => {
  useEffect(() => {
    const h = delayRender("tech fonts");
    Promise.all([
      ...[600, 800, 900].map((w) => new Promise<void>((res) => { const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); })),
      new Promise<void>((res) => { const f = new FontFace("JetBrains Mono", `url(${staticFile("fonts/jetbrains-mono.ttf")})`, { weight: "400 700" }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); }),
    ]).then(() => continueRender(h)).catch(() => continueRender(h));
  }, []);
};

const glow = (color: string, strength = 0.45) => ({ boxShadow: `0 0 24px ${color}${Math.round(strength * 255).toString(16).padStart(2, "0")}, 0 0 60px ${color}22`, borderColor: `${color}66` });

const SceneLabel: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: 100, fontFamily: MONO, fontSize: 24, color: DIM, letterSpacing: "0.3em", textAlign: "center" }}>{text}</div>
);

const BigCenter: React.FC<{ headline: string; sub?: string; accent?: string }> = ({ headline, sub, accent = CYAN }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - 2, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 36}px)` }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 96, color: WHITE, lineHeight: 1.15, maxWidth: 1500 }}>{headline}</div>
        {sub ? <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 28, color: accent, letterSpacing: "0.22em" }}>{sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

const Terminal: React.FC<{ title: string; w: number; color?: string; children: React.ReactNode; style?: React.CSSProperties; delay?: number }> = ({ title, w, color = CYAN, children, style, delay = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <div style={{ position: "absolute", width: w, transform: `scale(${Math.max(s, 0.01)})`, transformOrigin: "center", ...style }}>
      <div style={{ background: PANEL, border: "1.5px solid", borderRadius: 14, overflow: "hidden", ...glow(color) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FF5F57" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FEBC2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#28C840" }} />
          <div style={{ marginLeft: 10, fontFamily: MONO, fontSize: 18, color: DIM }}>{title}</div>
        </div>
        <div style={{ padding: "20px 24px" }}>{children}</div>
      </div>
    </div>
  );
};

const CodeTyping: React.FC<{ text: string; start?: number; speed?: number; color?: string; size?: number }> = ({ text, start = 0, speed = 1.6, color = GREEN, size = 26 }) => {
  const f = useCurrentFrame();
  const chars = Math.max(0, Math.floor((f - start) * speed));
  const done = chars >= text.length;
  return (
    <div style={{ fontFamily: MONO, fontSize: size, color, whiteSpace: "pre-wrap" }}>
      {text.slice(0, chars)}
      {!done ? <span style={{ color: DIM }}>▌</span> : null}
    </div>
  );
};

const Counter: React.FC<{ values: number[]; start?: number; step?: number; color?: string; size?: number }> = ({ values, start = 0, step = 24, color = CYAN, size = 64 }) => {
  const f = useCurrentFrame();
  const idx = Math.min(values.length - 1, Math.max(0, Math.floor((f - start) / step)));
  const tickP = interpolate(f - start - idx * step, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: size, color, textAlign: "center" }}>
      <span style={{ color: DIM, fontSize: size * 0.42, display: "block", marginBottom: 4 }}>ID</span>
      <span style={{ display: "inline-block", transform: `translateY(${(1 - tickP) * 10}px)`, opacity: tickP }}>{values[idx]}</span>
    </div>
  );
};

const FlowLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; delay?: number; color?: string }> = ({ x1, y1, x2, y2, delay = 0, color = RED }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 } });
  const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 70;
  const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      <circle cx={x1} cy={y1} r={6 * p} fill={color} />
      <circle cx={x2} cy={y2} r={6 * p} fill={color} />
    </svg>
  );
};

const SizeBar: React.FC<{ label: string; v: number; max: number; color: string; delay: number; text: string }> = ({ label, v, max, color, delay, text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 18, stiffness: 120 } });
  const w = interpolate(p, [0, 1], [0, (v / max) * 900]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 34 }}>
      <div style={{ width: 260, fontFamily: MONO, fontSize: 30, color: WHITE, textAlign: "right" }}>{label}</div>
      <div style={{ height: 58, width: Math.max(w, 8), borderRadius: 10, background: `${color}22`, border: `1.5px solid ${color}`, ...glow(color, 0.3), display: "flex", alignItems: "center", paddingLeft: 20 }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color }}>{text}</span>
      </div>
    </div>
  );
};

const WarnBadge: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 10, stiffness: 200 } });
  const pulse = 0.78 + 0.22 * Math.sin(f / 5);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 750, display: "flex", justifyContent: "center", transform: `scale(${Math.max(s, 0.01) * pulse})` }}>
      <div style={{ border: `2px solid ${RED}`, borderRadius: 14, padding: "14px 42px", fontFamily: MONO, fontWeight: 700, fontSize: 38, color: RED, background: "rgba(248,113,113,0.08)", ...glow(RED, 0.5) }}>
        ⚠ {text}
      </div>
    </div>
  );
};

const UuidGrid: React.FC<{ delay: number; color?: string }> = ({ delay, color = CYAN }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 44px)", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: 32 }).map((_, i) => {
        const on = interpolate(f - delay - i * 1.3, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={i} style={{
            width: 44, height: 44, borderRadius: 8,
            background: on ? `${color}22` : "rgba(255,255,255,0.03)",
            border: `1.5px solid ${on ? color : "rgba(255,255,255,0.12)"}`,
            boxShadow: on ? `0 0 12px ${color}44` : "none",
            opacity: 0.35 + 0.65 * on,
          }} />
        );
      })}
    </div>
  );
};

// ---------------- scene renderers (all receive the scene object) ----------------
const STitle: React.FC<{ s: any }> = ({ s }) => <BigCenter headline={s.headline} sub={s.sub} />;
const SEnd: React.FC<{ s: any }> = ({ s }) => <BigCenter headline={s.headline} sub={s.sub} accent={GREEN} />;

const STerminal: React.FC<{ s: any; accent: string }> = ({ s, accent }) => {
  const f = useCurrentFrame();
  const lines: string[] = s.lines || [];
  const per = 26;
  return (
    <>
      {s.label ? <SceneLabel text={s.label} /> : null}
      <Terminal title={s.termTitle || "terminal"} w={s.wide ? 1180 : 900} color={accent} delay={2} style={{ left: s.wide ? 370 : 510, top: 300 }}>
        {lines.map((ln, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <CodeTyping text={ln} start={8 + i * per} speed={2.0} color={i % 2 === 0 ? GREEN : PURPLE} size={s.wide ? 28 : 26} />
          </div>
        ))}
      </Terminal>
      {s.caption ? (
        <div style={{ position: "absolute", top: 700 + lines.length * 44, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontSize: 28, color: DIM, opacity: f > 8 + lines.length * per ? 1 : 0 }}>
          {s.caption}
        </div>
      ) : null}
    </>
  );
};

const SCounter: React.FC<{ s: any; accent: string }> = ({ s, accent }) => (
  <>
    {s.label ? <SceneLabel text={s.label} /> : null}
    <DatabaseNodeWrap title={s.nodeTitle || "database"} sub={s.sub} color={accent} x={700} y={280} delay={2}>
      <Counter values={s.values && s.values.length ? s.values : [1, 2, 3]} start={20} step={26} color={accent} />
    </DatabaseNodeWrap>
  </>
);

const DatabaseNodeWrap: React.FC<{ title: string; sub?: string; color: string; x: number; y: number; delay?: number; children?: React.ReactNode }> = ({ title, sub, color, x, y, delay, children }) => (
  <Terminal title={title} w={520} color={color} delay={delay} style={{ left: x, top: y }}>
    {sub ? <div style={{ fontFamily: MONO, fontSize: 18, color: DIM, marginBottom: 14 }}>{sub}</div> : null}
    {children}
  </Terminal>
);

const SBars: React.FC<{ s: any; accent: string }> = ({ s, accent }) => {
  const bars = (s.bars || []).slice(0, 4);
  const max = Math.max(...bars.map((b: any) => Number(b.v) || 1), 1);
  return (
    <>
      {s.label ? <SceneLabel text={s.label} /> : null}
      <div style={{ position: "absolute", top: 240, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {bars.map((b: any, i: number) => (
          <SizeBar key={i} label={b.label} v={Number(b.v) || 1} max={max} color={ACCENTS[i % ACCENTS.length]} delay={8 + i * 12} text={b.text} />
        ))}
      </div>
      {s.caption ? (
        <div style={{ position: "absolute", top: 640, left: 300, right: 300, textAlign: "center", fontFamily: MONO, fontSize: 28, color: DIM }}>{s.caption}</div>
      ) : null}
      <div style={{ position: "absolute", top: 760, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: 0.9 }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 64, color: accent }}>{s.big || ""}</div>
      </div>
    </>
  );
};

const SClash: React.FC<{ s: any; accent: string }> = ({ s }) => {
  const val = s.value ?? 1001;
  return (
    <>
      {s.label ? <SceneLabel text={s.label} /> : null}
      <div style={{ position: "absolute", top: 330, left: 230 }}>
        <Terminal title={s.a || "node-A"} w={520} color={CYAN} delay={4}>
          <Counter values={[val]} start={20} step={20} color={CYAN} />
        </Terminal>
      </div>
      <div style={{ position: "absolute", top: 330, left: 1170 }}>
        <Terminal title={s.b || "node-B"} w={520} color={PURPLE} delay={16}>
          <Counter values={[val]} start={34} step={20} color={PURPLE} />
        </Terminal>
      </div>
      <FlowLine x1={760} y1={480} x2={1160} y2={480} delay={46} color={RED} />
      <WarnBadge text={s.warn || "COLLISION"} delay={54} />
    </>
  );
};

const SCode: React.FC<{ s: any; accent: string }> = ({ s, accent }) => {
  const f = useCurrentFrame();
  const chars = Math.max(0, Math.floor((f - 14) / 1.6));
  const big = String(s.big || "");
  return (
    <>
      {s.label ? <SceneLabel text={s.label} /> : null}
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontWeight: 700, fontSize: big.length > 40 ? 40 : 54, color: WHITE, padding: "0 120px" }}>
        {big.split("").map((ch, i) => (
          <span key={i} style={{ color: i < chars ? accent : DIM, textShadow: i < chars ? `0 0 18px ${accent}55` : "none" }}>{ch}</span>
        ))}
      </div>
      {s.caption ? (
        <div style={{ position: "absolute", top: 330, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontSize: 27, color: accent, opacity: f > 12 + big.length / 1.6 ? 1 : 0 }}>
          {s.caption}
        </div>
      ) : null}
      {s.grid ? (
        <div style={{ position: "absolute", top: 430, left: 0, right: 0 }}>
          <UuidGrid delay={26} color={accent} />
        </div>
      ) : null}
      {s.lines && s.lines.length ? (
        <Terminal title={s.termTitle || "terminal"} w={860} color={GREEN} delay={50} style={{ left: 530, top: s.grid ? 620 : 500 }}>
          {s.lines.map((ln: string, i: number) => (
            <CodeTyping key={i} text={ln} start={4 + i * 20} speed={2.0} color={GREEN} />
          ))}
        </Terminal>
      ) : null}
    </>
  );
};



// ---------------- long-form diagram templates ----------------
const MiniNode: React.FC<{ text: string; color: string; active: boolean; x: number; y: number; w?: number }> = ({ text, color, active, x, y, w = 380 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 12, stiffness: 160 } });
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `scale(${Math.max(s, 0.01)})`, transformOrigin: "center" }}>
      <div style={{ background: PANEL, border: `1.5px solid ${active ? color : "rgba(255,255,255,0.18)"}`, borderRadius: 14, padding: "22px 18px", textAlign: "center", fontFamily: MONO, fontWeight: 700, fontSize: 26, color: active ? "#000" : WHITE, background: active ? color : PANEL, boxShadow: active ? `0 0 30px ${color}88` : "none" }}>
        {text}
      </div>
    </div>
  );
};

const SFlow: React.FC<{ s: any; accent: string }> = ({ s, accent }) => {
  const f = useCurrentFrame();
  const nodes: string[] = (s.nodes || []).slice(0, 4);
  const n = nodes.length;
  const W = 1920;
  const boxW = n === 2 ? 460 : 380;
  const gap = (W - 200 - n * boxW) / Math.max(n - 1, 1);
  const active = Math.floor(f / 45) % n;
  return (
    <>
      {s.label ? <SceneLabel text={s.label} /> : null}
      {nodes.map((txt, i) => (
        <MiniNode key={i} text={txt} color={accent} active={i === active} x={100 + i * (boxW + gap)} y={380} w={boxW} />
      ))}
      {nodes.slice(0, -1).map((_, i) => (
        <svg key={`a${i}`} width={gap + 20} height={40} style={{ position: "absolute", left: 100 + boxW + i * (boxW + gap) - 10, top: 455 }}>
          <line x1="0" y1="20" x2={gap - 8} y2="20" stroke={DIM} strokeWidth={3} strokeDasharray="8 8" />
          <path d={`M ${gap - 16} 10 L ${gap - 4} 20 L ${gap - 16} 30`} fill="none" stroke={DIM} strokeWidth={3} strokeLinecap="round" />
        </svg>
      ))}
      {s.loop ? (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <path d={`M ${100 + n * boxW + (n - 1) * gap - boxW / 2} 560 Q 960 760 100 + ${boxW / 2} 560`}
            fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round"
            strokeDasharray="16 14" strokeDashoffset={-f * 2.2} opacity={0.85} />
          <text x="960" y="740" textAnchor="middle" fill={accent} fontFamily={MONO} fontSize={26} letterSpacing="0.25em">EVENT LOOP — REPEAT FOREVER</text>
        </svg>
      ) : null}
      {s.caption ? (
        <div style={{ position: "absolute", top: s.loop ? 810 : 640, left: 260, right: 260, textAlign: "center", fontFamily: MONO, fontSize: 28, color: DIM }}>{s.caption}</div>
      ) : null}
    </>
  );
};

const SSteps: React.FC<{ s: any; accent: string }> = ({ s, accent }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items: string[] = (s.items || []).slice(0, 5);
  return (
    <>
      {s.label ? <SceneLabel text={s.label} /> : null}
      <div style={{ position: "absolute", top: 240, left: 420, right: 300 }}>
        {items.map((it, i) => {
          const p = spring({ frame: f - 8 - i * 14, fps, config: { damping: 200 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 44, opacity: p, transform: `translateX(${(1 - p) * 60}px)` }}>
              <div style={{ minWidth: 64, height: 64, borderRadius: 14, background: `${accent}22`, border: `1.5px solid ${accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 30, color: accent, ...glow(accent, 0.3) }}>{i + 1}</div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 42, color: WHITE }}>{it}</div>
            </div>
          );
        })}
      </div>
      {s.caption ? (
        <div style={{ position: "absolute", top: 820, left: 260, right: 260, textAlign: "center", fontFamily: MONO, fontSize: 26, color: DIM }}>{s.caption}</div>
      ) : null}
    </>
  );
};

const SStatement: React.FC<{ s: any; accent: string }> = ({ s, accent }) => (
  <>
    {s.label ? <SceneLabel text={s.label} /> : null}
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "0 160px" }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 100, color: WHITE, lineHeight: 1.15 }}>
          <MarkedText text={s.headline || ""} color={accent} />
        </div>
        {s.sub ? <div style={{ marginTop: 40, fontFamily: MONO, fontSize: 32, color: accent, letterSpacing: "0.2em" }}>{s.sub}</div> : null}
      </div>
    </AbsoluteFill>
  </>
);

const MarkedText: React.FC<{ text: string; color: string }> = ({ text, color }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - 10, fps, config: { damping: 200 } });
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span style={{ position: "absolute", left: -10, right: -10, top: "10%", bottom: "6%", background: `${color}55`, transform: `scaleX(${p})`, transformOrigin: "left center", borderRadius: 8 }} />
      <span style={{ position: "relative" }}>{text}</span>
    </span>
  );
};

// ---------------- captions ----------------
const CapWindow = 4;
const Captions: React.FC<{ words: Array<{ w: string; t0: number; t1: number }>; accent: string }> = ({ words, accent }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (f / fps) * 1000;
  if (!words.length) return null;
  const idx = words.findIndex((w) => ms >= w.t0 - 40 && ms < w.t1 + 150);
  if (idx < 0) return null;
  const winStart = Math.max(0, Math.min(idx - 1, words.length - CapWindow));
  const win = words.slice(winStart, Math.min(winStart + CapWindow, words.length));
  const pop = spring({ frame: f - (words[idx].t0 / 1000) * fps, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <div style={{ position: "absolute", bottom: 110, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
      <div style={{ display: "flex", gap: 18, justifyContent: "center", alignItems: "baseline", whiteSpace: "nowrap" }}>
        {win.map((w, i) => {
          const gi = winStart + i;
          const active = gi === idx;
          return (
            <span key={i} style={{
              fontFamily: SANS, fontWeight: 900, fontSize: 52, lineHeight: 1.1,
              color: gi < idx ? accent : active ? "#000000" : "rgba(248,250,252,0.5)",
              background: active ? accent : "transparent",
              borderRadius: active ? 12 : 0, padding: active ? "4px 18px" : 0,
              transform: `scale(${active ? 1 + 0.06 * Math.max(pop, 0) : 1})`,
              transformOrigin: "center bottom", display: "inline-block",
              textShadow: active ? "none" : "0 2px 12px rgba(0,0,0,0.85)",
            }}>{w.w}</span>
          );
        })}
      </div>
    </div>
  );
};

const RENDERERS: Record<string, React.FC<any>> = {
  title: STitle,
  terminal: STerminal,
  counter: SCounter,
  bars: SBars,
  clash: SClash,
  code: SCode,
  flow: SFlow,
  steps: SSteps,
  statement: SStatement,
  end: SEnd,
};

// ---------------- orchestrator ----------------
export const TechVideo: React.FC<any> = (props) => {
  loadFonts();
  const { fps, durationInFrames } = useVideoConfig();
  const u = (s: number) => Math.round(s * fps);
  const scenes: any[] = props?.scenes || [];
  const starts: number[] = props?.starts || [];
  const durs: number[] = props?.durs || [];
  const words: Array<Array<{ w: string; t0: number; t1: number }>> = props?.sceneWords || [];
  const audio: Array<string | null> = props?.sceneAudio || [];
  const MUSIC: string | null = props?.music || null;
  return (
    <AbsoluteFill style={{ background: BG }}>
      {scenes.map((s, i) => {
        const R = RENDERERS[s.t] || STitle;
        const accent = ACCENTS[i % ACCENTS.length];
        return (
          <Sequence key={`s${i}`} from={u(starts[i] || 0)} durationInFrames={u(durs[i] || 4)}>
            <R s={s} accent={accent} />
            <Captions words={words[i] || []} accent={accent} />
          </Sequence>
        );
      })}
      {audio.map((a, i) => a ? (
        <Sequence key={`a${i}`} from={u(starts[i] || 0)} durationInFrames={u(durs[i] || 4)}>
          <Audio src={staticFile(a)} />
        </Sequence>
      ) : null)}
      {MUSIC ? (
        <Audio src={staticFile(MUSIC)} loop
          volume={(f: number) => interpolate(f, [0, 25, durationInFrames - 40, durationInFrames - 2], [0, 0.12, 0.12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      ) : null}
    </AbsoluteFill>
  );
};
