// #99 QUOTA LEDGER — repo-root shim (#104 fix round 1).
//
// The canonical implementation moved to studio/lib/quota-ledger.mjs so that
// studio/lib/schedule-projection.js can import it INSIDE the Studio Next.js
// root (imports reaching outside the Turbopack root fail `next build`).
// Every named export is re-exported here unchanged, so the pipeline callers
// keep importing './lib/quota-ledger.mjs' exactly as before:
//   channel-pipeline.mjs  -> evaluate
//   yt-daily.mjs          -> nextCounter
//   yt-deepdive.mjs       -> nextCounter
//   longvideo/shorts-clips.mjs -> nextCounter (+ dynamic import evaluate)
//   tests/quota-ledger.test.mjs -> ptDate, evaluate, nextCounter
export * from '../studio/lib/quota-ledger.mjs';
