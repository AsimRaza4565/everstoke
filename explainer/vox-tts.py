# Edge-TTS synthesis for the Vox paper-collage demo (writes into its own folder,
# never touches public/audio used by the older explainer storyboard).
# Input:  JSON path  [{ "i": int, "text": str }, ...]
# Output: <outdir>/beat-XX.mp3  +  <outdir>/durations.json  [{i, ms, words:[...]}]
import asyncio
import json
import os
import subprocess
import sys

VOICE = os.environ.get("VOX_VOICE", "en-US-AndrewNeural")
RATE = os.environ.get("VOX_RATE", "-2%")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_WIN_FF = os.path.join(ROOT, "ffmpeg-bin", "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe")
_WIN_FP = os.path.join(ROOT, "ffmpeg-bin", "ffmpeg-master-latest-win64-gpl", "bin", "ffprobe.exe")
FF = os.environ.get("VOX_FFMPEG") or (_WIN_FF if os.path.exists(_WIN_FF) else "ffmpeg")
FFPROBE = os.environ.get("VOX_FFPROBE") or (_WIN_FP if os.path.exists(_WIN_FP) else "ffprobe")


async def synth_one(edge_tts, text, mp3_path):
    words = []

    async def run():
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
        with open(mp3_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    words.append({"s": chunk["offset"] / 1e7,
                                  "d": chunk["duration"] / 1e7,
                                  "w": chunk["text"]})

    await asyncio.wait_for(run(), timeout=90)
    return words


def probe_ms(file):
    try:
        out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", file], capture_output=True, text=True, timeout=20)
        return int(float(out.stdout.strip()) * 1000)
    except Exception:
        return 0


async def main():
    import edge_tts
    in_path, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    beats = json.load(open(in_path, encoding="utf-8"))
    result = []
    for b in beats:
        mp3 = os.path.join(outdir, f"beat-{b['i']:02d}.mp3")
        words = []
        for attempt in range(3):
            try:
                words = await synth_one(edge_tts, b["text"], mp3)
                if os.path.getsize(mp3) > 4000:
                    break
            except Exception as e:
                print(f"[vox-tts] beat {b['i']} attempt {attempt + 1} failed: {e}", file=sys.stderr)
                await asyncio.sleep(2)
        ms = probe_ms(mp3)
        result.append({"i": b["i"], "ms": ms, "words": words})
        print(f"[vox-tts] beat {b['i']:02d}  {ms}ms  {len(words)} words")
    json.dump(result, open(os.path.join(outdir, "durations.json"), "w", encoding="utf-8"), indent=1)


asyncio.run(main())
