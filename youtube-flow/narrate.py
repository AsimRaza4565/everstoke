# YouTube Short narration with a HUMAN feel + word timestamps.
#
# Engine chain (first that works wins):
#   1. OpenAI gpt-4o-mini-tts (voice "onyx" + narrator instructions) — human
#      delivery; word timings via whisper-1 alignment.
#   2. Kokoro-82M (Apache 2.0, $0, #1 open model on TTS Arena) — human-ranked
#      fixed narrator voices; word timings estimated by word length (fine for
#      1-3-word caption cues). Voice via YT_KOKORO_VOICE (default am_michael).
#   3. Edge TTS (free fallback) with native WordBoundary events.
#
# Usage: python narrate.py <script.txt> <out.mp3> <out.words.json>
# Also writes <out.mp3>.meta.json: {"engine","audio","duration","words":[{w,s,d}]}
import asyncio
import json
import os
import re
import subprocess
import sys

VOICE = os.environ.get("YT_TTS_VOICE", "onyx")
KOKORO_VOICE = os.environ.get("YT_KOKORO_VOICE", "am_michael")
KOKORO_SPEED = float(os.environ.get("YT_KOKORO_SPEED", "1.0"))
# edge-tts voice names have the locale shape 'en-US-BrianMultilingualNeural';
# kokoro ids (am_michael/bm_daniel) do NOT and edge-tts rejects them with
# "Invalid voice ..." (run 40631681473: the deepdive edge fallback died there
# right after a successful script). Kokoro ids stay honored on the kokoro
# path (YT_KOKORO_VOICE); the edge fallback never borrows them.
EDGE_VOICE_DEFAULT = "en-US-BrianMultilingualNeural"
EDGE_VOICE_RE = re.compile(r"^[a-z]{2}-[A-Z]{2}-\w+")
NARRATOR_INSTRUCTIONS = (
    "You are a calm, confident documentary narrator with quiet intensity. "
    "Speak slightly slower than normal with deliberate short pauses between "
    "sentences. Sound like a wise mentor, not a salesman. Give the final "
    "line extra weight and conviction."
)


def run_curl(args):
    return subprocess.run(["curl", "-sS", "--fail", "--retry", "2"] + args,
                          capture_output=True, text=True, check=True)


def openai_tts(text, mp3_path, key):
    run_curl([
        "https://api.openai.com/v1/audio/speech",
        "-H", f"Authorization: Bearer {key}",
        "-F", "model=gpt-4o-mini-tts",
        "-F", f"voice={VOICE}",
        "-F", "speed=0.95",
        "-F", f"input={text}",
        "-F", f"instructions={NARRATOR_INSTRUCTIONS}",
        "-o", mp3_path,
    ])


def openai_align(mp3_path, key):
    r = run_curl([
        "https://api.openai.com/v1/audio/transcriptions",
        "-H", f"Authorization: Bearer {key}",
        "-F", f"file=@{mp3_path}",
        "-F", "model=whisper-1",
        "-F", "response_format=verbose_json",
        "-F", "timestamp_granularities[]=word",
    ])
    data = json.loads(r.stdout)
    return [{"w": w["word"].strip(), "s": round(float(w["start"]), 3),
             "d": round(float(w["end"]) - float(w["start"]), 3)}
            for w in data.get("words", []) if w.get("word", "").strip()]


def kokoro_tts(text, base_path):
    """Kokoro-82M ONNX — $0, human-ranked #1 open voice. Returns (audio_path, words, duration)."""
    import array
    import wave

    from kokoro_onnx import Kokoro

    pool = os.environ.get("KOKORO_DIR", "pixabay-pool")
    model = os.path.join(pool, "kokoro-v1.0.onnx")
    voices = os.path.join(pool, "voices-v1.0.bin")
    if not (os.path.exists(model) and os.path.exists(voices)):
        raise RuntimeError("kokoro model files missing in " + pool)
    k = Kokoro(model, voices)
    audio, sr = k.create(text, voice=KOKORO_VOICE, speed=KOKORO_SPEED, lang="en-us")
    wav_path = base_path.rsplit(".", 1)[0] + ".kokoro.wav"
    try:
        import soundfile as sf
        sf.write(wav_path, audio, sr)
    except ImportError:
        import array as _array
        import wave
        with wave.open(wav_path, "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(sr)
            f.writeframes(_array.array("h", (audio * 32767).astype("int16")).tobytes())
    duration = len(audio) / sr
    # word timings estimated by word length (kokoro-onnx has no alignment API)
    words = text.split()
    total = sum(len(w) + 1 for w in words)
    t, out = 0.0, []
    for w in words:
        d = duration * (len(w) + 1) / total
        out.append({"w": w.strip(".,!?;:\"'’"), "s": round(t, 3), "d": round(d, 3)})
        t += d
    return wav_path, out, duration


def resolve_edge_voice():
    """YT_EDGE_VOICE only counts when it has the edge-tts name shape; anything
    else (unset, or a kokoro id leaking in via a shared voice env) resolves to
    a known-valid default instead of an edge-tts ValueError mid-run."""
    v = os.environ.get("YT_EDGE_VOICE", "").strip()
    if v and EDGE_VOICE_RE.match(v):
        return v
    if v:
        print(f"edge voice '{v}' is not an edge-tts name (kokoro id?) - using {EDGE_VOICE_DEFAULT}",
              file=sys.stderr)
    return EDGE_VOICE_DEFAULT


def edge_tts(text, mp3_path):
    asyncio.run(_edge(text, mp3_path))


async def _edge(text, mp3_path):
    import edge_tts

    words = []
    # The voice must be an edge-tts name (locale shape) — never a kokoro id.
    # Channel brand voices reach this lane through YT_EDGE_VOICE; kokoro ids
    # reach it through the kokoro path above. The old `or KOKORO_VOICE` here
    # crashed the fallback with "Invalid voice 'am_michael'" (run 40631681473).
    voice = resolve_edge_voice()
    print(f"edge-tts voice: {voice}", file=sys.stderr)
    communicate = edge_tts.Communicate(text, voice, rate="+2%", boundary="WordBoundary")
    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"w": chunk["text"], "s": round(chunk["offset"] / 1e7, 3),
                              "d": round(chunk["duration"] / 1e7, 3)})
    with open(mp3_path.rsplit(".", 1)[0] + ".words.json", "w", encoding="utf-8") as f:
        json.dump(words, f)


def main():
    txt_path, mp3_path, words_path = sys.argv[1:4]
    with open(txt_path, encoding="utf-8") as f:
        text = " ".join(f.read().split())

    meta = {"engine": "edge", "audio": mp3_path, "words": []}
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        try:
            openai_tts(text, mp3_path, key)
            words = openai_align(mp3_path, key)
            if words:
                meta = {"engine": "openai", "audio": mp3_path, "words": words}
        except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError) as e:
            print(f"openai failed ({e}); trying kokoro", file=sys.stderr)
    if meta["engine"] == "edge":
        try:
            audio, words, duration = kokoro_tts(text, mp3_path)
            meta = {"engine": "kokoro", "audio": audio, "words": words,
                    "duration": round(duration, 3), "voice": KOKORO_VOICE}
        except Exception as e:
            print(f"kokoro failed ({e}); falling back to edge-tts", file=sys.stderr)
            edge_tts(text, mp3_path)

    if meta["engine"] == "edge":
        wp = mp3_path.rsplit(".", 1)[0] + ".words.json"
        with open(wp, encoding="utf-8") as f:
            meta["words"] = json.load(f)
        os.remove(wp)

    with open(mp3_path + ".meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f)
    print("engine:" + meta["engine"])


if __name__ == "__main__":
    main()
