'use client';
import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Palette, Sparkles, Monitor, Smartphone, Check } from 'lucide-react';

const PALETTES = {
  midnight: { bg: '#0A0A12', text: '#FFFFFF', primary: '#7C5CFF', accent: '#00E0FF', card: '#161626' },
  paper: { bg: '#FAF7F2', text: '#141414', primary: '#C8372D', accent: '#D97706', card: '#EFE6D0' },
  sunset: { bg: '#1A0B2E', text: '#FFF8F0', primary: '#FF6B35', accent: '#FACC15', card: '#2D124D' },
  forest: { bg: '#07130C', text: '#ECFDF5', primary: '#10B981', accent: '#34D399', card: '#0F291B' },
  ocean: { bg: '#04121F', text: '#F0F9FF', primary: '#3B82F6', accent: '#38BDF8', card: '#0D2744' },
  mono: { bg: '#0D0D0D', text: '#FFFFFF', primary: '#E2E8F0', accent: '#F59E0B', card: '#1C1C1C' },
};

export default function TemplateSimulator({ template, onClose, onSelect }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [activeVariant, setActiveVariant] = useState(template.variants[0] || 'default');
  const [paletteKey, setPaletteKey] = useState(template.previewTheme || 'midnight');
  const [aspect, setAspect] = useState(template.aspectRatios[0] || '16:9');
  const [copied, setCopied] = useState(false);

  const pal = PALETTES[paletteKey] || PALETTES.midnight;

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 180);
    }, 33); // ~30 fps
    return () => clearInterval(interval);
  }, [isPlaying]);

  const p = template.sampleProps || {};

  return (
    <div className="flex flex-col h-full max-h-[88vh] bg-[var(--surface-1)] text-ink rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner"
            style={{ background: `${template.accentColor}25`, color: template.accentColor }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-ink">{template.name}</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-muted uppercase tracking-wider">
                {template.category}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">{template.usedFor}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Aspect Ratio Toggle */}
          <div className="flex items-center bg-black/40 p-1 rounded-lg border border-white/10 text-xs">
            <button
              onClick={() => setAspect('16:9')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${aspect === '16:9' ? 'bg-white/15 text-white font-medium' : 'text-muted hover:text-white'}`}
            >
              <Monitor size={13} /> 16:9
            </button>
            <button
              onClick={() => setAspect('9:16')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition ${aspect === '9:16' ? 'bg-white/15 text-white font-medium' : 'text-muted hover:text-white'}`}
            >
              <Smartphone size={13} /> 9:16
            </button>
          </div>

          <button
            onClick={() => {
              if (onSelect) onSelect(template);
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-black shadow-lg transition flex items-center gap-1.5"
          >
            <Check size={14} /> Use Template in Production
          </button>
        </div>
      </div>

      {/* Simulator Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
        {/* Left Side: Live Frame Simulator */}
        <div className="lg:col-span-8 p-6 flex flex-col items-center justify-center bg-black/50 relative overflow-hidden">
          {/* Aspect Container */}
          <div
            className="relative rounded-xl overflow-hidden shadow-2xl transition-all duration-300 border border-white/15 flex flex-col items-center justify-center"
            style={{
              width: aspect === '16:9' ? '100%' : 'auto',
              maxWidth: aspect === '16:9' ? '680px' : '320px',
              aspectRatio: aspect === '16:9' ? '16 / 9' : '9 / 16',
              height: aspect === '9:16' ? '460px' : 'auto',
              background: pal.bg,
              color: pal.text,
            }}
          >
            {/* Ambient Background Grid / Noise */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, ${pal.accent}33 0%, transparent 70%)`,
              }}
            />

            {/* Template Specific Frame Previews */}
            {template.category === 'documentary' && (
              <div className="p-8 w-full text-center relative z-10 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center text-[10px] font-mono tracking-widest opacity-60">
                  <span>{p.location || 'GLOBAL RECONSTRUCTION'}</span>
                  <span>{p.date || 'OCTOBER 2026'}</span>
                </div>

                <div className="my-auto space-y-3">
                  <div className="inline-block px-3 py-1 rounded-full text-[11px] font-mono font-bold tracking-widest uppercase border border-current opacity-80" style={{ color: pal.accent }}>
                    {activeVariant.replace(/-/g, ' ')}
                  </div>
                  <h3 className="font-display font-extrabold text-2xl md:text-3xl tracking-tight leading-tight uppercase" style={{ color: pal.text }}>
                    {p.title || 'THE POWER SHIFT'}
                  </h3>
                  <p className="text-xs max-w-md mx-auto opacity-75 font-serif italic">
                    "{p.quote || p.subtitle || 'When history turns, it happens quietly before the roar.'}"
                  </p>
                </div>

                <div className="text-[10px] font-mono tracking-wider opacity-50 border-t border-current/20 pt-2 flex justify-between">
                  <span>FRAME {String(frame).padStart(4, '0')}</span>
                  <span>{p.source || 'ARCHIVAL RECORD // 24 FPS'}</span>
                </div>
              </div>
            )}

            {template.category === 'typography' && (
              <div className="p-8 w-full text-center relative z-10 my-auto">
                <div
                  className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter transition-transform duration-150"
                  style={{
                    color: pal.primary,
                    transform: `scale(${1 + (Math.sin(frame / 6) * 0.04)})`,
                    textShadow: `0 0 30px ${pal.primary}66`,
                  }}
                >
                  {p.headline || 'STAY SILENT & BUILD'}
                </div>
                <div className="mt-4 text-sm font-medium tracking-wide uppercase opacity-80" style={{ color: pal.accent }}>
                  {p.subline || 'TRUE DOMINANCE NEEDS NO VALIDATION'}
                </div>
                <div className="mt-6 flex justify-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: pal.accent }} />
                  <span className="w-8 h-2 rounded-full" style={{ background: pal.primary }} />
                  <span className="w-2 h-2 rounded-full" style={{ background: pal.accent }} />
                </div>
              </div>
            )}

            {template.category === 'tech' && (
              <div className="p-6 w-full relative z-10 flex flex-col justify-between h-full font-mono">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                    <span className="text-[11px] text-muted ml-2">{p.filename || 'engine.cluster.ts'}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400">● LIVE RUNTIME</span>
                </div>

                <div className="my-auto text-left text-xs space-y-1.5 opacity-90">
                  <div className="text-zinc-500">// Automated Remotion Render Pipeline</div>
                  <div><span className="text-purple-400">const</span> <span className="text-yellow-300">timeline</span> = <span className="text-purple-400">await</span> engine.<span className="text-sky-300">orchestrate</span>();</div>
                  <div><span className="text-purple-400">const</span> status = <span className="text-sky-300">renderBeats</span>(timeline, <span className="text-green-300">"{activeVariant}"</span>);</div>
                  <div className="text-emerald-400 pt-1">&gt; Compiling frame {frame} / 300 (fps: 30) <span className="animate-pulse">▌</span></div>
                </div>

                <div className="border-t border-white/10 pt-2 flex justify-between text-[10px] text-zinc-500">
                  <span>MEMORY: 184MB</span>
                  <span>CPU THREADS: 4</span>
                </div>
              </div>
            )}

            {template.category === 'finance' && (
              <div className="p-6 w-full text-center relative z-10 my-auto">
                <div className="text-xs uppercase font-mono tracking-widest opacity-60">{p.title || 'PORTFOLIO GROWTH ENGINE'}</div>
                <div className="text-4xl md:text-5xl font-black font-display tracking-tight mt-2" style={{ color: pal.accent }}>
                  {p.currency || '$'}{Math.floor((frame * 24000) + 10000).toLocaleString()}
                </div>
                <div className="text-xs font-semibold mt-1 text-emerald-400 flex items-center justify-center gap-1">
                  ▲ +148.6% ANNUALIZED YIELD
                </div>

                {/* Simulated Growth Bars */}
                <div className="flex items-end justify-center gap-2 mt-6 h-20 max-w-xs mx-auto">
                  {[24, 38, 52, 68, 85, 100].map((h, i) => (
                    <div
                      key={i}
                      className="w-8 rounded-t transition-all duration-200"
                      style={{
                        height: `${Math.min(h, Math.max(10, (frame / 2.5) + (i * 12)))}%`,
                        background: i === 5 ? pal.accent : pal.primary,
                        opacity: 0.85,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {template.category === 'podcasts' && (
              <div className="p-6 w-full text-center relative z-10 my-auto space-y-4">
                <div className="w-16 h-16 rounded-full mx-auto border-2 border-white/20 p-1 flex items-center justify-center shadow-lg" style={{ background: pal.primary }}>
                  <span className="font-display font-black text-xl text-black">HQ</span>
                </div>
                <div>
                  <h4 className="font-bold text-sm tracking-wide uppercase">{p.episodeTitle || 'DEEP DIVE INTERVIEW'}</h4>
                  <p className="text-xs opacity-60 font-mono mt-0.5">{p.speaker || 'GUEST SPEAKER // EP. 42'}</p>
                </div>
                {/* Audio Equalizer Bars */}
                <div className="flex items-center justify-center gap-1.5 h-10">
                  {[12, 28, 40, 22, 34, 18, 44, 30, 16, 26, 38, 14].map((bar, i) => (
                    <span
                      key={i}
                      className="w-1.5 rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(6, (bar * (0.4 + Math.sin((frame + i * 8) / 3) * 0.6)))}px`,
                        background: pal.accent,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {template.category === 'shorts' && (
              <div className="p-6 w-full text-center relative z-10 my-auto space-y-3">
                <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center font-bold text-sm" style={{ background: pal.accent, color: pal.bg }}>
                  {p.ruleNumber || '01'}
                </div>
                <h3 className="font-display font-extrabold text-2xl tracking-tight uppercase" style={{ color: pal.text }}>
                  {p.ruleTitle || 'THE UNFAIR ADVANTAGE'}
                </h3>
                <p className="text-xs max-w-[220px] mx-auto opacity-80 leading-relaxed">
                  {p.ruleBody || 'Most people give up before the magic happens. Refuse to be average.'}
                </p>
                <div className="pt-2 text-[10px] font-mono tracking-widest opacity-50 uppercase">
                  SWIPE UP • DAILY REELS
                </div>
              </div>
            )}

            {template.category === 'effects' && (
              <div className="p-6 w-full text-center relative z-10 my-auto space-y-3">
                <div className="text-xs font-mono tracking-widest text-emerald-400 flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {p.badge || '● REC'}
                </div>
                <div className="font-mono text-2xl font-bold tracking-widest" style={{ color: pal.accent }}>
                  {p.timecode || 'SP 00:14:32'}
                </div>
                <div className="text-[11px] font-mono opacity-60">
                  {p.date || 'OCT 17 1994 // RETRO VHS SIMULATION'}
                </div>
              </div>
            )}
          </div>

          {/* Timeline Playback Bar */}
          <div className="w-full max-w-xl mt-4 flex items-center gap-3 bg-black/60 px-4 py-2 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition text-white"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => setFrame(0)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition text-muted"
            >
              <RotateCcw size={14} />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted">{String(frame).padStart(3, '0')}f</span>
              <input
                type="range"
                min="0"
                max="180"
                value={frame}
                onChange={(e) => setFrame(Number(e.target.value))}
                className="flex-1 accent-sky-400 h-1 bg-white/20 rounded cursor-pointer"
              />
              <span className="font-mono text-[11px] text-muted">180f</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">30 FPS</span>
          </div>
        </div>

        {/* Right Side: Variant Inspector & Live Controls */}
        <div className="lg:col-span-4 p-5 border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[0.01] flex flex-col justify-between overflow-y-auto">
          <div className="space-y-5">
            {/* Template Variants */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted block mb-2">
                Available Variant Styles ({template.variants.length})
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {template.variants.map((v) => (
                  <button
                    key={v}
                    onClick={() => setActiveVariant(v)}
                    className={`px-3 py-2 rounded-lg text-left text-xs font-medium border transition ${activeVariant === v ? 'border-sky-500 bg-sky-500/15 text-white' : 'border-white/10 bg-black/20 text-muted hover:border-white/25 hover:text-white'}`}
                  >
                    {v.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Palette Switcher */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted block mb-2 flex items-center gap-1.5">
                <Palette size={13} /> Color Palette DNA
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PALETTES).map((pk) => (
                  <button
                    key={pk}
                    onClick={() => setPaletteKey(pk)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs capitalize flex items-center gap-1.5 border transition ${paletteKey === pk ? 'border-sky-500 bg-sky-500/15 text-white' : 'border-white/10 text-muted hover:border-white/25'}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTES[pk].primary }} />
                    {pk}
                  </button>
                ))}
              </div>
            </div>

            {/* Description & Technical Seam */}
            <div className="bg-black/30 p-3.5 rounded-xl border border-white/5 space-y-2 text-xs">
              <div className="font-semibold text-white">How This Renders:</div>
              <p className="text-muted leading-relaxed text-[11.5px]">{template.desc}</p>
              <div className="pt-2 border-t border-white/5 text-[11px] text-zinc-500 flex justify-between">
                <span>Remotion Engine:</span>
                <span className="font-mono text-zinc-400">src/families/{template.family}.tsx</span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-5 border-t border-white/10 mt-6 flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(template, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex-1 py-2.5 rounded-xl text-xs font-medium border border-white/15 bg-white/5 hover:bg-white/10 text-muted hover:text-white transition"
            >
              {copied ? '✓ Props Copied' : 'Copy JSON Props'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
