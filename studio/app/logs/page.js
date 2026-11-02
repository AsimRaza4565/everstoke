'use client';
import { useEffect, useState } from 'react';
import { ScrollText, RefreshCw, ArrowUpRight, FolderOpen, Terminal, ListChecks } from 'lucide-react';
import { Card, Chip, PageHeader, PageSkeleton, EmptyState, BrandMark, Segmented } from '@/components/ui';
import { BRAND_META } from '@/lib/site-data';
import { timeAgo, when } from '@/lib/utils';
import { Button } from '@/components/untitledui/base/buttons/button';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';
import DataTable from '@/components/DataTable';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'FB/IG', label: 'FB + IG' },
  { value: 'Facebook', label: 'Facebook' },
];

export default function Logs() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [tick, setTick] = useState(0);
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    fetch('/api/overview').then((r) => r.json()).then(setData).catch(() => setData({ logs: [] }));
    fetch('/api/audit').then((r) => r.json()).then((d) => setAudit(d.events || [])).catch(() => setAudit([]));
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <PageSkeleton />;
  const logs = (data.logs || []).filter((l) => filter === 'all' || l.platform === filter || (filter === 'FB/IG' && (l.platform === 'FB/IG' || l.platform === 'Facebook')));

  return (
    <div>
      <PageHeader icon={ScrollText} title="Posting logs" sub="Every post the machine made — newest first · auto-refreshes every minute">
        <Button color="secondary" onClick={() => setTick((t) => t + 1)} iconLeading={<RefreshCw size={16} />}>Refresh now</Button>
      </PageHeader>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <span className="text-[11.5px] text-faint">{logs.length} entries</span>
      </div>

      {/* team activity (audit trail) */}
      {audit.length ? (
        <Card className="overflow-hidden mb-4">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <ListChecks size={15} className="text-faint" />
            <span className="section-title">Team activity</span>
            <span className="text-[10.5px] text-faint ml-auto">who did what · newest first</span>
          </div>
          <div className="px-4 pb-4 space-y-1.5">
            {audit.slice(0, 12).map((e, i) => (
              <div key={i} className="flex items-center gap-3 inset-tile px-3 py-2">
                <span className="text-[11.5px] font-semibold text-ink truncate w-44 shrink-0">{e.actor}</span>
                <Chip tone="accent">{e.action}</Chip>
                <span className="text-[11.5px] text-muted truncate flex-1">{e.detail}</span>
                <span className="text-[10.5px] text-faint tnum shrink-0">{timeAgo(e.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-4">
        <DataTable
          label="Posting logs"
          rows={logs.map((l, i) => ({ ...l, id: `${l.videoId || l.slug}-${i}` }))}
          emptyIcon={ScrollText}
          emptyTitle="No posts match"
          emptySub="Try another filter, or run a job from Production."
          pageSize={12}
          columns={[
            { key: 'brand', label: '', render: (l) => <BrandMark short={BRAND_META[l.slug]?.short || '•'} accent={BRAND_META[l.slug]?.accent || 'var(--faint)'} size={26} /> },
            { key: 'at', label: 'When', render: (l) => (
              <span className="whitespace-nowrap">
                <span className="block text-[12.5px] text-fg-primary tnum">{when(l.at)}</span>
                <span className="block text-[10.5px] text-fg-quaternary">{timeAgo(l.at)}</span>
              </span>
            ) },
            { key: 'platform', label: 'Platform', render: (l) => <Chip tone={l.platform === 'YouTube' ? 'bad' : l.platform === 'FB/IG' ? 'accent' : 'info'}>{l.platform}</Chip> },
            { key: 'slug', label: 'Channel', render: (l) => <span className="text-fg-tertiary text-[12px]">{l.slug}</span> },
            { key: 'kind', label: 'Kind', render: (l) => <Chip>{l.kind}</Chip> },
            { key: 'title', label: 'Title', render: (l) => <span className="block max-w-[360px] truncate text-fg-primary" title={l.title}>{l.title}</span> },
            { key: 'open', label: '', render: (l) => l.videoId ? (
              <a href={`https://youtube.com/shorts/${l.videoId}`} target="_blank" rel="noreferrer" aria-label="Open on YouTube">
                <ButtonUtility size="xs" color="tertiary" icon={ArrowUpRight} />
              </a>
            ) : null },
          ]}
        />
      </Card>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Card className="p-4 flex items-start gap-3">
          <FolderOpen size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">Raw run output.</span> Every manual job writes to{' '}
            <code className="font-mono text-accent">studio-logs/</code> in the repo — one file per run with the full script output.
          </div>
        </Card>
        <Card className="p-4 flex items-start gap-3">
          <Terminal size={16} className="text-faint mt-0.5 shrink-0" />
          <div className="text-[12px] text-muted leading-relaxed">
            <span className="font-semibold text-ink">Scheduled runs.</span> GitHub Actions runs write to Actions logs, and every
            milestone pings your phone through ntfy (topic <code className="font-mono text-accent">quarry-x7f2k-reports</code>).
          </div>
        </Card>
      </div>
    </div>
  );
}
