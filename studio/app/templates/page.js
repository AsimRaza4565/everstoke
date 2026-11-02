'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clapperboard,
  Search,
  Sparkles,
  Play,
  Monitor,
  Smartphone,
  Layers,
  ArrowRight,
  Filter,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader, Card, Chip } from '@/components/ui';
import { TEMPLATES_DATA, TEMPLATE_CATEGORIES } from '@/lib/templates-catalog';
import TemplateSimulator from '@/components/TemplateSimulator';

export default function TemplatesPage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRatio, setSelectedRatio] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePreviewTemplate, setActivePreviewTemplate] = useState(null);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return TEMPLATES_DATA.filter((t) => {
      const matchCat = selectedCategory === 'all' || t.category === selectedCategory;
      const matchRatio = selectedRatio === 'all' || t.aspectRatios.includes(selectedRatio);
      const matchSearch =
        !searchQuery ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.usedFor.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchRatio && matchSearch;
    });
  }, [selectedCategory, selectedRatio, searchQuery]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Clapperboard}
        title="Video Templates Studio"
        sub="Browse 100+ modular broadcast video engines. Filter, preview live interactive animations, and pick styles for your channels."
      >
        <Link className="btn btn-outline" href="/create">
          <Sparkles size={14} className="text-sky-400" /> Create Custom Video
        </Link>
      </PageHeader>

      {/* Control Bar: Categories & Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[var(--surface-1)] p-4 rounded-2xl border border-white/10 shadow-sm">
        {/* Categories scroll / wrap */}
        <div className="flex flex-wrap items-center gap-1.5">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                selectedCategory === c.id
                  ? 'bg-sky-500 text-black font-semibold shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-muted hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Right side: Search & Aspect Ratio */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Aspect Ratio selector */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/10 text-xs shrink-0">
            <button
              onClick={() => setSelectedRatio('all')}
              className={`px-2.5 py-1 rounded-lg transition ${selectedRatio === 'all' ? 'bg-white/15 text-white font-medium' : 'text-muted'}`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedRatio('16:9')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition ${selectedRatio === '16:9' ? 'bg-white/15 text-white font-medium' : 'text-muted'}`}
            >
              <Monitor size={12} /> 16:9
            </button>
            <button
              onClick={() => setSelectedRatio('9:16')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg transition ${selectedRatio === '9:16' ? 'bg-white/15 text-white font-medium' : 'text-muted'}`}
            >
              <Smartphone size={12} /> 9:16
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search templates…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-black/40 border border-white/10 text-ink placeholder:text-muted focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Grid of Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTemplates.map((t) => (
          <Card
            key={t.id}
            hover
            className="flex flex-col justify-between overflow-hidden border border-white/10 bg-[var(--surface-1)] hover:border-sky-500/50 transition-all duration-200 group"
          >
            <div>
              {/* Card Banner / Visual Simulation Preview */}
              <div
                className="relative h-44 overflow-hidden flex flex-col justify-between p-4 cursor-pointer"
                style={{
                  background: `linear-gradient(135deg, #0A0A14 0%, #16162A 100%)`,
                  borderBottom: `2px solid ${t.accentColor}33`,
                }}
                onClick={() => setActivePreviewTemplate(t)}
              >
                {/* Glow accent */}
                <div
                  className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-40 group-hover:opacity-75 transition duration-500"
                  style={{ background: t.accentColor }}
                />

                <div className="flex justify-between items-start relative z-10">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/60 text-white/90 border border-white/10 backdrop-blur-md">
                    {t.category}
                  </span>
                  <div className="flex gap-1.5">
                    {t.aspectRatios.map((r) => (
                      <span
                        key={r}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-white/80 backdrop-blur-md flex items-center gap-1"
                      >
                        {r === '16:9' ? <Monitor size={10} /> : <Smartphone size={10} />}
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center Title Display */}
                <div className="my-auto relative z-10">
                  <div
                    className="font-display font-extrabold text-lg text-white group-hover:translate-x-1 transition duration-200"
                    style={{ textShadow: `0 0 20px ${t.accentColor}44` }}
                  >
                    {t.name}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 mt-1 flex items-center gap-1.5">
                    <Layers size={11} className="text-sky-400" />
                    <span>{t.variants.length} Layout Variants Included</span>
                  </div>
                </div>

                {/* Bottom preview pill */}
                <div className="relative z-10 flex justify-between items-center pt-2 border-t border-white/10 text-[10px] text-zinc-400">
                  <span className="truncate max-w-[180px]">{t.variants.slice(0, 2).join(' · ')}...</span>
                  <span className="flex items-center gap-1 text-sky-400 font-semibold group-hover:underline">
                    <Play size={10} /> Interactive Demo
                  </span>
                </div>
              </div>

              {/* Card Body Information */}
              <div className="p-4 space-y-2.5">
                <p className="text-xs text-muted leading-relaxed line-clamp-2">{t.desc}</p>
                <div className="text-[11px] text-faint flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                  <span className="truncate">{t.usedFor}</span>
                </div>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="p-4 pt-0 border-t border-white/5 flex items-center justify-between gap-2 mt-2">
              <button
                onClick={() => setActivePreviewTemplate(t)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition flex items-center justify-center gap-1.5"
              >
                <Play size={12} className="text-sky-400" /> Open Demo
              </button>
              <button
                onClick={() => router.push(`/create?template=${t.id}`)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-black border border-sky-500/30 transition flex items-center justify-center gap-1"
              >
                Use Style <ArrowRight size={12} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-white/10">
          <SlidersHorizontal size={32} className="mx-auto text-muted mb-3 opacity-50" />
          <h3 className="font-semibold text-ink text-base">No templates found</h3>
          <p className="text-xs text-muted mt-1">Try clearing your search query or selecting "All Templates".</p>
        </div>
      )}

      {/* Interactive Simulator Modal */}
      {activePreviewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-5xl h-[88vh]">
            <TemplateSimulator
              template={activePreviewTemplate}
              onClose={() => setActivePreviewTemplate(null)}
              onSelect={(tpl) => {
                setActivePreviewTemplate(null);
                router.push(`/create?template=${tpl.id}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
