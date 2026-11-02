// Vox-style paper-collage documentary demo (Rachit Singh system, rebuilt on our stack).
// Each beat = one "4s clip": collage elements assemble back-to-front with stop-motion
// (on-twos) motion, then hold as a living poster. No music — narration + paper SFX only.
import React, { useEffect } from "react";
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, continueRender, delayRender,
} from "remotion";

export type VoxBeat = {
  i: number; id: string; text: string; audio: string; img: string | null; card?: boolean;
  label: string | null; stamp: string | null; thread: boolean;
  startMs: number; ms: number;
};
export type VoxDoc = {
  title: string; fps: number; width: number; height: number; totalMs: number;
  bg: string | null; beats: VoxBeat[];
};

const INK = "#221c15";
const CREAM = "#efe6d0";
const RED = "#c8372d";
const PAPER = "#f7f1e1";

const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const rnd = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const step2 = (f: number) => Math.floor(f / 2) * 2; // animate on twos (stop-motion)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const loadFonts = () => {
  useEffect(() => {
    const h = delayRender("vox fonts");
    Promise.all([
      ...[800, 900].map((w) => new Promise<void>((res) => { const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); })),
      new Promise<void>((res) => { const f = new FontFace("JetBrains Mono", `url(${staticFile("fonts/jetbrains-mono.ttf")})`, { weight: "400 700" }); f.load().then((l) => { document.fonts.add(l); res(); }).catch(() => res()); }),
    ]).then(() => continueRender(h)).catch(() => continueRender(h));
  }, []);
};

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix type='saturate' values='0'/></filter><rect width='300' height='300' filter='url(%23n)' opacity='0.55'/></svg>`
)}")`;

// ---- furniture over the whole film ----
const Grain: React.FC = () => {
  const f = useCurrentFrame();
  const o = 0.05 + (step2(f) % 4 < 2 ? 0.03 : 0);
  return <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: o, mixBlendMode: "multiply", pointerEvents: "none" }} />;
};

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(30,22,12,0.42) 100%)", pointerEvents: "none" }} />
);

const Masthead: React.FC<{ doc: VoxDoc; beat: VoxBeat | null }> = ({ doc, beat }) => (
  <div style={{ position: "absolute", top: 46, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "0 70px", fontFamily: "JetBrains Mono" }}>
    <div style={{ transform: "rotate(-1.2deg)" }}>
      <div style={{ color: RED, fontWeight: 700, fontSize: 26, letterSpacing: "0.34em" }}>THE PAPER FILE</div>
      <div style={{ color: INK, fontSize: 17, letterSpacing: "0.22em", marginTop: 6, opacity: 0.75 }}>CASE 065 — {doc.title.replace("The Paper File: ", "").toUpperCase()}</div>
    </div>
    {beat ? (
      <div style={{ color: CREAM, background: INK, fontSize: 20, fontWeight: 700, padding: "8px 16px", letterSpacing: "0.2em", transform: "rotate(1.4deg)", height: "fit-content" }}>{beat.id}</div>
    ) : null}
  </div>
);

// ---- tape strip ----
const Tape: React.FC<{ x: number; y: number; rot: number; w?: number; on: number }> = ({ x, y, rot, w = 170, on }) => {
  if (on <= 0) return null;
  const p = clamp01(on / 3);
  const s = interpolate(step2(p * 3), [0, 3], [0.55, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: 40, background: "rgba(226,214,178,0.62)", transform: `rotate(${rot}deg) scale(${s})`, boxShadow: "0 2px 5px rgba(40,30,15,0.25)", borderLeft: "2px dashed rgba(120,105,70,0.35)", borderRight: "2px dashed rgba(120,105,70,0.35)" }} />
  );
};

// ---- red thread with brass pins ----
const Thread: React.FC<{ p: number; a: [number, number]; b: [number, number] }> = ({ p, a, b }) => {
  if (p <= 0) return null;
  const mid: [number, number] = [(a[0] + b[0]) / 2 + 40, (a[1] + b[1]) / 2 + 110];
  const d = `M ${a[0]} ${a[1]} Q ${mid[0]} ${mid[1]} ${b[0]} ${b[1]}`;
  const len = 1400;
  const off = len * (1 - clamp01(p));
  const pin = (x: number, y: number, k: number) => (
    <div style={{ position: "absolute", left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: 999, background: "radial-gradient(circle at 35% 30%, #e8c56a, #8a6a1e)", boxShadow: "1px 2px 3px rgba(0,0,0,0.4)", opacity: p > k ? 1 : 0 }} />
  );
  return (
    <>
      <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d={d} fill="none" stroke={RED} strokeWidth={4} strokeDasharray={len} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      {pin(a[0], a[1], 0.02)}{pin(b[0], b[1], 0.45)}
    </>
  );
};

// ---- one beat = one clip ----
const BeatView: React.FC<{ beat: VoxBeat; doc: VoxDoc }> = ({ beat, doc }) => {
  const f = useCurrentFrame();
  const { durationInFrames: d } = useVideoConfig();
  const s = hash(beat.id);
  const land = Math.max(14, Math.floor(d * 0.55));
  const labelAt = Math.floor(d * 0.7);
  const stampAt = Math.floor(d * 0.82);

  const jx = (rnd(s) - 0.5) * 180;
  const jy = (rnd(s + 1) - 0.5) * 120;
  const restRot = (rnd(s + 2) - 0.5) * 5 - 1;
  const heroW = 820 + Math.floor(rnd(s + 3) * 300);

  const sf = step2(Math.max(0, f - 4));
  const entryP = clamp01(sf / Math.max(1, land - 4));
  const ease = 1 - Math.pow(1 - entryP, 2.2);
  const fromX = jx + 190, fromY = jy + 230;
  const hx = fromX + (jx - fromX) * ease;
  const hy = fromY + (jy - fromY) * ease;
  const hrot = restRot - 7 * (1 - ease);
  const settle = f >= land ? 1 + 0.05 * (1 - clamp01((f - land) / 6)) : 1;
  const holdRot = f >= land ? 0.35 * Math.sin((f - land) / 9) : 0;
  const heroOn = sf > 0 && !!beat.img;
  const cardOn = sf > 0 && !!beat.card && !beat.img;

  const typed = beat.text.slice(0, Math.ceil(beat.text.length * clamp01((f - 6) / Math.max(1, d * 0.55))));

  return (
    <>
      {heroOn ? (
        <div style={{
          position: "absolute", left: 960 - heroW / 2 + hx, top: 520 + hy - 0, width: heroW,
          transform: `rotate(${hrot + holdRot}deg) scale(${settle})`, transformOrigin: "center",
          filter: "contrast(1.06) drop-shadow(7px 11px 9px rgba(30,22,10,0.38))",
        }}>
          <Img src={staticFile(beat.img!)} style={{ width: "100%" }} />
        </div>
      ) : null}

      {cardOn ? (
        <div style={{
          position: "absolute", left: 960 - 330 + hx, top: 320 + hy, width: 660, height: 400,
          background: PAPER, borderRadius: 14, border: "1px solid rgba(60,45,25,0.35)",
          transform: `rotate(${hrot + holdRot}deg) scale(${settle})`, transformOrigin: "center",
          boxShadow: "8px 12px 14px rgba(30,22,10,0.38)", padding: 38,
        }}>
          <div style={{ fontFamily: "JetBrains Mono", color: INK, fontSize: 34, letterSpacing: "0.24em", fontWeight: 700 }}>MADOFF</div>
          <div style={{ fontFamily: "JetBrains Mono", color: INK, fontSize: 19, letterSpacing: "0.16em", opacity: 0.65, marginTop: 12 }}>INVESTMENT SECURITIES</div>
          <div style={{ position: "absolute", bottom: 34, left: 38, right: 38, height: 1, background: "rgba(60,45,25,0.3)" }} />
          <div style={{
            position: "absolute", right: 28, top: 28, width: 80, height: 80, borderRadius: 999,
            border: `3px solid ${RED}`, color: RED, fontFamily: "Inter", fontWeight: 900, fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(12deg)", opacity: 0.85,
          }}>TRUST</div>
        </div>
      ) : null}

      <Thread p={beat.thread ? clamp01((f - Math.floor(d * 0.25)) / (d * 0.4)) : 0}
        a={[430 + rnd(s + 4) * 120, 330 + rnd(s + 5) * 100]} b={[1420 + rnd(s + 6) * 100, 700 + rnd(s + 7) * 80]} />

      <Tape x={960 - heroW / 2 + hx - 34} y={520 + hy + 12} rot={-38 + rnd(s + 8) * 10} on={f >= land + 2 ? f - (land + 2) : 0} />
      <Tape x={960 + heroW / 2 + hx - 150} y={520 + hy + 260} rot={26 + rnd(s + 9) * 10} on={f >= land + 4 ? f - (land + 4) : 0} w={150} />

      {beat.label && f >= labelAt ? (() => {
        const lp = clamp01((f - labelAt) / 4);
        const lx = (1 - lp) * 90;
        return (
          <div style={{
            position: "absolute", right: 250 + jx * 0.3 + lx, top: 760 + jy * 0.4,
            background: PAPER, color: INK, fontFamily: "JetBrains Mono", fontWeight: 700,
            fontSize: 34, letterSpacing: "0.28em", padding: "14px 26px 12px 32px",
            transform: `rotate(1.6deg)`, boxShadow: "3px 5px 8px rgba(30,22,10,0.35)",
            borderLeft: `6px solid ${RED}`,
          }}>{beat.label}</div>
        );
      })() : null}

      {beat.stamp && f >= stampAt ? (() => {
        const k = step2(f - stampAt);
        const sc = k === 0 ? 1.9 : k === 2 ? 1.05 : 1;
        const op = k === 0 ? 0.4 : 1;
        return (
          <div style={{
            position: "absolute", left: 300 + jx * 0.4, top: 210 + jy * 0.4,
            color: RED, border: `6px double ${RED}`, borderRadius: 10, padding: "10px 26px",
            fontFamily: "Inter", fontWeight: 900, fontSize: 64, letterSpacing: "0.08em",
            transform: `rotate(-11deg) scale(${sc})`, opacity: op,
            textShadow: "0 0 1px rgba(200,55,45,0.4)",
          }}>{beat.stamp}</div>
        );
      })() : null}

      {/* typewriter caption slip */}
      <div style={{
        position: "absolute", left: 70, bottom: 56, maxWidth: 1250,
        background: PAPER, color: INK, fontFamily: "JetBrains Mono", fontSize: 29, lineHeight: 1.35,
        padding: "16px 22px", transform: "rotate(-0.5deg)", boxShadow: "3px 6px 10px rgba(30,22,10,0.35)",
        opacity: f >= 2 ? 1 : 0,
      }}>
        <span style={{ color: RED, fontWeight: 700, marginRight: 14 }}>{beat.id}</span>
        {typed}
        <span style={{ opacity: step2(f) % 4 < 2 ? 1 : 0, color: RED }}>▌</span>
      </div>
    </>
  );
};

export const VoxCollage: React.FC<{ doc?: VoxDoc | null }> = (all) => {
  // input props merge shallowly over defaultProps — the raw --props doc (beats at
  // top level, no doc key) must WIN over the merged-in empty default.
  const raw = all as unknown as VoxDoc;
  const doc: VoxDoc =
    (raw && Array.isArray(raw.beats) && raw.beats.length > 0 && raw) ||
    all?.doc ||
    ((all as any)?.vox as VoxDoc) || { title: "Vox", fps: 30, width: 1920, height: 1080, totalMs: 100, bg: null, beats: [] };
  loadFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let acc = 0;
  let cur: VoxBeat | null = null;
  for (const b of doc.beats) {
    const frames = Math.round((b.ms / 1000) * fps);
    if (frame >= acc && frame < acc + frames) { cur = b; break; }
    acc += frames;
  }

  return (
    <AbsoluteFill style={{ background: "#d8cdb4" }}>
      {doc.bg ? (
        <AbsoluteFill>
          <Img src={staticFile(doc.bg)} style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scale(1.08) translate(${-frame * 0.012}px, ${Math.sin(frame / 240) * 6}px)`,
          }} />
        </AbsoluteFill>
      ) : null}

      {doc.beats.map((b) => {
        const from = Math.round((b.startMs / 1000) * fps);
        const dur = Math.round((b.ms / 1000) * fps);
        return (
          <Sequence key={b.id} from={from} durationInFrames={dur} name={b.id}>
            <BeatView beat={b} doc={doc} />
          </Sequence>
        );
      })}

      {/* audio: narration + paper SFX, placed as siblings (teacher.tsx pattern) */}
      {doc.beats.filter((b) => b.audio).map((b) => (
        <Sequence key={`a${b.id}`} from={Math.round((b.startMs / 1000) * fps)} durationInFrames={Math.max(1, Math.ceil((b.ms / 1000) * fps))}>
          <Audio src={staticFile(b.audio)} />
        </Sequence>
      ))}
      {doc.beats.map((b) => {
        const base = Math.round((b.startMs / 1000) * fps);
        const d = Math.max(1, Math.round((b.ms / 1000) * fps));
        const land = Math.max(14, Math.floor(d * 0.55));
        const sfx: Array<[string, number, number]> = [];
        if (b.img || b.card) sfx.push(["swish.wav", Math.round(base + 0.15 * fps), 0.5]);
        sfx.push(["tap.wav", base + land, 0.45]);
        if (b.label) sfx.push(["tap.wav", base + Math.floor(d * 0.7), 0.4]);
        if (b.stamp) sfx.push(["stamp.wav", base + Math.floor(d * 0.82), 0.7]);
        return sfx.map(([file, at, vol], k) => (
          <Sequence key={`s${b.id}${k}`} from={at} durationInFrames={30}>
            <Audio src={staticFile(`vox-collage/sfx/${file}`)} volume={vol} />
          </Sequence>
        ));
      })}

      <Masthead doc={doc} beat={cur} />
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

export default VoxCollage;
