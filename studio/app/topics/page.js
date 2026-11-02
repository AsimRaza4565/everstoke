'use client';
import { useEffect, useState } from 'react';
import { ListChecks, Flame, Search, Plus, X, PenLine, RefreshCw, Clock3 } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { BRAND_META } from '@/lib/site-data';
import { fmt } from '@/lib/utils';
import { Button } from '@/components/untitledui/base/buttons/button';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';

// 10-05 PHASE B — TOPIC DESK: research proposes, you approve, the nightly run
// consumes your picks first (one per slot per day) before auto-research.

export default function TopicDesk() {
  const [ov, setOv] = useState(null);
  const [reg, setReg] = useState(null);
  const [sel, setSel] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setOv).catch(() => setOv({ channels: [] }));
    fetch('/api/channels/registry').then((r) => r.json()).then(setReg).catch(() => setReg({ channels: [] }));
  }, []);

  const options = (() => {
    const legacy = (ov?.channels || []).filter((c) => c.active).map((c) => ({ value: c.slug, label: BRAND_META[c.slug]?.short || c.slug }));
    const mine = (reg?.channels || [])
      .filter((c) => c.active !== false && !legacy.some((l) => l.value === c.slug))
      .map((c) => ({ value: c.slug, label: (c.label || c.slug).slice(0, 6).toUpperCase() }));
    return [...legacy, ...mine];
  })();

  // deferred one tick so the setState isn't synchronous in the effect body
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!sel && options.length) setSel(options[0].value);
    });
    return () => cancelAnimationFrame(id);
  }, [options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    if (!sel) return;
    setLoading(true);
    await fetch('/api/topics?slug=' + sel)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTopics = async (topics) => {
    setBusy(true);
    try {
      const r = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: sel, action: 'add', topics }),
      });
      const d = await r.json();
      if (d.ok) setData((x) => ({ ...(x || {}), queue: d.queue }));
    } catch { }
    setBusy(false);
  };
  const removeTopic = async (id) => {
    setBusy(true);
    try {
      const r = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: sel, action: 'remove', id }),
      });
      const d = await r.json();
      if (d.ok) setData((x) => ({ ...(x || {}), queue: d.queue }));
    } catch { }
    setBusy(false);
  };

  if (!ov || !reg) return <PageSkeleton />;
  const accent = BRAND_META[sel]?.accent || 'var(--accent)';

  return (
    <div>
      <PageHeader icon={ListChecks} title="Topic Desk" sub="Research proposes → you approve → the nightly run makes exactly these first. One topic = one slot.">
        <Button color="secondary" onClick={load} isDisabled={loading} iconLeading={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}>
          Refresh
        </Button>
      </PageHeader>

      {options.length ? (
        <div className="mb-5">
          <Segmented options={options} value={sel} onChange={setSel} />
        </div>
      ) : (
        <EmptyState icon={ListChecks} title="No channels yet" sub="Connect a channel first (Channels → New channel)." />
      )}

      {sel ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* candidates */}
          <Card className="overflow-hidden">
            <CardHead
              title="From your research"
              sub="Proven viral themes in your niche + what your viewers actually searched (last 28 days)"
              icon={Flame}
              right={data?.researchAt ? <Chip tone="ok">research ready</Chip> : <Chip tone="warn">no research yet</Chip>}
            />
            <div className="px-2 pb-2">
              {loading ? (
                <div className="px-3 py-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
              ) : (
                <>
                  {(data?.trends || []).slice(0, 8).map((v) => (
                    <div key={v.title} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                      <Flame size={13} className="text-orange-400 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-medium text-ink truncate">{v.title}</span>
                        <span className="block text-[10.5px] text-faint">{v.channel} · {fmt(v.views)} views in 14d</span>
                      </span>
                      <ButtonUtility size="sm" color="tertiary" tooltip="Approve this theme" isDisabled={busy} icon={Plus} onClick={() => addTopics([{ kind: 'seed', text: v.title }])} />
                    </div>
                  ))}
                  {(data?.terms || []).slice(0, 8).map((t) => (
                    <div key={t.term} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                      <Search size={13} className="text-accent shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-medium text-ink truncate">{t.term}</span>
                        <span className="block text-[10.5px] text-faint">real viewer search · {fmt(t.views)} views</span>
                      </span>
                      <ButtonUtility size="sm" color="tertiary" tooltip="Approve this search" isDisabled={busy} icon={Plus} onClick={() => addTopics([{ kind: 'search', text: t.term }])} />
                    </div>
                  ))}
                  {!(data?.trends || []).length && !(data?.terms || []).length ? (
                    <p className="text-[12px] text-faint px-3 py-8 text-center">
                      No research yet. The nightly run gathers it automatically — come back after the first run, or add a custom topic below.
                    </p>
                  ) : null}

                  <div className="px-3 pb-3 pt-3 mt-2 border-t border-line">
                    <div className="flex items-center gap-2">
                      <PenLine size={13} className="text-faint shrink-0" />
                      <input
                        className="input flex-1"
                        placeholder="Your own topic — full idea or instruction…"
                        value={manual}
                        onChange={(e) => setManual(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && manual.trim()) { addTopics([{ kind: 'custom', text: manual.trim() }]); setManual(''); }
                        }}
                      />
                      <Button
                        color="primary"
                        isDisabled={busy || !manual.trim()}
                        onClick={() => { addTopics([{ kind: 'custom', text: manual.trim() }]); setManual(''); }}
                        iconLeading={<Plus size={16} />}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* approved queue */}
          <Card className="overflow-hidden">
            <CardHead
              title="Approved queue"
              sub="The nightly run takes these first — one per day/slot — then auto-research fills the rest"
              icon={Clock3}
              right={<Chip tone="ok">{(data?.queue || []).length} waiting</Chip>}
            />
            <div className="px-2 pb-2">
              {loading ? (
                <div className="px-3 py-6 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
              ) : (data?.queue || []).length === 0 ? (
                <EmptyState icon={Clock3} title="Queue is empty" sub="Approve candidates on the left, or add your own topic." />
              ) : (
                (data?.queue || []).map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                    <span className="tnum text-[11px] font-bold text-faint w-5 shrink-0">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12px] font-medium text-ink truncate">{t.text}</span>
                      <span className="block text-[10.5px] text-faint">
                        {t.kind === 'seed' ? 'from viral research' : t.kind === 'search' ? 'from viewer searches' : 'your own topic'}
                        {t.addedAt ? ` · added ${t.addedAt.slice(5, 10)}` : ''}
                      </span>
                    </span>
                    <ButtonUtility size="sm" color="tertiary" tooltip="Remove from queue" isDisabled={busy} icon={X} onClick={() => removeTopic(t.id)} />
                  </div>
                ))
              )}
              {(data?.queue || []).length ? (
                <p className="text-[11px] text-faint px-3 pt-2">
                  <BrandMark short="i" accent={accent} size={14} /> Consumed top-first, one per run. When the queue empties, auto-research takes over.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
