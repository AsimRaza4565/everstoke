'use client';
// Super Admin — /users. Owner-only: every user, their channels, keys, sessions
// and last activity in one screen. Data: /api/users (assembles Neon users +
// audit log + registry bindings + encrypted-keys presence).
import { useEffect, useState } from 'react';
import { Loader2, Users as UsersIcon, KeyRound, Tv, Activity, ShieldCheck } from 'lucide-react';

const fmtDay = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');

export default function UsersPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null); // email of expanded row

  useEffect(() => {
    fetch('/api/users')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) setErr(d.error || 'failed');
        else setData(d);
      })
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight flex items-center gap-2"><UsersIcon size={18} /> Users</h1>
        <p className="text-[12px] text-muted mt-0.5">Super admin view — every account, their channels, keys, sessions and last activity.</p>
      </div>

      {err ? (
        <p className="text-[13px]" style={{ color: 'var(--bad)' }}>{err}</p>
      ) : !data ? (
        <div className="flex items-center gap-2 text-muted text-sm py-8"><Loader2 size={15} className="animate-spin" /> Loading users…</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="inset-tile p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted">Accounts</div>
              <div className="text-2xl font-bold mt-1 font-[family-name:var(--font-display)]">{data.users.length}</div>
            </div>
            <div className="inset-tile p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted">Active sessions</div>
              <div className="text-2xl font-bold mt-1 font-[family-name:var(--font-display)]">{data.totalSessions}</div>
            </div>
            <div className="inset-tile p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted">Client channels bound</div>
              <div className="text-2xl font-bold mt-1 font-[family-name:var(--font-display)]">{data.users.reduce((a, u) => a + u.channels.length, 0)}</div>
            </div>
          </div>

          <div className="space-y-3">
            {data.users.map((u) => {
              const expanded = open === u.email;
              const acts = expanded
                ? (data._audit || []).filter((a) => String(a.actor || '').toLowerCase() === u.email.toLowerCase()).slice(0, 8)
                : [];
              return (
                <div key={u.email} className="border border-line rounded-xl bg-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div>
                      <div className="text-[13.5px] font-semibold">{u.name || u.email}</div>
                      <div className="text-[11.5px] text-muted">{u.email}</div>
                    </div>
                    <span className="ml-auto text-[10.5px] px-2 py-0.5 rounded-full border border-line flex items-center gap-1" style={{ color: u.role === 'owner' ? 'var(--accent)' : 'var(--muted)' }}>
                      <ShieldCheck size={11} /> {u.role}
                    </span>
                    <span className="text-[10.5px] px-2 py-0.5 rounded-full border border-line text-muted flex items-center gap-1">
                      <Activity size={11} /> {u.sessionsActive} session{u.sessionsActive === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 mt-3">
                    <div className="inset-tile p-2.5 flex items-start gap-2">
                      <Tv size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                      <div className="text-[12px]">
                        <div className="text-faint text-[10.5px] uppercase tracking-wide">Channels bound</div>
                        {u.channels.length
                          ? u.channels.map((c) => <div key={c.slug} className="text-muted">{c.label}</div>)
                          : <span className="text-muted">{u.role === 'owner' ? 'all legacy channels (owner)' : 'none bound'}</span>}
                      </div>
                    </div>
                    <div className="inset-tile p-2.5 flex items-start gap-2">
                      <KeyRound size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                      <div className="text-[12px]">
                        <div className="text-faint text-[10.5px] uppercase tracking-wide">API keys</div>
                        {u.keysFiles.length
                          ? u.keysFiles.map((s) => <div key={s} className="text-muted">{s}: keys configured</div>)
                          : <span className="text-muted">none saved (shared keys in use)</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="text-[11px] text-muted flex items-center gap-1"><Activity size={11} /> Last action: {u.lastAction ? `${fmtDay(u.lastAction.at)} · ${u.lastAction.action}` : 'none recorded'}</span>
                    <button onClick={() => setOpen(expanded ? null : u.email)} className="ml-auto text-[11.5px] font-medium" style={{ color: 'var(--accent)' }}>
                      {expanded ? 'Hide activity' : 'Recent activity'}
                    </button>
                  </div>
                  {expanded ? (
                    <div className="inset-tile p-2.5 mt-2 space-y-1">
                      {u.recentActivity?.length
                        ? u.recentActivity.map((a, i) => (
                          <div key={i} className="text-[11.5px] text-muted">
                            <span className="text-faint">{fmtDay(a.at)}</span> · <span className="text-ink">{a.action}</span>{a.detail ? ` — ${a.detail}` : ''}
                          </div>
                        ))
                        : <p className="text-[11px] text-muted">No recorded activity yet.</p>}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {data.unboundChannels?.length ? (
            <div className="border border-line rounded-xl bg-surface p-4 mt-5">
              <div className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Connected channels with no owner assigned</div>
              <div className="text-[12px] text-muted">{data.unboundChannels.map((c) => c.label).join(' · ')}</div>
              <p className="text-[10.5px] text-faint mt-1">Assign an owner email during the Add-Channel wizard to bind them to a user.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
