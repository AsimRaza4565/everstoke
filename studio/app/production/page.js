'use client';
import { useEffect, useState } from 'react';
import {
  Zap,
  Clapperboard,
  Film,
  Music2,
  Share2,
  Image as ImageIcon,
  AtSign,
  ArrowRight,
  FileText,
  Clock,
  Pause,
  Play,
} from 'lucide-react';
import ActionButton from '@/components/ActionButton';
import { Card, CardHead, Chip, PageHeader, EmptyState } from '@/components/ui';
import { PIPELINES } from '@/lib/site-data';
import { Button } from '@/components/untitledui/base/buttons/button';

const ICONS = { clapperboard: Clapperboard, film: Film, music2: Music2, share2: Share2, image: ImageIcon, 'at-sign': AtSign };

export default function Production() {
  // 10-08 FLOW CONTROL — network master switch (Hootsuite-style suspend):
  // one button pauses/resumes EVERY channel's autopilot at once.
  const [chans, setChans] = useState([]); // {slug, label, fromRegistry}
  const [netPaused, setNetPaused] = useState(null); // null = unknown yet
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState('');
  const [runs, setRuns] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      const d = await fetch('/api/overview').then((r) => r.json()).catch(() => null);
      if (!alive || !d?.channels?.length) return;
      setChans(d.channels.map((c) => ({ slug: c.slug, label: c.label || c.slug, fromRegistry: Boolean(c.fromRegistry) })));
      setNetPaused(d.channels.every((c) => c.flowPaused));
    })();
    return () => { alive = false; };
  }, []);

  const setAll = async (on) => {
    setNetBusy(true);
    setNetError('');
    let fails = 0;
    for (const c of chans) {
      try {
        const r = await fetch('/api/channels/flow', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: c.slug, on }),
        });
        if (!r.ok) fails += 1;
      } catch { fails += 1; }
    }
    setNetPaused(on ? false : true);
    if (fails) setNetError(`${fails} channel(s) failed — try again or check the logs.`);
    setNetBusy(false);
  };

  // 10-08 P1: "produce now" for ANY channel — legacy dispatch their own
  // workflow, wizard channels dispatch the autopilot with their slug
  const produce = async (slug) => {
    setRuns((r) => ({ ...r, [slug]: 'busy' }));
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'yt-daily', slug }),
      });
      const d = await r.json().catch(() => ({}));
      setRuns((x) => ({ ...x, [slug]: r.ok && d.started ? 'started' : 'error' }));
    } catch {
      setRuns((x) => ({ ...x, [slug]: 'error' }));
    }
  };

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="Production"
        sub="Every pipeline that makes and ships content. Buttons start real jobs on this machine or on GitHub Actions."
      >
        <a href="/logs"><Button color="secondary" iconLeading={<FileText size={16} />}>Open logs</Button></a>
      </PageHeader>

      {/* master flow switch */}
      {chans.length ? (
        <Card className="p-4 mb-5 flex items-center gap-4 flex-wrap" style={netPaused ? { borderColor: '#f59e0b66' } : undefined}>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[14px] font-bold text-ink">Master flow</h3>
              <Chip tone={netPaused === false ? 'ok' : netPaused === true ? 'warn' : ''} dot={netPaused === false}>
                {netPaused === true ? 'ALL CHANNELS PAUSED' : netPaused === false ? 'RUNNING' : '…'}
              </Chip>
            </div>
            <p className="text-[11.5px] text-muted mt-1 leading-relaxed">
              {netPaused
                ? 'Every channel is paused — nothing new is produced. Already-scheduled videos still publish. Topics, settings and keys are kept.'
                : 'Pause stops ALL channels at once: no new videos are made until you resume. Already-scheduled videos still publish; nothing is deleted.'}
              {netError ? <span className="block mt-1" style={{ color: 'var(--bad)' }}>{netError}</span> : null}
            </p>
          </div>
          <Button
            color={netPaused ? 'primary' : 'secondary'}
            onClick={() => setAll(!netPaused)}
            disabled={netBusy}
          >
            {netBusy ? 'Working…' : netPaused ? (<><Play size={14} /> Resume everything</>) : (<><Pause size={14} /> Pause everything</>)}
          </Button>
        </Card>
      ) : null}

      {/* channel runs — produce now for ANY channel */}
      {chans.length ? (
        <Card className="p-4 mb-5 overflow-hidden">
          <CardHead title="Channel runs" sub="Run the nightly pipeline now for any channel — research, script, voice, render, upload (all gates apply). Already-done steps skip automatically." />
          <div className="px-2 pb-2 space-y-1.5">
            {chans.map((c) => (
              <div key={c.slug} className="flex items-center gap-3 inset-tile px-3 py-2.5">
                <span className="text-[12.5px] font-semibold text-ink truncate flex-1">{c.label}</span>
                <Chip>{c.fromRegistry ? 'wizard' : 'legacy'}</Chip>
                <Button
                  color="secondary"
                  onClick={() => produce(c.slug)}
                  isDisabled={runs[c.slug] === 'busy' || runs[c.slug] === 'started'}
                >
                  {runs[c.slug] === 'busy' ? 'Starting…' : runs[c.slug] === 'started' ? 'Started ✓' : runs[c.slug] === 'error' ? 'Failed — retry' : 'Produce now'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        {PIPELINES.map((p) => {
          const Icon = ICONS[p.icon] || Zap;
          return (
            <Card key={p.id} hover className="p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Icon size={19} strokeWidth={2.1} />
                  </div>
                  <div>
                    <h2 className="section-title">{p.name}</h2>
                    <p className="text-[11.5px] text-faint mt-0.5">{p.engine}</p>
                  </div>
                </div>
                <Chip tone="ok" dot>live</Chip>
              </div>

              <p className="text-[12.5px] text-muted leading-relaxed -mt-1">{p.desc}</p>

              {/* stage flow */}
              <div className="flex items-center flex-wrap gap-y-2">
                {p.stages.map((s, i) => (
                  <span key={s} className="flex items-center">
                    <span className="inset-tile px-2.5 py-1 text-[11px] font-semibold text-muted">{s}</span>
                    {i < p.stages.length - 1 ? <ArrowRight size={11} className="mx-1 text-faint shrink-0" /> : null}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11.5px] text-faint">
                <Clock size={12} />
                <span className="font-mono">{p.schedule}</span>
              </div>

              {p.note ? (
                <p className="text-[11px] text-muted leading-relaxed -mt-2">{p.note}</p>
              ) : null}

              {p.actions.length ? (
                <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                  {p.actions.map((a) => (
                    <ActionButton key={a.action + (a.slug || '')} small action={a.action} slug={a.slug || null} label={a.label} />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-faint pt-1 mt-auto">Runs on its own schedule — no manual button for this one.</p>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-5 p-5">
        <div className="flex items-start gap-3">
          <FileText size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12.5px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">How runs report back.</span> Every button spawns the real script
            (same ones GitHub Actions uses) and writes output to <code className="font-mono text-accent">studio-logs/</code> in the
            repo. The{' '}
            <a href="/logs" className="text-accent hover:underline">
              Logs page
            </a>{' '}
            shows what actually got published. If a job fails, it fails closed — nothing broken goes public.
          </div>
        </div>
      </Card>
    </div>
  );
}
