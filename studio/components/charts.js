'use client';
import { useMemo, useState } from 'react';

/* -------------------------------- Sparkline ------------------------------- */

export function Sparkline({ data, color = 'var(--accent)', w = 96, h = 36 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - 4) + 2, h - 4 - ((v - min) / span) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const gid = 'sg' + Math.abs(hash(`${min}${max}${data.length}${color}`));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w - 2},${h} L2,${h} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" className="chart-line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

/* ------------------------------- MultiChart ------------------------------- */
// Smooth multi-series area chart with hover crosshair + tooltip.

export function MultiChart({ series, labels, height = 240, fmt = (v) => v.toLocaleString() }) {
  const [hover, setHover] = useState(null);
  const W = 720;
  const H = height;
  const PAD_L = 44;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 26;

  const { paths, areas, yTicks, max, x } = useMemo(() => {
    const all = series.flatMap((s) => s.data);
    const rawMax = Math.max(...all, 1);
    const max = Math.ceil(rawMax / 4 / 500) * 500 || 1;
    const x = (i) => PAD_L + (i / (labels.length - 1)) * (W - PAD_L - PAD_R);
    const y = (v) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
    const out = { paths: [], areas: [], yTicks: [], max, x };
    for (const s of series) {
      const pts = s.data.map((v, i) => [x(i), y(v)]);
      const d = smoothPath(pts);
      out.paths.push({ d, color: s.color, key: s.key });
      out.areas.push({ d: `${d} L${x(s.data.length - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z`, color: s.color, key: s.key });
    }
    for (let t = 0; t <= 4; t++) out.yTicks.push({ v: (max / 4) * t, y: y((max / 4) * t) });
    out.x = x;
    return out;
  }, [series, labels, H]);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="views chart">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`ag-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_L - 8} y={t.y + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">
              {fmt(Math.round(t.v))}
            </text>
          </g>
        ))}
        {areas.map((a) => (
          <path key={a.key} d={a.d} fill={`url(#ag-${a.key})`} />
        ))}
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2.2" strokeLinecap="round" className="chart-line" />
        ))}
        {labels.map((l, i) =>
          i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? (
            <text
              key={i}
              x={paths.length ? series[0] && PAD_L + (i / (labels.length - 1)) * (W - PAD_L - PAD_R) : 0}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--faint)"
              fontFamily="var(--font-mono)"
            >
              {l}
            </text>
          ) : null
        )}
        {hover !== null ? (
          <g>
            <line
              x1={PAD_L + (hover / (labels.length - 1)) * (W - PAD_L - PAD_R)}
              x2={PAD_L + (hover / (labels.length - 1)) * (W - PAD_L - PAD_R)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={PAD_L + (hover / (labels.length - 1)) * (W - PAD_L - PAD_R)}
                cy={PAD_T + (1 - s.data[hover] / max) * (H - PAD_T - PAD_B)}
                r="3.4"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div
          className="absolute top-2 pop-in card px-3 py-2 pointer-events-none"
          style={{
            left: `${Math.min(78, Math.max(2, (hover / (labels.length - 1)) * 100))}%`,
            transform: 'translateX(-50%)',
            minWidth: 140,
          }}
        >
          <div className="overline mb-1.5">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4 text-xs py-0.5">
              <span className="flex items-center gap-1.5" style={{ color: s.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tnum font-semibold text-ink">{fmt(s.data[hover])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- Donut ---------------------------------- */

export function Donut({ slices, size = 148, thickness = 16, center }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} role="img" aria-label="platform split">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s, i) => {
            const frac = s.value / total;
            const dash = `${frac * c} ${c}`;
            const off = -acc * c;
            acc += frac;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={off}
                strokeLinecap="butt"
                opacity={s.value ? 1 : 0}
              />
            );
          })}
        </g>
      </svg>
      {center ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
      ) : null}
    </div>
  );
}

/* ------------------------------ RetentionBars ----------------------------- */

export function RetentionBars({ rows, goal }) {
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.slug}>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.accent }} />
              {r.name}
            </span>
            <span className="tnum font-bold" style={{ color: r.pct >= goal ? 'var(--ok)' : 'var(--ink)' }}>
              {r.pct}%
            </span>
          </div>
          <div className="relative h-3.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${Math.min(100, r.pct)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${r.accent} 55%, transparent), ${r.accent})` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5"
              style={{ left: `${goal}%`, background: 'var(--ink)', opacity: 0.55 }}
              title={`goal ${goal}%`}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between text-[10.5px] text-faint pt-1">
        <span>0%</span>
        <span className="font-bold" style={{ color: 'var(--ink)' }}>▲ goal {goal}%</span>
        <span>100% watched</span>
      </div>
    </div>
  );
}

/* -------------------------------- MiniBars -------------------------------- */

export function MiniBars({ data, color = 'var(--accent)', height = 56, labels }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${labels?.[i] ?? i}: ${v}`}>
          <div
            className="w-full rounded-t-md transition-[height,opacity] duration-500 ease-out group-hover:opacity-80"
            style={{ height: `${Math.max(4, (v / max) * (height - 14))}px`, background: color, opacity: 0.32 + 0.68 * (v / max) }}
          />
          {labels ? <span className="text-[9px] text-faint font-mono">{labels[i]}</span> : null}
        </div>
      ))}
    </div>
  );
}
