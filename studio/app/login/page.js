'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pickaxe, Loader2, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [next, setNext] = useState('/');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = requestAnimationFrame(() => {
      const n = q.get('next');
      if (n && n.startsWith('/')) setNext(n);
      const err = q.get('error');
      if (err) setError(err);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        router.replace(next);
        router.refresh();
      } else {
        setError(d.error || 'Could not sign in.');
      }
    } catch {
      setError('Network error — try again.');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 page-glow relative bg-bg">
      <form onSubmit={submit} className="w-full max-w-sm card p-7 pop-in">
        <div className="flex items-center gap-3 mb-6">
          <span
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #22d3ee))' }}
          >
            <Pickaxe size={18} color="var(--accent-ink)" strokeWidth={2.4} />
          </span>
          <div>
            <h1 className="font-display font-bold text-[17px] tracking-tight text-ink leading-none">Quarry Studio</h1>
            <p className="text-[11px] text-faint mt-1">Command Center · private</p>
          </div>
        </div>

        <a
          href="/api/auth/google/start"
          className="btn btn-primary w-full h-11 flex items-center justify-center gap-2"
          style={{ background: '#ffffff', color: '#17171c', border: '1px solid var(--line-strong)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Sign in with Google
        </a>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[10.5px] text-faint overline">or with password</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <label className="overline block mb-2" htmlFor="studio-password">Password</label>
        <div className="relative">
          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            id="studio-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Your studio password"
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-line bg-surface-2 text-[14px] text-ink placeholder:text-faint outline-none focus:border-line-strong"
          />
        </div>

        {error ? <p className="text-[12px] mt-3 px-1" style={{ color: 'var(--bad)' }}>{error}</p> : null}

        <button type="submit" disabled={busy || !password} className="btn btn-primary w-full mt-5 h-11">
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {busy ? 'Checking…' : 'Open the studio'}
        </button>

        <p className="text-[11px] text-faint mt-5 leading-relaxed">
          The password lives in the server&apos;s environment settings, never in the code.
          Signing in keeps this device trusted for 30 days — use Log out (top-right avatar) on shared computers.
        </p>
      </form>
    </div>
  );
}
