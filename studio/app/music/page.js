'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Music,
  Play,
  Pause,
  Lock,
  ListMusic,
  Disc3,
  Hourglass,
  Volume2,
  Loader2,
} from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, BrandMark } from '@/components/ui';
import { MUSIC_MOODS, BRAND_META } from '@/lib/site-data';
import MUSIC_URLS from '@/lib/music-urls.json';
import { cn } from '@/lib/utils';

const CHANNELS = [
  { slug: 'quotequarry', label: 'Quote Quarry' },
  { slug: 'investors-compass', label: "Investor's Compass" },
  { slug: 'money-rulebook', label: 'The Money Rulebook' },
  { slug: 'debt-free-doctrine', label: 'Old Money Code' },
];

export default function MusicPage() {
  const [slug, setSlug] = useState('quotequarry');
  const [playingTitle, setPlayingTitle] = useState(null);
  const [loadingTitle, setLoadingTitle] = useState(null);
  const audioRef = useRef(null);

  const tracks = MUSIC_URLS[slug] || [];

  // stop audio when leaving the page
  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  const switchChannel = (s) => {
    if (audioRef.current) audioRef.current.pause();
    setPlayingTitle(null);
    setSlug(s);
  };

  const toggle = (track) => {
    if (!track.url) return;
    if (playingTitle === track.title) {
      audioRef.current.pause();
      setPlayingTitle(null);
      return;
    }
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.pause();
    audioRef.current = new Audio(track.url);
    audioRef.current.volume = 0.7;
    setLoadingTitle(track.title);
    audioRef.current.onplaying = () => { setPlayingTitle(track.title); setLoadingTitle(null); };
    audioRef.current.onended = () => setPlayingTitle(null);
    audioRef.current.onerror = () => { setLoadingTitle(null); setPlayingTitle(null); };
    audioRef.current.play().catch(() => setLoadingTitle(null));
  };

  return (
    <div>
      <PageHeader icon={Music} title="Music" sub="Each channel's own approved tracks — click play to preview (streams from the free source; renders download the original)" />

      {/* channel selector */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-0.5 p-1 rounded-xl border border-line bg-surface flex-wrap">
          {CHANNELS.map((c) => (
            <button
              key={c.slug}
              onClick={() => switchChannel(c.slug)}
              className={cn('px-3 h-8 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5', slug === c.slug ? 'text-ink' : 'text-faint hover:text-muted')}
              style={slug === c.slug ? { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' } : undefined}
            >
              <BrandMark short={BRAND_META[c.slug]?.short} accent={BRAND_META[c.slug]?.accent} size={16} />
              {c.label}
            </button>
          ))}
        </div>
        <Chip tone="accent">{tracks.length} tracks in this channel's pool</Chip>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* playable pool */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHead
            title={CHANNELS.find((c) => c.slug === slug)?.label + ' — approved pool'}
            sub="These are the only tracks this channel's videos use · one track per video"
            icon={Lock}
          />
          <div className="px-2 pb-2">
            {tracks.map((t) => {
              const isPlaying = playingTitle === t.title;
              const isLoading = loadingTitle === t.title;
              const disabled = !t.url;
              return (
                <div key={t.title} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors', !disabled && 'hover:bg-surface-2')}>
                  <button
                    disabled={disabled}
                    className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-transform hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ background: isPlaying ? 'var(--accent)' : 'var(--surface-2)', color: isPlaying ? 'var(--accent-ink)' : 'transparent', border: '1px solid var(--line)' }}
                    onClick={() => toggle(t)}
                    aria-label={isPlaying ? `Pause ${t.title}` : `Play ${t.title}`}
                  >
                    {isLoading ? <Loader2 size={13} className="animate-spin" /> : isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <span className="flex-1 min-w-0">
                    <span className={cn('block text-[12.5px] font-semibold truncate', isPlaying ? 'text-accent' : 'text-ink')}>{t.title}</span>
                    <span className="block text-[10.5px] text-faint">
                      {disabled ? 'no online preview — file kept locally' : 'Kevin MacLeod · CC BY · credit added automatically'}
                    </span>
                  </span>
                  {isPlaying ? (
                    <span className="flex items-end gap-[2px] h-4" aria-hidden>
                      {[0.5, 0.9, 0.6, 1, 0.4].map((h, i) => (
                        <span
                          key={i}
                          className="w-[3px] rounded-full"
                          style={{ height: `${h * 100}%`, background: 'var(--accent)', animation: `pulse-dot 1s ${i * 0.12}s ease-in-out infinite` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <Volume2 size={13} className="text-faint" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* side cards */}
        <div className="space-y-4">
          <Card>
            <CardHead title="Channel moods" sub="Requested feel per brand" icon={Disc3} />
            <div className="px-4 pb-4 space-y-3">
              {Object.entries(MUSIC_MOODS).map(([mslug, moods]) => (
                <div key={mslug} className="inset-tile p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <BrandMark short={BRAND_META[mslug]?.short} accent={BRAND_META[mslug]?.accent} size={22} />
                    <span className="text-[12px] font-semibold text-ink truncate">{BRAND_META[mslug]?.short || mslug}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {moods.map((m) => <Chip key={m} tone="accent">{m}</Chip>)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Rules the engine follows" icon={ListMusic} />
            <div className="px-4 pb-4 space-y-2 text-[12px] text-muted leading-relaxed">
              <p>· Only THIS channel&apos;s approved pool — on shorts, episodes and reels alike.</p>
              <p>· One track per video. Long videos RESTART the same track when it ends — never a second song.</p>
              <p>· Renders download the original file; this page streams a preview.</p>
              <p>· Kevin MacLeod CC BY credit is added to captions automatically.</p>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'color-mix(in srgb, var(--warn) 14%, transparent)', color: 'var(--warn)' }}>
              <Hourglass size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-ink">Old Money Code pool</p>
              <p className="text-[11.5px] text-muted">Its 27 tracks were picked for the old debt theme — consider calmer picks to match the new niche.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
