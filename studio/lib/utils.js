'use client';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function fmt(n) {
  if (n === null || n === undefined) return '—';
  if (typeof n !== 'number') return n;
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (Math.abs(n) >= 10_000) return Math.round(n / 1000) + 'K';
  return n.toLocaleString('en-US');
}

export function fmtFull(n) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString('en-US');
}

// "2026-09-28T21:15:00Z" -> "Sep 28, 21:15"
export function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 14) return Math.round(s / 86400) + 'd ago';
  return when(iso);
}

export function slugToName(slug) {
  return (slug || '')
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}
