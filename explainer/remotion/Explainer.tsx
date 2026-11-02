import React, { useEffect, useMemo } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { C } from "./theme";
import { SCENES } from "./scenes";

export type Beat = {
  i: number;
  tpl: string;
  props: any;
  text: string;
  audio: string | null;
  startMs: number;
  ms: number;
};

export type Storyboard = {
  title: string;
  chapters: { n: number; title: string }[];
  fps: number;
  width: number;
  height: number;
  totalMs: number;
  beats: Beat[];
};

const loadInter = () => {
  const handle = delayRender("loading Inter fonts");
  const weights = [400, 600, 800, 900];
  Promise.all(
    weights.map(
      (w) =>
        new Promise<void>((res, rej) => {
          const f = new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.ttf`)})`, { weight: String(w) });
          f.load()
            .then((loaded) => {
              document.fonts.add(loaded);
              res();
            })
            .catch(rej);
        })
    )
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error("font load failed", e);
      continueRender(handle);
    });
};

export const Explainer: React.FC<any> = (input) => {
  const storyboard: Storyboard = input?.storyboard ?? input;
  const { fps } = useVideoConfig();
  useEffect(() => {
    loadInter();
  }, []);

  const totalFrames = useMemo(() => Math.ceil((storyboard.totalMs / 1000) * fps), [storyboard, fps]);
  const musicSrc = staticFile("music.mp3");

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {storyboard.beats.map((b) => {
        const Scene = SCENES[b.tpl] || SCENES.statement;
        const from = Math.round((b.startMs / 1000) * fps);
        const dur = Math.max(Math.ceil((b.ms / 1000) * fps), 2);
        return (
          <Sequence key={b.i} from={from} durationInFrames={dur} name={`${b.tpl}-${String(b.i).padStart(2, "0")}`}>
            <Scene text={b.text} props={b.props} beatMs={b.ms} />
          </Sequence>
        );
      })}

      {storyboard.beats
        .filter((b) => b.audio)
        .map((b) => {
          const from = Math.round((b.startMs / 1000) * fps);
          return (
            <Sequence key={`a${b.i}`} from={from} durationInFrames={Math.ceil((b.ms / 1000) * fps)}>
              <Audio src={staticFile(b.audio!)} />
            </Sequence>
          );
        })}

      <Audio src={musicSrc} volume={(f) => {
        if (totalFrames < 150) return 0;
        const fadeInEnd = 45;
        const fadeOutStart = totalFrames - 90;
        if (fadeOutStart <= fadeInEnd) return 0;
        return interpolate(f, [0, fadeInEnd, fadeOutStart, totalFrames - 10], [0, 0.055, 0.055, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
      }} />
    </AbsoluteFill>
  );
};
