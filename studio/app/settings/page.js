'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Settings, Sun, Moon, Monitor, Check, Plug, Bell, Server, ShieldAlert, Users, Trash2, Plus, MonitorSmartphone } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, Switch } from '@/components/ui';
import { INTEGRATIONS } from '@/lib/site-data';
import { cn } from '@/lib/utils';
import { Button } from '@/components/untitledui/base/buttons/button';
import { ButtonUtility } from '@/components/untitledui/base/buttons/button-utility';

const STATUS_STYLE = {
  ok: { label: 'connected', tone: 'ok' },
  warn: { label: 'attention', tone: 'warn' },
  bad: { label: 'failing', tone: 'bad' },
  pending: { label: 'setup', tone: 'info' },
};

function ThemeCard({ value, label, icon: Icon, current, onPick, preview }) {
  const active = current === value;
  return (
    <button
      onClick={() => onPick(value)}
      className={cn('text-left rounded-xl border p-3 transition-[transform,border-color,background-color] duration-150 ease-out flex-1 cursor-pointer active:scale-[0.98]', active ? '' : 'hover:-translate-y-0.5')}
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        boxShadow: active ? '0 0 0 1px var(--accent)' : undefined,
      }}
    >
      <div className="rounded-lg overflow-hidden border border-line mb-3" style={{ height: 84 }}>
        {preview}
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
          <Icon size={13} /> {label}
        </span>
        {active ? (
          <span className="flex items-center justify-center w-5 h-5 rounded-full" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
            <Check size={11} strokeWidth={3} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

function MiniPreview({ dark }) {
  const bg = dark ? '#0f1113' : '#f6f7f8';
  const card = dark ? '#17191c' : '#ffffff';
  const line = dark ? 'rgba(255,255,255,0.08)' : '#e6e8eb';
  const accent = '#C9B7EF';
  return (
    <div className="w-full h-full p-2.5 flex flex-col gap-1.5" style={{ background: bg }}>
      <div className="flex gap-1.5 flex-1">
        <div className="w-8 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="h-4 rounded-md" style={{ background: accent, opacity: 0.85 }} />
          <div className="flex gap-1.5 flex-1">
            <div className="flex-1 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
            <div className="flex-1 rounded-md" style={{ background: card, border: `1px solid ${line}` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifs, setNotifs] = useState({ ntfy: true, fails: true, weekly: false });
  // 10-08 P1 — TEAM (owner only)
  const [team, setTeam] = useState(null);
  const [teamErr, setTeamErr] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('staff');
  // 10-09 A1 — SECURITY (active sign-ins)
  const [sessions, setSessions] = useState(null);
  const [secBusy, setSecBusy] = useState(false);
  const [secErr, setSecErr] = useState('');
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let alive = true;
    fetch('/api/team')
      .then((r) => (r.status === 403 ? { users: 'forbidden' } : r.json()))
      .then((d) => {
        requestAnimationFrame(() => {
          if (alive) setTeam(d?.users || 'forbidden');
        });
      })
      .catch(() => {
        requestAnimationFrame(() => {
          if (alive) setTeam('forbidden');
        });
      });
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setSessions(d.sessions || []);
      })
      .catch(() => { });
    return () => {
      alive = false;
    };
  }, []);

  const revokeAll = async () => {
    if (!window.confirm('Sign out EVERYWHERE? All devices (including this one) lose access and must sign in again.')) return;
    setSecBusy(true);
    setSecErr('');
    try {
      const r = await fetch('/api/sessions', { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not revoke');
      setSessions([]);
      window.location.href = '/login';
    } catch (e) {
      setSecErr(e.message);
      setSecBusy(false);
    }
  };

  const addMember = async () => {
    setTeamBusy(true);
    setTeamErr('');
    try {
      const r = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not add');
      setTeam(d.users || team);
      setNewEmail('');
    } catch (e) {
      setTeamErr(e.message);
    }
    setTeamBusy(false);
  };

  const removeMember = async (email) => {
    if (!window.confirm(`Remove ${email} from the team? They lose dashboard access immediately.`)) return;
    setTeamBusy(true);
    setTeamErr('');
    try {
      const r = await fetch('/api/team?email=' + encodeURIComponent(email), { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not remove');
      setTeam(d.users || team);
    } catch (e) {
      setTeamErr(e.message);
    }
    setTeamBusy(false);
  };

  return (
    <div>
      <PageHeader icon={Settings} title="Settings" sub="Appearance, engine and integrations — the studio talks to live APIs, so be gentle" />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* appearance */}
        <Card className="lg:col-span-2 p-5">
          <div className="overline mb-3">Appearance</div>
          <div className="flex gap-3 flex-wrap">
            <ThemeCard
              value="light"
              label="Light"
              icon={Sun}
              current={mounted ? theme : undefined}
              onPick={setTheme}
              preview={<MiniPreview dark={false} />}
            />
            <ThemeCard
              value="dark"
              label="Dark"
              icon={Moon}
              current={mounted ? theme : undefined}
              onPick={setTheme}
              preview={<MiniPreview dark />}
            />
          </div>
          <p className="text-[11.5px] text-faint mt-3">
            Your choice is saved in this browser. Dark is the house style — light is fully supported everywhere.
          </p>

          <div className="overline mt-7 mb-3">Typography</div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            <div className="inset-tile p-3">
              <p className="text-[13px] font-semibold text-ink" style={{ fontFamily: 'var(--font-jakarta)' }}>Plus Jakarta Sans</p>
              <p className="text-[11px] text-faint mt-0.5">UI + body text</p>
            </div>
            <div className="inset-tile p-3">
              <p className="text-[13px] font-bold text-ink" style={{ fontFamily: 'var(--font-jakarta)' }}>Plus Jakarta Sans</p>
              <p className="text-[11px] text-faint mt-0.5">Headlines + big numbers</p>
            </div>
            <div className="inset-tile p-3">
              <p className="text-[12.5px] font-semibold text-ink" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>JetBrains Mono</p>
              <p className="text-[11px] text-faint mt-0.5">Times, logs, IDs</p>
            </div>
          </div>

          <div className="overline mt-7 mb-3">Notifications</div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between inset-tile px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Phone pushes (ntfy)</p>
                <p className="text-[11px] text-faint">Topic quarry-x7f2k-reports — milestones + daily report</p>
              </div>
              <Switch checked={notifs.ntfy} onChange={(v) => setNotifs((n) => ({ ...n, ntfy: v }))} label="ntfy pushes" />
            </div>
            <div className="flex items-center justify-between inset-tile px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Failure alerts only</p>
                <p className="text-[11px] text-faint">Ping only when a job fails closed</p>
              </div>
              <Switch checked={notifs.fails} onChange={(v) => setNotifs((n) => ({ ...n, fails: v }))} label="Failure alerts" />
            </div>
            <div className="flex items-center justify-between inset-tile px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Weekly digest</p>
                <p className="text-[11px] text-faint">Retention + growth summary every Sunday</p>
              </div>
              <Switch checked={notifs.weekly} onChange={(v) => setNotifs((n) => ({ ...n, weekly: v }))} label="Weekly digest" />
            </div>
          </div>
        </Card>

        {/* engine + integrations */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server size={15} className="text-faint" />
              <span className="section-title">Engine</span>
              <Chip tone="ok" dot className="ml-auto">connected</Chip>
            </div>
            <div className="space-y-2 text-[12px] text-muted">
              <p className="flex justify-between"><span>Live site</span><code className="font-mono text-accent">quarry-studio.vercel.app</code></p>
              <p className="flex justify-between"><span>Local dev</span><code className="font-mono text-accent">localhost:3000</code></p>
              <p className="flex justify-between"><span>Production runs</span><span>GitHub Actions (cloud-only)</span></p>
              <p className="flex justify-between"><span>Render repo</span><code className="font-mono text-accent">quarry-render</code></p>
              <p className="flex justify-between"><span>State files</span><code className="font-mono text-accent">yt-mcp/ · fb-outbox/</code></p>
            </div>
            <div className="inset-tile p-3 mt-3 flex gap-2.5">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
              <p className="text-[11px] text-muted leading-relaxed">
                The automation repo flips back to private on Oct 1 (auto-task). Rendering lives on the public
                quarry-render repo permanently.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Plug size={15} className="text-faint" />
              <span className="section-title">Integrations</span>
            </div>
            <div className="space-y-1">
              {INTEGRATIONS.map((i) => {
                const st = STATUS_STYLE[i.status];
                return (
                  <div key={i.name} className="flex items-center gap-2.5 py-1.5">
                    <Chip tone={st.tone} dot className="w-[86px] justify-center">{st.label}</Chip>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-ink truncate">{i.name}</span>
                      <span className="block text-[10.5px] text-faint truncate">{i.note}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-2.5">
              <Bell size={15} className="text-faint" />
              <span className="section-title">Safety rules the engine obeys</span>
            </div>
            <ul className="space-y-1.5 text-[11.5px] text-muted leading-relaxed list-none">
              <li>· Every upload passes duration, title and duplicate gates — fail closed.</li>
              <li>· Never re-upload the same file (strike risk).</li>
              <li>· Nothing posts to Facebook without your approval first.</li>
              <li>· Bugs in published videos get fixed forward, never re-uploaded.</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* team (10-08 P1) */}
      <Card className="p-5 mt-4">
        <CardHead
          title="Team"
          sub="Who can sign in with Google — roles decide what they see and can do. Owner = everything · staff = dashboard + run buttons · client = their own channels only (coming)."
          icon={Users}
        />
        {team === 'forbidden' ? (
          <p className="text-[12px] text-faint px-1">Team management is owner-only.</p>
        ) : (
          <>
            <div className="space-y-1.5 mb-4">
              {(Array.isArray(team) ? team : []).map((u) => (
                <div key={u.email} className="flex items-center gap-3 inset-tile px-3 py-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-bold shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {(u.name || u.email).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-ink truncate">{u.name || u.email}</span>
                    <span className="block text-[10.5px] text-faint truncate">{u.email}</span>
                  </span>
                  <Chip tone={u.role === 'owner' ? 'ok' : 'accent'}>{u.role}</Chip>
                  {u.role !== 'owner' ? (
                    <ButtonUtility size="sm" color="tertiary" tooltip="Remove from team" isDisabled={teamBusy} icon={Trash2} onClick={() => removeMember(u.email)} />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="input flex-1 min-w-[220px]"
                placeholder="new.member@gmail.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <select className="input w-auto" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="staff">staff</option>
                <option value="client">client</option>
              </select>
              <Button color="primary" onClick={addMember} isDisabled={teamBusy || !newEmail.trim()} iconLeading={<Plus size={16} />}>Add</Button>
            </div>
            {teamErr ? <p className="text-[11.5px] mt-2" style={{ color: 'var(--bad)' }}>{teamErr}</p> : null}
            <p className="text-[11px] text-faint mt-3">
              New members sign in with Google on the login page — their email must match exactly. Owners are added by editing the invite file in the repo.
            </p>
          </>
        )}
      </Card>

      {/* security — A1 sessions (10-09) */}
      <Card className="p-5 mt-4">
        <CardHead
          title="Security — active sign-ins"
          sub="Every device signed in with your account. Revocable instantly — this is the A1 session upgrade."
          icon={MonitorSmartphone}
          right={
            <Button color="secondary" onClick={revokeAll} isDisabled={secBusy || !sessions?.length}>Sign out everywhere</Button>
          }
        />
        {secErr ? <p className="text-[12px] px-1 mb-2" style={{ color: 'var(--bad)' }}>{secErr}</p> : null}
        <div className="space-y-1.5">
          {(sessions || []).map((s) => (
            <div key={s.id} className="flex items-center gap-3 inset-tile px-3 py-2.5">
              <MonitorSmartphone size={14} className="text-faint shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-ink truncate">{s.device || 'Unknown device'}</span>
                <span className="block text-[10.5px] text-faint">
                  signed in {s.created ? new Date(s.created).toLocaleDateString() : '—'} · last used {s.lastUsed ? new Date(s.lastUsed).toLocaleString() : '—'}
                  {s.ip ? ` · ${s.ip}` : ''}
                </span>
              </span>
            </div>
          ))}
          {sessions && !sessions.length ? (
            <p className="text-[12px] text-faint px-1 py-2">No active sessions found for your account yet — sign out and back in once to register this device.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
