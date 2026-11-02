'use client';
// Per-channel template assignment panel (issue #102 Phase 1, Task 8).
// Lives inside the Channels page cards (same pattern as SchedulePanel) and
// talks to the Task 7 API: GET /api/templates?channel=<slug> for the view,
// POST/DELETE /api/templates/assign for writes. Owner gets assign/unassign/
// re-pin controls; staff sees the same view read-only (AC-9). The picker
// orders templates niche-first (AC-10) using the channelConfig the API
// returns — the exact niches the compatibility validator compares, so
// ordering can never drift from validation. Blocking reasons (422) render
// as friendly fix-naming messages (AC-3).
import { useEffect, useMemo, useState } from 'react';
import { Layers, AlertTriangle, CheckCircle2, XCircle, Loader2, Trash2, ArrowUpCircle, Info } from 'lucide-react';
import { Button } from '@/components/untitledui/base/buttons/button';
import { Chip } from '@/components/ui';

const CAP_LABEL = {
  'script-gen': 'script generation (LLM)',
  'tts': 'text-to-speech',
  'captions': 'captions',
  'image-gen': 'image generation',
};

// Stable validator codes -> human sentences that name the fix (spec D4).
export function friendlyReason({ code, detail }) {
  if (typeof code === 'string' && code.startsWith('missing_capability:')) {
    const cap = code.slice('missing_capability:'.length);
    return `Missing capability: no ${CAP_LABEL[cap] || cap} provider is configured for this channel. Fix: add a key in this channel's API keys panel (key icon on its Channels card).`;
  }
  switch (code) {
    case 'format_mismatch':
      return `Format mismatch: the template's formats don't match what this channel produces. Fix: give the channel a long-form slot in Production scheduling, or pick a Shorts template.`;
    case 'niche_mismatch':
      return `Niche mismatch: this template targets niches the channel isn't tagged with. Fix: set a matching sub-niche in the channel's settings, or pick a template for this niche.`;
    case 'renderer_unavailable':
      return `Renderer unavailable: ${detail || 'the template needs a renderer this deployment does not ship'}.`;
    case 'deprecated_template':
      return `This template is deprecated — ${detail || 'new assignments are blocked'}. Pick a newer style.`;
    case 'invalid_meta':
      return `Template metadata failed validation — ${detail || 'repair the registry data in git and re-sync'}.`;
    default:
      return detail || code || 'unknown incompatibility';
  }
}

function majorOf(version) {
  const n = parseInt(String(version || '').split('.')[0], 10);
  return Number.isInteger(n) ? n : null;
}

// Distinct pinned-major options for a template (from its changelog versions).
function availableMajors(t) {
  const majors = [...new Set((t?.registry?.changelog || [])
    .map((e) => majorOf(e.version))
    .filter((m) => m !== null))];
  if (!majors.length) majors.push(majorOf(t?.registry?.version) || 0);
  return majors.sort((a, b) => b - a);
}

// Highest version within a pinned major (AC-5: minor/patch auto-adopt).
function highestInMajor(t, major) {
  const versions = (t?.registry?.changelog || [])
    .map((e) => e.version)
    .filter((v) => majorOf(v) === major)
    .sort((a, b) => {
      const [a1, a2, a3] = a.split('.').map(Number);
      const [b1, b2, b3] = b.split('.').map(Number);
      return b1 - a1 || b2 - a2 || b3 - a3;
    });
  return versions[0] || null;
}

export default function TemplateAssignPanel({ slug }) {
  const [data, setData] = useState(null);       // GET /api/templates?channel=
  const [loadErr, setLoadErr] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [familyId, setFamilyId] = useState('');
  const [pinnedMajor, setPinnedMajor] = useState('');
  const [busy, setBusy] = useState('');         // familyId currently writing
  const [msg, setMsg] = useState(null);         // { ok, text, reasons? }

  const load = () => {
    setLoadErr(null);
    fetch(`/api/templates?channel=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `request failed (${r.status})`);
        setData(d);
      })
      .catch((e) => setLoadErr(String(e.message || e)));
  };
  useEffect(() => { load(); }, [slug]);

  const templates = data?.templates || [];
  const assignments = data?.assignments || [];
  const channelNiches = data?.channelConfig?.niches || [];
  const channelFormats = data?.channelConfig?.formats || [];
  const isOwner = data?.role === 'owner';
  const byFamily = useMemo(() => new Map(templates.map((t) => [t.familyId, t])), [templates]);

  // AC-10: templates whose niches overlap the channel's niches first.
  const orderedTemplates = useMemo(() => {
    const hit = (t) => (t.registry?.niches || []).some((n) => channelNiches.includes(n));
    return [...templates].sort((a, b) => Number(hit(b)) - Number(hit(a)) || a.name.localeCompare(b.name));
  }, [templates, channelNiches]);

  const pickTemplate = (id) => {
    setFamilyId(id);
    setPinnedMajor('');
    setMsg(null);
    const t = byFamily.get(id);
    if (t) setPinnedMajor(String(majorOf(t.registry.version)));
  };

  const assign = async () => {
    if (!familyId || pinnedMajor === '') return;
    setBusy(familyId);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: slug, familyId, pinnedMajor: Number(pinnedMajor) }),
      });
      const d = await r.json();
      if (r.status === 422 && Array.isArray(d.reasons)) {
        setMsg({ ok: false, text: 'Not compatible — assignment blocked:', reasons: d.reasons });
      } else if (!r.ok) {
        setMsg({ ok: false, text: d.error || `assignment failed (${r.status})` });
      } else {
        setMsg({ ok: true, text: `Assigned — pinned major ${d.pinnedMajor}, resolving v${d.resolvedVersion}.` });
        setAssignOpen(false);
        setFamilyId('');
        setPinnedMajor('');
        load();
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  const unassign = async (fid) => {
    setBusy(fid);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: slug, familyId: fid }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error === 'no_active_assignment' ? 'No active assignment for that template.' : (d.error || `unassign failed (${r.status})`) });
      else { setMsg({ ok: true, text: 'Unassigned — the channel falls back to its normal engine path.' }); load(); }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  // AC-5: explicit consent per channel — re-pin to the new major.
  const repin = async (fid, newMajor) => {
    setBusy(fid);
    setMsg(null);
    try {
      const r = await fetch('/api/templates/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: slug, familyId: fid, pinnedMajor: newMajor }),
      });
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error === 'incompatible' ? 'Re-pin blocked — see compatibility reasons below.' : (d.error || `re-pin failed (${r.status})`), reasons: d.reasons });
      else { setMsg({ ok: true, text: `Re-pinned to major ${d.pinnedMajor} — resolving v${d.resolvedVersion}.` }); load(); }
    } catch (e) {
      setMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setBusy('');
    }
  };

  if (loadErr) {
    return (
      <div className="inset-tile p-4 mt-1 flex items-center gap-2 text-[12px]" style={{ color: 'var(--bad)' }}>
        <XCircle size={14} className="shrink-0" /> Template registry unavailable: {loadErr}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="inset-tile p-4 mt-1 flex items-center gap-2 text-muted text-[12px]">
        <Loader2 size={14} className="animate-spin" /> Loading template assignment…
      </div>
    );
  }

  return (
    <div className="inset-tile p-4 mt-1">
      <div className="flex items-center gap-2 overline mb-3">
        <Layers size={12} /> Template registry
        {!isOwner ? <Chip tone="info">read-only — owner only</Chip> : null}
      </div>

      {/* current assignments */}
      {assignments.length === 0 ? (
        <p className="text-[12px] text-muted mb-3">
          No registry template assigned — this channel runs its normal engine path. {isOwner ? 'Assign one below to pin a version.' : ''}
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {assignments.map((a) => {
            const t = byFamily.get(a.family_id);
            const curMajor = t ? majorOf(t.registry.version) : null;
            const majorUpdate = curMajor !== null && curMajor > a.pinned_major;
            const autoVersion = t ? highestInMajor(t, a.pinned_major) : null;
            const autoAdopt = autoVersion && autoVersion !== a.pinned_version;
            return (
              <div key={`${a.family_id}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{t ? t.name : a.family_id}</span>
                  <Chip tone="accent" className="font-mono">pin v{a.pinned_version} (major {a.pinned_major})</Chip>
                  {t?.registry.deprecated ? <Chip tone="warn">deprecated</Chip> : null}
                  {isOwner ? (
                    <button
                      onClick={() => unassign(a.family_id)}
                      disabled={busy === a.family_id}
                      className="ml-auto text-[11px] px-2 py-1 rounded-lg border border-white/10 text-muted hover:text-ink hover:bg-white/5 disabled:opacity-50 flex items-center gap-1"
                      title="Unassign — the channel falls back to its normal engine path"
                    >
                      {busy === a.family_id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Unassign
                    </button>
                  ) : null}
                </div>
                <p className="text-[10.5px] text-faint mt-1 font-mono">
                  assigned by {a.assigned_by || '—'} · {String(a.assigned_at || '').slice(0, 16).replace('T', ' ')} UTC
                </p>

                {/* AC-6: deprecation notice — existing production continues */}
                {t?.registry.deprecated ? (
                  <div className="flex items-start gap-1.5 mt-2 text-[11.5px]" style={{ color: 'var(--warn, #d97706)' }}>
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>Deprecated{t.registry.deprecated_on ? ` since ${t.registry.deprecated_on}` : ''} — existing production keeps running; migrate to a newer style when ready.</span>
                  </div>
                ) : null}

                {/* AC-5: major updates wait for explicit consent */}
                {majorUpdate ? (
                  <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ArrowUpCircle size={13} className="text-sky-400 shrink-0" />
                      <span className="text-[11.5px] text-ink font-medium">
                        Major update available: v{curMajor} is published — this channel stays pinned to {a.pinned_major} until you adopt it.
                      </span>
                      {isOwner ? (
                        <button
                          onClick={() => repin(a.family_id, curMajor)}
                          disabled={busy === a.family_id}
                          className="ml-auto text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-black border border-sky-500/30 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          {busy === a.family_id ? <Loader2 size={11} className="animate-spin" /> : <ArrowUpCircle size={11} />} Re-pin to v{curMajor}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* AC-5: minor/patch auto-adopt note */}
                {autoAdopt ? (
                  <div className="flex items-start gap-1.5 mt-2 text-[11.5px] text-muted">
                    <Info size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                    <span>Minor/patch updates auto-adopt — the next generation resolves v{autoVersion} (no action needed).</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* assign flow (owner only) */}
      {isOwner ? (
        assignOpen ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="overline">Assign template</span>
              {channelNiches.length ? <Chip tone="plain">channel niches: {channelNiches.join(', ')}</Chip> : null}
            </div>
            <select
              value={familyId}
              onChange={(e) => pickTemplate(e.target.value)}
              className="w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-surface"
            >
              <option value="">— pick a template (this channel&apos;s niches first) —</option>
              {orderedTemplates.map((t) => {
                const nicheHit = (t.registry?.niches || []).some((n) => channelNiches.includes(n));
                const fmtMiss = !(t.registry?.formats || []).some((f) => channelFormats.includes(f));
                return (
                  <option key={t.familyId} value={t.familyId}>
                    {nicheHit ? '★ ' : ''}{t.name} · v{t.registry.version}{t.registry.deprecated ? ' (deprecated)' : ''}{fmtMiss ? ' — format mismatch' : ''}
                  </option>
                );
              })}
            </select>
            {familyId && byFamily.get(familyId) ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="overline">Pinned major</span>
                <select
                  value={pinnedMajor}
                  onChange={(e) => setPinnedMajor(e.target.value)}
                  className="text-[13px] px-3 py-2 rounded-lg border border-line bg-surface"
                >
                  {availableMajors(byFamily.get(familyId)).map((m) => (
                    <option key={m} value={m}>{m} {m === majorOf(byFamily.get(familyId).registry.version) ? '(current)' : ''}</option>
                  ))}
                </select>
                {byFamily.get(familyId).registry.deprecated ? (
                  <span className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--warn, #d97706)' }}>
                    <AlertTriangle size={12} /> deprecated — the validator blocks new assignments
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Button color="primary" onClick={assign} disabled={!familyId || pinnedMajor === '' || busy === familyId}>
                {busy === familyId ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Assign &amp; pin
              </Button>
              <button
                onClick={() => { setAssignOpen(false); setFamilyId(''); setPinnedMajor(''); setMsg(null); }}
                className="text-[12.5px] px-3 py-2 rounded-lg border border-line text-muted hover:text-ink hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <Button color="secondary" onClick={() => { setAssignOpen(true); setMsg(null); }} iconLeading={<Layers size={15} />}>
            Assign template
          </Button>
        )
      ) : null}

      {/* empty registry (REGISTRY_META is seeded in Task 10) */}
      {!assignments.length && !templates.length ? (
        <p className="text-[11.5px] text-faint mt-2">No registry templates yet — seeds land in Task 10.</p>
      ) : null}

      {/* result / validation messages */}
      {msg ? (
        <div className={`mt-3 rounded-xl border p-2.5 text-[12px] ${msg.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="flex items-start gap-1.5">
            {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 text-emerald-400 shrink-0" /> : <XCircle size={13} className="mt-0.5 text-red-400 shrink-0" />}
            <span className={msg.ok ? 'text-emerald-300' : 'text-red-300'}>{msg.text}</span>
          </div>
          {Array.isArray(msg.reasons) && msg.reasons.length ? (
            <ul className="mt-1.5 space-y-1 pl-5">
              {msg.reasons.map((r, i) => (
                <li key={i} className="list-disc text-red-300 marker:text-red-400">
                  <span className="font-mono text-[10.5px] mr-1 opacity-80">{r.code}</span> {friendlyReason(r)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
