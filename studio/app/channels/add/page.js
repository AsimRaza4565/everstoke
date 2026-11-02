'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserPlus, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight, Layers, Settings2, Plus, Sparkles, X } from 'lucide-react';
import { Card, CardHead, Chip, PageHeader, EmptyState, PageSkeleton } from '@/components/ui';
import { STYLE_CATALOG, STYLE_BY_ID } from '@/lib/styles-catalog';
import { NICHE_CATALOG, NICHE_MAP } from '@/lib/niches';

const VOICE_SUGGESTIONS = ['am_michael', 'bm_george', 'bm_daniel', 'am_onyx', 'bf_emma'];
const DOC_DAYS = ['Tue', 'Wed', 'Thu', 'Fri'];

function originNow() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export default function AddChannel() {
  const [reg, setReg] = useState(null); // { channels, mode, canWriteSecrets }
  const [error, setError] = useState('');
  const [connectedSlug, setConnectedSlug] = useState('');
  const [secretWarning, setSecretWarning] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [makingLink, setMakingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fillingKit, setFillingKit] = useState(false);
  const [kitMood, setKitMood] = useState('');
  const [form, setForm] = useState({
    label: '', niche: '', subNiches: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '22:35',
    docDay: 'Tue', eyebrow: '', tagline: '', tags: '', description: '',
  });

  const loadReg = () => fetch('/api/channels/registry').then((r) => r.json()).then(setReg).catch(() => setReg({ channels: [] }));

  const prefill = (entry) => {
    const rawNiches = Array.isArray(entry.kit?.niches)
      ? entry.kit.niches
      : Array.isArray(entry.niches)
        ? entry.niches
        : (entry.niche ? [entry.niche] : []);
    setForm((f) => ({
      ...f,
      label: entry.label || '',
      niche: entry.niche || '',
      subNiches: rawNiches.join(', '),
      style: entry.style || f.style || 'cinematic',
      voice: entry.voice || f.voice || 'am_michael',
      accent: entry.accent || f.accent || '#38BDF8',
      slots: Array.isArray(entry.slots) ? entry.slots.join(', ') : (entry.slots || '22:35'),
      docDay: entry.docDay || entry.kit?.docDay || 'Tue',
      eyebrow: entry.kit?.eyebrow || '',
      tagline: entry.kit?.tagline || '',
      tags: entry.kit?.tags?.length ? entry.kit.tags.join(', ') : (entry.ytKeywords || ''),
      description: entry.kit?.description || entry.ytDescription || '',
    }));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const r = await fetch('/api/channels/registry')
        .then((x) => x.json())
        .catch(() => ({ channels: [] }));
      if (!alive) return;
      setReg(r?.channels ? r : { channels: [] });
      if (q.get('error')) setError(q.get('error'));
      if (q.get('secretWarning')) setSecretWarning(q.get('secretWarning'));
      if (q.get('connected')) {
        const connSlug = q.get('connected');
        setConnectedSlug(connSlug);
        fetch(`/api/channels/profile?slug=${connSlug}`)
          .then((x) => x.json())
          .then((d) => { if (d?.channel) prefill(d.channel); })
          .catch(() => {
            const entry = (r?.channels || []).find((c) => c.slug === connSlug);
            if (entry) prefill(entry);
          });
      }
      // edit mode: ?edit=slug opens the setup form for ANY channel (living or registry)
      if (q.get('edit')) {
        const editSlug = q.get('edit');
        setConnectedSlug(editSlug);
        fetch(`/api/channels/profile?slug=${editSlug}`)
          .then((x) => x.json())
          .then((d) => { if (d?.channel) prefill(d.channel); })
          .catch(() => {
            const entry = (r?.channels || []).find((c) => c.slug === editSlug);
            if (entry) prefill(entry);
          });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const autoFillKit = async () => {
    if (!form.niche.trim()) {
      setError('Type a niche first — the kit generator drafts from it.');
      return;
    }
    setFillingKit(true);
    setError('');
    try {
      const r = await fetch('/api/channels/kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: connectedSlug, niche: form.niche, label: form.label }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Kit generation failed');
      setKitMood(d.kit.mood || '');
      setForm((f) => ({
        ...f,
        subNiches: Array.isArray(d.kit.niches) ? d.kit.niches.join(', ') : f.subNiches,
        eyebrow: d.kit.eyebrow || f.eyebrow,
        tagline: d.kit.tagline || f.tagline,
        tags: (d.kit.tags || []).join(', '),
        description: d.kit.description || f.description,
      }));
    } catch (e) {
      setError(e.message);
    }
    setFillingKit(false);
  };

  const makeLink = async () => {
    setMakingLink(true);
    setCopied(false);
    setError('');
    try {
      const r = await fetch('/api/oauth/start?mode=link');
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not create the connect link.');
        setMakingLink(false);
        return;
      }
      setLinkUrl(d.url);
    } catch {
      setError('Network error creating the link.');
    }
    setMakingLink(false);
  };

  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      const r = await fetch('/api/oauth/start');
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Could not start the Google login.');
        if (r.status === 500) setShowSetup(true);
        setConnecting(false);
        return;
      }
      window.location.href = d.url;
    } catch {
      setError('Network error starting the login.');
      setConnecting(false);
    }
  };

  // start=false saves settings with autopilot OFF; start=true records consent
  // and flips the autopilot on (YouTube API express-consent requirement)
  const saveProfile = async (start = false) => {
    setSaving(true);
    setError('');
    const subNichesList = form.subNiches
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    try {
      const r = await fetch('/api/channels/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: connectedSlug,
          label: form.label,
          niche: form.niche,
          subNiches: subNichesList,
          style: form.style,
          voice: form.voice,
          accent: form.accent,
          slots: form.slots,
          docDay: form.docDay,
          startAutopilot: start,
          kit: {
            eyebrow: form.eyebrow,
            tagline: form.tagline,
            tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
            niches: subNichesList.length ? subNichesList : (form.niche ? [form.niche.toLowerCase()] : []),
            description: form.description,
          },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setSaved(true);
      setStarted(start);
      loadReg();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (!reg) return <PageSkeleton />;
  const entry = reg.channels?.find((c) => c.slug === connectedSlug);
  const origin = originNow();

  return (
    <div className="max-w-3xl">
      <PageHeader icon={UserPlus} title="Add Channel" sub="Log in with Google → pick the channel → pick niche + template. One login connects ONE YouTube channel." />

      {error ? (
        <Card className="p-4 mb-4" style={{ borderColor: '#ef444455' }}>
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-ink">Connect problem</p>
              <p className="text-[12px] text-muted mt-1 break-words">{error}</p>
              <p className="text-[11px] text-faint mt-2">
                Reconnect errors like <span className="font-mono">redirect_uri_mismatch</span> mean the callback URL is not registered yet — see
                “One-time Google setup” below.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* STEP 1 — connect */}
      {!connectedSlug ? (
        <Card className="p-5 mb-4">
          <CardHead title="Step 1 · Connect a YouTube channel" sub="Google's own login screen — your password never touches Studio" icon={ShieldCheck} />
          <div className="inset-tile p-3.5 mb-4">
            <div className="flex items-start gap-2.5">
              <Layers size={15} className="text-accent shrink-0 mt-0.5" />
              <div>
                <p className="text-[12.5px] font-semibold text-ink">Multiple Gmails, multiple channels — all fine.</p>
                <p className="text-[12px] text-muted mt-1 leading-relaxed">
                  Every connect is a fresh Google login: choose <b>any of your Gmail accounts</b>, then <b>any of its YouTube channels</b>, and Allow.
                  Connect Mail A&apos;s channel today, Mail B&apos;s tomorrow — they all land in the same registry and run on the same autopilot, each
                  with its own key, niche, template and schedule. To add another channel on the same Gmail, run this wizard again and pick a different
                  channel. Your Gmail address is never stored; only each channel&apos;s ID and name are saved.
                </p>
              </div>
            </div>
          </div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={connect} disabled={connecting}>
            {connecting ? 'Opening Google…' : 'Connect with Google'} <ArrowRight size={14} />
          </button>

          {/* connect from ANOTHER browser — copyable one-time link */}
          <div className="mt-4 pt-4 border-t border-line">
            <p className="overline mb-2">Or connect from another browser / phone</p>
            {!linkUrl ? (
              <button className="btn btn-outline w-full sm:w-auto" onClick={makeLink} disabled={makingLink}>
                {makingLink ? 'Creating…' : 'Generate connect link'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="input flex-1 font-mono text-[11px]" />
                  <button
                    className="btn btn-primary shrink-0"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(linkUrl); } catch { }
                      setCopied(true);
                    }}
                  >
                    {copied ? 'Copied ✓' : 'Copy link'}
                  </button>
                  <button className="btn btn-ghost shrink-0" onClick={() => { setLinkUrl(''); setCopied(false); }}>
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[11px] text-faint leading-relaxed">
                  Paste this in the browser where your Gmail is logged in → choose the account → choose the channel → Allow. The link works ONCE and
                  expires in 15 minutes — treat it like a password. After allowing, finish Step 2 (niche + template) here in this browser.
                </p>
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {/* STEP 2 — profile */}
      {connectedSlug && !saved ? (
        <Card className="p-5 mb-4">
          <CardHead
            title="Step 2 · Set up the channel"
            sub={entry ? `Connected: ${entry.label} ${entry.handle ? `(${entry.handle})` : ''} — key saved as ${entry.tokenSecret}` : 'Connected'}
            icon={Settings2}
          />
          {secretWarning ? (
            <div className="inset-tile p-3 mb-4" style={{ borderColor: '#f59e0b55' }}>
              <p className="text-[12px] text-muted">
                <b className="text-ink">Warning:</b> the GitHub token secret could not be written ({secretWarning}). The channel is registered, but CI
                can&apos;t use it until the secret <span className="font-mono">{entry?.tokenSecret}</span> exists. Run locally:{' '}
                <span className="font-mono text-[11px]">gh secret set {entry?.tokenSecret} {'<'} token.json</span>
              </p>
            </div>
          ) : null}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="overline block mb-1.5">Channel name</span>
              <input className="input w-full" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="OLD MONEY CODE" />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Niche</span>
              <input className="input w-full" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="Old money & quiet luxury" />
            </label>
            <div className="sm:col-span-2 -mt-1">
              <div className="flex flex-wrap gap-1.5">
                {NICHE_CATALOG.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="inset-tile px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink rounded-md transition-[color,border-color,background-color,transform] duration-100 ease-out cursor-pointer active:scale-[0.96]"
                    style={form.niche === n ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                    onClick={() => {
                      const subs = NICHE_MAP[n] || [];
                      setForm({
                        ...form,
                        niche: n,
                        subNiches: subs.length ? subs.join(', ') : form.subNiches,
                      });
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[10.5px] text-faint mt-1.5">One tap = niche filled + smart sub-niches auto-loaded. Or type your own.</p>
            </div>

            {/* 10-16 PRODUCT SCALE: Sub-niches field */}
            <label className="block sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="overline block">Sub-niches & Content Pillars (Comma separated)</span>
                <span className="text-[11px] text-faint">Daily research automatically rotates across these pillars</span>
              </div>
              <textarea
                className="input w-full font-mono text-[12px]"
                rows={2}
                value={form.subNiches}
                onChange={(e) => setForm({ ...form, subNiches: e.target.value })}
                placeholder="e.g. power of silence, dark psychology defense, samurai mindset, emotional detachment, boundary setting"
              />
              {NICHE_MAP[form.niche]?.length ? (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-muted mr-1">Recommended pillars:</span>
                  {NICHE_MAP[form.niche].map((sn) => {
                    const currentSubs = form.subNiches.split(',').map((s) => s.trim().toLowerCase());
                    const active = currentSubs.includes(sn.toLowerCase());
                    return (
                      <button
                        key={sn}
                        type="button"
                        className="inset-tile px-2 py-0.5 text-[10.5px] font-medium rounded-md transition-[color,border-color,background-color,transform] duration-100 ease-out cursor-pointer active:scale-[0.96]"
                        style={active ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : { color: 'var(--muted)' }}
                        onClick={() => {
                          if (active) {
                            const filtered = currentSubs.filter((s) => s !== sn.toLowerCase());
                            setForm({ ...form, subNiches: filtered.join(', ') });
                          } else {
                            const next = form.subNiches.trim() ? `${form.subNiches.trim().replace(/,$/, '')}, ${sn}` : sn;
                            setForm({ ...form, subNiches: next });
                          }
                        }}
                      >
                        {active ? '✓ ' : '+ '} {sn}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <p className="text-[10.5px] text-faint mt-1.5">
                The research engine searches YouTube for live viral videos in each sub-niche, ensuring your channel never runs out of fresh, high-performing ideas.
              </p>
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Video template</span>
              <select className="input w-full" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
                {STYLE_CATALOG.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.status === 'live' ? '· live' : '· demo'}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Voice</span>
              <input className="input w-full" list="voice-suggestions" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })} />
              <datalist id="voice-suggestions">
                {VOICE_SUGGESTIONS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Accent color</span>
              <input type="color" className="input w-full h-[38px] p-1" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Short slot UTC (evening is best)</span>
              <input className="input w-full font-mono" value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Weekly episode day</span>
              <select className="input w-full" value={form.docDay} onChange={(e) => setForm({ ...form, docDay: e.target.value })}>
                {DOC_DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-outline w-full sm:w-auto" onClick={autoFillKit} disabled={fillingKit}>
                <Sparkles size={14} /> {fillingKit ? 'Drafting…' : 'Auto-fill brand kit from niche'}
              </button>
              {kitMood ? <span className="text-[11px] text-faint ml-2">music mood: {kitMood}</span> : null}
            </div>
            <label className="block sm:col-span-2">
              <span className="overline block mb-1.5">Eyebrow (on-video label)</span>
              <input className="input w-full font-mono" value={form.eyebrow} onChange={(e) => setForm({ ...form, eyebrow: e.target.value })} placeholder="OLD MONEY HABITS // OLD MONEY CODE" />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">Tagline</span>
              <input className="input w-full" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Wealth whispers." />
            </label>
            <label className="block">
              <span className="overline block mb-1.5">SEO tags (comma separated)</span>
              <input className="input w-full" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="old money, quiet luxury, wealth habits" />
            </label>
            <label className="block sm:col-span-2">
              <span className="overline block mb-1.5">Channel description</span>
              <textarea className="input w-full" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
          </div>
          {form.style && STYLE_BY_ID[form.style] ? (
            <p className="text-[11.5px] text-faint mt-3">
              Template: <b className="text-muted">{STYLE_BY_ID[form.style].name}</b> — {STYLE_BY_ID[form.style].desc}
            </p>
          ) : null}
          <div className="flex gap-2 mt-4 flex-wrap">
            <button className="btn btn-primary" onClick={() => saveProfile(false)} disabled={saving || !form.niche.trim()}>
              {saving ? 'Saving…' : 'Save & review'}
            </button>
            <button className="btn btn-outline" onClick={connect} disabled={connecting} title="Refresh this channel's stored key (fixes 're-connect once' notices)">
              {connecting ? 'Opening Google…' : 'Re-connect key with Google'}
            </button>
            <button className="btn btn-outline" onClick={makeLink} disabled={makingLink} title="Paste this in the browser where this Gmail is logged in">
              {makingLink ? 'Creating…' : 'Copy re-connect link (other browser)'}
            </button>
            <Link className="btn btn-outline" href="/styles">
              Browse templates
            </Link>
          </div>
          {linkUrl ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input readOnly value={linkUrl} onFocus={(e) => e.target.select()} className="input flex-1 font-mono text-[11px]" />
                <button
                  className="btn btn-primary shrink-0"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(linkUrl); } catch { }
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <button className="btn btn-ghost shrink-0" onClick={() => { setLinkUrl(''); setCopied(false); }}>
                  <X size={14} />
                </button>
              </div>
              <p className="text-[11px] text-faint leading-relaxed">
                Paste this in the browser where <b>{entry?.handle || 'this channel'}</b>&apos;s Gmail is logged in → choose that account → choose the same
                channel → Allow. Works once · 15 minutes. This upgrades the stored key — your settings here are kept.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* DONE */}
      {connectedSlug && saved ? (
        <Card className="p-5 mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-bold text-ink">{started ? 'Autopilot started ✓' : 'Settings saved ✓ — autopilot OFF'}</p>
              <p className="text-[12.5px] text-muted mt-1 leading-relaxed">
                {started ? (
                  <>
                    <b className="text-ink">{form.label || connectedSlug}</b> is live: 1 short per day at your slot, weekly episode on {form.docDay},
                    Sunday off. Your explicit consent for automated publishing was recorded {new Date().toLocaleDateString()} (YouTube API policy). Pause
                    anytime from the Channels page.
                  </>
                ) : (
                  <>
                    <b className="text-ink">{form.label || connectedSlug}</b> settings are saved but the autopilot is OFF — nothing publishes until you
                    resume it from the Channels page (pencil → Resume).
                  </>
                )}
              </p>
              <div className="flex gap-2 mt-3">
                <Link className="btn btn-primary" href="/channels">
                  Back to channels
                </Link>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setSaved(false);
                    setStarted(false);
                    setConnectedSlug('');
                    setKitMood('');
                    setForm({ label: '', niche: '', style: 'cinematic', voice: 'am_michael', accent: '#38BDF8', slots: '22:35', docDay: 'Tue', eyebrow: '', tagline: '', tags: '', description: '' });
                  }}
                >
                  <Plus size={14} /> Connect another channel
                </button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Connected list */}
      <Card className="mt-5 overflow-hidden">
        <CardHead title="Connected via Studio" sub="Channels this wizard linked — they run on the nightly Channel Autopilot" icon={Layers} />
        {!reg ? (
          <PageSkeleton />
        ) : reg.channels?.length ? (
          <div className="px-4 pb-4 space-y-2">
            {reg.channels.map((c) => (
              <div key={c.slug} className="inset-tile p-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-bold" style={{ background: `${c.accent}22`, color: c.accent }}>
                  {(c.label || c.slug).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-ink truncate">{c.label || c.slug}</p>
                  <p className="text-[11px] text-faint truncate font-mono">
                    {c.handle || c.channelId} · key: {c.tokenSecret}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end shrink-0">
                  {c.style ? <Chip tone="accent">{STYLE_BY_ID[c.style]?.name || c.style}</Chip> : null}
                  {c.kit?.tags?.length ? <Chip tone="ok">kit saved</Chip> : null}
                  <Chip tone={c.tokenSecretSaved === false ? 'warn' : 'ok'}>{c.tokenSecretSaved === false ? 'secret missing' : 'key saved'}</Chip>
                  <button
                    className="icon-btn w-8 h-8 rounded-md shrink-0"
                    title="Open the setup form for this channel (also use this to re-connect and upgrade its dashboard data)"
                    onClick={() => {
                      setSaved(false);
                      setConnectedSlug(c.slug);
                      prefill(c);
                      setError('');
                    }}
                  >
                    <Settings2 size={14} />
                  </button>
                  <button
                    className="icon-btn w-8 h-8 rounded-md shrink-0 text-red-400 hover:text-red-300 hover:border-red-500/40"
                    title="Disconnect: revoke access, delete the key, remove from Studio. Videos on the channel stay."
                    onClick={async () => {
                      if (!window.confirm(`Disconnect ${c.label || c.slug}? The machine loses access immediately (key revoked) and it leaves the dashboard. Videos on the channel stay. Continue?`)) return;
                      const r = await fetch('/api/channels/registry?slug=' + c.slug, { method: 'DELETE' });
                      const d = await r.json().catch(() => ({}));
                      if (!r.ok) { setError(d.error || 'Disconnect failed'); return; }
                      loadReg();
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="No channels connected yet" sub="Use Step 1 above — the Google login takes ~30 seconds." />
        )}
      </Card>

      {/* Setup */}
      <Card className="mt-5 overflow-hidden">
        <button className="w-full text-left" onClick={() => setShowSetup(!showSetup)}>
          <CardHead title="One-time Google setup" sub="If the login fails with redirect_uri_mismatch, register the callback URLs" icon={Settings2} />
        </button>
        {showSetup ? (
          <div className="px-4 pb-4 text-[12px] text-muted leading-relaxed">
            <ol className="list-decimal ml-4 space-y-1.5">
              <li>
                Open <span className="font-mono text-ink">console.cloud.google.com → APIs &amp; Services → Credentials</span> and open the OAuth client whose
                ID matches <span className="font-mono text-ink">YOUTUBE_CLIENT_ID</span>.
              </li>
              <li>
                Under <b className="text-ink">Authorized redirect URIs</b>, add both:
                <br />
                <span className="font-mono text-accent block mt-1">{origin}/api/oauth/callback</span>
                <span className="font-mono text-accent block">http://localhost:3000/api/oauth/callback</span>
              </li>
              <li>Save (may take a few minutes to apply), then press “Connect with Google” again.</li>
            </ol>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
