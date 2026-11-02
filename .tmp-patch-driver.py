p = 'colab-driver-v5.py'
s = open(p, encoding='utf-8').read()

s = s.replace("import subprocess, json, sys, os, time, re",
              "import subprocess, json, sys, os, time, re, threading, queue, urllib.request")

old_rpc = (
    'send_id = 6000\n'
    'def send(obj): proc.stdin.write(json.dumps(obj) + "\\n"); proc.stdin.flush()\n'
    '\n'
    'def rpc(method, params, timeout=120):\n'
    '    global send_id\n'
    '    send_id += 1\n'
    '    rid = send_id\n'
    '    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})\n'
    '    deadline = time.time() + timeout\n'
    '    while time.time() < deadline:\n'
    '        line = proc.stdout.readline()\n'
    '        if not line:\n'
    '            time.sleep(0.05)\n'
    '            if proc.poll() is not None: return {"error": "server died"}\n'
    '            continue\n'
    '        try: msg = json.loads(line)\n'
    '        except: continue\n'
    '        if msg.get("id") == rid: return msg\n'
    '    return {"error": "timeout"}')
new_rpc = (
    'send_id = 6000\n'
    'def send(obj): proc.stdin.write(json.dumps(obj) + "\\n"); proc.stdin.flush()\n'
    '\n'
    '# #51: one persistent reader thread feeds a queue — readline() used to block\n'
    '# past any deadline when the colab-mcp server went silent without dying\n'
    'outq = queue.Queue()\n'
    'def _reader():\n'
    '    for line in proc.stdout:\n'
    '        outq.put(line)\n'
    '    outq.put(None)  # EOF sentinel\n'
    'threading.Thread(target=_reader, daemon=True).start()\n'
    '\n'
    'def rpc(method, params, timeout=120):\n'
    '    global send_id\n'
    '    send_id += 1\n'
    '    rid = send_id\n'
    '    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})\n'
    '    deadline = time.time() + timeout\n'
    '    while True:\n'
    '        remaining = deadline - time.time()\n'
    '        if remaining <= 0: return {"error": "timeout"}\n'
    '        try: line = outq.get(timeout=min(remaining, 0.5))\n'
    '        except queue.Empty: continue\n'
    '        if line is None: return {"error": "server died"}  # EOF (#51: poll-aware)\n'
    '        try: msg = json.loads(line)\n'
    '        except: continue\n'
    '        if msg.get("id") == rid: return msg')
assert old_rpc in s, 'rpc anchor missing'
s = s.replace(old_rpc, new_rpc)

old_test = (
    'def test():\n'
    '    r = subprocess.run([sys.executable, "-c", "from diffusers import AceStepPipeline"], capture_output=True, text=True)\n'
    '    return r.returncode == 0')
new_test = (
    'def test():\n'
    '    # #50: the top-level import passes while from_pretrained\'s LAZY chain\n'
    '    # (diffusers.loaders.lora_pipeline -> torchao.quantization) fails — probe\n'
    '    # the deep chain so a bad pin is caught here, not after 70 minutes\n'
    '    r = subprocess.run([sys.executable, "-c", "from diffusers import AceStepPipeline; import diffusers.loaders.lora_pipeline"], capture_output=True, text=True)\n'
    '    return r.returncode == 0')
assert old_test in s, 'test anchor missing'
s = s.replace(old_test, new_test)

old_guard = (
    'def upload(path, name):\n'
    '    if not GH: return\n'
    '    import urllib.request\n'
    '    global _rel\n'
    '    try:\n'
    '        if _rel is None: raise FileNotFoundError\n'
    '    except NameError:\n'
    '        _rel = None\n'
    '    h = {"Authorization": f"Bearer {GH}", "User-Agent": "colab-gen"}')
new_guard = (
    'def upload(path, name):\n'
    '    if not GH: return\n'
    '    import urllib.request\n'
    '    global _rel\n'
    '    h = {"Authorization": f"Bearer {GH}", "User-Agent": "colab-gen"}')
assert old_guard in s, 'guard anchor missing'
s = s.replace(old_guard, new_guard)

old_flight = (
    '# ---- 3. token env + FOREGROUND run with long timeout (~65 min) ----\n'
    'log("step: launching generation FOREGROUND (up to ~65 min) — tab must stay open")')
new_flight = (
    '# ---- 3. token env + FOREGROUND run with long timeout (~65 min) ----\n'
    '# #50: validate the token BEFORE burning 70 minutes (a kernel restart wipes env)\n'
    'try:\n'
    '    pre = urllib.request.urlopen(urllib.request.Request("https://api.github.com/users/", headers={"Authorization": f"Bearer {pat}", "User-Agent": "colab-gen"}))\n'
    '    log("token pre-flight OK")\n'
    'except Exception as e:\n'
    '    log(f"FATAL: GITHUB_PAT invalid before run: {str(e)[:80]}"); sys.exit(4)\n'
    'log("step: launching generation FOREGROUND (up to ~65 min) — tab must stay open")')
assert old_flight in s, 'flight anchor missing'
s = s.replace(old_flight, new_flight)

old_gen = (
    'res, txt = call_tool(run_tool["name"], {"cellId": cid}, 4200)\n'
    'log("generation cell finished -> " + txt[-300:])')
new_gen = (
    'res, txt = call_tool(run_tool["name"], {"cellId": cid}, 4200)\n'
    'if res.get("isError"): log("FATAL: generation cell errored -> " + txt[-200:]); sys.exit(5)\n'
    'log("generation cell finished -> " + txt[-300:])\n'
    '# #50: a 0-track run is a FAILURE, not "complete" (old code exited 0 on it)\n'
    'm = re.search(r"GENERATION_DONE (\\d+)/(\\d+)", txt or "")\n'
    'if not m:\n'
    '    log("FATAL: no GENERATION_DONE marker in output"); sys.exit(5)\n'
    'done_n, total_n = int(m.group(1)), int(m.group(2))\n'
    'if done_n == 0:\n'
    '    log(f"FATAL: 0/{total_n} tracks generated"); sys.exit(5)\n'
    'log(f"tracks generated: {done_n}/{total_n}")')
assert old_gen in s, 'gen anchor missing'
s = s.replace(old_gen, new_gen)

old_sweep = (
    'out = colab_exec(upload_sweep, 300)\n'
    'log("sweep -> " + out[-150:])\n'
    '\n'
    'log("=== driver v5 complete ===")')
new_sweep = (
    'if not pat:\n'
    '    log("FATAL: sweep skipped — no GITHUB_PAT"); sys.exit(6)\n'
    'out = colab_exec(upload_sweep, 300)\n'
    'log("sweep -> " + out[-150:])\n'
    'if "sweep uploaded 0" in (out or "") and done_n < total_n:\n'
    '    log(f"FATAL: sweep uploaded 0 with {done_n}/{total_n} generated"); sys.exit(6)\n'
    '\n'
    'log(f"=== driver v5 complete ({done_n}/{total_n} tracks) ===")')
assert old_sweep in s, 'sweep anchor missing'
s = s.replace(old_sweep, new_sweep)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('driver patched OK')
