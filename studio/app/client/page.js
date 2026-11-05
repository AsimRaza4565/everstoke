'use client';
// DFY client workspace — /client. Bare layout (no full studio nav): a client
// of the done-for-you service sees only their channel(s), live stats, what the
// engine produced, and the topic approvals. /api/overview already scopes the
// payload to the caller's channels (clients = registry ownerEmail match).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, BadgeCheck, PauseCircle, Sparkles, Clock, KeyRound, CheckCircle2, XCircle } from 'lucide-react';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const day = (s) => (s ? String(s).slice(0, 10) : '—');

export default function ClientPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | anon | ok

  useEffect(() => {
    fetch('/api/overview')
      .then(async (r) => {
        if (r.status === 401) { setStatus('anon'); return null; }
        const d = await r.json();
        setData(d);
        setStatus('ok');
        return d;
      })
      .catch(() => setStatus('anon'));
  }, []);

  if (status === 'loading') {
    return (
      <main className="min-h-screen bg-bg text-ink flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted text-sm"><Loader2 size={15} className="animate-spin" /> Loading your channel…</div>
      </main>
    );
  }

  if (status === 'anon') {
    return (
      <main className="min-h-screen bg-bg text-ink flex items-center justify-center px-5">
        <div className="border border-line rounded-xl p-6 bg-surface max-w-sm text-center">
          <Lock size={18} className="mx-auto mb-2 text-muted" />
          <div className="font-semibold">Client sign-in required</div>
          <p className="text-[12.5px] text-muted mt-1 leading-relaxed">Sign in with the email your channel manager invited you with.</p>
          <button onClick={() => router.push('/login?next=/client')} className="mt-4 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-line hover:bg-surface-2">
            Go to sign-in
          </button>
        </div>
      </main>
    );
  }

  const channels = data?.channels || [];
  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted">Everstoke Studio · done-for-you</div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Your channel, today</h1>
          </div>
          <a href="/thumbs" className="text-[12px] text-muted hover:text-ink mr-3">Thumbnails →</a>
          <a href="/" className="text-[12px] text-muted hover:text-ink">Full studio →</a>
        </div>

        {!channels.length ? (
          <div className="border border-line rounded-xl p-5 bg-surface text-[13px] text-muted">
            No channel is linked to your account yet — your channel manager connects it during onboarding.
          </div>
        ) : (
          <div className="space-y-5">
            {channels.map((c) => {
              const upcoming = (c.todayVideos || 0) > 0;
              return (
                <div key={c.slug} className="border border-line rounded-xl bg-surface overflow-hidden">
                  <div className="px-5 pt-5 pb-4 flex items-center gap-2.5 border-b border-line">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.accent }} />
                    <div className="font-semibold">{c.label}</div>
                    <span className="ml-auto text-[10.5px] px-2 py-0.5 rounded-full border border-line flex items-center gap-1" style={{ color: c.flowPaused ? 'var(--warn)' : (c.lastRun ? 'var(--ok)' : 'var(--muted)') }}>
                      {c.flowPaused ? <><PauseCircle size={11} /> paused</> : (c.lastRun ? <><BadgeCheck size={11} /> engine running</> : <>standby — never run</>)}
                    </span>
                  </div>
                  <div className="px-5 py-4 grid grid-cols-3 gap-2">
                    <div><div className="text-[10.5px] uppercase tracking-wide text-faint">Subscribers</div><div className="text-lg font-semibold">{fmt(c.yt?.subs)}</div></div>
                    <div><div className="text-[10.5px] uppercase tracking-wide text-faint">All-time views</div><div className="text-lg font-semibold">{fmt(c.yt?.views)}</div></div>
                    <div><div className="text-[10.5px] uppercase tracking-wide text-faint">Videos live</div><div className="text-lg font-semibold">{fmt(c.yt?.videos)}</div></div>
                  </div>
                  <div className="px-5 pb-5 space-y-3">
                    <div className="inset-tile p-3 flex gap-2.5 items-start">
                      <Clock size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                      <p className="text-[12.5px] text-muted leading-relaxed">
                        Last production run: <span className="text-ink font-medium">{day(c.lastRun)}</span>
                        {upcoming ? ' · new videos are scheduled and will go public at their slot times.' : ' · the next video is being researched and produced.'}
                      </p>
                    </div>
                    <KeysInline slug={c.slug} />
                    {c.todayTopics?.length ? (
                      <div className="inset-tile p-3">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-faint mb-1.5"><Sparkles size={11} /> Topics in production</div>
                        {c.todayTopics.slice(0, 3).map((t, i) => (
                          <div key={i} className="text-[12.5px] text-muted truncate">· {t}</div>
                        ))}
                        <a href="/topics" className="inline-block mt-2 text-[12px] font-medium" style={{ color: 'var(--accent)' }}>Approve or swap topics →</a>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-8 text-[11px] text-faint">Stats update every few minutes · questions? message your channel manager.</p>
      </div>
    </main>
  );
}


// Compact per-channel key manager for DFY clients — same API the owner's
// ChannelKeysPanel (inline on /channels) uses; the server only allows the
// channel bound to the client.
function KeysInline({ slug }) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState(null);
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});

  const load = () => {
    fetch(`/api/channels/keys?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || {}))
      .catch(() => setProviders({}));
  };

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
      await fetch('/api/channels/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, provider }),
      });
      setMsg((m) => ({ ...m, [provider]: { ok: true, text: 'removed - shared key resumes' } }));
      load();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="border-t border-line pt-3">
      <button onClick={() => { const n = !open; setOpen(n); if (n) load(); }} className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: 'var(--accent)' }}>
        <KeyRound size={12} /> {open ? 'Hide API keys' : 'Manage API keys'}
      </button>
      {open && providers ? (
        <div className="mt-2 space-y-2">
          {Object.entries(providers).map(([p, v]) => (
            <div key={p} className="inset-tile p-2.5">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-medium text-ink">{v.label}</span>
                {v.set ? (
                  <span className="ml-auto flex items-center gap-1" style={{ color: 'var(--ok)' }}><CheckCircle2 size={11} /> {v.masked}</span>
                ) : (
                  <span className="ml-auto text-faint">shared key in use</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={v.set ? 'paste a new key to replace' : 'paste your key…'}
                  value={inputs[p] || ''}
                  onChange={(e) => setInputs((s) => ({ ...s, [p]: e.target.value }))}
                  className="flex-1 min-w-[180px] text-[12px] px-2.5 py-1.5 rounded-lg border border-line bg-bg-soft"
                  autoComplete="off"
                />
                <button onClick={() => save(p)} disabled={busy === p} className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50">
                  {busy === p ? '…' : 'Save & test'}
                </button>
                {v.set ? (
                  <button onClick={() => remove(p)} disabled={busy === p} className="text-[11.5px] px-2 py-1.5 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50" title="remove - shared key resumes">
                    <XCircle size={12} />
                  </button>
                ) : null}
              </div>
              {msg[p] ? (
                <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: msg[p].ok ? 'var(--ok)' : 'var(--bad)' }}>
                  {msg[p].ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {msg[p].text}
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-[10.5px] text-faint leading-relaxed">Your keys run before the studio&apos;s shared keys. They are encrypted and never shown again after saving. A dead key is dropped automatically and the shared key covers — you get an alert.</p>
        </div>
      ) : null}
      {open && !providers ? <p className="text-[11.5px] text-muted mt-2">Loading…</p> : null}
    </div>
  );
}
