'use client';
import { useEffect, useMemo, useState } from 'react';
import { Film, Search, ArrowUpRight } from 'lucide-react';
import { YoutubeIcon } from '@/components/BrandIcons';
import { Card, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { BRAND_META } from '@/lib/site-data';
import { when } from '@/lib/utils';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';
import DataTable from '@/components/DataTable';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'Short', label: 'Shorts' },
  { value: 'Episode', label: 'Episodes' },
];

const PLATFORM_ICON = { YouTube: YoutubeIcon };

export default function Videos() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ logs: [] }));
  }, []);

  const logs = data?.logs || [];
  const filtered = useMemo(
    () =>
      logs.filter((l) => l.kind === 'Short' || l.kind === 'Episode').filter((l) => {
        if (filter === 'Short' && l.kind !== 'Short') return false;
        if (filter === 'Episode' && l.kind !== 'Episode') return false;
        if (filter === 'Image' && l.kind !== 'Image post') return false;
        if (filter === 'Cross' && !String(l.kind).startsWith('Cross')) return false;
        if (q && !String(l.title || '').toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [logs, filter, q]
  );

  const counts = {
    all: logs.filter((l) => l.kind === 'Short' || l.kind === 'Episode').length,
    Short: logs.filter((l) => l.kind === 'Short').length,
    Episode: logs.filter((l) => l.kind === 'Episode').length,
  };

  if (!data) return <PageSkeleton />;

  return (
    <div>
      <PageHeader icon={Film} title="Videos" sub="Every video the machine published — shorts and episodes, newest first">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            className="h-9 w-56 pl-9 pr-3 rounded-xl border border-line bg-surface text-[13px] text-ink placeholder:text-faint outline-none focus:border-line-strong"
          />
        </div>
      </PageHeader>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <span className="text-[11.5px] text-faint">
          {filtered.length} videos · {counts.Short} shorts · {counts.Episode} episodes
        </span>
      </div>

      <Card className="overflow-hidden p-4">
        <DataTable
          label="All videos"
          rows={filtered.map((l, i) => ({ ...l, id: `${l.videoId || l.slug}-${i}` }))}
          emptyIcon={Film}
          emptyTitle="Nothing here"
          emptySub="No videos match this filter yet."
          pageSize={12}
          columns={[
            { key: 'brand', label: '', render: (l) => <BrandMark short={BRAND_META[l.slug]?.short || '•'} accent={BRAND_META[l.slug]?.accent || 'var(--faint)'} size={28} /> },
            { key: 'title', label: 'Title', render: (l) => <span className="block max-w-[340px] truncate font-medium text-fg-primary" title={l.title}>{l.title}</span> },
            { key: 'slug', label: 'Channel', render: (l) => <span className="text-fg-tertiary text-[12px]">{l.slug}</span> },
            { key: 'kind', label: 'Kind', render: (l) => <Chip tone={l.kind === 'Episode' ? 'accent' : l.kind === 'Short' ? 'info' : 'plain'}>{l.kind}</Chip> },
            { key: 'platform', label: 'Platform', render: (l) => {
              const Icon = PLATFORM_ICON[l.platform] || Film;
              return <span className="flex items-center gap-1.5 text-[12px] text-fg-tertiary"><Icon size={13} /> {l.platform}</span>;
            } },
            { key: 'status', label: 'Status', render: (l) => (
              <span className="whitespace-nowrap">
                <Chip tone={l.status === 'scheduled' ? 'info' : 'ok'} dot>
                  {l.status === 'scheduled' ? 'Scheduled' : l.status === 'published' ? 'Published' : '—'}
                </Chip>
                <span className="block text-[10.5px] text-fg-quaternary tnum mt-0.5">{when(l.at)}</span>
              </span>
            ) },
            { key: 'open', label: '', render: (l) => l.videoId ? (
              <a href={`https://youtube.com/watch?v=${l.videoId}`} target="_blank" rel="noreferrer" aria-label="Open on YouTube">
                <ButtonUtility size="xs" color="tertiary" icon={ArrowUpRight} />
              </a>
            ) : null },
          ]}
        />
      </Card>
    </div>
  );
}
