'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import {
  Users,
  Eye,
  Film,
  RefreshCw,
  Zap,
  Flame,
  ArrowUpRight,
  Clock,
  CalendarDays,
  Radar,
} from 'lucide-react';
import ActionButton from '@/components/ActionButton';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Card, CardHead, Chip, StatCard, PageSkeleton, EmptyState, BrandMark } from '@/components/ui';
import { MiniBars } from '@/components/charts';
import { ALERTS, BRAND_META } from '@/lib/site-data';
import { fmt, fmtFull, timeAgo, when } from '@/lib/utils';

const ALERT_ICON = { bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };

export default function Overview() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = (fresh = false) => {
    if (fresh) setRefreshing(true);
    return Promise.allSettled([
      fetch('/api/overview' + (fresh ? '?fresh=1' : '')).then((r) => r.json()),
      fetch('/api/analytics?slug=all' + (fresh ? '&fresh=1' : '?fresh=1')).then((r) => r.json()),
    ]).then(([ov, an]) => {
      if (ov.status === 'fulfilled') { setData(ov.value); setErr(false); } else setErr(true);
      const a = an.status === 'fulfilled' ? an.value : null;
      setAnalytics(a && !a.error ? a : null);
      if (fresh) setRefreshedAt(new Date());
    }).finally(() => setRefreshing(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(), 60000);
    return () => clearInterval(t);
  }, [tick]);

  if (err)
    return (
      <EmptyState
        icon={RefreshCw}
        title="Could not reach the engine"
        sub="The /api/overview endpoint did not answer. Check that the studio server is running, then retry."
      />
    );
  if (!data) return <PageSkeleton />;

  const { channels, totals, logs, trends } = data;
  const active = channels.filter((c) => c.active);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Real daily views from the YouTube Analytics API (28-day window, cached 1h
  // server-side). Last 14 days feed the chart; per-channel totals in tiles.
  const daily = (analytics?.daily || []).slice(-14);
  const labels = daily.map((d) => d.date.slice(5));
  const last = daily.at(-1)?.views || 0;
  const prev = daily.at(-2)?.views || 0;
  const viewsDelta = prev ? Math.round(((last - prev) / prev) * 100) : 0;

  const upcoming = logs.filter((l) => l.at && (l.kind === "Short" || l.kind === "Episode")).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-display-md font-semibold tracking-tight text-fg-primary leading-tight text-balance">
            {greet}, Muzzamil
          </h1>
          <p className="text-[13px] text-fg-tertiary mt-0.5 flex items-center gap-1.5 text-pretty">
            <CalendarDays size={13} className="text-muted" />
            {today} · {active.length} live channels · engine running on GitHub Actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshedAt && !refreshing ? (
            <span className="text-[10.5px] text-faint tnum">updated {refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          ) : null}
          <Button color="secondary" onClick={() => load(true)} isDisabled={refreshing} iconLeading={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Link href="/production"><Button color="primary" iconLeading={<Zap size={16} />}>Production</Button></Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-5">
        <StatCard delay={0} icon={Users} label="YT subs" value={totals.ytSubs} fmt={fmt} />
        <StatCard delay={1} icon={Eye} label="YT views" value={totals.ytViews} fmt={fmt} delta={viewsDelta} spark={daily.map((d) => d.views)} color="var(--info)" iconBg="color-mix(in srgb, var(--info) 12%, transparent)" />
        <StatCard delay={2} icon={Film} label="Videos" value={totals.ytVideos} fmt={fmt} />
        <StatCard delay={3} icon={FacebookIcon} label="FB followers" value={totals.fbFollowers} fmt={fmt} color="#3b82f6" iconBg="color-mix(in srgb, #3b82f6 12%, transparent)" />
        <StatCard delay={4} icon={InstagramIcon} label="IG followers" value={totals.igFollowers > 0 ? totals.igFollowers : null} fmt={fmt} color="#ec4899" iconBg="color-mix(in srgb, #ec4899 12%, transparent)" />
      </div>

      {/* chart + alerts */}
      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title="Views per day"
            sub={analytics ? 'Real YouTube Analytics · all channels · last 14 of 28 days' : 'Loading real YouTube Analytics…'}
            icon={Radar}
            right={<Chip tone="ok">real data</Chip>}
          />
          <div className="px-3 pb-3">
            {analytics ? (
              <>
                {/* div-based bars ONLY — the SVG MultiChart + real data combo crashed
                    tabs before (a7c4a8c); do not reintroduce it here */}
                <MiniBars data={daily.map((d) => d.views)} labels={labels.length ? labels : ['-']} color="var(--accent)" height={170} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {active.map((c) => {
                    const t = analytics.channels?.[c.slug]?.totals;
                    return (
                      <div key={c.slug} className="inset-tile p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: c.accent }} />
                          <span className="overline truncate">{BRAND_META[c.slug]?.short}</span>
                        </div>
                        <div className="tnum text-[13px] font-bold text-ink">{fmt(t?.views || 0)}</div>
                        <div className="text-[10px] text-faint">views · 28d</div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="px-4 py-10 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-5" />)}</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Needs attention" sub={`${ALERTS.length} open alerts`} icon={Flame} right={<Link href="/tasks" className="text-[11.5px] text-accent hover:underline">all tasks →</Link>} />
          <div className="px-2 pb-2">
            {ALERTS.map((a) => (
              <Link key={a.title} href={a.href} className="flex gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: ALERT_ICON[a.level] }} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-ink leading-snug">{a.title}</span>
                  <span className="block text-[11px] text-faint mt-0.5 leading-snug ">{a.body}</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* production line */}
      <Card className="mb-5 overflow-hidden">
        <CardHead
          title="Today's production line"
          sub="What the machine already made today, and each channel's upload slots"
          icon={Zap}
        />
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Shorts today</th>
                <th>Poster</th>
                <th>Episode</th>
                <th>Slots (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => {
                const meta = BRAND_META[c.slug];
                return (
                  <tr key={c.slug}>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <BrandMark short={meta?.short || '•'} accent={c.accent} size={26} />
                        <span className="font-semibold">{c.label}</span>
                      </span>
                    </td>
                    <td>
                      {c.todayVideos ? (
                        <Chip tone="ok" dot>{c.todayVideos} queued</Chip>
                      ) : (
                        <Chip tone="warn">not run today</Chip>
                      )}
                    </td>
                    <td>
                      {c.imageDate === new Date().toISOString().slice(0, 10) ? (
                        <Chip tone="ok">done</Chip>
                      ) : (
                        <Chip>—</Chip>
                      )}
                    </td>
                    <td>{c.deepdiveDate ? <Chip tone="ok">{c.deepdiveDate}</Chip> : <Chip>—</Chip>}</td>
                    <td className="text-muted font-mono text-[11.5px] tnum">
                      {c.slots.join(' · ')}
                      {c.longSlot ? ` + ${c.longSlot}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* researched topics */}
      {active.some((c) => c.todayTopics || c.episodeTopic) ? (
        <Card className="mb-5 overflow-hidden">
          <CardHead
            title="Today's researched topics"
            sub="Picked by the machine from what is provably getting views in each niche right now — no fixed lists"
            icon={Radar}
          />
          <div className="px-4 pb-4 grid md:grid-cols-2 gap-2.5">
            {active.filter((c) => c.todayTopics || c.episodeTopic).map((c) => (
              <div key={c.slug} className="inset-tile p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <BrandMark short={BRAND_META[c.slug]?.short || '•'} accent={c.accent} size={22} />
                  <span className="text-[12px] font-semibold text-ink">{c.label}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {(c.todayTopics || []).map((t, i) => (
                    <span key={i} className="text-[11.5px] text-muted leading-snug flex gap-1.5">
                      <span style={{ color: c.accent }}>▸</span>
                      <span>from viral wave: “{t}”</span>
                    </span>
                  ))}
                  {c.episodeTopic ? (
                    <span className="text-[11.5px] text-muted leading-snug flex gap-1.5">
                      <span className="text-accent">▸</span>
                      <span>episode: “{c.episodeTopic}”</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* trend radar */}
      <Card>
        <CardHead title="Trend radar" sub="Live keywords + viral videos per niche" icon={Flame} />
        <div className="px-5 pb-5">
          {Object.entries(trends).length === 0 ? (
            <EmptyState icon={Radar} title="No trend cache yet" sub="Trends refresh with the next production batch." />
          ) : (
            Object.entries(trends).map(([slug, t]) => (
              <div key={slug} className="py-2.5 border-b border-line last:border-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <BrandMark short={BRAND_META[slug]?.short || '•'} accent={BRAND_META[slug]?.accent || 'var(--faint)'} size={20} />
                  <span className="text-[12.5px] font-semibold text-ink">{slug}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {t.keywords.map((k) => (
                    <Chip key={k} tone="accent">{k}</Chip>
                  ))}
                </div>
                <p className="text-[11px] text-faint truncate">viral now: {t.viral.map((v) => v.title).join(' · ').slice(0, 110)}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      <p className="mt-4 text-[11px] text-faint">
        Live totals: {fmtFull(totals.ytSubs)} subs · {fmtFull(totals.ytViews)} all-time views · refreshed every 60s. Real 28-day numbers live on the Analytics page.
      </p>
    </div>
  );
}
