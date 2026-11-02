'use client';
// PUBLIC sales page — /proof. No login, no app shell (AppShell skips this path).
// Shows the live, real numbers of the channels running on Quarry Studio.
import { useEffect, useState } from 'react';
import { BadgeCheck, Radio, Loader2, ArrowRight } from 'lucide-react';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

export default function ProofPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/proof')
      .then((r) => r.json())
      .then((d) => (d.error && !d.channels?.length ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <main className="min-h-screen bg-bg text-ink">
      <div className="max-w-4xl mx-auto px-5 py-14">
        <div className="flex items-center gap-2 text-[12px] text-muted mb-8">
          <Radio size={14} style={{ color: 'var(--ok)' }} />
          <span>LIVE · refreshed every 15 minutes · real YouTube numbers, not mockups</span>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
          The machine behind<br />the channels.
        </h1>
        <p className="mt-4 text-[15px] text-muted max-w-xl leading-relaxed">
          Quarry Studio runs faceless YouTube channels on autopilot — research, scripts, voice,
          footage, thumbnails, uploads and safety gates. These are the channels it runs right now,
          with their live stats.
        </p>

        {err ? (
          <p className="mt-8 text-[13px]" style={{ color: 'var(--bad)' }}>Could not load live stats: {err}</p>
        ) : !data ? (
          <div className="mt-10 flex items-center gap-2 text-muted text-sm"><Loader2 size={15} className="animate-spin" /> Loading live stats…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mt-10">
              {[
                { k: 'Subscribers', v: fmt(data.totals?.subs) },
                { k: 'Total views', v: fmt(data.totals?.views) },
                { k: 'Videos published', v: fmt(data.totals?.videos) },
              ].map((t) => (
                <div key={t.k} className="inset-tile p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted">{t.k}</div>
                  <div className="text-2xl font-bold mt-1 font-[family-name:var(--font-display)]">{t.v}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-faint">{data.cadence}</p>

            <div className="grid md:grid-cols-2 gap-4 mt-8">
              {(data.channels || []).map((c) => (
                <div key={c.slug} className="border border-line rounded-xl p-5 bg-surface">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.accent }} />
                    <div className="font-semibold leading-tight">{c.label}</div>
                    {c.flowPaused ? (
                      <span className="ml-auto text-[10.5px] px-2 py-0.5 rounded-full border border-line text-muted">paused</span>
                    ) : (
                      <span className="ml-auto text-[10.5px] px-2 py-0.5 rounded-full border border-line flex items-center gap-1" style={{ color: 'var(--ok)' }}>
                        <BadgeCheck size={11} /> running
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-muted mt-1">{c.handle} · {c.niche}</div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div><div className="text-[10.5px] uppercase tracking-wide text-faint">Subs</div><div className="text-[15px] font-semibold">{fmt(c.subs)}</div></div>
                    <div><div className="text-[10.5px] uppercase tracking-wide text-faint">Views</div><div className="text-[15px] font-semibold">{fmt(c.views)}</div></div>
                    <div><div className="text-[10.5px] uppercase tracking-wide text-faint">Videos</div><div className="text-[15px] font-semibold">{fmt(c.videos)}</div></div>
                  </div>
                  {c.recent?.length ? (
                    <div className="mt-4 border-t border-line pt-3">
                      <div className="text-[10.5px] uppercase tracking-wide text-faint mb-1.5">Latest uploads</div>
                      {c.recent.map((v, i) => (
                        <div key={i} className="text-[12px] text-muted truncate">· {v.title || '—'}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-12 border border-line rounded-xl p-5 bg-surface flex flex-wrap items-center gap-3">
          <div className="text-[13px] leading-snug">
            <span className="font-semibold">Your channel could be next.</span>{' '}
            <span className="text-muted">Done-for-you channel management on this exact engine.</span>
          </div>
          <a href="/login" className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-line hover:bg-surface-2">
            Studio login <ArrowRight size={13} />
          </a>
        </div>
        <p className="mt-6 text-[11px] text-faint">Powered by Quarry Studio · automated with human supervision · stats pulled live from YouTube</p>
      </div>
    </main>
  );
}
