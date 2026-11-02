import React from "react";
import { Composition } from "remotion";
import { Explainer, type Storyboard } from "./Explainer";
import { Reel } from "./reels";
import { LongVideo } from "./longscenes";
import { DocV2 } from "./longscenes2";
import { CapShowcase } from "./caption-showcase";
import { Thumb } from "./thumb";
import { ThumbLab, OverlayThumb, TSThumb } from "./thumb-lab";
import { Teacher } from "./teacher";
import { TechExplain } from "./tech-explain";
import { TechVideo } from "./tech-video";
import { PsychToon, type PsychDoc } from "./psych-toon";
import { VoxCollage, type VoxDoc } from "./vox-collage";

const EMPTY: Storyboard = {
  title: "Explainer",
  chapters: [],
  fps: 30,
  width: 1920,
  height: 1080,
  totalMs: 2000,
  beats: [],
};

// The real storyboard arrives as CLI input props (--props=public/storyboard.json).
// Accept both the raw document and a {storyboard: ...} wrapper.
const unwrap = (p: any): Storyboard | null => {
  if (!p) return null;
  if (Array.isArray(p?.beats) && p.beats.length > 0) return p as Storyboard;
  if (Array.isArray(p?.storyboard?.beats) && p.storyboard.beats.length > 0) return p.storyboard as Storyboard;
  return null;
};

const calculateMetadata = ({ props }: { props: unknown }) => {
  const data = unwrap(props);
  if (!data) {
    return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
  }
  return {
    durationInFrames: Math.max(Math.ceil((data.totalMs / 1000) * (data.fps || 30)), 10),
    fps: data.fps || 30,
    width: data.width || 1920,
    height: data.height || 1080,
    props: { storyboard: data },
  };
};

// DocV2 docs arrive raw as {beats, totalMs, fps}
const calculateDocV2Metadata = ({ props }: { props: any }) => {
  const doc = Array.isArray(props?.beats) && props.beats.length > 0 ? props : (Array.isArray(props?.docv2?.beats) && props.docv2.beats.length > 0 ? props.docv2 : null);
  if (!doc) return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
  return { durationInFrames: Math.max(Math.ceil((doc.totalMs / 1000) * (doc.fps || 30)), 10), fps: doc.fps || 30, width: doc.width || 1920, height: doc.height || 1080, props: { docv2: doc } };
};

// Reel docs arrive raw as {spec, timeline, totalMs, fps}. defaultProps merge an
// empty {reel} key in — so require NON-empty timelines before trusting either shape.
const calculateReelMetadata = ({ props }: { props: any }) => {
  const doc = Array.isArray(props?.timeline) && props.timeline.length > 0 ? props
    : (Array.isArray(props?.reel?.timeline) && props.reel.timeline.length > 0 ? props.reel : null);
  if (!doc) return { durationInFrames: 10, fps: 30, width: 1080, height: 1920 };
  return {
    durationInFrames: Math.max(Math.ceil((doc.totalMs / 1000) * (doc.fps || 30)), 10),
    fps: doc.fps || 30,
    width: 1080,
    height: 1920,
    props: { reel: doc },
  };
};

// LongVideo docs arrive raw as {beats:[...], totalMs, fps}
const calculateLongMetadata = ({ props }: { props: any }) => {
  const doc = Array.isArray(props?.beats) && props.beats.length > 0 ? props
    : (Array.isArray(props?.longvideo?.beats) && props.longvideo.beats.length > 0 ? props.longvideo : null);
  if (!doc) return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
  return {
    durationInFrames: Math.max(Math.ceil((doc.totalMs / 1000) * (doc.fps || 30)), 10),
    fps: doc.fps || 30,
    width: 1920,
    height: 1080,
    props: { longvideo: doc },
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Explainer"
        component={Explainer}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ storyboard: EMPTY }}
        calculateMetadata={calculateMetadata}
      />
      <Composition
        id="Reel"
        component={Reel}
        durationInFrames={10}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ reel: { spec: { id: "demo", themeKey: "money", beats: [] }, timeline: [], totalMs: 100, fps: 30 } }}
        calculateMetadata={calculateReelMetadata}
      />
      <Composition
        id="DocV2"
        component={DocV2}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ docv2: { beats: [], totalMs: 100, fps: 30 } }}
        calculateMetadata={calculateDocV2Metadata}
      />
      <Composition
        id="LongVideo"
        component={LongVideo}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ longvideo: { beats: [], totalMs: 100, fps: 30 } }}
        calculateMetadata={calculateLongMetadata}
      />
      <Composition
        id="CapShowcase"
        component={CapShowcase}
        durationInFrames={1344}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ showcase: { words: [], audio: "cap-voice.mp3" } }}
      />
      <Composition
        id="Thumb"
        component={Thumb}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ thumb: { headline: "THE $136B TWEET", brand: "BRAND" } }}
      />
      <Composition
        id="TechExplain"
        component={TechExplain}
        durationInFrames={Math.round((50.5) * 30)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ sceneWords: [], sceneAudio: [null, null, null, null], music: null }}
      />
      <Composition
        id="TSThumb"
        component={TSThumb}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ bg: "tl/crashchart.jpg", face: "tl/face.jpg", line1: "NOBEL WINNERS", line2: "LOST $46 BILLION", chip: "INVESTOR'S COMPASS", accent: "#F5E31C" }}
      />
      <Composition
        id="OverlayThumb"
        component={OverlayThumb}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ bg: "tl/bg-ic.png", headline: "THE $46B MISTAKE", brand: "INVESTOR'S COMPASS", accent: "#E8C15A" }}
      />
      <Composition
        id="ThumbLab"
        component={ThumbLab}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{ channel: "ic", variant: "A" }}
      />
      <Composition
        id="TechVideo"
        component={TechVideo}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ scenes: [], starts: [], durs: [], sceneWords: [], sceneAudio: [], music: null }}
        calculateMetadata={({ props }) => {
          const last = Array.isArray(props?.starts) && props.starts.length ? props.starts[props.starts.length - 1] : 0;
          const lastD = Array.isArray(props?.durs) && props.durs.length ? props.durs[props.durs.length - 1] : 1;
          const total = Math.max(last + lastD + 0.5, 1);
          const fps = Number(props?.fps) || 30;
          return { durationInFrames: Math.ceil(total * fps), fps, width: 1920, height: 1080, props };
        }}
      />
      <Composition
        id="Teacher"
        component={Teacher}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ teacher: { beats: [], totalMs: 100, fps: 30 } }}
        calculateMetadata={({ props }: any) => {
          const d = Array.isArray(props?.beats) && props.beats.length > 0 ? props : (props?.teacher?.beats?.length ? props.teacher : null);
          if (!d) return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
          return { durationInFrames: Math.max(Math.ceil((d.totalMs / 1000) * (d.fps || 30)), 10), fps: d.fps || 30, width: 1920, height: 1080, props: { teacher: d } };
        }}
      />
      <Composition
        id="PsychToon"
        component={PsychToon}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ psych: { title: "PsychToon", fps: 30, width: 1920, height: 1080, totalMs: 100, music: null, scenes: [] } as PsychDoc }}
        calculateMetadata={({ props }: any) => {
          // input props merge shallowly over defaultProps, so check the raw
          // --props doc FIRST (it still carries the stale {psych} empty key).
          const raw = Array.isArray(props?.scenes) && props.scenes.length > 0;
          const d: PsychDoc | undefined = raw ? props : props?.psych;
          if (!d || !Array.isArray(d.scenes) || d.scenes.length === 0) return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
          return {
            durationInFrames: Math.max(Math.ceil((d.totalMs / 1000) * (d.fps || 30)), 10),
            fps: d.fps || 30,
            width: d.width || 1920,
            height: d.height || 1080,
            props: raw ? props : { psych: d },
          };
        }}
      />
      <Composition
        id="VoxCollage"
        component={VoxCollage}
        durationInFrames={10}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ doc: { title: "Vox Collage", fps: 30, width: 1920, height: 1080, totalMs: 100, bg: null, beats: [] } as VoxDoc }}
        calculateMetadata={({ props }: any) => {
          const raw = Array.isArray(props?.beats) && props.beats.length > 0;
          const d: VoxDoc | undefined = raw ? props : props?.doc;
          if (!d || !Array.isArray(d.beats) || d.beats.length === 0) return { durationInFrames: 10, fps: 30, width: 1920, height: 1080 };
          return {
            durationInFrames: Math.max(Math.ceil((d.totalMs / 1000) * (d.fps || 30)), 10),
            fps: d.fps || 30,
            width: d.width || 1920,
            height: d.height || 1080,
            props: raw ? props : { doc: d },
          };
        }}
      />
    </>
  );
};
