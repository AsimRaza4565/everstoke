# Runtime-side generation script (runs INSIDE the Colab GPU runtime).
# Written to /content/generate.py by the driver; runs as a background process.
import os, subprocess, time, torch, soundfile as sf
os.makedirs('/content/own-music', exist_ok=True)
from diffusers import AceStepPipeline
pipe = AceStepPipeline.from_pretrained("ACE-Step/acestep-v15-xl-turbo-diffusers", torch_dtype=torch.float16)
pipe = pipe.to("cuda")
print('model loaded', flush=True)
MOOD_PLAN = [
  ('calm', 1, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 2, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 3, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 4, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 5, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 6, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 101, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 102, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 103, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 104, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 105, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 106, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('epic', 1, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 2, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 3, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 4, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 5, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 101, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 102, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 103, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 104, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 105, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('driving', 1, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 2, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 3, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 4, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 101, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('driving', 102, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('driving', 103, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('driving', 104, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('bright', 1, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 2, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 3, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 4, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 101, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('bright', 102, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('bright', 103, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('bright', 104, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('luxury', 1, 'elegant neoclassical strings and grand piano, sophisticated, slow waltz, instrumental', 120),
  ('luxury', 2, 'elegant neoclassical strings and grand piano, sophisticated, slow waltz, instrumental', 120),
  ('luxury', 3, 'elegant neoclassical strings and grand piano, sophisticated, slow waltz, instrumental', 120),
  ('luxury', 101, 'quiet luxury jazz lounge, smooth brushes, warm saxophone, classy, instrumental', 120),
  ('luxury', 102, 'quiet luxury jazz lounge, smooth brushes, warm saxophone, classy, instrumental', 120),
  ('luxury', 103, 'quiet luxury jazz lounge, smooth brushes, warm saxophone, classy, instrumental', 120),
  ('dark', 1, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 2, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 3, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 4, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
]
print('plan:', len(MOOD_PLAN), 'tracks', flush=True)

REPO = 'muzzamilhassan/automation'
RELEASE_TAG = 'own-music-v1'
GH_TOKEN = os.environ.get('GITHUB_TOKEN', '')
_rel = None
def upload_track(path, name):
    global _rel
    import urllib.request
    if not GH_TOKEN:
        print('no token — skip upload', name, flush=True); return
    if _rel is None:
        import urllib.request
        h = {'Authorization': f'Bearer {GH_TOKEN}', 'User-Agent': 'colab-gen'}
        try:
            _rel = json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases/tags/{RELEASE_TAG}', headers=h)))
        except Exception:
            body = json.dumps({'tag_name': RELEASE_TAG, 'name': 'Quarry Originals — own music library', 'body': 'Self-produced ACE-Step instrumentals (Apache 2.0).'}).encode()
            req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases', method='POST', data=body, headers={'Authorization': f'Bearer {GH_TOKEN}', 'Content-Type': 'application/json', 'User-Agent': 'colab-gen'})
            _rel = json.load(urllib.request.urlopen(req))
    existing = {a['name'] for a in _rel.get('assets', [])}
    if name in existing:
        print('asset exists, skip', name, flush=True); return
    req = urllib.request.Request(f'https://uploads.github.com/repos/{REPO}/releases/{_rel["id"]}/assets?name={name}',
                                 method='POST', data=open(path, 'rb').read(),
                                 headers={'Authorization': f'Bearer {GH_TOKEN}', 'Content-Type': 'application/octet-stream', 'User-Agent': 'colab-gen'})
    urllib.request.urlopen(req)
    print('asset uploaded:', name, flush=True)
done, failed = 0, []
t0 = time.time()
for mood, seed, tags, dur in MOOD_PLAN:
    out_dir = f'/content/own-music/{mood}'
    os.makedirs(out_dir, exist_ok=True)
    out_name = f'qs-{mood}-{seed:03d}'
    if os.path.exists(f'{out_dir}/{out_name}.mp3'):
        done += 1; continue
    try:
        g = torch.Generator('cuda').manual_seed(seed)
        audio = pipe(prompt=f'{tags}, professional background music', lyrics='',
                     audio_duration=float(dur), num_inference_steps=8, generator=g).audios
        wav = f'/content/{out_name}.wav'
        sf.write(wav, audio[0].T.float().cpu().numpy(), 48000)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-codec:a', 'libmp3lame', '-b:a', '192k',
                        f'{out_dir}/{out_name}.mp3'], check=True)
        os.remove(wav)
        done += 1
        try: upload_track(out, out_name + '.mp3')
        except Exception as ue: print('upload fail', out_name, str(ue)[:60], flush=True)
        print(f'PROGRESS {done}/{len(MOOD_PLAN)} {out_name}.mp3', flush=True)
    except Exception as e:
        failed.append((out_name, str(e)[:80]))
        print(f'FAILED {out_name}: {str(e)[:80]}', flush=True)
    time.sleep(2)
print(f'GENERATION_DONE {done}/{len(MOOD_PLAN)} failed={len(failed)}', flush=True)
