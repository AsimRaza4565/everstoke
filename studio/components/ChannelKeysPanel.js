'use client';
// Per-channel API keys panel (#103) — lives inside the Channels page cards
// (same pattern as SchedulePanel / TemplateAssignPanel). All key behavior is
// unchanged from the retired /keys page: live validate-before-save,
// AES-256-GCM at rest, masked read-back forever. The parent only mounts this
// while open, so fetch-on-mount == fetch-on-open.
import { useEffect, useState } from 'react';
import { KeyRound, Loader2, CheckCircle2, XCircle, Trash2, ExternalLink, Info } from 'lucide-react';

export default function ChannelKeysPanel({ slug }) {
  const [providers, setProviders] = useState(null);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState('');       // provider currently saving/removing
  const [msg, setMsg] = useState({});         // provider -> {ok, text}
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null); // friendly denial / network error (AC-12)

  const load = () => {
    setLoading(true);
    setLoadErr(null);
    fetch(`/api/channels/keys?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setProviders(d.providers || null);
        setMeta({ updated: d.updated, updatedBy: d.updatedBy });
      })
      .catch((e) => setLoadErr(String(e.message || e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [slug]);

  const save = async (provider) => {
    const key = (inputs[provider] || '').trim();
    if (!key) { setMsg((m) => ({ ...m, [provider]: { ok: false, text: 'paste a key first' } })); return; }
    setBusy(provider);
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider, key }),
      });
      const d = await r.json();
      setMsg((m) => ({ ...m, [provider]: d.ok ? { ok: true, text: `saved ${d.masked}` } : { ok: false, text: d.error || 'rejected' } }));
      if (d.ok) load();
    } catch (e) {
      setMsg((m) => ({ ...m, [provider]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  };

  const remove = async (provider) => {
    setBusy(provider);
    try {
      const r = await fetch('/api/channels/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg((m) => ({ ...m, [provider]: r.ok ? { ok: true, text: 'removed — shared key takes over' } : { ok: false, text: d.error || `remove failed (${r.status})` } }));
      if (r.ok) load();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="inset-tile p-4 mt-1">
      <div className="flex items-center gap-2 overline mb-3">
        <KeyRound size={12} /> API keys
      </div>

      {meta?.updated ? (
        <div className="flex gap-2 items-start mb-3 text-[11.5px] text-muted">
          <Info size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
          <span>Last change {String(meta.updated).slice(0, 16).replace('T', ' ')} UTC · by {meta.updatedBy || '—'} · every change is also in the audit log and git history.</span>
        </div>
      ) : null}

      {loadErr ? (
        <div className="flex items-center gap-2 text-[12px] py-1" style={{ color: 'var(--bad)' }}>
          <XCircle size={13} className="shrink-0" /> {loadErr}
        </div>
      ) : loading || !providers ? (
        <div className="flex items-center gap-2 text-muted text-[12px] py-4"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(providers).map(([p, v]) => (
            <div key={p} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[12.5px] text-ink">{v.label}</span>
                <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-white/10 text-muted">{v.hint}</span>
                {v.set ? (
                  <span className="ml-auto text-[11px] flex items-center gap-1" style={{ color: 'var(--ok)' }}><CheckCircle2 size={12} /> {v.masked}</span>
                ) : (
                  <span className="ml-auto text-[11px] text-faint">not set — shared key is used</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  type="password"
                  placeholder={v.set ? 'paste a new key to replace' : `paste ${v.label.split(' ')[0]} key…`}
                  value={inputs[p] || ''}
                  onChange={(e) => setInputs((s) => ({ ...s, [p]: e.target.value }))}
                  className="flex-1 min-w-[200px] text-[12.5px] px-3 py-1.5 rounded-lg border border-white/10 bg-black/20"
                  autoComplete="new-password"
                />
                <button
                  onClick={() => save(p)}
                  disabled={busy === p}
                  className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-50 flex items-center gap-1"
                >
                  {busy === p ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Save &amp; test
                </button>
                {v.set ? (
                  <button
                    onClick={() => remove(p)}
                    disabled={busy === p}
                    className="text-[11px] px-2 py-1.5 rounded-lg border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-50"
                    title="remove — shared key takes over again"
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
                <a href={v.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted hover:text-ink flex items-center gap-1 ml-auto">
                  get a key <ExternalLink size={10} />
                </a>
              </div>
              {msg[p] ? (
                <p className="text-[11px] mt-2 flex items-center gap-1" style={{ color: msg[p].ok ? 'var(--ok)' : 'var(--bad)' }}>
                  {msg[p].ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {msg[p].text}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-start mt-3 text-[11px] text-muted leading-relaxed">
        <Info size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
        <span>
          Channel keys run <span className="text-ink font-medium">before</span> the shared keys; if a channel has no key for a provider, the shared key is used. A saved key is encrypted with AES-256-GCM and can only be replaced or removed — never viewed again.
        </span>
      </div>
    </div>
  );
}
