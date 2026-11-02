'use client';
// Template registry catalog browser (issue #102 Phase 1, Task 8 — AC-1).
// Lists every template with VALID registry metadata (the API's fail-closed
// loader already excludes invalid blocks — they arrive only in `invalid`,
// rendered as an owner warning strip). Filterable by niche and format.
// Read-only for staff (AC-9); assignment happens per channel on the
// Channels page (TemplateAssignPanel), detail lives at ?family=….
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Layers, RefreshCw, AlertTriangle, Search, ArrowRight, ShieldCheck, Ban } from 'lucide-react';
import { PageHeader, Card, Chip, PageSkeleton, EmptyState, Segmented } from '@/components/ui';
import { Button } from '@/components/untitledui/base/buttons/button';

export default function TemplateRegistryPage() {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [niche, setNiche] = useState('all');
  const [format, setFormat] = useState('all');
  const [query, setQuery] = useState('');

  const load = () => {
    setLoadErr(null);
    fetch('/api/templates')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  };
  useEffect(() => { load(); }, []);

  const templates = data?.templates || [];
  const invalid = data?.invalid || [];
  const isOwner = data?.role === 'owner';

  const allNiches = useMemo(
    () => [...new Set(templates.flatMap((t) => t.registry?.niches || []))].sort(),
    [templates],
  );

  const filtered = useMemo(() => templates.filter((t) => {
    const matchNiche = niche === 'all' || (t.registry?.niches || []).includes(niche);
    const matchFormat = format === 'all' || (t.registry?.formats || []).includes(format);
    const q = query.trim().toLowerCase();
    const matchQuery = !q || t.name.toLowerCase().includes(q) || t.familyId.toLowerCase().includes(q);
    return matchNiche && matchFormat && matchQuery;
  }), [templates, niche, format, query]);

  if (loadErr) {
    return (
      <div>
        <PageHeader icon={Layers} title="Template Registry" sub="Versioned, niche-linked, capability-aware template catalog." />
        <Card className="p-6 flex items-center gap-2.5" style={{ color: 'var(--bad)' }}>
          <Ban size={15} /> Template registry unavailable: {loadErr}. {loadErr.includes('not signed in') ? 'Sign in with an owner or staff account.' : ''}
        </Card>
      </div>
    );
  }
  if (!data) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Layers}
        title="Template Registry"
        sub={`${templates.length} registry template${templates.length === 1 ? '' : 's'} · versions, niche linkage and capability requirements — assign from a channel's card.`}
      >
        {!isOwner && data?.role ? <Chip tone="info">read-only — owner only</Chip> : null}
        <Link href="/channels"><Button color="secondary">Channels</Button></Link>
        <Button color="secondary" onClick={load} iconLeading={<RefreshCw size={15} />}>Refresh</Button>
      </PageHeader>

      {/* invalid-metadata warning strip (owner) — these never appear as cards */}
      {isOwner && invalid.length > 0 ? (
        <Card className="border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-ink">{invalid.length} template block{invalid.length === 1 ? '' : 's'} failed registry validation — excluded from browse and assignment.</p>
              <ul className="mt-1.5 space-y-1">
                {invalid.map((v) => (
                  <li key={v.familyId} className="text-[11.5px] text-muted">
                    <span className="font-mono text-[10.5px] text-amber-300">{v.familyId}</span> — {v.errors.join(' · ')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}

      {/* filters: niche + format + search (AC-1) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[var(--surface-1)] p-4 rounded-2xl border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="overline">Niche</span>
          <select
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            className="text-[12.5px] px-3 py-1.5 rounded-lg border border-line bg-surface"
          >
            <option value="all">all niches</option>
            {allNiches.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <Segmented
            className="ml-2"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'all', label: 'All formats' },
              { value: 'short', label: 'Short' },
              { value: 'long', label: 'Long' },
            ]}
          />
        </div>
        <div className="relative w-full md:w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search registry…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-black/40 border border-white/10 text-ink placeholder:text-muted focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* catalog grid */}
      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="No registry templates yet — seeds land in Task 10"
            sub="The catalog fills in automatically once registry metadata is seeded and synced; channels keep their normal engine path until assigned."
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No templates match these filters" sub="Try another niche or set the format filter back to all." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const reg = t.registry || {};
            return (
              <Card key={t.familyId} hover className="p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display text-[15px] font-bold tracking-tight text-ink truncate">{t.name}</h3>
                    <p className="text-[10.5px] text-faint font-mono truncate">{t.familyId}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Chip tone="accent" className="font-mono">v{reg.version}</Chip>
                    {reg.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(reg.niches || []).map((n) => <Chip key={n} tone="plain">{n}</Chip>)}
                </div>

                <div className="inset-tile p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11.5px] text-muted">
                    <span className="overline w-20 shrink-0">Formats</span>
                    <span className="font-mono">{(reg.formats || []).join(' · ')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-muted">
                    <span className="overline w-20 shrink-0">Renderer</span>
                    <span className="font-mono truncate">{reg.renderer}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-muted">
                    <span className="overline w-20 shrink-0">Needs</span>
                    <span className="flex flex-wrap gap-1">
                      {(reg.required_capabilities || []).length
                        ? (reg.required_capabilities || []).map((c) => <Chip key={c} tone="info">{c}</Chip>)
                        : <span className="text-faint">—</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11.5px] text-muted">
                    <span className="overline w-20 shrink-0">Safety</span>
                    <span className="flex items-center gap-1 flex-wrap">
                      {reg.safety?.required_sources ? <Chip tone="ok">sources</Chip> : null}
                      {(reg.safety?.review_required || []).map((r) => <Chip key={r} tone="warn">review: {r}</Chip>)}
                      {!reg.safety?.required_sources && !(reg.safety?.review_required || []).length ? <span className="text-faint">—</span> : null}
                    </span>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-faint flex items-center gap-1">
                    <ShieldCheck size={11} /> {reg.variation_rules?.length || 0} variation rule{(reg.variation_rules?.length || 0) === 1 ? '' : 's'}
                  </span>
                  <Link
                    href={`/templates/registry/detail?family=${encodeURIComponent(t.familyId)}`}
                    className="text-[11.5px] font-semibold flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    Detail <ArrowRight size={12} />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* deprecated explanation footer */}
      {templates.some((t) => t.registry?.deprecated) ? (
        <div className="inset-tile p-3 flex gap-2.5 items-start">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warn, #d97706)' }} />
          <p className="text-[11.5px] text-muted">
            Deprecated templates keep producing on channels already assigned to them, but the validator blocks every new assignment (AC-6). Unassign and move those channels to a successor style when ready.
          </p>
        </div>
      ) : null}
    </div>
  );
}
