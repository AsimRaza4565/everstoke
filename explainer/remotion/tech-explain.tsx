import React, { useEffect } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, continueRender, delayRender } from "remotion";

// ============ TECH EXPLAIN — "Dark Mode Minimalist Tech" dev explainer (DEMO) ============
// LOCAL-ONLY TEST (not committed, not pushed). Pitch-black bg, glowing terminal
// windows, neon cyan/purple/yellow, spring pop-ins, char-by-char typing, drawn
// SVG flow lines, expanding size bars, ticking counters, collision warning,
// UUID grid + UUIDv7 timestamp highlight. Each scene is a child component so
// useCurrentFrame() is sequence-relative.

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
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: 110, fontFamily: MONO, fontSize: 24, color: DIM, letterSpacing: "0.3em", textAlign: "center" }}>{text}</div>
);

const TitleCard: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - 2, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", opacity: p, transform: `translateY(${(1 - p) * 36}px)` }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 96, color: WHITE, lineHeight: 1.15 }}>{text}</div>
        {sub ? <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 28, color: DIM, letterSpacing: "0.22em" }}>{sub}</div> : null}
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

const DatabaseNode: React.FC<{ name: string; sub?: string; glowColor?: string; x: number; y: number; delay?: number; children?: React.ReactNode }> = ({ name, sub, glowColor = CYAN, x, y, delay = 0, children }) => (
  <Terminal title={name} w={520} color={glowColor} delay={delay} style={{ left: x, top: y }}>
    {sub ? <div style={{ fontFamily: MONO, fontSize: 18, color: DIM, marginBottom: 14 }}>{sub}</div> : null}
    {children}
  </Terminal>
);

const Counter: React.FC<{ values: number[]; start?: number; step?: number; color?: string; size?: number }> = ({ values, start = 0, step = 22, color = CYAN, size = 64 }) => {
  const f = useCurrentFrame();
  const idx = Math.min(values.length - 1, Math.max(0, Math.floor((f - start) / step)));
  const tickP = interpolate(f - start - idx * step, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: size, color, textAlign: "center" }}>
      <span style={{ color: DIM, fontSize: size * 0.45, display: "block", marginBottom: 4 }}>AUTO INCREMENT</span>
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

const SizeBar: React.FC<{ label: string; bytes: number; color: string; delay: number; text: string }> = ({ label, bytes, color, delay, text }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 18, stiffness: 120 } });
  const w = interpolate(p, [0, 1], [0, bytes * 56]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 34 }}>
      <div style={{ width: 220, fontFamily: MONO, fontSize: 30, color: WHITE, textAlign: "right" }}>{label}</div>
      <div style={{ height: 58, width: Math.max(w, 8), borderRadius: 10, background: `${color}22`, border: `1.5px solid ${color}`, ...glow(color, 0.3), display: "flex", alignItems: "center", paddingLeft: 20 }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color }}>{text}</span>
      </div>
    </div>
  );
};

const CollisionBadge: React.FC<{ delay: number }> = ({ delay }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay, fps, config: { damping: 10, stiffness: 200 } });
  const pulse = 0.78 + 0.22 * Math.sin(f / 5);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 760, display: "flex", justifyContent: "center", transform: `scale(${Math.max(s, 0.01) * pulse})` }}>
      <div style={{ border: `2px solid ${RED}`, borderRadius: 14, padding: "14px 42px", fontFamily: MONO, fontWeight: 700, fontSize: 40, color: RED, background: "rgba(248,113,113,0.08)", ...glow(RED, 0.5) }}>
        ⚠ COLLISION — ID 1001 EXISTS TWICE
      </div>
    </div>
  );
};

const UuidGrid: React.FC<{ delay: number }> = ({ delay }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 44px)", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: 32 }).map((_, i) => {
        const on = interpolate(f - delay - i * 1.3, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={i} style={{
            width: 44, height: 44, borderRadius: 8,
            background: on ? `${CYAN}22` : "rgba(255,255,255,0.03)",
            border: `1.5px solid ${on ? CYAN : "rgba(255,255,255,0.12)"}`,
            boxShadow: on ? `0 0 12px ${CYAN}44` : "none",
            opacity: 0.35 + 0.65 * on,
          }} />
        );
      })}
    </div>
  );
};

// ---------------- scenes ----------------
const Scene1: React.FC = () => (
  <>
    <SceneLabel text="SCENE 1 — THE BASELINE" />
    <DatabaseNode name="users_db — US-East" sub="single database, counting up" glowColor={CYAN} x={700} y={250} delay={2}>
      <Counter values={[1001, 1002, 1003, 1004]} start={26} step={24} color={CYAN} />
    </DatabaseNode>
    <Terminal title="app — insert query" w={900} color={GREEN} delay={20} style={{ left: 510, top: 620 }}>
      <CodeTyping text="INSERT INTO users (name) VALUES ('ada');" start={18} speed={1.7} color={GREEN} />
      <div style={{ height: 14 }} />
      <CodeTyping text="-- id generated automatically: 1001" start={46} speed={2.2} color={DIM} />
    </Terminal>
  </>
);

const Scene2: React.FC = () => (
  <>
    <SceneLabel text="SCENE 2 — THE PRICE OF EACH" />
    <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <SizeBar label="INT" bytes={4} color={CYAN} delay={6} text="4 bytes" />
      <SizeBar label="BIGINT" bytes={8} color={YELLOW} delay={18} text="8 bytes" />
      <SizeBar label="UUID" bytes={16} color={PURPLE} delay={30} text="16 bytes" />
    </div>
    <Terminal title="search — human readable?" w={980} color={YELLOW} delay={46} style={{ left: 470, top: 600 }}>
      <CodeTyping text="WHERE id = '550e8400-e29b-41d4-a716-446655440000'" start={10} speed={2.6} color={PURPLE} />
      <div style={{ height: 10 }} />
      <div style={{ fontFamily: MONO, fontSize: 24, color: DIM }}>vs  WHERE id = 1001   ← you can say this out loud</div>
    </Terminal>
  </>
);

const Scene3: React.FC = () => (
  <>
    <SceneLabel text="SCENE 3 — TWO DATABASES, ONE COUNTER" />
    <DatabaseNode name="users_db — US-East" glowColor={CYAN} x={230} y={330} delay={4}>
      <Counter values={[1001]} start={20} step={20} color={CYAN} />
    </DatabaseNode>
    <DatabaseNode name="users_db — Europe" glowColor={PURPLE} x={1170} y={330} delay={16}>
      <Counter values={[1001]} start={34} step={20} color={PURPLE} />
    </DatabaseNode>
    <FlowLine x1={760} y1={480} x2={1160} y2={480} delay={46} color={RED} />
    <CollisionBadge delay={54} />
  </>
);

const Scene4: React.FC = () => {
  const f = useCurrentFrame();
  const lit = Math.max(0, Math.floor((f - 14) / 1.6));
  const chars = "550e8400-";
  return (
    <>
      <SceneLabel text="SCENE 4 — THE FIX: UUIDv7" />
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontWeight: 700, fontSize: 44, color: WHITE }}>
        {chars.split("").map((ch, i) => (
          <span key={i} style={{ color: i < lit ? YELLOW : DIM, textShadow: i < lit ? `0 0 18px ${YELLOW}66` : "none" }}>{ch}</span>
        ))}
        <span style={{ color: PURPLE }}>-e29b-41d4-a716-446655440000</span>
      </div>
      <div style={{ position: "absolute", top: 320, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontSize: 26, color: YELLOW, opacity: f > 30 ? 1 : 0 }}>
        ↑ the first bits are a TIMESTAMP — every ID sorts itself
      </div>
      <div style={{ position: "absolute", top: 410, left: 0, right: 0 }}>
        <UuidGrid delay={26} />
      </div>
      <div style={{ position: "absolute", top: 556, left: 0, right: 0, textAlign: "center", fontFamily: MONO, fontSize: 24, color: DIM }}>
        128 bits — unique everywhere, no counter to share
      </div>
      <Terminal title="app — insert query" w={860} color={GREEN} delay={54} style={{ left: 530, top: 640 }}>
        <CodeTyping text="id = uuidv7();  -- unique + time-sorted ✓" start={6} speed={2.0} color={GREEN} />
      </Terminal>
    </>
  );
};

// ---------------- captions (dark karaoke, style-2) ----------------
const CapWindow = 4;
const Captions: React.FC<{ words: Array<{ w: string; t0: number; t1: number }>; accent?: string }> = ({ words, accent = CYAN }) => {
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

// ---------------- orchestrator ----------------
export const SCENE_STARTS = [0, 3, 13.5, 24, 35, 48];
export const SCENE_DURS = [3, 10.5, 10.5, 11, 13, 4.5];

export const TechExplain: React.FC<any> = (props) => {
  loadFonts();
  const { fps, durationInFrames } = useVideoConfig();
  const u = (s: number) => Math.round(s * fps);
  const WORDS: Array<Array<{ w: string; t0: number; t1: number }>> = props?.sceneWords || [[], [], [], []];
  const AUDIO: Array<string | null> = props?.sceneAudio || [null, null, null, null];
  const MUSIC: string | null = props?.music || null;
  const accents = [CYAN, YELLOW, RED, GREEN];
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={u(SCENE_STARTS[0])} durationInFrames={u(SCENE_DURS[0])}>
        <TitleCard text="Why Databases Fight Over IDs" sub="AUTO INCREMENT vs UUID" />
      </Sequence>
      {[[1, <Scene1 key="s1" />], [2, <Scene2 key="s2" />], [3, <Scene3 key="s3" />], [4, <Scene4 key="s4" />]].map(([n, el]) => {
        const idx = (n as number) - 1;
        return (
          <Sequence key={`s${n}`} from={u(SCENE_STARTS[n as number])} durationInFrames={u(SCENE_DURS[n as number])}>
            {el as React.ReactNode}
            <Captions words={WORDS[idx] || []} accent={accents[idx]} />
          </Sequence>
        );
      })}
      <Sequence from={u(SCENE_STARTS[5])} durationInFrames={u(SCENE_DURS[5])}>
        <TitleCard text="Now you know why UUIDs exist." sub="FOLLOW FOR MORE" />
      </Sequence>
      {AUDIO.map((a, i) => a ? (
        <Sequence key={`a${i}`} from={u(SCENE_STARTS[i + 1])} durationInFrames={u(SCENE_DURS[i + 1])}>
          <Audio src={staticFile(a)} />
        </Sequence>
      ) : null)}
      {MUSIC ? (
        <Audio src={staticFile(MUSIC)} loop
          volume={(f: number) => interpolate(f, [0, 25, durationInFrames - 40, durationInFrames - 2], [0, 0.16, 0.16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
      ) : null}
    </AbsoluteFill>
  );
};
