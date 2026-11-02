'use client';
import { useEffect, useState } from 'react';
import {
  Clock,
  Share2,
  Music2,
  AtSign,
  Pin,
  CheckCircle2,
  AlertTriangle,
  OctagonAlert,
  Loader2,
} from 'lucide-react';
import { YoutubeIcon, FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import { Card, CardHead, Chip, PageHeader, PageSkeleton, BrandMark, EmptyState } from '@/components/ui';
import { BRAND_META } from '@/lib/site-data';
import { fmt } from '@/lib/utils';

const TABS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'threads', label: 'Threads' },
  { value: 'pinterest', label: 'Pinterest' },
];

const NOTE_STATUS = { ok: CheckCircle2, warn: AlertTriangle, bad: OctagonAlert, pending: Loader2 };
const NOTE_COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', pending: 'var(--info)' };

export default function Social() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('youtube');
  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ channels: [] }));
  }, []);
  if (!data) return <PageSkeleton />;
  const active = data.channels.filter((c) => c.active);

  const totals = {
    youtube: active.reduce((a, c) => a + (c.yt?.subs || 0), 0),
    facebook: active.reduce((a, c) => a + (c.fb?.followers || 0), 0),
    instagram: active.reduce((a, c) => a + (c.ig?.followers || 0), 0),
    tiktok: null,
    threads: null,
    pinterest: null,
  };

  return (
    <div>
      <PageHeader icon={Share2} title="Social" sub="Every account the engine posts to — reach, health and known issues" />

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="inline-flex items-center gap-0.5 p-1 rounded-xl border border-line bg-surface overflow-x-auto max-w-full">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3.5 h-8 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === t.value ? 'text-ink' : 'text-faint hover:text-muted'
              }`}
              style={tab === t.value ? { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' } : undefined}
            >
              {t.label}
              {totals[t.value] !== null ? <span className="ml-1.5 tnum" style={{ color: 'var(--accent)' }}>{fmt(totals[t.value])}</span> : null}
            </button>
          ))}
        </div>
        <Chip tone="info">Funnel platforms — YouTube + Facebook are the money platforms</Chip>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* accounts */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title={`${TABS.find((t) => t.value === tab)?.label} accounts`}
            sub={tab === 'tiktok' ? 'Rides the UK account via the Zernio app' : 'Linked to live APIs — numbers refresh every minute'}
            icon={tab === 'youtube' ? YoutubeIcon : tab === 'facebook' ? FacebookIcon : tab === 'instagram' ? InstagramIcon : tab === 'tiktok' ? Music2 : tab === 'threads' ? AtSign : Pin}
          />
          <div className="px-2 pb-2">
            {(tab === 'youtube' || tab === 'facebook' || tab === 'instagram') &&
              active.map((c) => {
                const row = tab === 'youtube' ? c.yt : tab === 'facebook' ? c.fb : c.ig;
                const Icon = tab === 'youtube' ? YoutubeIcon : tab === 'facebook' ? FacebookIcon : InstagramIcon;
                const color = tab === 'youtube' ? '#ff4444' : tab === 'facebook' ? '#3b82f6' : '#ec4899';
                return (
                  <div key={c.slug} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-2 transition-colors">
                    <BrandMark short={BRAND_META[c.slug]?.short} accent={c.accent} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink truncate">{c.label}</span>
                      <span className="block text-[11px] text-faint font-mono truncate">
                        {row ? `@${row.handle || row.username || row.name}` : 'not linked'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-[11px] text-faint hidden sm:flex">
                      <Icon size={13} style={{ color }} />
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block tnum text-[13px] font-bold text-ink">{row ? fmt(tab === 'youtube' ? row.subs : row.followers) : '—'}</span>
                      <span className="block overline">{tab === 'youtube' ? 'subs' : 'followers'}</span>
                    </span>
                  </div>
                );
              })}

            {tab === 'tiktok' && (
              <div className="p-3">
                <div className="inset-tile p-4 flex items-center gap-4 mb-3">
                  <span className="flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: 'color-mix(in srgb, #22d3ee 12%, transparent)', color: '#22d3ee' }}>
                    <Music2 size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-ink">@arzo22345 · “Poetic Home”</p>
                    <p className="text-[11.5px] text-faint">UK account · posts as Quarry Studio app</p>
                  </div>
                  <Chip tone="ok" dot>LIVE</Chip>
                </div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <div className="inset-tile p-3">
                    <p className="overline mb-1">Shorts slots</p>
                    <p className="text-[12px] text-muted">4 posts/day via <code className="font-mono text-accent">tiktok-post.yml</code></p>
                  </div>
                  <div className="inset-tile p-3">
                    <p className="overline mb-1">Clip engine</p>
                    <p className="text-[12px] text-muted">Long-forms auto-cut into 1-min parts · 1 part/day</p>
                  </div>
                  <div className="inset-tile p-3">
                    <p className="overline mb-1">Queue</p>
                    <p className="text-[12px] text-muted">Parts drip out one per day automatically</p>
                  </div>
                  <div className="inset-tile p-3">
                    <p className="overline mb-1">Branding</p>
                    <p className="text-[12px] text-muted">“Quote Quarry” naming pending in the app</p>
                  </div>
                </div>
              </div>
            )}

            {tab === 'threads' && (
              <div className="p-3">
                <div className="inset-tile p-4 flex items-center gap-4 mb-3">
                  <span className="flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                    <AtSign size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-ink">@quotequarry8</p>
                    <p className="text-[11.5px] text-faint">1 QQ reel per day · restored Sep 20</p>
                  </div>
                  <Chip tone="warn" dot>token expiring</Chip>
                </div>
                <div className="inset-tile p-3 flex gap-2.5">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
                  <p className="text-[12px] text-muted leading-relaxed">
                    The token is valid until about <span className="font-semibold text-ink">Oct 29</span>. Refresh it before
                    then or posting stops silently. Files are hosted on uguu.se (tmpfiles.org serves HTML — known trap).
                  </p>
                </div>
              </div>
            )}

            {tab === 'pinterest' && (
              <div className="p-3">
                <div className="inset-tile p-4 flex items-center gap-4 mb-3">
                  <span className="flex items-center justify-center w-11 h-11 rounded-2xl" style={{ background: 'color-mix(in srgb, #e60023 12%, transparent)', color: '#e60023' }}>
                    <Pin size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-bold text-ink">NIAZRA · personal API</p>
                    <p className="text-[11.5px] text-faint">No review needed · ~1 year token</p>
                  </div>
                  <Chip tone="info" dot>waiting on you</Chip>
                </div>
                <div className="inset-tile p-3 flex gap-2.5">
                  <OctagonAlert size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                  <p className="text-[12px] text-muted leading-relaxed">
                    Code and CI are wired and pushed. To finish: paste the App ID + secret, then the OAuth tunnel runs once
                    (port 3003) and the PINTEREST secrets get stored.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* health panel */}
        <div className="space-y-4">
          <Card>
            <CardHead title="Platform health" sub="What is working and what hurts" icon={AlertTriangle} />
            <div className="px-4 pb-4 space-y-2.5">
              <Note tone="bad" title="Facebook reels blackout">
                ~60 reels on 4 pages = 2 views. Cause: Meta demotes unchanged YT cross-posts. Fix plan waits for your go.
              </Note>
              <Note tone="warn" title="Threads token">
                Valid until ~Oct 29 — refresh before then.
              </Note>
              <Note tone="warn" title="FB page names mismatch">
                Pages say Silent Wealth / Eon Ventures / Boundaries Club — channels say IC / MR / DFD. Rename pending.
              </Note>
              <Note tone="ok" title="Instagram verified">
                All 4 accounts publishing daily; transient errors self-heal at the next slot.
              </Note>
              <Note tone="ok" title="TikTok live">
                Shorts + clip parts flowing through Zernio since Sep 28.
              </Note>
            </div>
          </Card>

          <Card>
            <CardHead title="Timing strategy" sub="US-anchored slots = money slots" icon={Clock} />
            <div className="px-4 pb-4 space-y-2 text-[12px] text-muted">
              <p>· Slot 3 (US prime evening) is the money slot — protect it.</p>
              <p>· IG posts at 7:20 AM / 11:20 AM / 6:20 PM ET.</p>
              <p>· TikTok posts at production time (~4:40 AM ET) — scheduled slots are the planned fix.</p>
              <p>· CPM depends more on viewer geography than hour.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Note({ tone, title, children }) {
  const Icon = NOTE_STATUS[tone] || CheckCircle2;
  return (
    <div className="inset-tile p-3 flex gap-2.5">
      <Icon size={14} className="shrink-0 mt-0.5" style={{ color: NOTE_COLOR[tone] }} />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-ink">{title}</p>
        <p className="text-[11.5px] text-muted leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}
