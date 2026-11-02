import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FadeEdges, resolvePalette, seededRand, type Palette } from "../lib/primitives";

/** Restrained editorial frames for documentary titles, archival captions, and chapter transitions. */
type DocumentaryVariant =
  | "chapter-card"
  | "archival-caption"
  | "location-date"
  | "voiceover-quote"
  | "map-chapter"
  | "photo-caption"
  | "document-title"
  | "reconstruction-card"
  | "end-chapter"
  | "documentary-open";

export interface DocumentaryFramesProps {
  variant: DocumentaryVariant;
  title: string;
  subtitle: string;
  chapter: string;
  location: string;
  date: string;
  quote: string;
  source: string;
  imageUrl?: string;
  paletteName: string;
  accentColor?: string;
  body?: string;
}

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = '"SFMono-Regular", Consolas, monospace';

const labels: Record<DocumentaryVariant, string> = {
  "chapter-card": "CHAPTER CARD",
  "archival-caption": "ARCHIVAL RECORD",
  "location-date": "LOCATION / DATE",
  "voiceover-quote": "VOICEOVER",
  "map-chapter": "FIELD NOTES",
  "photo-caption": "IMAGE / CAPTION",
  "document-title": "DOCUMENT",
  "reconstruction-card": "RECONSTRUCTION",
  "end-chapter": "END OF CHAPTER",
  "documentary-open": "A DOCUMENTARY",
};

const fallbackBody = "A record of the people, places, and decisions that shaped what came next.";

const Grain: React.FC<{ pal: Palette; opacity?: number }> = ({ pal, opacity = 0.12 }) => (
  <div
    style={{
      position: "absolute", inset: 0, pointerEvents: "none", opacity,
      backgroundImage: `repeating-linear-gradient(0deg, ${pal.text}12 0px, transparent 1px, transparent 4px), repeating-linear-gradient(90deg, ${pal.text}08 0px, transparent 1px, transparent 5px)`,
      mixBlendMode: "screen",
    }}
  />
);

const ImageField: React.FC<{ p: DocumentaryFramesProps; pal: Palette; dark?: boolean }> = ({ p, pal, dark = false }) => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(135deg, ${pal.primary}88, ${pal.bg} 52%, ${pal.secondary}55)` }}>
    {p.imageUrl ? <Img src={p.imageUrl} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: dark ? "grayscale(0.7) contrast(1.1)" : "sepia(0.18) contrast(1.05)" }} /> : (
      <>
        <div style={{ position: "absolute", inset: "-12%", background: `radial-gradient(ellipse at ${28 + seededRand(4) * 35}% ${35 + seededRand(8) * 30}%, ${pal.accent}99 0%, transparent 32%), linear-gradient(${110 + seededRand(3) * 80}deg, ${pal.primary}cc, ${pal.bg} 56%, ${pal.secondary}99)`, transform: "scale(1.08)" }} />
        <div style={{ position: "absolute", left: "8%", right: "8%", bottom: "16%", height: "18%", borderTop: `1px solid ${pal.text}55`, borderBottom: `1px solid ${pal.text}35`, transform: "skewY(-3deg)" }} />
      </>
    )}
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${pal.bg}08 35%, ${pal.bg}${dark ? "cc" : "55"} 100%)` }} />
  </div>
);

const Marker: React.FC<{ pal: Palette; label: string; accent: string }> = ({ pal, label, accent }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, color: pal.text, font: `600 14px ${MONO}`, letterSpacing: "0.12em" }}>
    <span style={{ width: 28, height: 2, background: accent, display: "inline-block" }} />{label}
  </div>
);

const Frame: React.FC<{ p: DocumentaryFramesProps; pal: Palette; children: React.ReactNode; dark?: boolean }> = ({ p, pal, children, dark = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 22), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: pal.bg, color: pal.text, fontFamily: SANS, opacity: Math.min(enter, exit) }}>
      {children}
      <Grain pal={pal} opacity={dark ? 0.18 : 0.1} />
    </AbsoluteFill>
  );
};

const DocumentaryRenderer: React.FC<{ p: DocumentaryFramesProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame();
  const accent = p.accentColor ?? pal.accent;
  const body = p.body ?? fallbackBody;
  const common = <div style={{ position: "absolute", left: "6vw", right: "6vw", top: "6vh" }}><Marker pal={pal} label={labels[p.variant]} accent={accent} /></div>;

  switch (p.variant) {
    case "chapter-card":
      return <Frame p={p} pal={pal} dark><div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 70% 30%, ${pal.primary}44, transparent 42%)` }} />{common}<div style={{ position: "absolute", left: "6vw", bottom: "13vh", maxWidth: "78vw" }}><div style={{ color: accent, font: `700 18px ${MONO}`, letterSpacing: "0.16em", marginBottom: 18 }}>{p.chapter}</div><div style={{ font: `700 clamp(54px, 9vw, 150px) ${SERIF}`, lineHeight: 0.95 }}>{p.title}</div><div style={{ marginTop: 24, color: pal.secondary, font: `22px ${SANS}` }}>{p.subtitle}</div></div></Frame>;
    case "archival-caption":
      return <Frame p={p} pal={pal}><ImageField p={p} pal={pal} /><div style={{ position: "absolute", left: "6vw", bottom: "9vh", width: "min(680px, 70vw)", padding: "22px 26px", borderLeft: `4px solid ${accent}`, background: `${pal.bg}dd` }}><div style={{ color: accent, font: `700 14px ${MONO}`, letterSpacing: "0.16em", marginBottom: 12 }}>{p.date} / {p.source}</div><div style={{ font: `28px ${SERIF}`, lineHeight: 1.18 }}>{p.title}</div><div style={{ marginTop: 10, color: pal.muted ?? pal.secondary, font: `16px ${SANS}` }}>{p.body ?? p.subtitle}</div></div></Frame>;
    case "location-date":
      return <Frame p={p} pal={pal}><ImageField p={p} pal={pal} dark />{common}<div style={{ position: "absolute", left: "6vw", bottom: "12vh" }}><div style={{ font: `700 clamp(48px, 8vw, 124px) ${SERIF}`, lineHeight: 0.95 }}>{p.location}</div><div style={{ marginTop: 20, color: accent, font: `700 22px ${MONO}`, letterSpacing: "0.14em" }}>{p.date}</div></div></Frame>;
    case "voiceover-quote":
      return <Frame p={p} pal={pal} dark><div style={{ position: "absolute", inset: 0, background: `linear-gradient(120deg, ${pal.primary}33, transparent 50%), radial-gradient(circle at 80% 70%, ${pal.accent}33, transparent 35%)` }} />{common}<div style={{ position: "absolute", left: "13vw", right: "13vw", top: "28vh", textAlign: "center" }}><div style={{ color: accent, font: `100px ${SERIF}`, height: 70, lineHeight: 1 }}>“</div><div style={{ font: `italic clamp(32px, 5vw, 74px) ${SERIF}`, lineHeight: 1.12 }}>{p.quote}</div><div style={{ marginTop: 32, color: pal.secondary, font: `600 16px ${MONO}`, letterSpacing: "0.12em" }}>— {p.source}</div></div></Frame>;
    case "map-chapter":
      return <Frame p={p} pal={pal}><div style={{ position: "absolute", inset: 0, background: `linear-gradient(${pal.bg}, ${pal.primary}18)` }} />{common}<div style={{ position: "absolute", inset: "18vh 8vw 10vh", opacity: 0.7 }}>{Array.from({ length: 8 }, (_, i) => <div key={`h-${i}`} style={{ position: "absolute", left: 0, right: 0, top: `${i * 14}%`, borderTop: `1px solid ${pal.secondary}35`, transform: `rotate(${i % 2 ? -4 : 3}deg)` }} />)}{Array.from({ length: 7 }, (_, i) => <div key={`v-${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${i * 16}%`, borderLeft: `1px solid ${pal.secondary}28`, transform: `rotate(${i % 2 ? 8 : -6}deg)` }} />)}<div style={{ position: "absolute", left: "18%", top: "42%", width: "62%", borderTop: `4px dashed ${accent}`, transform: "rotate(-13deg)" }} />{["ORIGIN", "FIELD SITE", "NEXT STOP"].map((x, i) => <div key={x} style={{ position: "absolute", left: `${16 + i * 30}%`, top: `${52 - i * 12}%`, color: pal.text, font: `700 14px ${MONO}`, letterSpacing: "0.1em" }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: accent, marginRight: 10 }} />{x}</div>)}</div><div style={{ position: "absolute", left: "8vw", bottom: "8vh" }}><div style={{ font: `700 46px ${SERIF}` }}>{p.chapter}</div><div style={{ color: pal.secondary, marginTop: 8 }}>{p.subtitle}</div></div></Frame>;
    case "photo-caption":
      return <Frame p={p} pal={pal}><div style={{ position: "absolute", left: "12vw", top: "10vh", width: "58vw", height: "70vh", border: `10px solid ${pal.text}`, boxShadow: `18px 22px 0 ${pal.primary}77`, boxSizing: "border-box", overflow: "hidden" }}><ImageField p={p} pal={pal} /></div><div style={{ position: "absolute", right: "6vw", bottom: "12vh", width: "min(27vw, 420px)", maxWidth: "27vw", boxSizing: "border-box", overflow: "hidden", paddingLeft: "1vw", paddingRight: "0.5vw" }}><Marker pal={pal} label={p.date} accent={accent} /><div style={{ marginTop: 18, maxWidth: "100%", font: `clamp(20px, 2.8vw, 36px) ${SERIF}`, lineHeight: 1.08, overflowWrap: "anywhere", wordBreak: "break-word" }}>{p.title}</div><div style={{ marginTop: 12, maxWidth: "100%", color: pal.secondary, font: `clamp(13px, 1.35vw, 18px) ${SANS}`, lineHeight: 1.25, overflowWrap: "anywhere", wordBreak: "break-word" }}>{p.subtitle}</div></div></Frame>;
    case "document-title":
      return <Frame p={p} pal={pal}><div style={{ position: "absolute", inset: "13vh 12vw", border: `1px solid ${pal.secondary}66`, padding: "8vh 7vw", background: `${pal.primary}12` }}><div style={{ color: accent, font: `700 15px ${MONO}`, letterSpacing: "0.2em" }}>{p.source}</div><div style={{ marginTop: 48, font: `700 clamp(48px, 8vw, 130px) ${SERIF}`, lineHeight: 0.95 }}>{p.title}</div><div style={{ marginTop: 32, maxWidth: 580, color: pal.secondary, font: `22px ${SANS}`, lineHeight: 1.4 }}>{body}</div><div style={{ position: "absolute", bottom: "7vh", left: "7vw", right: "7vw", display: "flex", justifyContent: "space-between", color: pal.muted ?? pal.secondary, font: `13px ${MONO}` }}><span>{p.chapter}</span><span>{p.date}</span></div></div></Frame>;
    case "reconstruction-card":
      return <Frame p={p} pal={pal} dark><ImageField p={p} pal={pal} dark />{common}<div style={{ position: "absolute", left: "7vw", right: "7vw", bottom: "12vh", display: "flex", alignItems: "flex-end", gap: 30 }}><div style={{ width: 7, height: 150, background: accent }} /><div><div style={{ color: accent, font: `700 15px ${MONO}`, letterSpacing: "0.15em" }}>{p.date} / {p.location}</div><div style={{ marginTop: 14, font: `700 clamp(42px, 7vw, 110px) ${SERIF}`, lineHeight: 0.95 }}>{p.title}</div><div style={{ marginTop: 20, maxWidth: 650, color: pal.text, font: `20px ${SANS}` }}>{p.subtitle}</div></div></div></Frame>;
    case "end-chapter":
      return <Frame p={p} pal={{ ...pal, bg: "#050505" }} dark><div style={{ position: "absolute", inset: "16vh 8vw", borderTop: `1px solid ${accent}`, borderBottom: `1px solid ${pal.secondary}55`, display: "flex", flexDirection: "column", justifyContent: "center" }}><div style={{ color: accent, font: `700 15px ${MONO}`, letterSpacing: "0.2em" }}>{labels[p.variant]}</div><div style={{ marginTop: 30, font: `700 clamp(46px, 8vw, 120px) ${SERIF}` }}>{p.chapter}</div><div style={{ marginTop: 20, color: pal.secondary, font: `20px ${SANS}` }}>{p.subtitle}</div></div></Frame>;
    case "documentary-open":
    default:
      return <Frame p={p} pal={pal} dark><ImageField p={p} pal={pal} dark /><div style={{ position: "absolute", left: "6vw", top: "10vh", color: accent, font: `700 16px ${MONO}`, letterSpacing: "0.2em" }}>{labels[p.variant]} / {p.date}</div><div style={{ position: "absolute", left: "6vw", bottom: "10vh", maxWidth: "80vw" }}><div style={{ font: `700 clamp(58px, 10vw, 170px) ${SERIF}`, lineHeight: 0.88 }}>{p.title}</div><div style={{ marginTop: 24, font: `22px ${SANS}`, color: pal.text }}>{p.subtitle}</div><div style={{ marginTop: 20, color: pal.secondary, font: `700 15px ${MONO}`, letterSpacing: "0.12em" }}>{p.location} · {p.chapter}</div></div></Frame>;
  }
};

export const DocumentaryFrames: React.FC<{ p: DocumentaryFramesProps; pal: Palette }> = ({ p, pal }) => <DocumentaryRenderer p={p} pal={pal} />;

const familyCast = (variant: DocumentaryVariant) => ((props: Record<string, unknown>) => {
  const p = { ...(props as unknown as DocumentaryFramesProps), variant };
  return <DocumentaryFrames p={p} pal={resolvePalette(p.paletteName ?? "midnight")} />;
}) as React.ComponentType<Record<string, unknown>>;

export const FAMILY_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  "documentary-frames-chapter-card": familyCast("chapter-card"),
  "documentary-frames-archival-caption": familyCast("archival-caption"),
  "documentary-frames-location-date": familyCast("location-date"),
  "documentary-frames-voiceover-quote": familyCast("voiceover-quote"),
  "documentary-frames-map-chapter": familyCast("map-chapter"),
  "documentary-frames-photo-caption": familyCast("photo-caption"),
  "documentary-frames-document-title": familyCast("document-title"),
  "documentary-frames-reconstruction-card": familyCast("reconstruction-card"),
  "documentary-frames-end-chapter": familyCast("end-chapter"),
  "documentary-frames-documentary-open": familyCast("documentary-open"),
};
