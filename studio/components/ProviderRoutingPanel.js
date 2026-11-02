'use client';
// Per-capability provider routing panel (issue #104 Phase 2 BYOK vault v2,
// Task 4). Same per-channel panel pattern as SchedulePanel / TemplateAssignPanel /
// ChannelKeysPanel: mounted inside the Channels page cards while open, or
// without a slug on the /providers page where it edits the workspace defaults.
//
// Talks to Task 4's API: GET /api/providers[?channel=<slug>] for catalog +
// routes + effective resolution, POST /api/providers {action: set-route |
// deactivate-route} for writes (owner-only server-side; staff renders
// read-only). Per capability it shows the priority chain (up/down reordering,
// spaced priorities 100/200/…), the local baseline lanes as always-available
// (no key, never routed — they are the implicit last resort), and — per
// channel — the effective order (channel override → workspace default,
// deduped) straight from resolveCapability so what you see is what the
// pipeline resolves.
import { useEffect, useMemo, useState } from 'react';
import { Route, ArrowUp, ArrowDown, Plus, Trash2, Loader2, CheckCircle2, XCircle, Info, LockKeyhole } from 'lucide-react';
import { Chip } from '@/components/ui';

const CAP_LABEL = {
  'script-gen': 'script generation (LLM)',
  'tts': 'text-to-speech',
  'captions': 'captions',
  'image-gen': 'image generation',
};

const PRIORITY_STEP = 100;

export default function ProviderRoutingPanel({ slug }) {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [layer, setLayer] = useState('channel');        // 'channel' override vs 'default' (workspace)
  const [busy, setBusy] = useState('');                 // `capability:providerId` currently writing
  const [msg, setMsg] = useState(null);                 // { ok, text }
  const [pick, setPick] = useState({});                 // capability -> providerId chosen in the add select

  const load = () => {
    setLoadErr(null);
    fetch(`/api/providers${slug ? `?channel=${encodeURIComponent(slug)}` : ''}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  };
  useEffect(() => { load(); }, [slug]);

  const isOwner = data?.role === 'owner';
  const catalog = useMemo(() => new Map((data?.catalog || []).map((p) => [p.id, p])), [data]);
  const caps = data?.capabilities || [];
  const routes = data?.routes || [];
  const activeLayer = slug ? layer : 'default';

  const chainFor = (cap) => routes
    .filter((r) => r.capability === cap && (activeLayer === 'channel' ? r.channel_id === slug : r.channel_id === null))
    .sort((a, b) => a.priority - b.priority);

  const post = async (payload) => {
    const r = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error === 'invalid route' && Array.isArray(d.errors) ? d.errors.join('; ') : d.error || `request failed (${r.status})`);
    return d;
  };

  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      load();
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const reorder = (cap, idx, dir) => {
    const chain = chainFor(cap);
    const swap = idx + dir;
    if (swap < 0 || swap >= chain.length) return;
    const moved = [...chain];
    [moved[idx], moved[swap]] = [moved[swap], moved[idx]];
    const key = `${cap}:${moved[swap].provider_id}`;
    run(key, async () => {
      // Rewrite only rows whose priority actually changes (spaced 100/200/…).
      for (let i = 0; i < moved.length; i++) {
        const want = (i + 1) * PRIORITY_STEP;
        if (moved[i].priority !== want) {
          await post({ action: 'set-route', channelId: activeLayer === 'channel' ? slug : null, capability: cap, providerId: moved[i].provider_id, priority: want });
        }
      }
    });
  };

  const addProvider = (cap) => {
    const providerId = pick[cap];
    if (!providerId) return;
    const chain = chainFor(cap);
    const priority = chain.length ? chain[chain.length - 1].priority + PRIORITY_STEP : PRIORITY_STEP;
    run(`${cap}:${providerId}`, async () => {
      await post({ action: 'set-route', channelId: activeLayer === 'channel' ? slug : null, capability: cap, providerId, priority });
      setPick((p) => ({ ...p, [cap]: '' }));
      setMsg({ ok: true, text: `${catalog.get(providerId)?.label || providerId} added to the ${CAP_LABEL[cap] || cap} chain (priority ${priority}).` });
    });
  };

  const removeProvider = (cap, providerId) => {
    run(`${cap}:${providerId}`, async () => {
      await post({ action: 'deactivate-route', channelId: activeLayer === 'channel' ? slug : null, capability: cap, providerId });
    });
  };

  if (loadErr) {
    return (
      <div className="inset-tile p-4 mt-1 flex items-center gap-2 text-[12px]" style={{ color: 'var(--bad)' }}>
        <XCircle size={14} className="shrink-0" /> Provider routing unavailable: {loadErr}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="inset-tile p-4 mt-1 flex items-center gap-2 text-muted text-[12px]">
        <Loader2 size={14} className="animate-spin" /> Loading provider routing…
      </div>
    );
  }

  const localsOf = (cap) => (data.capabilities.find((c) => c.cap === cap)?.providers || [])
    .map((id) => catalog.get(id))
    .filter((p) => p?.local);

  return (
    <div className="inset-tile p-4 mt-1">
      <div className="flex flex-wrap items-center gap-2 overline mb-1">
        <Route size={12} /> Provider routing
        {!isOwner ? <Chip tone="info">read-only — owner only</Chip> : null}
      </div>
      <p className="text-[11.5px] text-muted mb-3">
        {slug
          ? 'Per-capability provider priority for this channel. Channel overrides run before workspace defaults; the local baseline lanes always remain as the last resort.'
          : 'Workspace defaults — the fallback chain every channel uses when it has no override of its own. Local baseline lanes always remain as the last resort.'}
      </p>

      {/* channel override vs workspace default toggle (per-channel mount only) */}
      {slug ? (
        <div className="flex items-center gap-1.5 mb-3">
          <button
            onClick={() => { setLayer('channel'); setMsg(null); }}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${activeLayer === 'channel' ? 'border-white/20 bg-white/10 text-ink font-semibold' : 'border-white/10 text-muted hover:text-ink hover:bg-white/5'}`}
          >
            This channel (override)
          </button>
          <button
            onClick={() => { setLayer('default'); setMsg(null); }}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition ${activeLayer === 'default' ? 'border-white/20 bg-white/10 text-ink font-semibold' : 'border-white/10 text-muted hover:text-ink hover:bg-white/5'}`}
          >
            Workspace default
          </button>
          {activeLayer === 'channel' ? <span className="text-[10.5px] text-faint ml-1">empty rows fall through to the workspace default</span> : null}
        </div>
      ) : null}

      {data.routesError ? (
        <div className="flex items-start gap-1.5 mb-3 text-[11.5px]" style={{ color: 'var(--warn, #d97706)' }}>
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>Routing store unavailable ({data.routesError}) — chains below are empty and resolution falls back to the catalog baseline order until Neon is reachable.</span>
        </div>
      ) : null}

      <div className="space-y-2">
        {caps.map(({ cap }) => {
          const chain = chainFor(cap);
          const locals = localsOf(cap);
          const covering = (data.capabilities.find((c) => c.cap === cap)?.providers || [])
            .map((id) => catalog.get(id))
            .filter((p) => p && !p.local);
          const inChain = new Set(chain.map((r) => r.provider_id));
          const addable = covering.filter((p) => !inChain.has(p.id));
          const resolvedList = slug && data.resolved ? data.resolved[cap] || [] : null;
          return (
            <div key={cap} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-semibold text-ink">{CAP_LABEL[cap] || cap}</span>
                {locals.map((p) => (
                  <Chip key={p.id} tone="plain" className="font-mono"><LockKeyhole size={10} className="inline mr-1 -mt-px" />{p.label} always available</Chip>
                ))}
              </div>

              {covering.length === 0 ? (
                <p className="text-[11.5px] text-faint mt-2">
                  No provider covers this capability yet — nothing to route (the vault-adds lane lights it up when a key for a covering provider lands).
                </p>
              ) : chain.length === 0 ? (
                <p className="text-[11.5px] text-muted mt-2">
                  {activeLayer === 'channel'
                    ? 'No channel override — the workspace default chain (then the catalog baseline order) is used.'
                    : 'No workspace routes yet — providers run in the catalog baseline order.'}
                </p>
              ) : (
                <div className="mt-2 space-y-1">
                  {chain.map((r, i) => {
                    const p = catalog.get(r.provider_id);
                    const key = `${cap}:${r.provider_id}`;
                    return (
                      <div key={r.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
                        <span className="tnum text-[10.5px] text-faint w-5 shrink-0">{i + 1}.</span>
                        <span className="text-[12px] text-ink font-medium truncate">{p?.label || r.provider_id}</span>
                        <span className="text-[10px] text-faint font-mono">prio {r.priority}</span>
                        {slug && activeLayer === 'channel' ? <Chip tone="accent">override</Chip> : null}
                        {isOwner ? (
                          <span className="ml-auto flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => reorder(cap, i, -1)}
                              disabled={Boolean(busy) || i === 0}
                              className="text-[11px] px-1.5 py-1 rounded-md border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-40"
                              title="Move up (higher priority)"
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              onClick={() => reorder(cap, i, 1)}
                              disabled={Boolean(busy) || i === chain.length - 1}
                              className="text-[11px] px-1.5 py-1 rounded-md border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-40"
                              title="Move down (lower priority)"
                            >
                              <ArrowDown size={11} />
                            </button>
                            <button
                              onClick={() => removeProvider(cap, r.provider_id)}
                              disabled={Boolean(busy)}
                              className="text-[11px] px-1.5 py-1 rounded-md border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-40"
                              title="Remove from the chain"
                            >
                              {busy === key ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                            </button>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* add provider (owner only) */}
              {isOwner && covering.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <select
                    value={pick[cap] || ''}
                    onChange={(e) => setPick((p) => ({ ...p, [cap]: e.target.value }))}
                    className="text-[11.5px] px-2 py-1.5 rounded-lg border border-line bg-surface"
                  >
                    <option value="">— add a provider to the chain —</option>
                    {addable.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.envVar})</option>
                    ))}
                  </select>
                  <button
                    onClick={() => addProvider(cap)}
                    disabled={!pick[cap] || Boolean(busy)}
                    className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-50 flex items-center gap-1"
                    title="Append to the end of the chain (lowest priority of the chain)"
                  >
                    {busy.startsWith(`${cap}:`) ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Add
                  </button>
                </div>
              ) : null}

              {/* effective resolution preview (channel mount only) */}
              {resolvedList ? (
                <p className="text-[10.5px] text-faint mt-2 font-mono">
                  {resolvedList.length
                    ? `effective: ${resolvedList.map((r) => `${r.providerId}${r.source === 'channel' ? ' (channel)' : ' (default)'}`).join(' → ')} → ${locals.map((p) => p.id).join(' → ') || 'baseline'}`
                    : `effective: catalog baseline order → ${locals.map((p) => p.id).join(' → ') || 'baseline'}`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {msg ? (
        <div className={`mt-3 rounded-xl border p-2.5 text-[12px] ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="flex items-start gap-1.5">
            {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 text-emerald-400 shrink-0" /> : <XCircle size={13} className="mt-0.5 text-red-400 shrink-0" />}
            <span className={msg.ok ? 'text-emerald-300' : 'text-red-300'}>{msg.text}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
