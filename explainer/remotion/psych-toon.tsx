import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  Easing,
} from "remotion";

// ---------------------------------------------------------------------------
// PsychToon v2 — hand-drawn "stick figure explainer" style engine.
// Motion grammar measured from the reference (see research doc):
//  - hard cuts every 2.5–6s, each shot a new composition
//  - "line boil": wobbly hand-drawn lines that re-jitter every ~4 frames
//  - framed vignettes on paper with big handwritten captions above
//  - characters emote (brows, O-mouth, sweat marks) and change pose mid-shot
//  - props appear exactly when narration names them (word-synced actions)
//  - micro-motion holds: blink, breathing, arm sway — never frozen stills
// ---------------------------------------------------------------------------

const INK = "#2f2b26";
const PAPER = "#f2e8d5";
const WOOD = "#a9743f";
const WOOD_DARK = "#7d5528";
const PROP_PAPER = "#f8f2e2";

const PALETTES: [string, string][] = [
  ["#e6c368", "#bf5f45"], // mustard / rust
  ["#b4c49c", "#d8c29c"], // sage / tan
  ["#e7dcc0", "#7d9d8e"], // cream / teal
  ["#cf7f4e", "#e5d3a0"], // terra / sand
  ["#8fa79f", "#d8c29c"], // teal-grey / tan
  ["#e5d3a0", "#b0613f"], // sand / rust
];

const SHIRTS = ["#c96f4a", "#5f8f8a", "#d9a441", "#6c7f9b", "#7c9a5e", "#b0523d"];

// ---- fonts ----------------------------------------------------------------

let fontsLoaded = false;
const ensureFonts = () => {
  if (fontsLoaded) return;
  fontsLoaded = true;
  for (const [family, file] of [
    ["Patrick Hand", "fonts/PatrickHand-Regular.ttf"],
    ["Caveat", "fonts/Caveat.ttf"],
  ] as [string, string][]) {
    const handle = delayRender(`font ${family}`);
    const face = new FontFace(family, `url(${staticFile(file)})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }
};

// ---- spec types ------------------------------------------------------------

export type PsychMood = "calm" | "happy" | "worried" | "shocked" | "sad";

export type PsychAction = {
  at?: number; // seconds within scene (baked by orchestrator from `word`)
  word?: string; // narration word trigger (orchestrator resolves to `at`)
  char?: number; // char index for pose/mood change
  pose?: string;
  mood?: PsychMood;
  prop?: number; // prop index to reveal at this moment
};

export type PsychProp = {
  t: string;
  x?: number;
  y?: number;
  s?: number;
  text?: string;
  color?: string;
  delay?: number;
  front?: boolean;
  hideUntil?: number; // seconds within scene (baked from actions)
};

export type PsychChar = {
  pose:
    | "stand"
    | "walk"
    | "sit"
    | "write"
    | "read"
    | "point"
    | "think"
    | "celebrate"
    | "shrug"
    | "carry"
    | "phone"
    | "lean";
  x?: number;
  y?: number;
  shirt?: number | string;
  flip?: boolean;
  s?: number;
  face?: boolean;
  mood?: PsychMood;
  delay?: number;
};

export type PsychScene = {
  audio?: string | null;
  ms: number;
  startMs?: number;
  set?: "room" | "field" | "night" | "textcard";
  palette?: number;
  frame?: "full" | "vignette";
  caption?: string; // big handwritten caption above a vignette frame
  label?: { text: string; y?: number; size?: number };
  signText?: string;
  cardText?: string;
  floorTiles?: boolean;
  props?: PsychProp[];
  chars?: PsychChar[];
  actions?: PsychAction[];
  zoom?: "in" | "out";
};

export type PsychDoc = {
  title?: string;
  fps: number;
  width: number;
  height: number;
  totalMs: number;
  music?: { src: string; volume?: number } | null;
  scenes: PsychScene[];
};

// ---- primitives ------------------------------------------------------------

const Line = ({
  d,
  w = 4,
  color = INK,
}: {
  d: string;
  w?: number;
  color?: string;
}) => <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;

const O = ({
  cx,
  cy,
  rx,
  ry,
  fill,
  stroke = INK,
  sw = 4,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  stroke?: string | null;
  sw?: number;
}) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke ?? "none"} strokeWidth={sw} />;

const Box = ({
  x,
  y,
  w,
  h,
  fill,
  stroke = INK,
  sw = 4,
  rx = 4,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke?: string | null;
  sw?: number;
  rx?: number;
}) => <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke ?? "none"} strokeWidth={sw} />;

// ---- character rig ---------------------------------------------------------

// returns {pose, mood, changedAtFrame} given scene actions
const resolveCharState = (
  base: PsychChar,
  actions: PsychAction[] | undefined,
  localT: number,
  fps: number
): { pose: PsychChar["pose"]; mood: PsychMood; changedAt: number } => {
  let pose = base.pose;
  let mood = (base.mood ?? "calm") as PsychMood;
  let changedAt = -100;
  for (const a of actions ?? []) {
    if (a.char === undefined || a.at === undefined) continue;
    if (localT + 1e-6 >= a.at && (a.pose || a.mood)) {
      if (a.pose) pose = a.pose as PsychChar["pose"];
      if (a.mood) mood = a.mood;
      changedAt = a.at;
    }
  }
  return { pose, mood, changedAt: changedAt * fps };
};

const Face: React.FC<{ mood: PsychMood; blink: boolean }> = ({ mood, blink }) => {
  const eyeY = -208;
  if (mood === "calm") {
    return (
      <g>
        {blink ? (
          <Line d={`M -19 ${eyeY} L -11 ${eyeY} M 11 ${eyeY} L 19 ${eyeY}`} w={3.5} />
        ) : (
          <>
            <O cx={-15} cy={eyeY} rx={3.4} ry={4.6} fill={INK} sw={0} />
            <O cx={15} cy={eyeY} rx={3.4} ry={4.6} fill={INK} sw={0} />
          </>
        )}
        <Line d="M -12 -184 Q 0 -176 12 -184" w={3.5} />
      </g>
    );
  }
  if (mood === "happy") {
    return (
      <g>
        {blink ? (
          <Line d={`M -21 ${eyeY - 4} L -9 ${eyeY - 4} M 9 ${eyeY - 4} L 21 ${eyeY - 4}`} w={3.5} />
        ) : (
          <>
            <O cx={-15} cy={eyeY - 4} rx={3.6} ry={4.4} fill={INK} sw={0} />
            <O cx={15} cy={eyeY - 4} rx={3.6} ry={4.4} fill={INK} sw={0} />
          </>
        )}
        <Line d="M -22 -222 L -10 -218 M 10 -218 L 22 -222" w={3.5} />
        <Line d="M -16 -184 Q 0 -170 16 -184" w={4} />
      </g>
    );
  }
  if (mood === "worried") {
    return (
      <g>
        <O cx={-15} cy={eyeY - 2} rx={3.4} ry={4.4} fill={INK} sw={0} />
        <O cx={15} cy={eyeY - 2} rx={3.4} ry={4.4} fill={INK} sw={0} />
        <Line d="M -24 -224 L -10 -219 M 10 -219 L 24 -224" w={3.5} />
        <Line d="M -13 -180 Q 0 -187 13 -180" w={3.5} />
      </g>
    );
  }
  if (mood === "shocked") {
    return (
      <g>
        <O cx={-15} cy={eyeY - 10} rx={4} ry={5.2} fill={INK} sw={0} />
        <O cx={15} cy={eyeY - 10} rx={4} ry={5.2} fill={INK} sw={0} />
        <Line d="M -25 -232 L -11 -226 M 11 -226 L 25 -232" w={3.5} />
        <O cx={0} cy={-180} rx={8} ry={11} fill={INK} sw={0} />
        {/* shock sparks */}
        <Line d="M -50 -262 L -58 -276 M 46 -260 L 55 -272 M 0 -276 L 0 -290" w={4} />
      </g>
    );
  }
  // sad
  return (
    <g>
      <O cx={-15} cy={eyeY} rx={3.4} ry={4.6} fill={INK} sw={0} />
      <O cx={15} cy={eyeY} rx={3.4} ry={4.6} fill={INK} sw={0} />
      <Line d="M -24 -216 L -10 -221 M 10 -221 L 24 -216" w={3.5} />
      <Line d="M -12 -178 Q 0 -187 12 -178" w={3.5} />
    </g>
  );
};

const Char: React.FC<PsychChar & { f: number; actions?: PsychAction[]; localT: number; fps: number }> = ({
  x = 960,
  y = 810,
  shirt = 0,
  flip,
  s = 1,
  face,
  f,
  actions,
  localT,
  fps,
  ...rest
}) => {
  const { pose, mood, changedAt } = resolveCharState(rest as PsychChar, actions, localT, fps);
  const shirtColor = typeof shirt === "number" ? SHIRTS[shirt % SHIRTS.length] : shirt;
  const bob = Math.sin(f / 28) * 2.5;
  const sway = Math.sin(f / 17) * 2.5; // idle arm micro-motion
  const swing = Math.sin(f / 7) * 16; // walk cycle
  const blink = f % 78 < 2 || f % 91 < 2;
  const armW = 4.5;

  // squash on pose change (puppet snap)
  const since = f - changedAt;
  const squash =
    since >= 0 && since < 8
      ? 1 + Math.sin((since / 8) * Math.PI) * 0.06 * (since < 4 ? 1 : -1)
      : 1;

  let armL: [number, number] = [-34 + sway, -62];
  let armR: [number, number] = [34 + sway, -62];
  let extra: React.ReactNode = null;
  let legsOverride: [string, string] | null = null;

  switch (pose) {
    case "walk":
      armL = [-34 + swing * 0.6, -62];
      armR = [34 - swing * 0.6, -62];
      legsOverride = [`M -10 -84 L ${-16 + swing} 0`, `M 10 -84 L ${16 - swing} 0`];
      break;
    case "point":
      armR = [88, -118];
      break;
    case "think":
      armR = [34, -168];
      armL = [-38, -70];
      break;
    case "celebrate":
      armL = [-58, -232];
      armR = [58, -232];
      break;
    case "shrug":
      armL = [-52, -132];
      armR = [52, -132];
      break;
    case "carry":
      armR = [40, -70];
      armL = [-40, -70];
      extra = <Box x={-52} y={-108} w={104} h={40} fill={WOOD} sw={4} rx={4} />;
      break;
    case "phone":
      armR = [46, -108];
      extra = (
        <g>
          <Box x={38} y={-132} w={26} h={44} fill={INK} rx={6} sw={0} />
          <Box x={42} y={-128} w={18} h={32} fill="#cfe3dd" rx={2} sw={0} />
        </g>
      );
      break;
    case "lean":
      // standing, leaning on the desk with one arm
      armR = [74, -78];
      break;
    case "write":
      armR = [58, -96];
      armL = [-30, -66];
      legsOverride = ["M -10 -92 L -34 -92 L -34 -4", "M 10 -92 L 22 -92 L 34 -30 L 40 -2"];
      extra = (
        <g>
          <Line d={`M 58 -96 L ${58 + Math.sin(f / 5) * 4} -108`} w={4} />
          <Box x={30 - 64} y={-118} w={64} h={46} fill={PROP_PAPER} sw={4} rx={3} />
        </g>
      );
      break;
    case "read":
      armR = [34, -124];
      armL = [-34, -124];
      extra = (
        <g transform={`rotate(${-4 + Math.sin(f / 33) * 2} 0 -120)`}>
          <Box x={-34} y={-148} w={68} h={48} fill={PROP_PAPER} sw={4} rx={4} />
          <Line d="M -22 -134 L 22 -134" w={3} />
          <Line d="M -22 -122 L 22 -122" w={3} />
          <Line d="M -22 -110 L 12 -110" w={3} />
        </g>
      );
      legsOverride = ["M -10 -92 L -34 -92 L -34 -4", "M 10 -92 L 22 -92 L 34 -30 L 40 -2"];
      break;
    case "sit":
      legsOverride = ["M -10 -92 L -34 -92 L -34 -4", "M 10 -92 L 22 -92 L 34 -30 L 40 -2"];
      break;
    default:
      break;
  }

  return (
    <g transform={`translate(${x} ${y}) scale(${(flip ? -1 : 1) * s * 1} ${s * squash}) translate(0 ${bob})`}>
      {legsOverride ? (
        <>
          <Line d={legsOverride[0]} w={armW} />
          <Line d={legsOverride[1]} w={armW} />
        </>
      ) : (
        <>
          <Line d={`M -10 -84 L -16 0`} w={armW} />
          <Line d={`M 10 -84 L 16 0`} w={armW} />
        </>
      )}
      <Box x={-26} y={-156} w={52} h={76} fill={shirtColor} rx={18} sw={4.5} />
      <Line d={`M -22 -138 L ${armL[0]} ${armL[1]}`} w={armW} />
      <Line d={`M 22 -138 L ${armR[0]} ${armR[1]}`} w={armW} />
      <g transform={`rotate(${Math.sin(f / 45) * 1.6} 0 -190)`}>
        <Line d="M 0 -156 L 0 -148" w={5} />
        <O cx={0} cy={-206} rx={54} ry={58} fill="#faf5e8" sw={4.5} />
        {face && <Face mood={mood} blink={blink} />}
      </g>
      {extra}
    </g>
  );
};

// ---- props -----------------------------------------------------------------

const Prop: React.FC<PsychProp & { f: number }> = ({ t, x = 960, y = 810, s = 1, text, color, f }) => {
  let el: React.ReactNode = null;
  switch (t) {
    case "desk":
      el = (
        <g>
          <Box x={-235} y={-172} w={470} h={26} fill={WOOD} sw={4.5} rx={6} />
          <Line d="M -205 -146 L -205 0 M 205 -146 L 205 0 M -190 -60 L 190 -60" w={10} />
          <Line d="M -205 -146 L -205 0" w={11} color={WOOD_DARK} />
          <Line d="M 205 -146 L 205 0" w={11} color={WOOD_DARK} />
        </g>
      );
      break;
    case "sideDesk":
      // perspective desk, viewed from the side (like the reference writing scene)
      el = (
        <g>
          <path d="M -250 -158 L 250 -176 L 250 -136 L -250 -120 Z" fill={WOOD} stroke={INK} strokeWidth={4.5} />
          <Line d="M -215 -132 L -230 0" w={12} color={WOOD_DARK} />
          <Line d="M 215 -150 L 228 0" w={12} color={WOOD_DARK} />
          <Line d="M -170 -56 L 195 -70" w={9} color={WOOD_DARK} />
        </g>
      );
      break;
    case "chair":
      el = (
        <g>
          <Box x={-38} y={-64} w={76} h={16} fill={WOOD} sw={4} rx={4} />
          <Box x={30} y={-172} w={12} h={110} fill={WOOD} sw={4} rx={5} />
          <Line d="M -30 -48 L -30 0 M 30 -48 L 30 0" w={8} color={WOOD_DARK} />
        </g>
      );
      break;
    case "stool":
      el = (
        <g>
          <Box x={-36} y={-70} w={72} h={14} fill={WOOD} sw={4} rx={4} />
          <Line d="M -26 -56 L -32 0 M 26 -56 L 32 0" w={7} color={WOOD_DARK} />
        </g>
      );
      break;
    case "books":
      el = (
        <g>
          <Box x={-42} y={-26} w={84} h={26} fill={color ?? "#b0523d"} sw={4} rx={3} />
          <Box x={-36} y={-50} w={72} h={24} fill={color ?? "#5f8f8a"} sw={4} rx={3} />
          <Box x={-30} y={-72} w={60} h={22} fill={color ?? "#d9a441"} sw={4} rx={3} />
        </g>
      );
      break;
    case "paperStack":
      el = (
        <g>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Box key={i} x={-40 + (i % 2) * 4} y={-18 - i * 12} w={82 - (i % 3) * 5} h={12} fill={PROP_PAPER} sw={3.5} rx={2} />
          ))}
        </g>
      );
      break;
    case "note":
      // paper with a big word on it (like the reference's FINAL EXAM)
      el = (
        <g transform="rotate(-3)">
          <Box x={-52} y={-70} w={104} h={72} fill={color ?? "#cfe3dd"} sw={4.5} rx={3} />
          {(text ?? "NOTE").toUpperCase().split("\n").map((ln, i, arr) => (
            <text key={i} x={0} y={-70 + 40 + (i - (arr.length - 1) / 2) * 24} textAnchor="middle" fontFamily="Patrick Hand" fontSize={22} fill={INK}>
              {ln}
            </text>
          ))}
        </g>
      );
      break;
    case "sign":
      el = (
        <g>
          <Line d="M -60 0 L -60 -170 M 60 0 L 60 -170" w={10} color={WOOD_DARK} />
          <Box x={-190} y={-290} w={380} h={130} fill={PROP_PAPER} sw={5} rx={8} />
          {(text ?? "").toUpperCase().split("\n").map((ln, i, arr) => (
            <text
              key={i}
              x={0}
              y={-290 + 130 / 2 + 6 + (i - (arr.length - 1) / 2) * 44}
              textAnchor="middle"
              fontFamily="Patrick Hand"
              fontSize={44}
              fill={INK}
            >
              {ln}
            </text>
          ))}
        </g>
      );
      break;
    case "calendar": {
      const [title, xed] = (text ?? "9 DAYS|12").split("|");
      el = (
        <g>
          <Box x={-130} y={-210} w={260} h={210} fill={PROP_PAPER} sw={5} rx={6} />
          <text x={0} y={-172} textAnchor="middle" fontFamily="Patrick Hand" fontSize={40} fill={INK}>
            {title.toUpperCase()}
          </text>
          {Array.from({ length: 28 }).map((_, i) => {
            const col = i % 7;
            const row = Math.floor(i / 7);
            const cx = -112 + col * 37;
            const cy = -148 + row * 40;
            const isX = i < Number(xed || 0);
            return (
              <g key={i}>
                <Box x={cx} y={cy} w={30} h={32} fill={isX ? "#e8d8b8" : "#ffffff"} sw={2.5} rx={2} />
                {isX && <Line d={`M ${cx + 5} ${cy + 5} L ${cx + 25} ${cy + 27} M ${cx + 25} ${cy + 5} L ${cx + 5} ${cy + 27}`} w={3.5} />}
              </g>
            );
          })}
        </g>
      );
      break;
    }
    case "clockBig":
      el = (
        <g>
          <Line d="M -26 0 L 0 -96 L 26 0" w={9} color={WOOD_DARK} />
          <O cx={0} cy={-166} rx={78} ry={78} fill={PROP_PAPER} sw={5.5} />
          <Line d={`M 0 -166 L 0 -216 M 0 -166 L ${34 + Math.sin(f / 40) * 3} -150`} w={6} />
        </g>
      );
      break;
    case "clocks":
      el = (
        <g>
          <O cx={-30} cy={-40} rx={42} ry={42} fill={PROP_PAPER} />
          <O cx={38} cy={-58} rx={46} ry={46} fill={PROP_PAPER} />
          <O cx={-4} cy={-118} rx={48} ry={48} fill={PROP_PAPER} />
          <Line d="M -92 -160 L 84 6" w={13} />
          <Line d="M -88 0 L 80 -166" w={13} />
        </g>
      );
      break;
    case "blackboard":
      el = (
        <g>
          <Box x={-190} y={-230} w={380} h={180} fill="#5f574e" sw={6} rx={4} />
          <Box x={-170} y={-210} w={150} h={70} fill={color ?? "#d9a441"} sw={0} rx={2} opacity={0.5} />
          <Line d="M -160 -110 L 40 -104" w={4} color="#ffffff" opacity={0.55} />
          <Line d="M -160 -80 L 80 -76" w={4} color="#ffffff" opacity={0.4} />
        </g>
      );
      break;
    case "shelf":
      el = (
        <g>
          <Line d="M -90 -8 L 90 -12" w={9} color={WOOD_DARK} />
          <path d="M -30 -8 Q -40 -50 0 -54 Q 40 -50 30 -8 Z" fill={color ?? "#8f8577"} stroke={INK} strokeWidth={4} />
        </g>
      );
      break;
    case "loop":
      el = (
        <g>
          {[0, 120, 240].map((a) => (
            <g key={a} transform={`rotate(${a + f / 2.2} 0 -90)`}>
              <path d="M 0 -172 A 82 82 0 0 1 71 -49" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
              <path d="M 71 -49 L 46 -58 M 71 -49 L 66 -76" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
            </g>
          ))}
        </g>
      );
      break;
    case "phone":
      el = (
        <g>
          <Box x={-24} y={-64} w={48} h={84} fill={INK} rx={9} sw={0} />
          <Box x={-17} y={-56} w={34} h={60} fill="#cfe3dd" rx={3} sw={0} />
          <Line d="M -60 -140 Q 0 -190 60 -140" w={4} opacity={0.5 + Math.sin(f / 6) * 0.4} />
          <Line d="M -70 -170 Q 0 -230 70 -170" w={4} opacity={0.3 + Math.sin(f / 6 + 1) * 0.3} />
        </g>
      );
      break;
    case "snack":
      el = (
        <g>
          <Box x={-44} y={-40} w={88} h={40} fill={color ?? "#b0523d"} sw={4} rx={8} />
          <Line d="M -44 -20 L 44 -20" w={3} color="#00000033" />
        </g>
      );
      break;
    case "brain":
      el = (
        <g>
          <path
            d="M -90 -60 Q -110 -130 -40 -140 Q -10 -185 50 -160 Q 110 -165 100 -100 Q 130 -50 70 -30 Q 40 0 -20 -14 Q -80 -8 -90 -60 Z"
            fill="#e8b294"
            stroke={INK}
            strokeWidth={5}
          />
          <Line d="M -40 -135 Q -20 -100 -45 -60 M 10 -158 Q 30 -110 5 -60 M 55 -152 Q 70 -110 50 -45" w={3.5} />
        </g>
      );
      break;
    case "blocks":
      el = (
        <g>
          <Box x={-92} y={-52} w={92} h={52} fill="#b0523d" sw={4.5} />
          <Box x={0} y={-52} w={92} h={52} fill="#5f8f8a" sw={4.5} />
          <Box x={-46} y={-104} w={92} h={52} fill="#d9a441" sw={4.5} />
          <Box x={-23} y={-156} w={46} h={52} fill="#7c9a5e" sw={4.5} />
        </g>
      );
      break;
    case "plant":
      el = (
        <g>
          <path d="M -26 -46 L 26 -46 L 18 0 L -18 0 Z" fill="#b0523d" stroke={INK} strokeWidth={4} />
          <Line d="M 0 -46 L 0 -96" w={4} color="#5c7a4a" />
          {[[-1, -70], [1, -78], [-1, -90]].map(([dir, yy], i) => (
            <path key={i} d={`M 0 ${yy} Q ${dir * 34} ${yy - 16} ${dir * 40} ${yy - 40} Q ${dir * 12} ${yy - 34} 0 ${yy}`} fill="#7c9a5e" stroke={INK} strokeWidth={3} />
          ))}
        </g>
      );
      break;
    case "window":
      el = (
        <g>
          <Box x={-80} y={-190} w={160} h={150} fill="#cfe3dd" sw={5} rx={4} />
          <Line d="M 0 -190 L 0 -40 M -80 -115 L 80 -115" w={4} />
          <Box x={-92} y={-40} w={184} h={12} fill={WOOD} sw={4} rx={3} />
        </g>
      );
      break;
    case "door":
      el = (
        <g>
          <Box x={-62} y={-196} w={124} h={196} fill={WOOD} sw={5} rx={3} />
          <O cx={38} cy={-100} rx={7} ry={7} fill={INK} sw={0} />
        </g>
      );
      break;
    case "rug":
      el = <O cx={0} cy={0} rx={210} ry={34} fill={color ?? "#c96f4a"} stroke={INK} sw={4} />;
      break;
    case "tree":
      el = (
        <g>
          <Line d="M 0 0 L 0 -70" w={9} color={WOOD_DARK} />
          <O cx={0} cy={-118} rx={62} ry={62} fill={color ?? "#8aa572"} sw={4.5} />
        </g>
      );
      break;
    case "flag":
      el = (
        <g>
          <Line d="M 0 0 L 0 -190" w={7} />
          <path d="M 0 -190 L 110 -168 L 0 -146 Z" fill={color ?? "#b0523d"} stroke={INK} strokeWidth={4} />
        </g>
      );
      break;
    case "road":
      el = (
        <g>
          <path
            d="M -700 0 C -420 -140 -160 -60 40 -150 C 240 -240 480 -180 700 -240"
            fill="none"
            stroke="#c9b691"
            strokeWidth={64}
            strokeLinecap="round"
          />
          <path
            d="M -700 0 C -420 -140 -160 -60 40 -150 C 240 -240 480 -180 700 -240"
            fill="none"
            stroke="#ffffff"
            strokeWidth={4}
            strokeDasharray="26 30"
            opacity={0.7}
          />
        </g>
      );
      break;
    case "moon":
      el = (
        <g>
          <Box x={-1920} y={-1080} w={3840} h={260} fill="#232c3d" sw={0} />
          <path d="M 1250 -160 A 34 34 0 1 0 1250 -110 A 27 27 0 1 1 1250 -160" fill="#f0e3b2" />
          {[980, 1090, 1360, 1470, 1600].map((sx, i) => (
            <O key={i} cx={sx} cy={-140 + (i % 3) * 40} rx={4} ry={4} fill="#f0e3b2" sw={0} />
          ))}
        </g>
      );
      break;
    default:
      el = null;
  }
  return <g transform={`translate(${x} ${y}) scale(${s})`}>{el}</g>;
};

// ---- sets ------------------------------------------------------------------

const SetBg: React.FC<{ set: string; palette: number; floorTiles?: boolean }> = ({ set, palette, floorTiles }) => {
  const [wall, floor] = PALETTES[palette % PALETTES.length];
  if (set === "textcard") {
    // textcard is rendered in HTML context, not inside sceneSvg
    return null;
  }
  // SVG-native bands (HTML divs don't paint inside <svg>)
  return (
    <g>
      <rect x={-120} y={-120} width={2160} height={963} fill={wall} />
      <rect x={-120} y={843} width={2160} height={477} fill={floor} />
      <rect x={-120} y={835} width={2160} height={10} fill="#00000018" />
      {floorTiles && (
        <g stroke="#00000022" strokeWidth={4}>
          {Array.from({ length: 7 }).map((_, i) => (
            <line key={i} x1={-200 + i * 400} y1={843} x2={-500 + i * 620} y2={1080} />
          ))}
          <line x1={0} y1={930} x2={1920} y2={930} stroke="#00000018" strokeWidth={3} />
          <line x1={0} y1={1000} x2={1920} y2={1000} stroke="#00000015" strokeWidth={3} />
        </g>
      )}
      {set === "night" && <Prop t="moon" x={960} y={0} f={0} />}
    </g>
  );
};

// ---- grain + vignette ------------------------------------------------------

const Grain: React.FC = () => (
  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <filter id="papergrain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={7} result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#papergrain)" opacity={0.07} />
    <radialGradient id="vig" cx="50%" cy="46%" r="75%">
      <stop offset="70%" stopColor="#000" stopOpacity={0} />
      <stop offset="100%" stopColor="#000" stopOpacity={0.14} />
    </radialGradient>
    <rect width="100%" height="100%" fill="url(#vig)" />
  </svg>
);

// ---- scene -----------------------------------------------------------------

const PsychSceneView: React.FC<{ scene: PsychScene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const localT = frame / fps;
  const set = scene.set ?? "room";
  const palette = scene.palette ?? index % PALETTES.length;
  const frameKind = scene.frame ?? (set === "textcard" ? "full" : "full");
  const boilSeed = 11 + (Math.floor(frame / 4) % 3) * 17;

  const pop = (d = 0) =>
    spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 130, mass: 0.7 } });

  // camera: zoom punch on cut, then slow push + drift + tiny organic rotate
  const punch = interpolate(frame, [0, 9], [1.055, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: "clamp",
  });
  const push = interpolate(frame, [0, durationInFrames], scene.zoom === "out" ? [1.05, 1] : [1, 1.045], {
    easing: Easing.inOut(Easing.ease),
  });
  const drift = interpolate(frame, [0, durationInFrames], [index % 2 ? -12 : 12, index % 2 ? 12 : -12]);
  const tilt = Math.sin(frame / 150) * 0.25;

  const filterDef = (
    <filter id={`rough${index}`} x="-6%" y="-6%" width="112%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves={2} seed={boilSeed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={5} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  );

  const captionEl = scene.caption ? (
    <text
      x={width / 2}
      y={150}
      textAnchor="middle"
      fontFamily="Patrick Hand"
      fontSize={92}
      fill={INK}
      letterSpacing={4}
      opacity={pop(6)}
      transform={`rotate(-0.6 ${width / 2} 150)`}
    >
      {scene.caption.toUpperCase()}
    </text>
  ) : null;

  // scene content, reusable for full-bleed and vignette-frame layouts
  const sceneSvg = (clipId?: string) => (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0 }}
      clipPath={clipId ? `url(#${clipId})` : undefined}
    >
      <defs>
        {filterDef}
        <clipPath id={`clip${index}`}>
          <rect x={110} y={238} width={1700} height={744} rx={10} />
        </clipPath>
      </defs>
      <SetBg set={set} palette={palette} floorTiles={scene.floorTiles} />
      <g filter={`url(#rough${index})`}>
        {(scene.props ?? [])
          .filter((p) => !p.front && (p.hideUntil === undefined || localT >= p.hideUntil))
          .map((p, i) => {
            const appearAt = p.hideUntil !== undefined ? p.hideUntil * fps : p.delay ?? 6 + i * 5;
            const ps = pop(appearAt);
            return (
              <g key={i} style={{ opacity: ps, transform: `scale(${0.7 + ps * 0.3})`, transformOrigin: `${p.x ?? 960}px ${p.y ?? 810}px` }}>
                <Prop {...p} f={frame} />
              </g>
            );
          })}

        {(scene.chars ?? []).map((c, i) => {
          const cs = pop(c.delay ?? 0);
          return (
            <g key={`c${i}`} style={{ opacity: Math.min(1, cs * 1.2) }}>
              <Char {...c} f={frame} actions={scene.actions} localT={localT} fps={fps} s={(c.s ?? 1) * (0.9 + cs * 0.1)} />
            </g>
          );
        })}

        {scene.signText && <Prop t="sign" x={960} y={810} text={scene.signText} f={frame} />}

        {(scene.props ?? [])
          .filter((p) => p.front && (p.hideUntil === undefined || localT >= p.hideUntil))
          .map((p, i) => {
            const appearAt = p.hideUntil !== undefined ? p.hideUntil * fps : p.delay ?? 6;
            const ps = pop(appearAt);
            return (
              <g key={`f${i}`} style={{ opacity: ps, transform: `scale(${0.7 + ps * 0.3})`, transformOrigin: `${p.x ?? 960}px ${p.y ?? 810}px` }}>
                <Prop {...p} f={frame} />
              </g>
            );
          })}
      </g>
    </svg>
  );

  if (set === "textcard") {
    const s = pop(4);
    const under = interpolate(frame, [12, 34], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
    return (
      <AbsoluteFill style={{ backgroundColor: PAPER }}>
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <filter id={`rough${index}`} x="-6%" y="-6%" width="112%" height="112%">
              <feTurbulence type="fractalNoise" baseFrequency="0.013" numOctaves={2} seed={boilSeed} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <g filter={`url(#rough${index})`}>
            <text
              x={width / 2}
              y={height / 2 + 20}
              textAnchor="middle"
              fontFamily="Patrick Hand"
              fontSize={scene.label?.size ?? 168}
              fill={INK}
              letterSpacing={8}
              opacity={s}
              transform={`scale(${0.92 + s * 0.08})`}
              style={{ transformOrigin: `${width / 2}px ${height / 2}px` }}
            >
              {(scene.cardText ?? "").toUpperCase()}
            </text>
            <path
              d={`M ${width / 2 - 310} ${height / 2 + 70} Q ${width / 2} ${height / 2 + 56} ${width / 2 + 310} ${height / 2 + 72}`}
              fill="none"
              stroke={INK}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={640}
              strokeDashoffset={640 * (1 - under)}
            />
          </g>
        </svg>
        <Grain />
      </AbsoluteFill>
    );
  }

  if (frameKind === "vignette") {
    return (
      <>
        <AbsoluteFill style={{ backgroundColor: PAPER, overflow: "hidden" }}>
          <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
            <defs>
              <clipPath id={`vclip${index}`}>
                <rect x={110} y={238} width={1700} height={744} rx={10} />
              </clipPath>
              <filter id={`innerRough${index}`} x="-3%" y="-3%" width="106%" height="106%">
                <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={boilSeed + 5} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale={7} xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            {captionEl}
            <g transform={`scale(${punch}) rotate(${tilt * 0.4} ${width / 2} ${height / 2})`} style={{ transformOrigin: `${width / 2}px ${height / 2}px` }}>
              {sceneSvg(`vclip${index}`)}
            </g>
            <rect
              x={110}
              y={238}
              width={1700}
              height={744}
              rx={10}
              fill="none"
              stroke={INK}
              strokeWidth={6}
              filter={`url(#innerRough${index})`}
            />
          </svg>
          <Grain />
        </AbsoluteFill>
        {scene.audio && <Audio src={staticFile(scene.audio as string)} />}
      </>
    );
  }

  // full-bleed
  return (
    <>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill
          style={{
            transform: `scale(${punch * push}) translateX(${drift}px) rotate(${tilt}deg)`,
            transformOrigin: "center center",
          }}
        >
          {sceneSvg()}
          {scene.label && (
            <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <defs>
                <filter id={`labRough${index}`} x="-4%" y="-4%" width="108%" height="108%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves={2} seed={boilSeed + 3} result="n" />
                  <feDisplacementMap in="SourceGraphic" in2="n" scale={3} xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </defs>
              <text
                x={width / 2}
                y={(scene.label.y ?? 120) + (scene.label.size ?? 100) * 0.8}
                textAnchor="middle"
                fontFamily="Patrick Hand"
                fontSize={scene.label.size ?? 100}
                fill={INK}
                letterSpacing={4}
                opacity={pop(8)}
                filter={`url(#labRough${index})`}
                transform={`rotate(${-1 + (index % 2) * 2} ${width / 2} ${scene.label.y ?? 120})`}
              >
                {scene.label.text.toUpperCase()}
              </text>
            </svg>
          )}
        </AbsoluteFill>
        <Grain />
      </AbsoluteFill>
      {scene.audio && <Audio src={staticFile(scene.audio as string)} />}
    </>
  );
};

// ---- root -------------------------------------------------------------------

export const PsychToon: React.FC<{ psych?: PsychDoc }> = (raw) => {
  // --props passes the doc raw, merged shallowly over defaultProps (which keeps
  // the empty {psych} key) — so the raw shape must win.
  const psych = (Array.isArray((raw as any).scenes) && (raw as any).scenes.length > 0
    ? (raw as unknown as PsychDoc)
    : raw.psych) as PsychDoc;
  if (!psych || !Array.isArray(psych.scenes) || psych.scenes.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: PAPER }} />;
  }
  ensureFonts();
  const { fps } = useVideoConfig();
  const totalFrames = Math.ceil((psych.totalMs / 1000) * fps);
  const musicVol = psych.music?.volume ?? 0.12;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {psych.scenes.map((s, i) => {
        const start = Math.round(((s.startMs ?? 0) / 1000) * fps);
        const dur = Math.max(1, Math.round((s.ms / 1000) * fps));
        return (
          <Sequence key={i} from={start} durationInFrames={dur}>
            <PsychSceneView scene={s} index={i} />
          </Sequence>
        );
      })}
      {psych.music && (
        <Audio
          src={staticFile(psych.music.src)}
          loop
          volume={(f: number) =>
            f < totalFrames - fps * 2.5 ? musicVol : Math.max(0, musicVol * ((totalFrames - f) / (fps * 2.5)))
          }
        />
      )}
    </AbsoluteFill>
  );
};
