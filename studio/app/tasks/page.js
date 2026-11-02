'use client';
import { useState } from 'react';
import { SquareKanban, OctagonAlert, Zap, User, Rocket, Archive, CircleCheck, Circle, Search } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader } from '@/components/ui';
import { ROADMAP } from '@/lib/site-data';
import { cn } from '@/lib/utils';

const ICONS = { alert: OctagonAlert, zap: Zap, user: User, rocket: Rocket, archive: Archive };

const STATE_STYLE = {
  live: { tone: 'ok', label: 'live' },
  ready: { tone: 'ok', label: 'ready' },
  built: { tone: 'ok', label: 'built' },
  done: { tone: 'ok', label: 'done' },
  pending: { tone: 'warn', label: 'pending' },
  'waiting-you': { tone: 'warn', label: 'waiting on you' },
  next: { tone: 'info', label: 'next' },
  info: { tone: 'plain', label: 'info' },
  optional: { tone: 'plain', label: 'optional' },
  parked: { tone: 'plain', label: 'parked' },
};

export default function Tasks() {
  const [showDone, setShowDone] = useState(true);
  const groups = ROADMAP.map((g) => ({
    ...g,
    items: showDone ? g.items : g.items.filter((i) => !['done', 'parked'].includes(i.state)),
  }));

  const total = ROADMAP.reduce((a, g) => a + g.items.length, 0);
  const live = ROADMAP.reduce((a, g) => a + g.items.filter((i) => i.state === 'live').length, 0);
  const waiting = ROADMAP.reduce((a, g) => a + g.items.filter((i) => i.state === 'waiting-you' || i.state === 'pending').length, 0);

  return (
    <div>
      <PageHeader icon={SquareKanban} title="Tasks" sub={`${total} items · ${live} running live · ${waiting} waiting on you`}>
        <button className={cn('btn', showDone ? 'btn-outline' : 'btn-primary')} onClick={() => setShowDone((s) => !s)}>
          {showDone ? <Search size={14} /> : <CircleCheck size={14} />}
          {showDone ? 'Hide parked' : 'Show parked'}
        </button>
      </PageHeader>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((g) => {
          const Icon = ICONS[g.icon] || Circle;
          return (
            <Card key={g.group} hover className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="section-title truncate">{g.group}</h2>
                  <p className="text-[11px] text-faint">{g.items.length} items</p>
                </div>
              </div>
              <ul className="space-y-1">
                {g.items.map((i) => {
                  const st = STATE_STYLE[i.state] || { tone: 'plain', label: i.state };
                  const isDone = i.state === 'live' || i.state === 'done' || i.state === 'built' || i.state === 'ready';
                  return (
                    <li key={i.t} className="flex items-start gap-2.5 py-1.5 px-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors">
                      <span className="mt-[3px] shrink-0" style={{ color: isDone ? 'var(--ok)' : 'var(--faint)' }}>
                        {isDone ? <CircleCheck size={14} /> : <Circle size={14} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12.5px] text-ink leading-snug">{i.t}</span>
                        <span className="mt-1 inline-block">
                          <Chip tone={st.tone}>{st.label}</Chip>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}

        {/* legend card */}
        <Card className="p-5">
          <CardHead title="How to read this" sub="Status chips" className="p-0 mb-3" />
          <div className="space-y-2.5 text-[12px] text-muted">
            <p className="flex items-center gap-2"><Chip tone="ok">live</Chip> running every day without you.</p>
            <p className="flex items-center gap-2"><Chip tone="warn">waiting on you</Chip> blocked until you act or say “go”.</p>
            <p className="flex items-center gap-2"><Chip tone="info">next</Chip> queued right after the blockers.</p>
            <p className="flex items-center gap-2"><Chip>parked</Chip> decided or frozen — hidden when you press “Hide parked”.</p>
          </div>
          <div className="inset-tile p-3 mt-4 text-[11.5px] text-muted leading-relaxed">
            The master sheet lives in <code className="font-mono text-accent">PLAN.md</code> at the repo root. It is
            append-only — ZCode adds and ticks, you prune.
          </div>
        </Card>
      </div>
    </div>
  );
}
