'use client';
import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Target,
  Search,
  FileSpreadsheet,
  Info,
  Eye,
  Users,
  Clock,
  UserPlus,
  Scissors,
  Film,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, StatCard, BrandMark, Segmented } from '@/components/ui';
import { RetentionBars, MiniBars } from '@/components/charts';
import { RETENTION, RETENTION_GOAL, BRAND_META } from '@/lib/site-data';
import { fmt } from '@/lib/utils';
import { Button } from '@/components/untitledui/base/buttons/button';
import DataTable from '@/components/DataTable';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState('all');
  const [real, setReal] = useState(null);
  const [realErr, setRealErr] = useState(false);
  const [terms, setTerms] = useState(null);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ totals: {}, channels: [] }));
    fetch('/api/reports').then((r) => r.json()).then((d) => setReports(d.reports || [])).catch(() => {});
  }, []);
  const load = (fresh = false) => {
    setReal(null);
    setRealErr(false);
    setTerms(null);
    const q = fresh ? '?fresh=1' : '';
    fetch('/api/analytics?slug=' + sel + q)
      .then((r) => r.json())
      .then((d) => (d && !d.error ? setReal(d) : setRealErr(true)))
      .catch(() => setRealErr(true));
    fetch('/api/terms?slug=' + sel)
      .then((r) => r.json())
      .then((d) => setTerms(d.terms || []))
      .catch(() => setTerms([]));
  };
  useEffect(() => {
    load();
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <PageSkeleton />;

  const { totals = {}, channels = [] } = data;
  const active = channels.filter((c) => c.active);
  const selChannel = sel === 'all' ? null : active.find((c) => c.slug === sel);

  // Live average-watched % from the YouTube Analytics API overlays the Sep-19
  // audit numbers — the API value wins whenever it exists.
  const avgFor = (slug) => {
    if (sel === 'all') return real?.channels?.[slug]?.avgWatched;
    if (sel === slug) return real?.avgWatched;
    return undefined;
  };
  const retentionRows = RETENTION.filter((r) => sel === 'all' || r.slug === sel).map((r) => {
    const live = Number(avgFor(r.slug));
    const hasLive = Number.isFinite(live) && live > 0;
    return {
      ...r,
      pct: hasLive ? Math.round(live) : r.pct,
      live: hasLive,
      name: active.find((c) => c.slug === r.slug)?.label || r.slug,
      accent: BRAND_META[r.slug]?.accent || 'var(--accent)',
    };
  });
  const retentionLive = retentionRows.length > 0 && retentionRows.every((r) => r.live);

  // REAL daily views from the YouTube Analytics API (28 days)

  const keywords = (terms || []).filter((k) => k && k.term);
  const platformSlices = sel === 'all'
    ? [
        { name: 'YouTube', value: totals.ytSubs || 0, color: '#ff4444' },
        { name: 'Facebook', value: totals.fbFollowers || 0, color: '#3b82f6' },
        { name: 'Instagram', value: totals.igFollowers || 0, color: '#ec4899' },
      ]
    : [
        { name: 'YouTube', value: selChannel?.yt?.subs || 0, color: '#ff4444' },
        { name: 'Facebook', value: selChannel?.fb?.followers || 0, color: '#3b82f6' },
        { name: 'Instagram', value: selChannel?.ig?.followers || 0, color: '#ec4899' },
      ];
  const platformTotal = platformSlices.reduce((a, s) => a + s.value, 0) || 1;
  const subsShown = sel === 'all' ? totals.ytSubs || 0 : selChannel?.yt?.subs || 0;
  const best = [...retentionRows].sort((a, b) => b.pct - a.pct)[0];
  const worst = retentionRows.length > 1 ? [...retentionRows].sort((a, b) => a.pct - b.pct)[0] : null;
  const splitTotal = (real?.split?.shortsViews || 0) + (real?.split?.longViews || 0);
  const shortPct = splitTotal ? Math.round((real.split.shortsViews / splitTotal) * 100) : 0;
  const genderTotal = (real?.audience?.gender || []).reduce((a, g) => a + g.views, 0) || 1;
  const GENDER_NAME = { gender_female: 'Women', gender_male: 'Men', gender_user_specified: 'Other' };

  return (
    <div>
      <PageHeader icon={TrendingUp} title="Analytics" sub={sel === 'all' ? 'All channels · real YouTube data for the last 28 days' : `${selChannel?.label || sel} · real YouTube data for the last 28 days`} />

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <Segmented
          options={[{ value: 'all', label: 'All channels' }, ...active.map((c) => ({ value: c.slug, label: BRAND_META[c.slug]?.short || c.slug }))]}
          value={sel}
          onChange={setSel}
        />
        <Button color="secondary" onClick={() => load(true)} iconLeading={<RefreshCw size={16} />}>Refresh</Button>
        {selChannel ? (
          <span className="flex items-center gap-2 text-[12px] text-muted">
            <BrandMark short={BRAND_META[sel]?.short} accent={selChannel.accent} size={20} />
            {selChannel.label}
          </span>
        ) : null}
      </div>

      {/* REAL 28-day numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard icon={Eye} label="Views · 28 days" value={real?.totals?.views ?? 0} fmt={fmt} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        <StatCard icon={Clock} label="Watch time · hours" value={real?.totals?.watchHours ?? 0} fmt={(v) => Number(v).toLocaleString('en-US')} color="var(--ok)" iconBg="color-mix(in srgb, var(--ok) 12%, transparent)" />
        <StatCard icon={UserPlus} label="Subs gained · 28 days" value={real?.totals?.subsGained ?? 0} fmt={(v) => Number(v).toLocaleString('en-US')} color="#ec4899" iconBg="color-mix(in srgb, #ec4899 12%, transparent)" />
        <StatCard icon={Users} label="Subscribers · total" value={subsShown} fmt={fmt} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* retention */}
        <Card>
          <CardHead
            title="Average watched"
            sub={retentionLive ? 'Live from YouTube Analytics · last 28 days' : 'Live where available · baseline audit Sep 19'}
            icon={Target}
            right={<Chip tone={retentionLive ? 'ok' : 'warn'}>{retentionLive ? 'live data' : 'partly live'}</Chip>}
          />
          <div className="px-5 pb-5">
            <RetentionBars rows={retentionRows} goal={RETENTION_GOAL} />
            {sel === 'all' && worst ? (
              <div className="inset-tile p-3 mt-4 flex gap-2.5">
                <Info size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                <p className="text-[11.5px] text-muted leading-relaxed">
                  <span className="font-semibold text-ink">The smoking gun:</span> {best?.name} holds {best?.pct}% while {worst?.name} sits at{' '}
                  {worst?.pct}%. Pick a channel above to see it alone.
                </p>
              </div>
            ) : (
              <div className="inset-tile p-3 mt-4 flex gap-2.5">
                <Info size={14} className="shrink-0 mt-0.5" style={{ color: best?.pct >= RETENTION_GOAL ? 'var(--ok)' : 'var(--warn)' }} />
                <p className="text-[11.5px] text-muted leading-relaxed">
                  {best?.pct >= RETENTION_GOAL
                    ? `${best?.name} is above the ${RETENTION_GOAL}% goal — the feed is pushing it. Keep the current format.`
                    : `Below the ${RETENTION_GOAL}% goal — the first 2 seconds still lose people.`}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* real views chart */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Views per day"
            sub="Real numbers · last 28 days from YouTube Analytics"
            icon={TrendingUp}
            right={<Chip tone="ok">real data</Chip>}
          />
          <div className="px-2 pb-2">
            {realErr ? (
              <p className="text-[12px] text-faint px-4 py-10 text-center">Analytics data unavailable right now — try Refresh in a minute.</p>
            ) : !real ? (
              <div className="px-4 py-10 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
            ) : real.daily.length ? (
              <div className="px-3">
                <MiniBars data={real.daily.map((d) => d.views)} labels={real.daily.map((d) => d.date.slice(5))} color="var(--accent)" height={170} />
              </div>
            ) : (
              <p className="text-[12px] text-faint px-4 py-10 text-center">No views recorded in this period.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* shorts vs long */}
        <Card>
          <CardHead title="Shorts vs long-form" sub="Views in the last 28 days" icon={Scissors} />
          <div className="px-5 pb-5">
            {splitTotal ? (
              <>
                <div className="flex h-3.5 rounded-full overflow-hidden border border-line mb-3">
                  <div style={{ width: shortPct + '%', background: 'var(--accent)' }} />
                  <div style={{ width: 100 - shortPct + '%', background: 'var(--info)' }} />
                </div>
                <div className="space-y-2 text-[12px]">
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted"><Scissors size={13} /> Shorts</span>
                    <span className="tnum font-bold text-ink">{fmt(real.split.shortsViews)} · {shortPct}%</span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted"><Film size={13} /> Long-form</span>
                    <span className="tnum font-bold text-ink">{fmt(real.split.longViews)} · {100 - shortPct}%</span>
                  </p>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-faint py-6 text-center">No views in this period yet.</p>
            )}
          </div>
        </Card>

        {/* audience: countries */}
        <Card>
          <CardHead title="Top countries" sub="Where the 28-day views came from" icon={Globe} />
          <div className="px-5 pb-5 space-y-2">
            {(real?.audience?.countries || []).slice(0, 6).map((c) => {
              const max = real.audience.countries[0]?.views || 1;
              return (
                <div key={c.key}>
                  <div className="flex justify-between text-[12px] mb-0.5">
                    <span className="text-muted">{c.key}</span>
                    <span className="tnum font-semibold text-ink">{fmt(c.views)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: Math.max(3, (c.views / max) * 100) + '%', background: 'var(--accent)' }} />
                  </div>
                </div>
              );
            })}
            {!(real?.audience?.countries || []).length ? <p className="text-[12px] text-faint py-4 text-center">No audience data yet.</p> : null}
          </div>
        </Card>

        {/* audience: age + gender */}
        <Card>
          <CardHead title="Who watches" sub="Age groups and gender, 28 days" icon={Users} />
          <div className="px-5 pb-5">
            <div className="flex gap-2 mb-3">
              {(real?.audience?.gender || []).map((g) => (
                <span key={g.key} className="inset-tile px-2.5 py-1.5 text-[11.5px] font-semibold text-ink">
                  {GENDER_NAME[g.key] || g.key}: {Math.round((g.views / genderTotal) * 100)}%
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              {(real?.audience?.age || []).slice(0, 6).map((a) => {
                const max = real.audience.age[0]?.views || 1;
                return (
                  <div key={a.key} className="flex items-center gap-2">
                    <span className="text-[11.5px] text-muted w-12 font-mono">{a.key.replace('age', '')}</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: Math.max(3, (a.views / max) * 100) + '%', background: 'var(--info)' }} />
                    </div>
                    <span className="text-[11px] tnum text-faint w-10 text-right">{fmt(a.views)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* audience split (followers) */}
        <Card>
          <CardHead title="Audience split" sub={sel === 'all' ? 'Followers by platform' : 'This channel, by platform'} icon={Users} />
          <div className="px-5 pb-5">
            <div className="space-y-2">
              {platformSlices.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[12px]">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-muted">{s.name}</span>
                  <span className="ml-auto tnum font-bold text-ink">{s.value ? fmt(s.value) : '—'}</span>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-faint mt-3">Followers, not views. Total {fmt(platformTotal)}.</p>
          </div>
        </Card>

        {/* viewer search terms (real, from the Analytics API via the CI engine) */}
        <Card className="overflow-hidden">
          <CardHead
            title="Viewer search terms"
            sub="What viewers typed into YouTube before finding you · last 28 days"
            icon={Search}
            right={<Chip tone="ok">real data</Chip>}
          />
          <div className="px-2 pb-2">
            {terms === null ? (
              <div className="px-3 py-6 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
            ) : (
              <DataTable
                label="Viewer search terms"
                rows={keywords.map((k, i) => ({ ...k, id: `${k.term}-${i}` }))}
                emptyIcon={Search}
                emptyTitle="No search terms yet"
                emptySub="YouTube needs a few days of search traffic first."
                pageSize={8}
                columns={[
                  { key: 'term', label: 'Search term', rowHeader: true, render: (k) => (
                    <span className="flex items-center gap-2 text-[12px] font-medium text-fg-primary truncate"><Search size={12} className="text-fg-quaternary shrink-0" /> {k.term}</span>
                  ) },
                  { key: 'views', label: 'Views', render: (k) => <span className="tnum font-semibold text-[12px] text-fg-primary">{fmt(k.views)}</span> },
                ]}
              />
            )}
          </div>
        </Card>

        {/* reports */}
        <Card>
          <CardHead title="Reports" sub="Daily Excel reports from the reporting pipeline" icon={FileSpreadsheet} />
          <div className="px-3 pb-3">
            {reports.length === 0 ? (
              <p className="text-[12px] text-faint py-6 text-center">No reports in the repo yet — the reporting pipeline drops them here.</p>
            ) : (
              reports.slice(0, 8).map((r) => (
                <div key={r.name} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: 'color-mix(in srgb, var(--ok) 12%, transparent)', color: 'var(--ok)' }}>
                    <FileSpreadsheet size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-medium text-ink truncate font-mono">{r.name}</span>
                    <span className="block text-[10.5px] text-faint">{r.when}{r.size ? ` · ${Math.round(r.size / 1024)} KB` : ''}</span>
                  </span>
                  <Chip>repo /reports</Chip>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
