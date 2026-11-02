'use client';
// Create Video — generative HyperFrames wizard (owner + staff).
// topic + style -> CI renders a bespoke-designed vertical short -> watch inline.
import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, PlayCircle, RefreshCw, CircleDot, CheckCircle2, XCircle, Download } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Badge, BadgeWithIcon } from '@/components/untitledui/base/badges/badges';

const STATE_BADGE = {
  queued: { color: 'warning', children: 'Rendering on CI…' },
  done: { color: 'success', children: 'Ready' },
  failed: { color: 'error', children: 'Failed' },
  unknown: { color: 'gray', children: 'In progress…' },
};
const STATE_LABEL = { queued: 'Rendering on CI…', done: 'Ready', failed: 'Failed', unknown: 'In progress…' };

export default function CreatePage() {
  const [meta, setMeta] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ topic: '', dna: 'luxury', genre: 'documentary', brand: '', subline: '', voice: 'en-US-AndrewNeural', beatCount: 5 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [playing, setPlaying] = useState(null);

  const loadJobs = useCallback(() => {
    fetch('/api/create-video')
      .then((r) => r.json())
      .then((d) => { setJobs(d.jobs || []); setMeta(d); })
      .catch(() => { });
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => {
    const t = setInterval(loadJobs, 45000);
    return () => clearInterval(t);
  }, [loadJobs]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setOkMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/create-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok || d.error) setErr(d.error || `HTTP ${r.status}`);
      else {
        setOkMsg(`Job ${d.id} queued — the AI is writing the script and designing the video now. This page updates itself.`);
        loadJobs();
      }
    } catch (e2) { setErr(String(e2.message)); }
    finally { setBusy(false); }
  };

  const input = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500/60';
  const label = 'block text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1.5';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-100"><Sparkles className="w-6 h-6 text-sky-400" /> Create Video</h1>
        <p className="mt-1 text-sm text-zinc-400">Give a topic. The AI writes the script, designs a bespoke look for it, renders a vertical short with voice + music. Every video gets its own design.</p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div>
          <label className={label}>Video topic</label>
          <input className={input} placeholder="e.g. Why quiet money beats loud money" value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })} />
        </div>

        <div>
          <label className={label}>Visual style (the AI designs within this DNA)</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(meta?.styles || []).map((s) => (
              <button type="button" key={s.id} onClick={() => setForm({ ...form, dna: s.id })}
                className={`rounded-lg border p-3 text-left transition ${form.dna === s.id ? 'border-sky-500 bg-sky-500/10' : 'border-white/10 bg-black/20 hover:border-white/25'}`}>
                <div className="text-sm font-medium text-zinc-100">{s.name}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-zinc-400">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Genre</span>
          {(meta?.genres || []).map((g) => (
            <button type="button" key={g.id} onClick={() => setForm({ ...form, genre: g.id })}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${form.genre === g.id ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/25'}`}>
              {g.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={label}>Brand name (end card)</label>
            <input className={input} placeholder="e.g. Old Money Code" value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <label className={label}>Tagline (optional)</label>
            <input className={input} placeholder="e.g. Quiet wealth · every day" value={form.subline}
              onChange={(e) => setForm({ ...form, subline: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Voice</label>
              <select className={input} value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>
                {(meta?.voices || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Beats</label>
              <select className={input} value={form.beatCount} onChange={(e) => setForm({ ...form, beatCount: Number(e.target.value) })}>
                {[4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} (~{n * 4}s)</option>)}
              </select>
            </div>
          </div>
        </div>

        {err && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{err}</div>}
        {okMsg && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{okMsg}</div>}

        <Button type="submit" color="primary" isDisabled={busy} iconLeading={busy ? <Loader2 className="animate-spin" /> : <Sparkles />}>
          {busy ? 'Queueing…' : 'Generate video'}
        </Button>
        {!meta?.gh && <div className="text-xs text-amber-400">⚠ No GITHUB_TOKEN on the server — queueing is disabled.</div>}
      </form>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-zinc-200">Rendered videos</h2>
        <button onClick={loadJobs} className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
          <RefreshCw className="w-3.5 h-3.5" /> refresh
        </button>
      </div>

      {jobs.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">No videos yet — create your first one above.</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jobs.map((j) => (
          <div key={j.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            {playing === j.id && j.videoUrl ? (
              <video src={j.videoUrl} controls autoPlay className="w-full aspect-[9/16] max-h-[480px] bg-black object-contain" />
            ) : j.state === 'done' ? (
              <button onClick={() => setPlaying(j.id)} className="relative block w-full">
                <img src={`https://raw.githubusercontent.com/muzzamilhassan/automation/main/hf-out/${j.id}/frame-a.jpg`} alt="" className="w-full aspect-[9/16] max-h-[480px] object-cover opacity-90" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <PlayCircle className="w-14 h-14 text-white drop-shadow-lg" />
                </span>
              </button>
            ) : (
              <div className="flex w-full items-center justify-center aspect-[9/16] max-h-[480px] bg-black/40">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  {j.state === 'failed' ? <XCircle className="w-5 h-5 text-rose-400" /> : <Loader2 className="w-5 h-5 animate-spin text-sky-400" />}
                  {STATE_LABEL[j.state] || j.state}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-zinc-200"><Badge color={(STATE_BADGE[j.state] || STATE_BADGE.unknown).color} size="sm">{(STATE_BADGE[j.state] || STATE_BADGE.unknown).children}</Badge><span className="truncate">{j.topic || j.id}</span></div>
                <div className="mt-0.5 text-[11px] text-zinc-500">{j.brand} · {j.dna}{j.durationSec ? ` · ${j.durationSec}s` : ''}</div>
              </div>
              {j.state === 'done' && j.videoUrl && (
                <a href={j.videoUrl} download className="shrink-0 rounded-md border border-white/10 p-2 text-zinc-400 hover:text-zinc-100" title="Download MP4">
                  <Download className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
