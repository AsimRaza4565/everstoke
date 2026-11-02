'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clapperboard, CheckCircle2, FlaskConical, Plus } from 'lucide-react';
import { Card, Chip, PageHeader, PageSkeleton } from '@/components/ui';
import { STYLE_CATALOG } from '@/lib/styles-catalog';

function StyleCard({ s }) {
  const live = s.status === 'live';
  return (
    <Card hover className="overflow-hidden">
      <div className="relative" style={{ background: 'var(--surface-2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={s.preview}
          alt={`${s.name} — real frame from a rendered video`}
          className="w-full object-cover"
          style={{
            aspectRatio: s.id === 'cinematic' ? '9 / 16' : '16 / 9',
            maxHeight: 340,
            objectPosition: 'center',
          }}
        />
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {live ? (
            <Chip tone="ok" dot>
              LIVE IN PRODUCTION
            </Chip>
          ) : (
            <Chip tone="warn">
              <FlaskConical size={10} style={{ marginRight: 4 }} /> DEMO RENDER
            </Chip>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-ink">{s.name}</h3>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {s.formats.map((f) => (
            <Chip key={f} tone="accent">
              {f}
            </Chip>
          ))}
        </div>
        <p className="text-[12px] text-muted leading-relaxed mb-2.5">{s.desc}</p>
        <p className="text-[11px] text-faint">
          <CheckCircle2 size={11} className="inline mr-1 -mt-0.5" />
          {s.usedBy}
        </p>
      </div>
    </Card>
  );
}

export default function Styles() {
  // rAF defers the setState out of the effect body (react-hooks lint rule) —
  // first paint is the skeleton on both server and client, so no mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!mounted) return <PageSkeleton />;

  const live = STYLE_CATALOG.filter((s) => s.status === 'live');
  return (
    <div>
      <PageHeader
        icon={Clapperboard}
        title="Video Styles"
        sub={`${live.length} styles in daily production · every preview is a real frame from your own renders — nothing mocked`}
      >
        <Link className="btn btn-outline" href="/channels/add">
          <Plus size={14} /> New channel
        </Link>
      </PageHeader>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {STYLE_CATALOG.map((s) => (
          <StyleCard key={s.id} s={s} />
        ))}
      </div>

      <p className="text-[11.5px] text-faint mt-5">
        Pick a style per channel in the Add Channel wizard. New styles appear here when they graduate from demo to production.
      </p>
    </div>
  );
}
