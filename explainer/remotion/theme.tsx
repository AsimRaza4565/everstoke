import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// ---- Design system (flat JSM-style: cream / ink / orange) ----
export const C = {
  bg: "#FAF3EB",
  ink: "#17120D",
  accent: "#E8542F",
  muted: "#8A8177",
  card: "#FFFDF9",
  line: "#E8DCCB",
  green: "#2E7D5B",
  red: "#C43D2B",
  ghost: "#EFE4D4",
};

export const FONT = "Inter, Arial, sans-serif";

export const Eyebrow: React.FC<{ text: string; color?: string }> = ({ text, color = C.muted }) => (
  <div
    style={{
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: 26,
      letterSpacing: "0.28em",
      textTransform: "uppercase",
      color,
    }}
  >
    {text}
  </div>
);

export const Chip: React.FC<{ text: string; color?: string; bg?: string; delay?: number }> = ({
  text,
  color = C.ink,
  bg = C.card,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <div
      style={{
        transform: `scale(${s})`,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 28,
        color,
        background: bg,
        border: `3px solid ${color}`,
        borderRadius: 999,
        padding: "12px 34px",
        letterSpacing: "0.06em",
        opacity: s,
      }}
    >
      {text}
    </div>
  );
};

// Splits text into words and staggers them in; `highlight` gets accent color.
export const BigText: React.FC<{
  text: string;
  highlight?: string;
  size?: number;
  weight?: number;
  color?: string;
  start?: number;
  align?: string;
}> = ({ text, highlight, size = 110, weight = 900, color = C.ink, start = 4, align = "center" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1.12,
        letterSpacing: "-0.03em",
        color,
        textAlign: align as any,
        maxWidth: 1500,
      }}
    >
      {words.map((w, i) => {
        const s = spring({ frame: frame - start - i * 1.6, fps, config: { damping: 200 } });
        const isHot = highlight && w.replace(/[^A-Za-z0-9$]/g, "").toLowerCase() === highlight.replace(/[^A-Za-z0-9$]/g, "").toLowerCase();
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.28em",
              opacity: s,
              transform: `translateY(${(1 - s) * 26}px)`,
              color: isHot ? C.accent : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// ---- Flat icon set (hand-drawn SVG, stroke style) ----
type IconProps = { size?: number; color?: string; style?: React.CSSProperties };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 100 100", fill: "none" as const });

export const ServerIcon: React.FC<IconProps> = ({ size = 200, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    {[6, 38, 70].map((y) => (
      <g key={y}>
        <rect x="10" y={y} width="80" height="26" rx="6" stroke={color} strokeWidth="6" fill={C.card} />
        <circle cx="26" cy={y + 13} r="5" fill={color} />
        <line x1="42" y1={y + 13} x2="80" y2={y + 13} stroke={color} strokeWidth="5" strokeLinecap="round" />
      </g>
    ))}
  </svg>
);

export const DbIcon: React.FC<IconProps> = ({ size = 200, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <ellipse cx="50" cy="22" rx="38" ry="13" stroke={color} strokeWidth="6" fill={C.card} />
    <path d="M12 22 v56 c0 7 17 13 38 13 s38 -6 38 -13 v-56" stroke={color} strokeWidth="6" fill={C.card} />
    <path d="M12 50 c0 7 17 13 38 13 s38 -6 38 -13" stroke={color} strokeWidth="5" fill="none" />
  </svg>
);

export const UserIcon: React.FC<IconProps> = ({ size = 48, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <circle cx="50" cy="32" r="18" stroke={color} strokeWidth="7" fill="none" />
    <path d="M18 86 c4 -22 20 -30 32 -30 s28 8 32 30" stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" />
  </svg>
);

export const BoltIcon: React.FC<IconProps> = ({ size = 100, color = C.accent, style }) => (
  <svg {...base(size)} style={style}>
    <polygon points="58,8 22,56 46,56 40,92 78,42 52,42" fill={color} stroke="none" />
  </svg>
);

export const AlertIcon: React.FC<IconProps> = ({ size = 100, color = C.red, style }) => (
  <svg {...base(size)} style={style}>
    <path d="M50 12 L92 84 H8 Z" stroke={color} strokeWidth="6" fill={C.card} strokeLinejoin="round" />
    <line x1="50" y1="40" x2="50" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round" />
    <circle cx="50" cy="72" r="4.5" fill={color} />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ size = 100, color = C.green, style }) => (
  <svg {...base(size)} style={style}>
    <polyline points="18,54 40,74 82,26" stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SplitIcon: React.FC<IconProps> = ({ size = 100, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <line x1="14" y1="50" x2="46" y2="50" stroke={color} strokeWidth="8" strokeLinecap="round" />
    <path d="M46 50 C64 50 60 24 84 22" stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />
    <path d="M46 50 C64 50 60 76 84 78" stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />
    <polygon points="84,14 92,22 82,30" fill={color} />
    <polygon points="84,70 92,78 82,86" fill={color} />
  </svg>
);

export const PhoneIcon: React.FC<IconProps> = ({ size = 100, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <rect x="30" y="8" width="40" height="84" rx="9" stroke={color} strokeWidth="6" fill={C.card} />
    <line x1="42" y1="16" x2="58" y2="16" stroke={color} strokeWidth="5" strokeLinecap="round" />
    <rect x="38" y="28" width="24" height="16" rx="4" fill={color} opacity="0.85" />
    <rect x="38" y="50" width="24" height="5" rx="2.5" fill={color} opacity="0.5" />
    <rect x="38" y="61" width="18" height="5" rx="2.5" fill={color} opacity="0.5" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ size = 100, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <circle cx="50" cy="54" r="36" stroke={color} strokeWidth="6" fill={C.card} />
    <line x1="50" y1="54" x2="50" y2="32" stroke={color} strokeWidth="6" strokeLinecap="round" />
    <line x1="50" y1="54" x2="66" y2="62" stroke={color} strokeWidth="6" strokeLinecap="round" />
    <line x1="40" y1="10" x2="60" y2="10" stroke={color} strokeWidth="6" strokeLinecap="round" />
    <line x1="50" y1="10" x2="50" y2="18" stroke={color} strokeWidth="6" />
  </svg>
);

export const DocIcon: React.FC<IconProps> = ({ size = 100, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <path d="M25 10 h34 l16 16 v64 h-50 z" stroke={color} strokeWidth="6" fill={C.card} strokeLinejoin="round" />
    <path d="M59 10 v16 h16" stroke={color} strokeWidth="6" fill="none" strokeLinejoin="round" />
    <line x1="35" y1="44" x2="65" y2="44" stroke={color} strokeWidth="5" strokeLinecap="round" />
    <line x1="35" y1="58" x2="65" y2="58" stroke={color} strokeWidth="5" strokeLinecap="round" />
    <line x1="35" y1="72" x2="53" y2="72" stroke={color} strokeWidth="5" strokeLinecap="round" />
  </svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ size = 100, color = C.ink, style }) => (
  <svg {...base(size)} style={style}>
    <circle cx="50" cy="50" r="38" stroke={color} strokeWidth="6" fill={C.card} />
    <ellipse cx="50" cy="50" rx="18" ry="38" stroke={color} strokeWidth="5" fill="none" />
    <line x1="12" y1="50" x2="88" y2="50" stroke={color} strokeWidth="5" />
    <path d="M20 28 c18 10 42 10 60 0" stroke={color} strokeWidth="5" fill="none" />
    <path d="M20 72 c18 -10 42 -10 60 0" stroke={color} strokeWidth="5" fill="none" />
  </svg>
);

// Animated connector between two points: draws itself in, then traffic dots
// flow along it, ending in a direction arrowhead. All geometry is exact.
export const Connector: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  delay?: number; drawFrames?: number; dots?: number; speed?: number;
  color?: string; dotColor?: string; arrow?: boolean; thickness?: number;
}> = ({ x1, y1, x2, y2, delay = 0, drawFrames = 20, dots = 3, speed = 0.18, color = C.ink, dotColor = C.accent, arrow = true, thickness = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const p = interpolate(frame, [delay, delay + drawFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const arrowS = spring({ frame: frame - delay - drawFrames + 2, fps, config: { damping: 13, stiffness: 220 } });
  const dotStart = delay + drawFrames + 3;
  return (
    <g>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={thickness} strokeLinecap="round"
        opacity={0.3} pathLength={1}
        strokeDasharray={1} strokeDashoffset={1 - p}
      />
      {arrow ? (
        <g transform={`translate(${x2} ${y2}) rotate(${angle})`} opacity={arrowS} transform-origin={`${-2} 0`}>
          <g transform={`scale(${Math.max(arrowS, 0.001)})`}>
            <polygon points="0,0 -15,-8.5 -15,8.5" fill={color} transform="translate(-1 0)" />
          </g>
        </g>
      ) : null}
      {Array.from({ length: dots }).map((_, i) => {
        const raw = ((frame - dotStart) * speed + i / dots) % 1;
        const t = ((raw % 1) + 1) % 1;
        const visible = frame >= dotStart && t <= p;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        return <circle key={i} cx={x} cy={y} r={7.5} fill={dotColor} opacity={visible ? 0.95 : 0} />;
      })}
    </g>
  );
};

// Small standalone arrow used in flow rows (outro recap).
export const FlowArrow: React.FC<{ delay?: number }> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const headS = spring({ frame: frame - delay - 12, fps, config: { damping: 13, stiffness: 220 } });
  return (
    <svg width="84" height="40" viewBox="0 0 84 40" style={{ display: "block" }}>
      <line x1="4" y1="20" x2="64" y2="20" stroke={C.accent} strokeWidth="6" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
      <g opacity={headS} transform={`translate(66 20) scale(${Math.max(headS, 0.001)})`}>
        <polygon points="14,0 -6,-11 -6,11" fill={C.accent} />
      </g>
    </svg>
  );
};

// Small standalone arrow used in flow rows (outro recap).
export const SceneCanvas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
    {children}
  </svg>
);

// Layout helpers
export const SceneFrame: React.FC<{ children: React.ReactNode; eyebrow?: string }> = ({ children, eyebrow }) => (
  <AbsoluteFill style={{ background: C.bg, padding: "90px 140px", fontFamily: FONT }}>
    {eyebrow ? (
      <div style={{ position: "absolute", top: 84, left: 140 }}>
        <Eyebrow text={eyebrow} />
      </div>
    ) : null}
    {children}
  </AbsoluteFill>
);

export const usePop = (delay = 0, damping = 16) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness: 150 } });
};

export const useFadeEdge = (beatMs?: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = ((beatMs ?? 10000) / 1000) * fps;
  return interpolate(frame, [0, 8, total - 6, total], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};
