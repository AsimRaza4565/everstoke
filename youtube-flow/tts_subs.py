# YouTube Short narration: Edge-TTS voiceover + word-grouped SRT subtitles.
# Borrowed from MoneyPrinterTurbo's voice.py flow (edge_tts.Communicate with
# WordBoundary events) but standalone — only needs `pip install edge-tts`.
# Usage: python tts_subs.py <script.txt> <out.mp3> <out.srt> <out.meta.json>
import asyncio
import json
import os
import subprocess
import sys


def srt_ts(seconds: float) -> str:
    ms = int(round(max(0.0, seconds) * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


async def synth(text, mp3_path, srt_path, meta_path, voice):
    import edge_tts

    words = []
    communicate = edge_tts.Communicate(text, voice, rate="+4%", boundary="WordBoundary")
    with open(mp3_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"s": chunk["offset"] / 1e7,
                              "d": chunk["duration"] / 1e7,
                              "w": chunk["text"]})

    # Group words into short cues (<=4 words or <=1.9s) — karaoke-style pacing
    cues, cur = [], []
    for w in words:
        cur.append(w)
        span = (cur[-1]["s"] + cur[-1]["d"]) - cur[0]["s"]
        if len(cur) >= 4 or span >= 1.9:
            cues.append((cur[0]["s"], cur[-1]["s"] + cur[-1]["d"],
                         " ".join(x["w"] for x in cur)))
            cur = []
    if cur:
        cues.append((cur[0]["s"], cur[-1]["s"] + cur[-1]["d"],
                     " ".join(x["w"] for x in cur)))

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, (a, b, t) in enumerate(cues, 1):
            f.write(f"{i}\n{srt_ts(a)} --> {srt_ts(b)}\n{t}\n\n")

    duration = (words[-1]["s"] + words[-1]["d"]) if words else 10.0
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"duration": round(duration, 3), "voice": voice,
                   "cues": len(cues)}, f)


def main():
    txt_path, mp3_path, srt_path, meta_path = sys.argv[1:5]
    with open(txt_path, encoding="utf-8") as f:
        text = " ".join(f.read().split())

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet",
                        "--user", "edge-tts"], check=True)

    voice = os.environ.get("YT_TTS_VOICE", "en-US-ChristopherNeural")
    asyncio.run(synth(text, mp3_path, srt_path, meta_path, voice))


if __name__ == "__main__":
    main()
