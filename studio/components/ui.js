'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/charts';

/* ------------------------------- PageHeader ------------------------------- */

export function PageHeader({ icon: Icon, title, sub, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
      <div className="flex items-center gap-3.5">
        {Icon ? (
          <div
            className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Icon size={21} strokeWidth={2.2} />
          </div>
        ) : null}
        <div>
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink text-balance">{title}</h1>
          {sub ? <p className="text-[13px] text-muted mt-0.5 text-pretty">{sub}</p> : null}
        </div>
      </div>
      {children ? <div className="flex items-center gap-2 flex-wrap">{children}</div> : null}
    </div>
  );
}

/* ---------------------------------- Card ---------------------------------- */

export function Card({ className, children, hover = false, ...rest }) {
  return (
    <div className={cn('card', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({ title, sub, icon: Icon, right, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon ? <Icon size={16} className="text-muted shrink-0" strokeWidth={2} /> : null}
        <div className="min-w-0">
          <h2 className="section-title truncate text-balance">{title}</h2>
          {sub ? <p className="text-xs text-muted mt-0.5 truncate text-pretty">{sub}</p> : null}
        </div>
      </div>
      {right ? <div className="flex items-center gap-2 shrink-0">{right}</div> : null}
    </div>
  );
}

/* ---------------------------------- Chip ---------------------------------- */

const CHIP_TONES = {
  ok: 'chip-ok',
  warn: 'chip-warn',
  bad: 'chip-bad',
  info: 'chip-info',
  accent: 'chip-accent',
  plain: '',
};

export function Chip({ tone = 'plain', dot = false, className, children }) {
  return (
    <span className={cn('chip', CHIP_TONES[tone], className)}>
      {dot ? <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------- StatCard -------------------------------- */

export function useCountUp(target, ms = 900) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (target - from) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function StatCard({ icon: Icon, label, value, delta, spark, color = 'var(--accent)', iconBg, delay = 0, fmt }) {
  const shown = useCountUp(value ?? 0);
  const up = delta >= 0;
  return (
    <Card hover className={cn('p-4 fade-up', delayClass(delay))}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ background: iconBg || 'var(--accent-soft)', color: color }}
          >
            <Icon size={15} strokeWidth={2.2} />
          </div>
          <span className="overline truncate">{label}</span>
        </div>
        {delta !== undefined && delta !== null ? (
          <span
            className="text-[11px] font-bold tnum px-1.5 py-0.5 rounded-md"
            style={{
              color: up ? 'var(--ok)' : 'var(--bad)',
              background: up ? 'color-mix(in srgb, var(--ok) 10%, transparent)' : 'color-mix(in srgb, var(--bad) 10%, transparent)',
            }}
          >
            {up ? '+' : ''}
            {delta}%
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2 mt-2.5">
        <div className="stat-num text-[26px] text-ink leading-none">{fmt ? fmt(shown) : shown.toLocaleString('en-US')}</div>
        {spark ? (
          <div className="w-24 h-9 shrink-0 opacity-90">
            <Sparkline data={spark} color={color} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function delayClass(d) {
  return [' ', 'fade-up-1', 'fade-up-2', 'fade-up-3', 'fade-up-4'][Math.min(d, 4)] || '';
}

/* -------------------------------- Skeleton -------------------------------- */

export function Skeleton({ className }) {
  return <div className={cn('skeleton', className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <Skeleton className="w-11 h-11 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-80" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/* -------------------------------- Segmented -------------------------------- */

export function Segmented({ options, value, onChange, className }) {
  return (
    <div
      className={cn('inline-flex items-center gap-0.5 p-1 rounded-xl border border-line bg-surface', className)}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-3 h-7 rounded-lg text-xs font-semibold cursor-pointer transition-[color,background-color,transform] duration-100 ease-out active:scale-[0.96]',
            value === o.value ? 'text-ink' : 'text-faint hover:text-muted'
          )}
          style={value === o.value ? { background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-strong)' } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Switch --------------------------------- */

export function Switch({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative w-10 h-[22px] rounded-full border transition-colors shrink-0 cursor-pointer before:absolute before:-inset-y-2 before:-inset-x-1 before:content-['']"
      style={{
        background: checked ? 'var(--accent)' : 'var(--surface-2)',
        borderColor: checked ? 'var(--accent)' : 'var(--line-strong)',
      }}
    >
      <span
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-[left,background-color] duration-150 ease-out"
        style={{
          left: checked ? 20 : 3,
          background: checked ? 'var(--accent-ink)' : 'var(--faint)',
        }}
      />
    </button>
  );
}

/* ------------------------------- EmptyState ------------------------------- */

export function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      {Icon ? (
        <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-3" style={{ background: 'var(--surface-2)', color: 'var(--faint)' }}>
          <Icon size={22} strokeWidth={1.8} />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-ink text-balance">{title}</p>
      {sub ? <p className="text-xs text-faint mt-1 max-w-xs text-pretty">{sub}</p> : null}
    </div>
  );
}

/* -------------------------------- Progress -------------------------------- */

export function Progress({ pct, color = 'var(--accent)', className }) {
  return (
    <div className={cn('h-1.5 rounded-full overflow-hidden', className)} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}

/* -------------------------------- BrandDot -------------------------------- */

export function BrandMark({ name, accent, short, size = 28 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg font-display font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        color: accent,
        background: `color-mix(in srgb, ${accent} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
      }}
      aria-hidden
    >
      {short}
    </span>
  );
}

/* Sparkline lives in components/charts.js (re-exported here for convenience). */
export { Sparkline };
