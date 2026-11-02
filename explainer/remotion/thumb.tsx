import React, { useEffect } from "react";
import { AbsoluteFill, Img, staticFile, continueRender, delayRender } from "remotion";

// YouTube thumbnail: famous persona/thing photo + giant punchy headline + brand chip.
// Rendered via `npx remotion still` in the same cloud run.

export const Thumb: React.FC<any> = (props) => {
  const doc = props?.thumb?.headline ? props.thumb : (props?.headline ? props : null);
  const h = delayRender("thumb persona");
  useEffect(() => {
    if (!doc?.persona) { continueRender(h); return; }
    const img = new Image();
    img.onload = () => continueRender(h);
    img.onerror = () => continueRender(h);
    img.src = staticFile(doc.persona);
  }, [doc?.persona]);
  if (!doc) return <AbsoluteFill style={{ background: "#0B1220" }} />;
  const accent = doc.accent || "#E8C15A";
  const bg = doc.bg || "#0B1220";
  const headline = String(doc.headline || "").toUpperCase();
  const words = headline.split(" ");
  const mid = Math.ceil(words.length / 2);
  const lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean);
  return (
    <AbsoluteFill style={{ background: bg, flexDirection: "row" }}>
      {/* left: headline block */}
      <div style={{ width: "55%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 60, paddingRight: 20 }}>
        {lines.map((ln, i) => (
          <div key={i} style={{
            fontFamily: "Inter, Arial, sans-serif", fontWeight: 900, fontSize: i === 0 ? 110 : 110, lineHeight: 1.02,
            color: i === lines.length - 1 ? accent : "#FFFFFF", letterSpacing: "-0.01em",
            textShadow: "0 8px 40px rgba(0,0,0,0.55)",
          }}>{ln}</div>
        ))}
        <div style={{ marginTop: 34, display: "inline-block", alignSelf: "flex-start", background: accent, color: bg, borderRadius: 10, padding: "10px 22px", fontFamily: "Inter, Arial, sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "0.22em" }}>
          {doc.brand || ""}
        </div>
      </div>
      {/* right: persona photo, full-height, subtle vignette */}
      <div style={{ width: "45%", height: "100%", position: "relative", overflow: "hidden" }}>
        {doc.persona ? (
          <Img src={staticFile(doc.persona)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(160deg, ${accent}22, transparent 60%)` }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${bg} 0%, transparent 30%, transparent 78%, ${bg}ee 100%)` }} />
      </div>
    </AbsoluteFill>
  );
};
