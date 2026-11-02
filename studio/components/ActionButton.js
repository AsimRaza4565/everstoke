'use client';
import { useState } from 'react';
import { Play, Loader2, Check, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function ActionButton({ action, slug = null, label, small = false, primary = false }) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(null);

  const run = async () => {
    setBusy(true);
    setOk(null);
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, slug }),
      });
      const d = await r.json();
      setOk(!!d.started);
    } catch {
      setOk(false);
    }
    setBusy(false);
    setTimeout(() => setOk(null), 5000);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className={cn('btn', small && 'btn-sm', primary ? 'btn-primary' : 'btn-outline')}
        title={`Runs ${action}${slug ? ` (${slug})` : ''} in the background`}
      >
        {busy ? (
          <Loader2 size={small ? 12 : 14} className="animate-spin text-accent" />
        ) : ok === true ? (
          <Check size={small ? 12 : 14} className="text-emerald-500" />
        ) : ok === false ? (
          <X size={small ? 12 : 14} className="text-red-500" />
        ) : (
          <Play size={small ? 12 : 14} className="translate-x-[0.5px]" />
        )}
        {busy ? 'Starting…' : ok === true ? 'Started' : ok === false ? 'Failed' : label}
      </button>
      {ok === true ? (
        <Link href="/logs" className="text-[11px] text-accent hover:underline whitespace-nowrap">
          watch logs →
        </Link>
      ) : null}
    </span>
  );
}
