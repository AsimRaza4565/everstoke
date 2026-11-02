import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring } from "remotion";
import {
  AlertIcon, BigText, BoltIcon, C, CheckIcon, Chip, ClockIcon, Connector, DbIcon, DocIcon,
  FlowArrow, FONT, PhoneIcon, SceneCanvas, SceneFrame, ServerIcon, UserIcon, useFadeEdge, usePop,
} from "./theme";

const MONO = "Consolas, 'Courier New', monospace";

type BeatProps = { text?: string; props?: any; beatMs?: number };

// ---------------------------------------------------------------- hook
export const HookScene: React.FC<BeatProps> = ({ text = "", props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ opacity: o, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 84, left: 140, fontFamily: FONT, fontWeight: 600, fontSize: 26, letterSpacing: "0.28em", color: C.muted }}>
          SYSTEM DESIGN · A TRUE-TO-LIFE STORY
        </div>
        <BigText text={text || "You shipped your app. And then everyone showed up at once."} highlight={props.highlight} size={128} />
        <div style={{ position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)", width: 120, height: 12, background: C.accent }} />
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- statement
export const StatementScene: React.FC<BeatProps> = ({ text = "", props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const bar = usePop(2, 20);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ opacity: o, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", left: 150, top: "50%", transform: `translateY(-50%) scaleY(${bar})`, transformOrigin: "top", width: 16, height: 420, background: C.accent }} />
        <div style={{ paddingLeft: 220 }}>
          <BigText text={text} highlight={props.highlight} size={92} align="left" start={6} />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- chapter
export const ChapterScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const n = props.n ?? 1;
  const total = props.total ?? 4;
  const title = props.title ?? "Untitled";
  const o = useFadeEdge(beatMs);
  const { fps } = useVideoConfig();
  const numS = spring({ frame: useCurrentFrame(), fps, config: { damping: 200 } });
  const tS = usePop(8, 18);
  return (
    <SceneFrame>
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 40 }}>
          <div
            style={{
              fontFamily: FONT, fontWeight: 900, fontSize: 380, color: "transparent",
              WebkitTextStroke: `5px ${C.ghost}`, letterSpacing: "-0.04em",
              transform: `translateX(${(1 - numS) * -160}px)`,
            }}
          >
            {String(n).padStart(2, "0")}
          </div>
          <div style={{ maxWidth: 900 }}>
            <div style={{ marginBottom: 18 }}><Chip text={`CHAPTER ${n}`} delay={10} /></div>
            <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 108, letterSpacing: "-0.03em", color: C.ink, opacity: tS, transform: `translateY(${(1 - tS) * 40}px)` }}>
              {title}
            </div>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 110, display: "flex", gap: 18 }}>
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: "50%", background: i < n ? C.accent : C.ghost }} />
          ))}
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// per-element spring (stable because every mapped array has a fixed length per beat)
function usePopDelay(delay: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 170 } });
}

// Absolute-positioned user crowd (4-wide grid).
const Crowd: React.FC<{ left: number; top: number; icon?: number; delay?: number }> = ({ left, top, icon = 54, delay = 6 }) => {
  const s = usePop(delay, 18);
  const gapX = 26, gapY = 18;
  return (
    <div style={{ position: "absolute", left, top, display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: `${gapY}px ${gapX}px`, opacity: s, transform: `scale(${s})`, transformOrigin: "left top" }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <UserIcon key={i} size={icon} color={C.ink} />
      ))}
    </div>
  );
};

// Absolute-positioned server with optional label chip below.
const ServerBlock: React.FC<{ left: number; top: number; size: number; label?: string; labelBg?: string; labelColor?: string; delay?: number; color?: string; shake?: number; children?: React.ReactNode }> = ({
  left, top, size, label, labelBg, labelColor, delay = 6, color = C.ink, shake = 0, children,
}) => {
  const s = usePop(delay, 16);
  return (
    <div style={{ position: "absolute", left, top, width: size, transform: `translateX(${shake}px)` }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: "center" }}>
        <ServerIcon size={size} color={color} />
      </div>
      {children}
      {label ? (
        <div style={{ marginTop: 22, textAlign: "center", opacity: s }}>
          <span style={{
            display: "inline-block", fontFamily: FONT, fontWeight: 800, fontSize: 28,
            background: labelBg || C.card, color: labelColor || C.ink,
            border: `3px solid ${labelColor || C.ink}`, borderRadius: 999, padding: "10px 30px", letterSpacing: "0.06em",
            whiteSpace: "nowrap",
          }}>{label}</span>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------- server (calm)
// variants: "intro" = users -> server -> database chain | "traffic" = phones on top, counter climbs
export const ServerScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const frame = useCurrentFrame();
  const variant = props.variant || "intro";

  if (variant === "traffic") {
    const raw = interpolate(frame, [20, 220], [40, props.users ?? 40000], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    const count = Math.max(Math.floor(raw), 0);
    const countIn = usePop(16, 18);
    return (
      <SceneFrame eyebrow="THEN · EVERYONE ARRIVES">
        <AbsoluteFill style={{ opacity: o }}>
          <SceneCanvas>
            <Connector x1={918} y1={345} x2={918} y2={432} delay={12} dots={2} speed={0.18} drawFrames={12} />
          </SceneCanvas>
          <div style={{ position: "absolute", left: 790, top: 140, display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "16px 30px", opacity: usePop(4, 18) }}>
            {Array.from({ length: 6 }).map((_, i) => <PhoneIcon key={i} size={58} />)}
          </div>
          <div style={{ position: "absolute", left: 700, top: 452, width: 440, textAlign: "center" }}>
            <div style={{ display: "inline-block", transform: `scale(${usePop(8, 16)})` }}>
              <ServerIcon size={260} />
            </div>
            <div style={{ marginTop: 22 }}><Chip text={props.label || "YOUR APP"} bg={C.ink} color={C.card} delay={14} /></div>
          </div>
          <div style={{ position: "absolute", bottom: 110, left: 0, right: 0, textAlign: "center", opacity: countIn, transform: `translateY(${(1 - countIn) * 24}px)` }}>
            <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 84, color: C.accent }}>{count.toLocaleString()}</span>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: C.muted }}> users and climbing</span>
          </div>
        </AbsoluteFill>
      </SceneFrame>
    );
  }

  // "intro": users -> server -> database (one chain, two connectors)
  return (
    <SceneFrame eyebrow="BEFORE · ONE SERVER, ONE DATABASE">
      <AbsoluteFill style={{ opacity: o }}>
        <SceneCanvas>
          <Connector x1={680} y1={540} x2={1025} y2={540} delay={14} dots={3} speed={0.09} arrow={false} />
          <Connector x1={1300} y1={540} x2={1430} y2={540} delay={24} dots={2} speed={0.09} drawFrames={14} />
        </SceneCanvas>
        <Crowd left={300} top={440} />
        <ServerBlock left={1040} top={430} size={220} label={props.label || "YOUR APP"} labelBg={C.ink} labelColor={C.card} delay={6} />
        <div style={{ position: "absolute", left: 1430, top: 450, width: 180, textAlign: "center", opacity: usePop(20, 16) }}>
          <DbIcon size={180} />
          <div style={{ marginTop: 18, fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.muted }}>DATABASE</div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- overload (crash)
// variants: "cpu" = users flood one server | "db" = query docs pile into a drowning database
export const OverloadScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const frame = useCurrentFrame();
  const variant = props.variant || "cpu";

  if (variant === "db") {
    const pulse = 1 + Math.sin(frame / 4) * 0.035;
    return (
      <SceneFrame eyebrow="BREAK · THE DATABASE DROWNS">
        <AbsoluteFill style={{ opacity: o }}>
          <SceneCanvas>
            {[400, 540, 680].map((y, i) => (
              <Connector key={y} x1={620} y1={y} x2={1000} y2={540} delay={12 + i * 8} dots={2} speed={0.13} color={C.red} dotColor={C.accent} drawFrames={16} arrow={false} />
            ))}
          </SceneCanvas>
          {["SERVER 1", "SERVER 2", "SERVER 3"].map((s, i) => {
            const pop = usePopDelay(4 + i * 4);
            return (
              <div key={s} style={{ position: "absolute", left: 390, top: [355, 495, 635][i], opacity: pop, transform: `scale(${pop})` }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.ink, background: C.card, border: `3px solid ${C.line}`, borderRadius: 12, padding: "10px 24px", display: "inline-block" }}>{s}</span>
              </div>
            );
          })}
          {/* query docs piling at the database entrance */}
          {Array.from({ length: 5 }).map((_, i) => {
            const s = usePopDelay(22 + i * 7);
            return (
              <div key={i} style={{ position: "absolute", left: 920 - i * 6, top: 405 + i * 52, opacity: s, transform: `scale(${s}) rotate(${i % 2 ? 6 : -5}deg)` }}>
                <DocIcon size={52} color={C.accent} />
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 1030, top: 385, width: 300, textAlign: "center", transform: `scale(${pulse})` }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <DbIcon size={280} color={C.red} />
              <div style={{ position: "absolute", right: -34, top: -38, transform: "rotate(12deg)" }}>
                <ClockIcon size={110} color={C.red} />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <span style={{ display: "inline-block", fontFamily: FONT, fontWeight: 800, fontSize: 28, background: C.red, color: C.card, borderRadius: 999, padding: "10px 30px", letterSpacing: "0.06em" }}>
                {props.label || "DROWNING"}
              </span>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 108, left: 0, right: 0, textAlign: "center" }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.muted }}>query time: </span>
            <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, color: C.red }}>0.05s → 8.5s</span>
          </div>
        </AbsoluteFill>
      </SceneFrame>
    );
  }

  // "cpu": users flood one server
  const shake = frame > 34 ? Math.sin(frame * 1.7) * 4 * Math.min(1, (frame - 34) / 30) : 0;
  const errors: string[] = Array.isArray(props.errors) && props.errors.length ? props.errors : ["500", "timeout"];
  // badge slots that never cover the icon (icon occupies 1250-1530 x 400-680)
  const slots = [
    { left: 1255, top: 235, rot: -5 },
    { left: 1585, top: 345, rot: 4 },
    { left: 1290, top: 775, rot: -3 },
    { left: 1600, top: 745, rot: 5 },
  ];
  return (
    <SceneFrame eyebrow="BREAK · TOO MANY USERS">
      <AbsoluteFill style={{ opacity: o }}>
        <SceneCanvas>
          <Connector x1={680} y1={540} x2={1160} y2={540} delay={12} dots={5} speed={0.15} color={C.red} dotColor={C.accent} />
        </SceneCanvas>
        <Crowd left={300} top={440} />
        {/* request queue piling up at the server entrance */}
        {Array.from({ length: 7 }).map((_, i) => {
          const s = usePopDelay(20 + i * 6);
          return (
            <div key={i} style={{
              position: "absolute", left: 1198, top: 430 + i * 27, width: 52, height: 14,
              borderRadius: 7, background: C.accent, opacity: s, transform: `scale(${s})`, transformOrigin: "left center",
            }} />
          );
        })}
        <ServerBlock left={1250} top={400} size={280} label="OVERLOADED" labelBg={C.red} labelColor={C.card} delay={6} color={C.red} shake={shake} />
        {errors.slice(0, 4).map((e, i) => {
          const s = usePopDelay(30 + i * 12);
          const slot = slots[i];
          return (
            <div key={i} style={{
              position: "absolute", left: slot.left, top: slot.top,
              transform: `scale(${s}) rotate(${slot.rot}deg)`, opacity: s,
              fontFamily: FONT, fontWeight: 800, fontSize: 30, color: C.card, background: C.red,
              padding: "10px 24px", borderRadius: 14, whiteSpace: "nowrap",
            }}>{e}</div>
          );
        })}
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- balancer (fix)
export const BalancerScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const servers = Math.min(Math.max(props.servers ?? 3, 2), 4);
  const lbS = usePop(8, 14);
  const xs = Array.from({ length: servers }, (_, i) => 960 + (i - (servers - 1) / 2) * 480);
  return (
    <SceneFrame eyebrow="FIX · LOAD BALANCER">
      <AbsoluteFill style={{ opacity: o }}>
        <SceneCanvas>
          <Connector x1={960} y1={352} x2={960} y2={442} delay={12} dots={2} speed={0.18} drawFrames={12} />
          {xs.map((x, i) => (
            <Connector key={i} x1={960} y1={552} x2={x} y2={632} delay={20 + i * 6} dots={2} speed={0.11} drawFrames={16} />
          ))}
        </SceneCanvas>
        {/* users on top */}
        <div style={{ position: "absolute", left: 852, top: 165, display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: "12px 24px", opacity: usePop(4, 18) }}>
          {Array.from({ length: 9 }).map((_, i) => <UserIcon key={i} size={50} />)}
        </div>
        {/* load balancer box */}
        <div style={{ position: "absolute", left: 720, top: 445, width: 480, height: 92, transform: `scale(${lbS})` }}>
          <div style={{
            width: "100%", height: "100%", background: C.ink, borderRadius: 20, color: C.card,
            fontFamily: FONT, fontWeight: 800, fontSize: 32, letterSpacing: "0.08em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          }}>
            <BoltIcon size={36} />
            {props.label || "LOAD BALANCER"}
          </div>
        </div>
        {/* servers */}
        {xs.map((x, i) => {
          const s = usePopDelay(26 + i * 6);
          return (
            <div key={i} style={{ position: "absolute", left: x - 85, top: 645, width: 170, textAlign: "center", opacity: s, transform: `scale(${s})`, transformOrigin: "center top" }}>
              <ServerIcon size={170} />
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.muted, marginTop: 14 }}>SERVER {i + 1}</div>
            </div>
          );
        })}
        <div style={{ position: "absolute", bottom: 105, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Chip text="TRAFFIC SPLIT EVENLY" delay={46} />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- database
// variants: "single" = one flood line | "converge" = three servers converge on one db
export const DatabaseScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const frame = useCurrentFrame();
  const variant = props.variant || "single";
  const pulse = 1 + Math.sin(frame / 5) * 0.03;
  const queries = props.queries ?? 300;
  const raw = interpolate(frame, [14, 210], [0, queries], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const count = Math.max(Math.floor(raw), 0);
  const countIn = usePop(12, 18);

  if (variant === "converge") {
    return (
      <SceneFrame eyebrow="NEXT BREAK · EVERYTHING HITS ONE DATABASE">
        <AbsoluteFill style={{ opacity: o }}>
          <SceneCanvas>
            {[375, 540, 705].map((y, i) => (
              <Connector key={y} x1={600} y1={y} x2={1250} y2={540} delay={14 + i * 8} dots={2} speed={0.14} drawFrames={18} />
            ))}
          </SceneCanvas>
          {[330, 470, 610].map((top, i) => {
            const s = usePopDelay(4 + i * 4);
            return (
              <div key={top} style={{ position: "absolute", left: 370, top, opacity: s, transform: `scale(${s})`, transformOrigin: "left center" }}>
                <ServerIcon size={150} />
              </div>
            );
          })}
          <div style={{ position: "absolute", left: 1290, top: 400, width: 280, textAlign: "center", transform: `scale(${pulse})` }}>
            <DbIcon size={280} color={C.red} />
            <div style={{ marginTop: 22 }}>
              <span style={{
                display: "inline-block", fontFamily: FONT, fontWeight: 800, fontSize: 28,
                background: C.red, color: C.card, borderRadius: 999, padding: "10px 30px", letterSpacing: "0.06em", whiteSpace: "nowrap",
              }}>{props.label || "DATABASE"}</span>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 115, left: 0, right: 0, textAlign: "center", opacity: countIn, transform: `translateY(${(1 - countIn) * 24}px)` }}>
            <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 72, color: C.ink }}>{count.toLocaleString()}</span>
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: C.muted }}> queries / min from every server</span>
          </div>
        </AbsoluteFill>
      </SceneFrame>
    );
  }

  return (
    <SceneFrame eyebrow="NEXT BREAK · THE DATABASE">
      <AbsoluteFill style={{ opacity: o }}>
        <SceneCanvas>
          <Connector x1={705} y1={540} x2={1250} y2={540} delay={14} dots={5} speed={0.16} drawFrames={16} />
        </SceneCanvas>
        <ServerBlock left={430} top={425} size={230} label="3 SERVERS" delay={6} />
        <div style={{ position: "absolute", left: 1280, top: 400, width: 280, textAlign: "center", transform: `scale(${pulse})` }}>
          <DbIcon size={280} color={C.red} />
          <div style={{ marginTop: 22 }}>
            <span style={{
              display: "inline-block", fontFamily: FONT, fontWeight: 800, fontSize: 28,
              background: C.red, color: C.card, borderRadius: 999, padding: "10px 30px", letterSpacing: "0.06em",
            }}>{props.label || "DATABASE"}</span>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 115, left: 0, right: 0, textAlign: "center", opacity: countIn, transform: `translateY(${(1 - countIn) * 24}px)` }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 72, color: C.ink }}>{count.toLocaleString()}</span>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: C.muted }}> queries / min</span>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- cache (fix)
export const CacheScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const rate = Math.min(Math.max(props.hitrate ?? 92, 50), 99);
  const cacheS = usePop(14, 14);
  const frame = useCurrentFrame();
  const raw = interpolate(frame, [26, 230], [0, rate], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hits = Math.max(Math.floor(raw), 0);
  const checkS = usePopDelay(34);
  return (
    <SceneFrame eyebrow="FIX · ADD A CACHE">
      <AbsoluteFill style={{ opacity: o }}>
        <SceneCanvas>
          <Connector x1={620} y1={540} x2={810} y2={540} delay={16} dots={4} speed={0.15} drawFrames={14} arrow={false} />
          <Connector x1={1120} y1={540} x2={1355} y2={540} delay={26} dots={1} speed={0.07} color={C.muted} dotColor={C.muted} drawFrames={14} arrow={false} thickness={4} />
        </SceneCanvas>
        <ServerBlock left={380} top={445} size={190} delay={6} />
        <div style={{ position: "absolute", left: 380, top: 660, width: 190, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.muted }}>REQUESTS</div>
        {/* cache box */}
        <div style={{ position: "absolute", left: 830, top: 442, width: 250, height: 196, transform: `scale(${cacheS})` }}>
          <div style={{
            width: "100%", height: "100%", background: C.ink, borderRadius: 26, display: "flex",
            alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12,
          }}>
            <BoltIcon size={64} color={C.accent} />
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 30, color: C.card, letterSpacing: "0.1em" }}>CACHE</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 1020, top: 395, transform: `scale(${checkS}) rotate(8deg)`, opacity: checkS }}>
          <CheckIcon size={90} />
        </div>
        <div style={{ position: "absolute", left: 1400, top: 445, width: 190, opacity: 0.55 }}>
          <DbIcon size={190} color={C.muted} />
        </div>
        <div style={{ position: "absolute", left: 1330, top: 660, width: 330, textAlign: "center", fontFamily: FONT, fontWeight: 700, fontSize: 24, color: C.muted }}>DATABASE (RARELY)</div>
        <div style={{ position: "absolute", bottom: 108, left: 0, right: 0, textAlign: "center" }}>
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 96, color: C.accent }}>{hits}%</span>
          <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: C.muted }}> answered from memory</span>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- stale (cache bug)
export const StaleScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const item = props.item || "PRICE";
  const oldV = props.old || "$49";
  const newV = props.neu || props.new || "$39";
  const cardS = usePop(6, 16);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strike = spring({ frame: frame - 70, fps, config: { damping: 200 } });
  const freshS = usePopDelay(95);
  return (
    <SceneFrame eyebrow="BREAK · STALE CACHE">
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 110, alignItems: "stretch" }}>
          <div style={{ transform: `scale(${cardS})`, background: C.card, border: `4px solid ${C.line}`, borderRadius: 28, padding: "56px 70px", textAlign: "center" }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 26, letterSpacing: "0.2em", color: C.muted, marginBottom: 18 }}>DATABASE (TRUTH)</div>
            <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 120, color: C.green }}>{newV}</div>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 28, color: C.muted, marginTop: 10 }}>updated just now</div>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ transform: `scale(${freshS})`, opacity: freshS }}><AlertIcon size={110} /></div>
          </div>
          <div style={{ transform: `scale(${cardS})`, background: C.card, border: `4px solid ${C.red}`, borderRadius: 28, padding: "56px 70px", textAlign: "center" }}>
            <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 26, letterSpacing: "0.2em", color: C.muted, marginBottom: 18 }}>CACHE (WHAT USERS SEE)</div>
            <div style={{ position: "relative", fontFamily: FONT, fontWeight: 900, fontSize: 120, color: C.red }}>
              {oldV}
              <div style={{ position: "absolute", left: "-4%", top: "52%", width: `${strike * 108}%`, height: 12, background: C.red, transform: "rotate(-8deg)" }} />
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 28, color: C.muted, marginTop: 10 }}>{item.toLowerCase()} · 6 minutes old</div>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <Chip text="SAME PRODUCT, TWO PRICES" delay={120} bg={C.red} color={C.card} />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- cost (bill)
export const CostScene: React.FC<BeatProps> = ({ props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const items: { name: string; cost: string }[] = Array.isArray(props.items) && props.items.length
    ? props.items
    : [{ name: "Scaling", cost: "never free" }];
  return (
    <SceneFrame eyebrow="THE BILL">
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1150 }}>
          {items.map((it, i) => {
            const s = usePopDelay(10 + i * 16);
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: C.card, border: `4px solid ${C.line}`, borderRadius: 24,
                padding: "40px 60px", marginBottom: 30,
                opacity: s, transform: `translateX(${(1 - s) * 60}px)`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
                  <div style={{ width: 16, height: 56, background: C.accent }} />
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 52, color: C.ink }}>{it.name}</div>
                </div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, color: C.muted }}>{it.cost}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- outro
export const OutroScene: React.FC<BeatProps> = ({ text = "", beatMs }) => {
  const o = useFadeEdge(beatMs);
  const parts = [usePopDelay(4), usePopDelay(14), usePopDelay(24), usePopDelay(34)];
  return (
    <SceneFrame>
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 34, marginBottom: 90 }}>
          <div style={{ opacity: parts[0], display: "flex", gap: 10 }}>
            {Array.from({ length: 3 }).map((_, i) => <UserIcon key={i} size={52} />)}
          </div>
          <div style={{ opacity: parts[0] }}><FlowArrow delay={8} /></div>
          <div style={{ opacity: parts[1], background: C.ink, color: C.card, fontFamily: FONT, fontWeight: 800, fontSize: 24, padding: "16px 28px", borderRadius: 16 }}>LB</div>
          <div style={{ opacity: parts[1] }}><FlowArrow delay={18} /></div>
          <div style={{ opacity: parts[1], display: "flex", gap: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => <ServerIcon key={i} size={92} />)}
          </div>
          <div style={{ opacity: parts[2] }}><FlowArrow delay={28} /></div>
          <div style={{ opacity: parts[2], background: C.ink, borderRadius: 18, width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BoltIcon size={44} />
          </div>
          <div style={{ opacity: parts[3] }}><FlowArrow delay={38} /></div>
          <div style={{ opacity: parts[3] }}><DbIcon size={96} /></div>
        </div>
        <BigText text={text || "One crash at a time."} size={84} start={44} />
        <div style={{ position: "absolute", bottom: 110, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 900, fontSize: 30, color: C.card }}>S</div>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 30, letterSpacing: "0.22em", color: C.ink }}>SYSTEM DESIGN, VISUALIZED</div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- panel (dark monitor)
// A dark stats window like the ops screens in the reference — same ink color on cream.
export const PanelScene: React.FC<BeatProps> = ({ text = "", props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const frame = useCurrentFrame();
  const title = props.title || "GAME SERVER";
  const status = props.status || "RESTARTED";
  const rows: { label: string; value: string; pct?: number }[] = Array.isArray(props.rows) && props.rows.length
    ? props.rows
    : [{ label: "CPU", value: "98%", pct: 98 }, { label: "RAM", value: "3.8 GB", pct: 74 }, { label: "QUEUE", value: "12,402", pct: 88 }];
  return (
    <SceneFrame eyebrow={text ? undefined : "LIVE · THE NUMBERS"}>
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1440, background: C.ink, borderRadius: 26, overflow: "hidden", boxShadow: "0 30px 60px rgba(23,18,13,0.18)" }}>
          {/* title bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "26px 38px", borderBottom: "2px solid rgba(250,243,235,0.12)" }}>
            {["#E8542F", "#F0B429", "#58C08A"].map((c) => (
              <div key={c} style={{ width: 16, height: 16, borderRadius: "50%", background: c, opacity: 0.9 }} />
            ))}
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: "#FAF3EB", letterSpacing: "0.12em", marginLeft: 18 }}>{title}</div>
            <div style={{ marginLeft: "auto", fontFamily: MONO, fontWeight: 700, fontSize: 22, color: C.accent, border: `2px solid ${C.accent}`, borderRadius: 8, padding: "6px 18px" }}>{status}</div>
          </div>
          {/* stat rows */}
          <div style={{ padding: "44px 48px 40px" }}>
            {rows.slice(0, 4).map((r, i) => {
              const d = 12 + i * 16;
              const w = interpolate(frame, [d, d + 46], [0, Math.min(Math.max(r.pct ?? 70, 4), 100)], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const rowIn = usePopDelay(d - 6);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 40, opacity: rowIn, transform: `translateX(${(1 - rowIn) * 40}px)` }}>
                  <div style={{ width: 230, fontFamily: MONO, fontWeight: 700, fontSize: 28, color: "rgba(250,243,235,0.75)", letterSpacing: "0.1em" }}>{r.label}</div>
                  <div style={{ flex: 1, height: 30, borderRadius: 15, background: "rgba(250,243,235,0.1)", overflow: "hidden" }}>
                    <div style={{ width: `${w}%`, height: "100%", borderRadius: 15, background: (r.pct ?? 0) >= 90 ? C.accent : "#58C08A" }} />
                  </div>
                  <div style={{ width: 210, textAlign: "right", fontFamily: MONO, fontWeight: 700, fontSize: 30, color: "#FAF3EB" }}>{r.value}</div>
                </div>
              );
            })}
            {props.note ? (
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: "rgba(250,243,235,0.5)", letterSpacing: "0.14em", marginTop: 8 }}>
                # {props.note}
              </div>
            ) : null}
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- code (query + result)
// Mono code card with a typed line and a highlighted slow result, like the reference's SQL panels.
export const CodeScene: React.FC<BeatProps> = ({ text = "", props = {}, beatMs }) => {
  const o = useFadeEdge(beatMs);
  const frame = useCurrentFrame();
  const code: string = props.code || "SELECT * FROM orders WHERE user_id = 42;";
  const result: string = props.result || "1 ROW — 8.5 SECONDS";
  const note: string = props.note || "";
  const chars = Math.floor(interpolate(frame, [18, 78], [0, code.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const typing = chars < code.length;
  const cursorOn = Math.floor(frame / 8) % 2 === 0;
  const resS = usePop(92, 14);
  const noteIn = usePopDelay(112);
  return (
    <SceneFrame eyebrow="UNDER THE HOOD">
      <AbsoluteFill style={{ opacity: o, alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 1440, background: C.card, border: `4px solid ${C.line}`, borderRadius: 26, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "24px 38px", borderBottom: `3px solid ${C.line}` }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.muted, letterSpacing: "0.14em" }}>{props.lang || "SQL"}</div>
            <div style={{ marginLeft: "auto", fontFamily: MONO, fontWeight: 700, fontSize: 24, color: C.muted }}>READ 0.02s</div>
          </div>
          <div style={{ padding: "46px 48px 40px" }}>
            <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 42, color: C.ink, minHeight: 120, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {code.slice(0, chars)}
              <span style={{ display: "inline-block", width: 22, height: 44, background: C.accent, marginLeft: 6, verticalAlign: "middle", opacity: typing && cursorOn ? 1 : 0 }} />
            </div>
            <div style={{ height: 3, background: C.line, margin: "26px 0" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ transform: `scale(${resS})`, opacity: resS }}>
                <span style={{ display: "inline-block", fontFamily: MONO, fontWeight: 700, fontSize: 34, background: C.red, color: C.card, borderRadius: 12, padding: "14px 30px" }}>{result}</span>
              </div>
              {note ? (
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, color: C.muted, opacity: noteIn }}># {note}</span>
              ) : null}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
};

export const SCENES: Record<string, React.FC<BeatProps>> = {
  hook: HookScene,
  statement: StatementScene,
  chapter: ChapterScene,
  server: ServerScene,
  overload: OverloadScene,
  balancer: BalancerScene,
  database: DatabaseScene,
  cache: CacheScene,
  stale: StaleScene,
  cost: CostScene,
  panel: PanelScene,
  code: CodeScene,
  outro: OutroScene,
};
