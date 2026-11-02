# Batch Edge-TTS synthesis for the explainer pipeline. Flaky-net hardened:
# - per-beat resume (skips mp3s that already exist and are >10KB)
# - 90s per-attempt timeout, 3 attempts, then a silent placeholder (pipeline never dies)
# Input:  beats JSON path  [{ "i": int, "text": str }, ...]
# Output: durations JSON   [{ "i": int, "ms": float, "words": [...] }] (+ audio/beat-XX.mp3)
import asyncio
import hashlib
import json
import os
import subprocess
import sys
import wave

VOICE = os.environ.get("EXPLAINER_VOICE", "en-US-AndrewNeural")
RATE = os.environ.get("EXPLAINER_RATE", "-2%")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Windows ships bundled ffmpeg binaries; Linux CI uses ffmpeg/ffprobe from PATH.
_WIN_FF = os.path.join(ROOT, "ffmpeg-bin", "ffmpeg-master-latest-win64-gpl", "bin", "ffmpeg.exe")
_WIN_FP = os.path.join(ROOT, "ffmpeg-bin", "ffmpeg-master-latest-win64-gpl", "bin", "ffprobe.exe")
FF = os.environ.get("EXPLAINER_FFMPEG") or (_WIN_FF if os.path.exists(_WIN_FF) else "ffmpeg")
FFPROBE = os.environ.get("EXPLAINER_FFPROBE") or (_WIN_FP if os.path.exists(_WIN_FP) else "ffprobe")

def _hash(text):
    # #41: resume cache key — re-derive word timings only when the beat text is unchanged
    return hashlib.sha256(str(text).encode("utf8")).hexdigest()[:16]


async def synth_one(edge_tts, text, mp3_path):
    words = []
    async def run():
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
        with open(mp3_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                    return_value = True
                elif chunk["type"] == "WordBoundary":
                    words.append({"s": chunk["offset"] / 1e7,
                                  "d": chunk["duration"] / 1e7,
                                  "w": chunk["text"]})
    await asyncio.wait_for(run(), timeout=90)
    return words


def silence(mp3_path, seconds=8.0):
    """Silent placeholder so the pipeline can continue without this beat's voice."""
    subprocess.run([FF, "-y", "-v", "error", "-f", "lavfi", "-i",
                    "anullsrc=r=24000:cl=mono", "-t", str(seconds), mp3_path],
                   check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def probe_ms(ffprobe, file):
    try:
        out = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                              "-of", "csv=p=0", file], capture_output=True, text=True, timeout=20)
        return round(float(out.stdout.strip()) * 1000)
    except Exception:
        return 0


async def main():
    import edge_tts

    beats_path = sys.argv[1]
    base = os.path.dirname(os.path.abspath(beats_path))
    out_dir = os.path.join(base, "audio")
    os.makedirs(out_dir, exist_ok=True)

    with open(beats_path, encoding="utf8") as f:
        beats = json.load(f)

    # #41: sidecar with per-beat word timings — the resume path used to return
    # words: [] for cached beats, silently destroying caption word-boundary timing
    words_cache_path = os.path.join(base, "tts-durations.words.json")
    words_cache = {}
    if os.path.exists(words_cache_path):
        try:
            with open(words_cache_path, encoding="utf8") as f:
                words_cache = json.load(f)
        except Exception:
            words_cache = {}

    ffprobe = FFPROBE
    results = []
    for b in beats:
        mp3 = os.path.join(out_dir, f"beat-{b['i']:02d}.mp3")
        # resume: keep existing good audio ONLY when its text hash matches
        # (#44: the cache was text-blind — edited narration resumed the OLD
        # audio under the NEW text). Mismatch -> fresh synthesis below.
        cached = words_cache.get(str(b["i"])) or {}
        hash_ok = cached.get("textHash") == _hash(b["text"])
        if os.path.exists(mp3) and os.path.getsize(mp3) > 10 * 1024 and hash_ok:
            ms = probe_ms(ffprobe, mp3)
            results.append({"i": b["i"], "ms": ms, "words": cached.get("words") or [], "textHash": cached["textHash"]})
            print(f"  [tts] beat {b['i']:02d}: cached {ms/1000:.1f}s ({len(cached.get('words') or [])} words)", flush=True)
            continue
        words = []
        ok = False
        for attempt in range(3):
            try:
                words = await synth_one(edge_tts, b["text"], mp3)
                # #41: success must clear the failure flag — the old code set
                # ok=True once BEFORE the loop, so a beat whose attempt 1 failed
                # but attempt 2/3 succeeded still hit the silence branch and
                # OVERWROTE the just-written good mp3 with 8s of dead air.
                ok = True
                break
            except Exception as e:
                print(f"  [tts] beat {b['i']:02d} retry {attempt + 1}: {str(e)[:90]}", flush=True)
                await asyncio.sleep(2 * (attempt + 1))
        if not ok or not os.path.exists(mp3) or os.path.getsize(mp3) < 2048:
            try:
                silence(mp3, 8.0)
            except Exception as e:
                print(f"  [tts] beat {b['i']:02d}: silence placeholder failed: {str(e)[:60]}", flush=True)
            words = []
            print(f"  [tts] beat {b['i']:02d}: SILENT PLACEHOLDER (network)", flush=True)
        if ok and words:
            words_cache[str(b["i"])] = {"textHash": _hash(b["text"]), "words": words}
        dur = (words[-1]["s"] + words[-1]["d"]) if words else probe_ms(ffprobe, mp3) / 1000 or 8.0
        results.append({"i": b["i"], "ms": round(dur * 1000), "words": words, "textHash": _hash(b["text"])})
        print(f"  [tts] beat {b['i']:02d}: {len(words)} words, {dur:.1f}s", flush=True)

    with open(os.path.join(base, "tts-durations.json"), "w", encoding="utf8") as f:
        json.dump(results, f)
    with open(words_cache_path, "w", encoding="utf8") as f:
        json.dump(words_cache, f)
    print("[tts] all beats done", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
