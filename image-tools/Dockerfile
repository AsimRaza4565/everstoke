FROM node:20-alpine
RUN apk add --no-cache font-noto font-liberation fontconfig ffmpeg
WORKDIR /app
RUN npm install sharp --no-audit --no-fund
COPY server.js codecard-v2.js ./
# Premium open fonts (OFL) for code-card rendering — identical output in container & CI
COPY fonts/ /usr/share/fonts/truetype/custom/
RUN fc-cache -f

# Synthesize 3 royalty-free ambient audio beds (own construction — no licensing constraints).
# To use real music instead: drop files named warm-pad.*, low-drone.*, airy.* into an ./audio
# folder next to this Dockerfile and rebuild — they override these.
RUN mkdir -p /app/audio && \
    ffmpeg -y -filter_complex "sine=frequency=110:duration=60,volume=0.32[a];sine=frequency=164.81:duration=60,volume=0.20[b];sine=frequency=220:duration=60,volume=0.13[c];anoisesrc=color=brown:duration=60:amplitude=0.025[d];[a][b][c][d]amix=inputs=4:duration=longest,tremolo=f=0.15:d=0.55,afade=t=in:st=0:d=4,afade=t=out:st=53:d=7" -c:a aac -b:a 128k /app/audio/warm-pad.m4a && \
    ffmpeg -y -filter_complex "sine=frequency=55:duration=60,volume=0.34[a];sine=frequency=82.41:duration=60,volume=0.22[b];sine=frequency=110:duration=60,volume=0.10[c];anoisesrc=color=brown:duration=60:amplitude=0.03[d];[a][b][c][d]amix=inputs=4:duration=longest,tremolo=f=0.1:d=0.4,afade=t=in:st=0:d=4,afade=t=out:st=53:d=7" -c:a aac -b:a 128k /app/audio/low-drone.m4a && \
    ffmpeg -y -filter_complex "sine=frequency=261.63:duration=60,volume=0.16[a];sine=frequency=392:duration=60,volume=0.11[b];sine=frequency=523.25:duration=60,volume=0.07[c];anoisesrc=color=pink:duration=60:amplitude=0.015[d];[a][b][c][d]amix=inputs=4:duration=longest,tremolo=f=0.25:d=0.5,afade=t=in:st=0:d=4,afade=t=out:st=53:d=7" -c:a aac -b:a 128k /app/audio/airy.m4a

# Real CC-BY ambient tracks (preferred by /reel over the synthesized beds).
# warm-pad = "White Petals" — Keys of Moon (CC BY 4.0)
# low-drone = "Sweet Dreams" — BatchBug (CC BY 3.0)
# airy = "Memories of Spring" — Tokyo Music Walker (CC BY 3.0)
# Sources: chosic.com — the workflow appends the credit line to reel captions.
COPY audio/ /app/audio/

EXPOSE 3210
CMD ["node", "server.js"]
