#!/bin/bash
# Produces 3 demo long videos in 3 high-RPM niches (US/UK/CA/AU targeting).
# Sequential: generate script -> storyboard+TTS+bgtrack -> 720p render (retry once).
ROOT=/c/Users/Revnix/Documents/youtube-automation
LOG=$ROOT/longvideo/make3-progress.log
echo "=== make3 started $(date) ===" > "$LOG"

declare -a ENTRIES=(
  "The Fake Tweet That Erased 136 Billion Dollars in 3 Minutes|investors-compass"
  "The Company That Pays You to Quit Your Job|money-rulebook"
  "The Tiny Island That Makes 90 Percent of the Worlds Most Advanced Chips|tax-shield"
)

i=0
for entry in "${ENTRIES[@]}"; do
  i=$((i+1))
  topic="${entry%%|*}"
  brand="${entry##*|}"
  port=$((3462 + i))

  cd "$ROOT/longvideo" || exit 1
  node generate-longscript.mjs --topic "$topic" --minutes 9 --brand "$brand" >> "$LOG" 2>&1
  GEN=$?
  if [ $GEN -ne 0 ]; then
    echo "  [gen] failed ($GEN) — retrying once" >> "$LOG"
    node generate-longscript.mjs --topic "$topic" --minutes 9 --brand "$brand" >> "$LOG" 2>&1 || { echo "GEN FAIL $i" >> "$LOG"; exit 1; }
  fi
  # #66: only directories are generated slugs — a stray file in out/ crashed storyboard.mjs
  SLUG=$(find out -maxdepth 1 -mindepth 1 -type d -printf "%T@ %f
" 2>/dev/null | sort -rn | head -1 | cut -d" " -f2-)
  echo "  [gen] slug=$SLUG" >> "$LOG"

  node storyboard.mjs "$SLUG" >> "$LOG" 2>&1 || { echo "STORYBOARD FAIL $i" >> "$LOG"; exit 1; }
  echo "  [sb] done" >> "$LOG"

  cd "$ROOT/explainer" || exit 1
  npx remotion render remotion/index.ts LongVideo "out/demo-$i-$SLUG.mp4" \
    --props="public/longvideo-$SLUG.json" --width=1280 --height=720 \
    --concurrency=4 --timeout=180000 --port="$port" > "out/render-$i.log" 2>&1
  RC=$?
  if [ $RC -ne 0 ]; then
    echo "  [render] attempt 1 failed ($RC) — retrying" >> "$LOG"
    npx remotion render remotion/index.ts LongVideo "out/demo-$i-$SLUG.mp4" \
      --props="public/longvideo-$SLUG.json" --width=1280 --height=720 \
      --concurrency=3 --timeout=180000 --port="$port" > "out/render-$i.log" 2>&1
  fi
  echo "  [render] EXIT=$? -> out/demo-$i-$SLUG.mp4" >> "$LOG"
done
echo "=== make3 ALL DONE $(date) ===" >> "$LOG"
