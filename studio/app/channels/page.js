'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Tv, Music2, RefreshCw, Mic, Music, Clock, Archive, Plus, PenLine, Pause, Play, CalendarDays, Layers, KeyRound, Route } from 'lucide-react';
import { YoutubeIcon, FacebookIcon, InstagramIcon } from '@/components/BrandIcons';
import { Card, CardHead, Chip, PageHeader, BrandMark, PageSkeleton, EmptyState } from '@/components/ui';
import { Button } from '@/components/untitledui/base/buttons/button';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';
import SchedulePanel from '@/components/SchedulePanel';
import TemplateAssignPanel from '@/components/TemplateAssignPanel';
import ChannelKeysPanel from '@/components/ChannelKeysPanel';
import ProviderRoutingPanel from '@/components/ProviderRoutingPanel';
import { BRAND_META, MUSIC_MOODS } from '@/lib/site-data';
import { fmt } from '@/lib/utils';

function PlatformRow({ icon: Icon, color, label, handle, followers, extra }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors">
      <span className="flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-ink truncate">{label}</span>
        <span className="block text-[11px] text-faint font-mono truncate">{handle}</span>
      </span>
      {extra ? <span className="text-[11px] text-faint hidden sm:block tnum">{extra}</span> : null}
      <span className="tnum text-[12px] font-bold text-ink shrink-0">{followers}</span>
    </div>
  );
}

export default function Channels() {
  const [data, setData] = useState(null);
  const [schedOpen, setSchedOpen] = useState(null);
  const [tplOpen, setTplOpen] = useState(null);   // #102 — template registry panel per channel
  const [keysOpen, setKeysOpen] = useState(null); // #103 — inline API keys panel per channel
  const [routeOpen, setRouteOpen] = useState(null); // #104 — per-capability provider routing panel per channel
  const [parkedKeys, setParkedKeys] = useState(null); // #103 — parked brand keys (full-width panel below grid)
  const load = () => fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ channels: [] }));

  // 10-08 FLOW CONTROL — per-channel autopilot ON/OFF
  const toggleFlow = async (slug, currentlyPaused) => {
    await fetch('/api/channels/flow', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, on: Boolean(currentlyPaused) }),
    });
    load();
  };
  useEffect(() => {
    load();
  }, []);

  if (!data) return <PageSkeleton />;
  const active = data.channels.filter((c) => c.active);
  const parked = data.channels.filter((c) => !c.active);

  return (
    <div>
      <PageHeader icon={Tv} title="Channels" sub={`${active.length} live channels + ${parked.length} parked brands · every platform account in one place`}>
        <Link href="/channels/add"><Button color="primary" iconLeading={<Plus size={16} />}>New channel</Button></Link>
        <Button color="secondary" onClick={load} iconLeading={<RefreshCw size={16} />}>Refresh</Button>
      </PageHeader>

      <div className="grid xl:grid-cols-2 gap-4">
        {active.map((c) => {
          const meta = BRAND_META[c.slug];
          const moods = MUSIC_MOODS[c.slug] || [];
          return (
            <Card key={c.slug} hover className="p-5">
              {/* head */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3.5">
                  <BrandMark short={meta?.short || '•'} accent={c.accent} size={44} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-[17px] font-bold tracking-tight text-ink text-balance">{c.label}</h2>
                      {c.flowPaused ? <Chip tone="warn">PAUSED</Chip> : <Chip tone="ok" dot>ACTIVE</Chip>}
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip={c.flowPaused ? 'Resume autopilot — the nightly run produces again' : 'Pause autopilot — nothing new is produced; already-scheduled videos still publish'}
                        icon={c.flowPaused ? Play : Pause}
                        onClick={() => toggleFlow(c.slug, c.flowPaused)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Production scheduling — doc days, Shorts days, clips source, quota"
                        icon={CalendarDays}
                        onClick={() => setSchedOpen(schedOpen === c.slug ? null : c.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Template registry — assigned template, pinned version, assign/unassign"
                        icon={Layers}
                        onClick={() => setTplOpen(tplOpen === c.slug ? null : c.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="API keys — per-channel provider keys (paste, Save & test, remove)"
                        icon={KeyRound}
                        onClick={() => setKeysOpen(keysOpen === c.slug ? null : c.slug)}
                      />
                      <ButtonUtility
                        size="sm"
                        color="tertiary"
                        tooltip="Provider routing — per-capability provider priority, channel override vs workspace default (#104)"
                        icon={Route}
                        onClick={() => setRouteOpen(routeOpen === c.slug ? null : c.slug)}
                      />
                      <Link href={`/channels/add?edit=${c.slug}`} title="Edit this channel (niche, sub-niches, template, schedule)">
                        <ButtonUtility size="sm" color="tertiary" icon={PenLine} />
                      </Link>
                    </div>
                    <p className="text-[12px] text-muted mt-0.5">{c.niche}</p>
                  </div>
                </div>
                {c.yt && !c.yt.error ? (
                  <div className="text-right shrink-0">
                    <div className="stat-num text-[20px] text-ink leading-none">{fmt(c.yt.subs)}</div>
                    <div className="overline mt-1">subs</div>
                  </div>
                ) : null}
              </div>

              {/* platforms */}
              <div className="inset-tile p-1 mb-4">
                {c.yt && !c.yt.error ? (
                  <PlatformRow icon={YoutubeIcon} color="#ff4444" label="YouTube" handle={c.yt.handle || c.yt.title} followers={fmt(c.yt.subs)} extra={`${fmt(c.yt.views)} views all-time · ${c.yt.videos} videos`} />
                ) : c.yt?.error ? (
                  <PlatformRow icon={YoutubeIcon} color="#ff4444" label="YouTube" handle={c.yt.error} followers="—" />
                ) : null}
                {c.fb ? (
                  <PlatformRow icon={FacebookIcon} color="#3b82f6" label="Facebook" handle={`@${c.fb.username || c.fb.name}`} followers={fmt(c.fb.followers)} />
                ) : null}
                {c.ig ? (
                  <PlatformRow icon={InstagramIcon} color="#ec4899" label="Instagram" handle={`@${c.ig.username}`} followers={fmt(c.ig.followers)} extra={`${c.ig.posts} posts`} />
                ) : null}
                {c.slug === 'investors-compass' ? (
                  <PlatformRow icon={Music2} color="#22d3ee" label="TikTok" handle="via Zernio · @arzo22345" followers="—" extra="clips + 4 slots/day" />
                ) : null}
                {!c.yt && !c.fb && !c.ig ? <p className="text-[12px] text-faint px-3 py-3">No accounts linked yet.</p> : null}
              </div>

              {/* brand config */}
              <div className="grid sm:grid-cols-3 gap-2.5">
                <div className="inset-tile p-3">
                  <div className="flex items-center gap-1.5 overline mb-1.5">
                    <Mic size={11} /> Voice
                  </div>
                  <p className="text-[11.5px] text-muted font-mono truncate" title={c.voice}>{c.voice || 'default'}</p>
                </div>
                <div className="inset-tile p-3">
                  <div className="flex items-center gap-1.5 overline mb-1.5">
                    <Music size={11} /> Music mood
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {moods.length ? moods.map((m) => <Chip key={m} tone="accent">{m}</Chip>) : <span className="text-[11.5px] text-faint">—</span>}
                  </div>
                </div>
                <div className="inset-tile p-3">
                  <div className="flex items-center gap-1.5 overline mb-1.5">
                    <Clock size={11} /> Slots UTC
                  </div>
                  <p className="text-[11.5px] text-muted font-mono tnum">
                    {c.slots.length ? c.slots.join(' · ') : '—'}
                    {c.longSlot ? <span className="text-accent"> + {c.longSlot}</span> : null}
                  </p>
                </div>
              </div>

              {schedOpen === c.slug ? <SchedulePanel slug={c.slug} accent={c.accent} /> : null}
              {tplOpen === c.slug ? <TemplateAssignPanel slug={c.slug} /> : null}
              {keysOpen === c.slug ? <ChannelKeysPanel slug={c.slug} /> : null}
              {routeOpen === c.slug ? <ProviderRoutingPanel slug={c.slug} /> : null}
            </Card>
          );
        })}
      </div>

      {/* parked brands */}
      <Card className="mt-5 overflow-hidden">
        <CardHead title="Parked brands" sub="Scripts and accents reserved — these wake up when you expand" icon={Archive} />
        {parked.length === 0 ? (
          <EmptyState icon={Archive} title="No parked brands" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 px-4 pb-4">
            {parked.map((c) => (
              <button
                key={c.slug}
                onClick={() => setParkedKeys(parkedKeys === c.slug ? null : c.slug)}
                title="API keys — pre-load this brand's provider keys before wake-up"
                className="inset-tile p-3 flex items-center gap-2.5 text-left hover:bg-surface-2 transition-colors"
              >
                <BrandMark short={BRAND_META[c.slug]?.short || '•'} accent={c.accent} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-semibold text-ink truncate">{c.label}</p>
                  <p className="text-[10.5px] text-faint truncate">{c.niche}</p>
                </div>
                <KeyRound size={12} className={parkedKeys === c.slug ? 'text-ink shrink-0' : 'text-faint shrink-0'} />
              </button>
            ))}
          </div>
        )}
        {parkedKeys ? (
          <div className="px-4 pb-4">
            <ChannelKeysPanel slug={parkedKeys} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
