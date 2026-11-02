# Colab MCP driver v5 — FOREGROUND generation (tab must stay open ~50 min).
# Each finished track uploads to the GitHub release immediately (token via env),
# so even a mid-run disconnect keeps completed tracks.
import subprocess, json, sys, os, time, re, threading, queue, urllib.request

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
LOG = r"C:\Users\Revnix\Documents\youtube-automation\colab-run.log"
REPO = "muzzamilhassan/automation"
TAG = "own-music-v1"
pat = ""
for line in open(r"C:\Users\Revnix\Documents\youtube-automation\.env", encoding="utf-8"):
    m = re.match(r"^GITHUB_PAT=(.*)$", line)
    if m: pat = m.group(1).strip()

proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp@b9ab3899e0f1fa493390b1fd6d54aa2e464ecdf1"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open(r"C:\Users\Revnix\Documents\youtube-automation\colab-mcp-stderr5.log", "wb"),
    text=True, encoding="utf-8", bufsize=1,
)
logf = open(LOG, "a", encoding="utf-8")
def log(s):
    logf.write(s + "\n"); logf.flush(); print(s, flush=True)

send_id = 6000
def send(obj): proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

# #51: one persistent reader thread feeds a queue — readline() used to block
# past any deadline when the colab-mcp server went silent without dying
outq = queue.Queue()
def _reader():
    for line in proc.stdout:
        outq.put(line)
    outq.put(None)  # EOF sentinel
threading.Thread(target=_reader, daemon=True).start()

def rpc(method, params, timeout=120):
    global send_id
    send_id += 1
    rid = send_id
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    deadline = time.time() + timeout
    while True:
        remaining = deadline - time.time()
        if remaining <= 0: return {"error": "timeout"}
        try: line = outq.get(timeout=min(remaining, 0.5))
        except queue.Empty: continue
        if line is None: return {"error": "server died"}  # EOF (#51: poll-aware)
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == rid: return msg

log("=== driver v5 start ===")
init_res = (rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "quarry-zcode", "version": "1.0"}}, 120) or {}).get("result") or {}
if "protocolVersion" not in init_res:
    log("FATAL init"); sys.exit(1)
log("initialized: " + str(init_res.get("serverInfo", {})))
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

def tools_list():
    r = rpc("tools/list", {}, 30)
    return (r.get("result") or {}).get("tools", [])

def call_tool(name, args, timeout=300):
    r = rpc("tools/call", {"name": name, "arguments": args}, timeout)
    res = r.get("result") or {}
    txt = ""
    try: txt = "\n".join(c.get("text", "") for c in res.get("content", []))
    except: pass
    return res, txt

# ---- connect (retry up to ~20 min; auto-connects if a T4 tab is alive) ----
connected = False
for attempt in range(1, 4):
    log(f"connect attempt {attempt}/3")
    res, txt = call_tool("open_colab_browser_connection", {}, 420)
    ok = (res.get("isError") is not True) and ("true" in (txt or "").lower())
    log(f"  -> {'connected' if ok else txt[:80]}")
    if ok: connected = True; break
    time.sleep(15)
if not connected:
    log("FATAL: no browser connection"); sys.exit(2)

tools = tools_list()
log("unlocked tools: " + str([t["name"] for t in tools]))

def find_tool(*keywords):
    for t in tools:
        if all(k in t["name"].lower() for k in keywords): return t
    return None

add_tool = find_tool("add", "code")
run_tool = find_tool("run", "code")
if not add_tool or not run_tool:
    log("FATAL: cell tools missing"); sys.exit(3)

def colab_exec(code, timeout=300):
    res, txt = call_tool(add_tool["name"], {"cellIndex": 0, "language": "python", "code": code}, 60)
    if res.get("isError"): return "ADD-ERR " + txt[:250]
    cid = None
    try: cid = json.loads(txt).get("newCellId")
    except: pass
    if not cid: return "ADD-ERR no cell id"
    res, txt = call_tool(run_tool["name"], {"cellId": cid}, timeout)
    return txt

# ---- 1. install ----
log("step: install diffusers")
out = colab_exec("""
import subprocess, sys
def pip(args):
    r = subprocess.run([sys.executable, '-m', 'pip', 'install', '-Uq'] + args, capture_output=True, text=True)
    return r.returncode
def test():
    # #50: the top-level import passes while from_pretrained's LAZY chain
    # (diffusers.loaders.lora_pipeline -> torchao.quantization) fails — probe
    # the deep chain so a bad pin is caught here, not after 70 minutes
    r = subprocess.run([sys.executable, '-c', 'from diffusers import AceStepPipeline; import diffusers.loaders.lora_pipeline'], capture_output=True, text=True)
    return r.returncode == 0
print('base install...')
pip(['diffusers', 'soundfile', 'torchao'])
ok = test()
print('test1:', ok)
if not ok:
    print('torchao from main...')
    pip(['git+https://github.com/pytorch/ao'])
    ok = test()
    print('test2:', ok)
if not ok:
    print('diffusers from main...')
    pip(['git+https://github.com/huggingface/diffusers'])
    pip(['git+https://github.com/pytorch/ao'])
    ok = test()
    print('test3:', ok)
if not ok:
    print('ALL_FAILED')
else:
    print('IMPORT_CHAIN_OK')
""", 420)
log("install -> " + out[-120:])

# ---- 2. write the generation script (with per-track upload) ----
gen_py = r'''
import os, json, subprocess, time, torch, soundfile as sf
REPO = "muzzamilhassan/automation"
TAG = "own-music-v1"
GH = os.environ.get("GITHUB_TOKEN", "")
os.makedirs("/content/own-music", exist_ok=True)
from diffusers import AceStepPipeline
print("loading model...", flush=True)
pipe = AceStepPipeline.from_pretrained("ACE-Step/acestep-v15-xl-turbo-diffusers", torch_dtype=torch.float16)
pipe = pipe.to("cuda")
print("model on GPU", flush=True)

def upload(path, name):
    if not GH: return
    import urllib.request
    global _rel
    h = {"Authorization": f"Bearer {GH}", "User-Agent": "colab-gen"}
    try:
        if _rel is None:
            _rel = json.load(urllib.request.urlopen(urllib.request.Request(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}", headers=h)))
    except Exception:
        body = json.dumps({"tag_name": TAG, "name": "Quarry Originals", "body": "Self-produced ACE-Step instrumentals (Apache 2.0)."}).encode()
        req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/releases", method="POST", data=body, headers={"Authorization": f"Bearer {GH}", "Content-Type": "application/json", "User-Agent": "colab-gen"})
        _rel = json.load(urllib.request.urlopen(req))
    existing = {a["name"] for a in _rel.get("assets", [])}
    if name in existing:
        print("asset exists, skip", name, flush=True); return
    req = urllib.request.Request(f"https://uploads.github.com/repos/{REPO}/releases/{_rel['id']}/assets?name={name}",
                                 method="POST", data=open(path, "rb").read(),
                                 headers={"Authorization": f"Bearer {GH}", "Content-Type": "application/octet-stream", "User-Agent": "colab-gen"})
    urllib.request.urlopen(req)
    print("asset uploaded:", name, flush=True)
_rel = None

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
  ('luxury', 103, 'quiet luxury jazz lounge, warm saxophone, classy, instrumental', 120),
  ('dark', 1, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 2, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 3, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 4, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
]
print("plan:", len(MOOD_PLAN), flush=True)
done = 0
t0 = time.time()
for mood, seed, tags, dur in MOOD_PLAN:
    out_dir = f"/content/own-music/{mood}"
    os.makedirs(out_dir, exist_ok=True)
    name = f"qs-{mood}-{seed:03d}.mp3"
    if os.path.exists(f"{out_dir}/{name}") and os.path.getsize(f"{out_dir}/{name}") > 300000:
        done += 1; continue
    try:
        g = torch.Generator("cuda").manual_seed(seed)
        audio = pipe(prompt=f"{tags}, professional background music", lyrics="",
                     audio_duration=float(dur), num_inference_steps=8, generator=g).audios
        wav = f"{out_dir}/{name.replace('.mp3', '.wav')}"
        sf.write(wav, audio[0].T.float().cpu().numpy(), 48000)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                        "-codec:a", "libmp3lame", "-b:a", "192k",
                        f"{out_dir}/{name}"], check=True)
        os.remove(wav)
        done += 1
        upload(f"{out_dir}/{name}", name)
        print(f"PROGRESS {done}/{len(MOOD_PLAN)} {name} ({round(time.time()-t0)}s)", flush=True)
    except Exception as e:
        print(f"FAILED {name}: {str(e)[:100]}", flush=True)
    time.sleep(2)
print(f"GENERATION_DONE {done}/{len(MOOD_PLAN)} total_time={round(time.time()-t0)}s", flush=True)
'''
writer = ("from pathlib import Path\nf = Path('/content/generate.py')\n"
          "f.write_text(" + repr(gen_py) + ")\nprint('written', len(f.read_text()))")
out = colab_exec(writer, 120)
log("generate.py -> " + out[-100:])

# ---- 3. token env + FOREGROUND run with long timeout (~65 min) ----
# #50: validate the token BEFORE burning 70 minutes (a kernel restart wipes env)
try:
    pre = urllib.request.urlopen(urllib.request.Request("https://api.github.com/users/", headers={"Authorization": f"Bearer {pat}", "User-Agent": "colab-gen"}))
    log("token pre-flight OK")
except Exception as e:
    log(f"FATAL: GITHUB_PAT invalid before run: {str(e)[:80]}"); sys.exit(4)
log("step: launching generation FOREGROUND (up to ~65 min) — tab must stay open")
launch_code = ("import os\n"
               "os.environ['GITHUB_TOKEN'] = " + repr(pat) + "\n"
               "exec(open('/content/generate.py').read())")
# add + run the generation cell (#73: the "__never__" placeholder call was a
# doomed -32602 whose stale response polluted later rpc calls)
res, txt = call_tool(add_tool["name"], {"cellIndex": 0, "language": "python", "code": launch_code}, 60)
if res.get("isError"): log("FATAL add: " + txt[:200]); sys.exit(3)
cid = None
try: cid = json.loads(txt).get("newCellId")
except: pass
if not cid: log("FATAL: no newCellId"); sys.exit(3)
log("generation cell running — waiting for completion (this cell takes ~50-70 min)")
res, txt = call_tool(run_tool["name"], {"cellId": cid}, 4200)
if res.get("isError"): log("FATAL: generation cell errored -> " + txt[-200:]); sys.exit(5)
log("generation cell finished -> " + txt[-300:])
# #50: a 0-track run is a FAILURE, not "complete" (old code exited 0 on it)
m = re.search(r"GENERATION_DONE (\d+)/(\d+)", txt or "")
if not m:
    log("FATAL: no GENERATION_DONE marker in output"); sys.exit(5)
done_n, total_n = int(m.group(1)), int(m.group(2))
if done_n == 0:
    log(f"FATAL: 0/{total_n} tracks generated"); sys.exit(5)
log(f"tracks generated: {done_n}/{total_n}")

# ---- 4. upload any tracks not yet uploaded (belt) + summary ----
log("final upload sweep")
upload_sweep = ("import os, glob, json, urllib.request\n"
                "REPO='muzzamilhassan/automation'; TAG='own-music-v1'; GH=os.environ.get('GITHUB_TOKEN','')\n"
                "h={'Authorization': f'Bearer {GH}', 'User-Agent': 'colab-gen'}\n"
                "try:\n    rel=json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases/tags/{TAG}', headers=h)))\n"
                "except Exception:\n"
                "    body=json.dumps({'tag_name':TAG,'name':'Quarry Originals','body':'x'}).encode()\n"
                "    rel=json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases', method='POST', data=body, headers={'Authorization': f'Bearer {GH}', 'Content-Type': 'application/json', 'User-Agent': 'colab-gen'})))\n"
                "existing={a['name'] for a in rel.get('assets', [])}\n"
                "n=0\n"
                "for f in sorted(glob.glob('/content/own-music/*/*.mp3')):\n"
                "    name=os.path.basename(f)\n"
                "    if name in existing: continue\n"
                "    req=urllib.request.Request(f'https://uploads.github.com/repos/{REPO}/releases/{rel[\"id\"]}/assets?name={name}', method='POST', data=open(f,'rb').read(), headers={'Authorization': f'Bearer {GH}', 'Content-Type': 'application/octet-stream', 'User-Agent': 'colab-gen'})\n"
                "    urllib.request.urlopen(req); n+=1\n"
                "print('sweep uploaded', n)")
if not pat:
    log("FATAL: sweep skipped — no GITHUB_PAT"); sys.exit(6)
out = colab_exec(upload_sweep, 300)
log("sweep -> " + out[-150:])
if "sweep uploaded 0" in (out or "") and done_n < total_n:
    log(f"FATAL: sweep uploaded 0 with {done_n}/{total_n} generated"); sys.exit(6)

log(f"=== driver v5 complete ({done_n}/{total_n} tracks) ===")
