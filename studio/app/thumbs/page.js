'use client';
// Thumbnail Studio — /thumbs. Pick channel → video → template → customize
// (title, accent word, chip, eyebrow, accent color, photo) → live preview at
// full + mobile size with a legibility checklist → attach to the video.
import { useEffect, useRef, useState } from 'react';
import { Loader2, Image as ImageIcon, Smartphone as Mobile, CheckCircle2, XCircle, Search, Upload, Wand2, Paperclip, Sparkles, FlaskConical, Trophy, BarChart3, Palette, Layers, Shuffle } from 'lucide-react';

const CATS = [
  { id: 'all', label: 'All' },
  { id: 'core', label: 'Core' },
  { id: 'photo', label: 'Photo' },
  { id: 'type', label: 'Type' },
  { id: 'ai', label: 'AI' },
];

const fmtDay = (s) => (s ? String(s).slice(0, 10) : '');

export default function ThumbsPage() {
  const [channels, setChannels] = useState([]);
  const [slug, setSlug] = useState('');
  const [accent, setAccent] = useState('#E8C15A');
  const [brand, setBrand] = useState('');
  const [videos, setVideos] = useState(null);
  const [video, setVideo] = useState(null); // {videoId,title}
  const [template, setTemplate] = useState('poster');
  const [title, setTitle] = useState('');
  const [accentWord, setAccentWord] = useState('');
  const [chip, setChip] = useState('');
  const [eyebrow, setEyebrow] = useState('');
  const [shade, setShade] = useState('#0A1128');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoQuery, setPhotoQuery] = useState('');
  const [photos, setPhotos] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState(null); // {image, bytes, words, checklist}
  const [previewErr, setPreviewErr] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState(null);
  const debounce = useRef(null);
  const fileRef = useRef(null);
  const faceInputRef = useRef(null);
  const pickSeqRef = useRef(0); // #71 stale-response guard for pickChannel
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('cinematic');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState(null);
  const [abVariants, setAbVariants] = useState([]); // dataURLs collected
  const [abInterval, setAbInterval] = useState(48);
  const [abBusy, setAbBusy] = useState('');
  const [abMsg, setAbMsg] = useState(null);
  const [tests, setTests] = useState(null);
  const [perf, setPerf] = useState(null);
  const [branding, setBranding] = useState(null);
  const [brandMsg, setBrandMsg] = useState(null);
  const [moreVariants, setMoreVariants] = useState([]); // [{image, accent}]
  const [moreBusy, setMoreBusy] = useState(false);
  const [previewHint, setPreviewHint] = useState('');
  const autoPhotoRef = useRef('');
  const [selMode, setSelMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState(null);
  const [tpls, setTpls] = useState([]);
  const [catTab, setCatTab] = useState('all');
  // 10-18 face library + template rotation (owner request)
  const [rotation, setRotation] = useState([]);
  const [faces, setFaces] = useState(null); // [{file, dataUrl}]
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceMsg, setFaceMsg] = useState(null);

  useEffect(() => {
    fetch('/api/thumbs/templates')
      .then((r) => r.json())
      .then((d) => setTpls(d.templates || []))
      .catch(() => setTpls([]));
  }, []);

  const pickChannel = (c) => {
    // #71: stale-response guard — a slow response for channel A landing after
    // channel B was picked used to set videos/branding from the WRONG channel
    // (attaching under the wrong channel -> YouTube 403 on thumbnails.set)
    const mine = ++pickSeqRef.current;
    setSlug(c.slug);
    setAccent(c.accent || '#E8C15A');
    setBrand(c.label || '');
    setVideo(null);
    setVideos(null);
    fetch(`/api/thumbs/videos?slug=${encodeURIComponent(c.slug)}`)
      .then((r) => r.json())
      .then((d) => { if (mine === pickSeqRef.current) setVideos(d.videos || []); })
      .catch(() => { if (mine === pickSeqRef.current) setVideos([]); });
    setSelected([]);
    setSelMode(false);
    fetch(`/api/thumbs/branding?slug=${encodeURIComponent(c.slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (mine !== pickSeqRef.current) return;
        const b = d.branding || {};
        setBranding(b);
        if (b.accent) setAccent(b.accent);
        if (b.shade) setShade(b.shade);
        if (b.chip) setChip(b.chip);
        if (b.eyebrow) setEyebrow(b.eyebrow);
        if (b.template) setTemplate(b.template);
        if (b.templateRotation) setRotation(b.templateRotation);
      })
      .catch(() => setBranding(null));
    loadFaces(c.slug);
  };


  const saveBranding = async () => {
    const r = await fetch('/api/thumbs/branding', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, accent, shade, chip, eyebrow, template, templateRotation: rotation }),
    });
    const d = await r.json();
    setBrandMsg(d.ok ? { ok: true, text: 'brand defaults saved — the editor opens with them from now on' } : { ok: false, text: d.error || 'save failed' });
  };

  const loadFaces = async (s) => {
    if (!s) return;
    try {
      const d = await (await fetch('/api/thumbs/faces?slug=' + encodeURIComponent(s))).json();
      setFaces(d.faces || []);
    } catch { setFaces([]); }
  };

  const uploadFace = async (file) => {
    if (!slug || !file) return;
    setFaceBusy(true); setFaceMsg(null);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(file);
      });
      const r = await fetch('/api/thumbs/faces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, dataUrl }),
      });
      const d = await r.json();
      if (d.error) setFaceMsg({ ok: false, text: d.error });
      else { setFaceMsg({ ok: true, text: 'face added — it now appears on every thumbnail this channel renders (rotating if several)' }); loadFaces(slug); }
    } catch (e) { setFaceMsg({ ok: false, text: e.message || 'upload failed' }); }
    setFaceBusy(false);
  };

  const removeFace = async (idx) => {
    setFaceBusy(true);
    try {
      await fetch('/api/thumbs/faces?slug=' + encodeURIComponent(slug) + '&idx=' + idx, { method: 'DELETE' });
      loadFaces(slug);
    } catch { }
    setFaceBusy(false);
  };

  const addToRotation = (id) => setRotation((r) => (r.includes(id) || r.length >= 10 ? r : [...r, id]));
  const removeFromRotation = (id) => setRotation((r) => r.filter((x) => x !== id));

  const runBulk = async () => {
    if (!selected.length) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const r = await fetch('/api/thumbs/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, videoIds: selected, template, accent, chip, eyebrow, shade, brand }),
      });
      const d = await r.json();
      if (d.error) setBulkMsg({ ok: false, text: d.error });
      else {
        setBulkMsg({ ok: true, text: `${d.okCount}/${d.processed} redesigned live${d.skipped ? ` · ${d.skipped} skipped (daily cap) — run again tomorrow` : ''}` });
        setSelected([]);
        setSelMode(false);
        fetch(`/api/thumbs/videos?slug=${encodeURIComponent(slug)}`).then((res) => res.json()).then((res) => setVideos(res.videos || [])).catch(() => { });
      }
    } catch (e) {
      setBulkMsg({ ok: false, text: e.message });
    } finally {
      setBulkBusy(false);
    }
  };

  const pickTemplate = (t) => {
    setTemplate(t.id);
    if (t.aiPreset) {
      const subject = (title || '').split(/\s+/).slice(0, 4).join(' ') || 'cinematic scene';
      setAiPrompt(t.aiPreset.replace('{subject}', subject));
      setPhotoDataUrl('');
      setPhotoUrl('');
    }
  };

  const pickVideo = (v) => {
    setVideo(v);
    setTitle(v.title.replace(/\s*[|#].*$/, '').trim() || v.title);
    setAccentWord('');
    setAttachMsg(null);
  };

  const reqBody = () => ({
    template, title, accent, accentWord, chip, eyebrow, shade, brand,
    photoDataUrl: photoDataUrl || undefined,
    photoUrl: !photoDataUrl && photoUrl ? photoUrl : undefined,
  });

  const renderPreview = () => {
    if (!title.trim()) { setPreview(null); return; }
    setPreviewing(true);
    setPreviewErr('');
    fetch('/api/thumbs/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody()) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) {
          if ((d.error || '').includes('needs a photo')) {
            setPreviewErr('');
            setPreview(null);
            setPreviewHint('This template uses a photo — search one above, upload your own, or pick a no-photo template.');
          } else { setPreviewErr(d.error || 'render failed'); setPreview(null); }
        } else { setPreview(d); setPreviewHint(''); }
      })
      .catch((e) => { setPreviewErr(e.message); setPreview(null); })
      .finally(() => setPreviewing(false));
  };

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(renderPreview, 650);
    return () => clearTimeout(debounce.current);
  }, [template, title, accentWord, accent, chip, eyebrow, shade, photoUrl, photoDataUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // FIX (audit 10-12): needs-photo templates auto-fetch a matching Pexels photo
  // from the headline — the user should never see "needs a photo" as a first run.
  const tplMeta = tpls.find((t) => t.id === template);
  useEffect(() => {
    if (!tplMeta?.needsPhoto || photoDataUrl || photoUrl || photos?.length) return;
    if (!title.trim() || title.trim().split(/\s+/).length < 2) return;
    const q = title.trim().split(/\s+/).slice(0, 4).join(' ');
    const key = template + '|' + q.toLowerCase();
    if (autoPhotoRef.current === key) return;
    autoPhotoRef.current = key;
    fetch(`/api/thumbs/photos?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.photos?.length) {
          setPhotos(d.photos);
          setPhotoUrl(d.photos[0].url);
        } else {
          setPreviewHint('This template uses a photo — search one above, upload your own, or switch to Bold Poster / Paper Doc (no photo needed).');
        }
      })
      .catch(() => { });
  }, [template, title, photoDataUrl, photoUrl, photos, tpls, tplMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchPhotos = () => {
    if (!photoQuery.trim()) return;
    setPhotoBusy(true);
    fetch(`/api/thumbs/photos?q=${encodeURIComponent(photoQuery)}`)
      .then((r) => r.json())
      .then((d) => setPhotos(d.photos || []))
      .catch(() => setPhotos([]))
      .finally(() => setPhotoBusy(false));
  };

  const onUpload = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setPhotoDataUrl(String(reader.result)); setPhotoUrl(''); setPhotos(null); };
    reader.readAsDataURL(f);
  };

  const attach = async () => {
    if (!preview || !video) return;
    setAttaching(true);
    setAttachMsg(null);
    try {
      const r = await fetch('/api/thumbs/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, videoId: video.videoId, imageDataUrl: preview.image }),
      });
      const d = await r.json();
      setAttachMsg(d.ok ? { ok: true, text: `Attached to "${video.title.slice(0, 40)}…" — live on YouTube shortly.` } : { ok: false, text: d.error });
    } catch (e) {
      setAttachMsg({ ok: false, text: e.message });
    } finally {
      setAttaching(false);
    }
  };

  const generateBg = async () => {
    setAiBusy(true);
    setAiMsg(null);
    try {
      const r = await fetch('/api/thumbs/ai-bg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, style: aiStyle }),
      });
      const d = await r.json();
      if (d.image) {
        setPhotoDataUrl(d.image);
        setPhotoUrl('');
        setAiMsg({ ok: true, text: 'AI background ready — tweak the headline and attach.' });
      } else setAiMsg({ ok: false, text: d.error || 'generation failed' });
    } catch (e) {
      setAiMsg({ ok: false, text: e.message });
    } finally {
      setAiBusy(false);
    }
  };

  const ACCENT_ALTS = ['#E8C15A', '#C1272D', '#3DDC97', '#5EEAD4', '#F4766F', '#D8FF3C', '#B8860B'];
  const generateMore = async () => {
    if (!title.trim()) { setAiMsg({ ok: false, text: 'type a headline first' }); return; }
    setMoreBusy(true);
    try {
      const alts = ACCENT_ALTS.filter((a) => a.toLowerCase() !== accent.toLowerCase()).slice(0, 3);
      const rendered = [];
      for (const acc of alts) {
        const r = await fetch('/api/thumbs/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template, title, accent: acc, accentWord, chip, eyebrow, shade, brand, photoDataUrl: photoDataUrl || undefined, photoUrl: !photoDataUrl && photoUrl ? photoUrl : undefined }),
        });
        const d = await r.json();
        if (d.image) rendered.push({ image: d.image, accent: acc });
      }
      setMoreVariants(rendered);
      if (!rendered.length) setAiMsg({ ok: false, text: 'could not render variations' });
    } catch (e) {
      setAiMsg({ ok: false, text: e.message });
    } finally {
      setMoreBusy(false);
    }
  };

  const applyVariant = (v) => {
    setAccent(v.accent);
    setPreview((p) => (p ? { ...p, image: v.image } : p));
  };

  const loadTests = () => {
    fetch(`/api/thumbs/abresults?slug=${encodeURIComponent(slug)}`).then((r) => r.json()).then((d) => setTests(d.tests || [])).catch(() => setTests([]));
    fetch(`/api/thumbs/performance?slug=${encodeURIComponent(slug)}`).then((r) => r.json()).then((d) => setPerf(d.videos || [])).catch(() => setPerf([]));
  };

  useEffect(() => { if (slug) loadTests(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const addVariant = () => {
    if (!preview) { setAbMsg({ ok: false, text: 'render a design first (type a headline)' }); return; }
    setAbVariants((v) => [...v, preview.image].slice(0, 3));
    setAbMsg({ ok: true, text: `variant ${Math.min(abVariants.length + 1, 3)} added` });
  };

  const startTest = async () => {
    if (!video) { setAbMsg({ ok: false, text: 'pick a video first' }); return; }
    if (abVariants.length < 2) { setAbMsg({ ok: false, text: 'add at least 2 variants' }); return; }
    setAbBusy('start');
    try {
      const r = await fetch('/api/thumbs/abstart', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, videoId: video.videoId, title: video.title, intervalHours: abInterval, variants: abVariants }),
      });
      const d = await r.json();
      setAbMsg(d.ok
        ? { ok: true, text: `Test live — variant A attached, swapping every ${abInterval}h. Results appear below within a day.` }
        : { ok: false, text: d.error });
      if (d.ok) { setAbVariants([]); loadTests(); }
    } finally {
      setAbBusy('');
    }
  };

  const stopTest = async (vid) => {
    setAbBusy(vid);
    await fetch('/api/thumbs/abstop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: vid }) });
    loadTests();
    setAbBusy('');
  };

  const words = title.trim().split(/\s+/).filter(Boolean).length;
  const ck = preview?.checklist;

  useEffect(() => {
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.channels || []).map((c) => ({ slug: c.slug, label: c.label, accent: c.accent, tags: c.todayTopics ? undefined : undefined, brand: c.label }));
        setChannels(list);
        if (list.length) pickChannel(list[0]);
      })
      .catch(() => setChannels([]));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight flex items-center gap-2"><ImageIcon size={18} /> Thumbnails</h1>
          <p className="text-[12px] text-muted mt-0.5">Design from templates, preview at mobile size, attach straight to YouTube.</p>
        </div>
        <select value={slug} onChange={(e) => pickChannel(channels.find((c) => c.slug === e.target.value) || channels[0])} className="ml-auto text-[13px] px-3 py-2 rounded-lg border border-line bg-surface">
          {channels.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-5">
        {/* Left column: video pick + controls */}
        <div className="space-y-4">
          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><Paperclip size={12} /> 1 · Pick a video</div>
            {!videos ? (
              <div className="flex items-center gap-2 text-muted text-[12.5px] py-2"><Loader2 size={13} className="animate-spin" /> Loading videos…</div>
            ) : (
              <>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => { setSelMode(!selMode); setSelected([]); }}
                  className={`text-[11.5px] px-2 py-1 rounded-lg border flex items-center gap-1.5 ${selMode ? 'border-accent text-ink' : 'border-line text-muted hover:border-line-strong'}`}>
                  <Layers size={11} /> {selMode ? 'Selecting for bulk redesign' : 'Bulk redesign'}
                </button>
                {selMode ? <span className="text-[11px] text-muted">{selected.length} selected · uses the template + colors set below</span> : null}
                {selMode && selected.length ? (
                  <button onClick={runBulk} disabled={bulkBusy} className="ml-auto text-[11.5px] font-semibold px-2.5 py-1 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50 flex items-center gap-1.5">
                    {bulkBusy ? <Loader2 size={11} className="animate-spin" /> : <Layers size={11} />} Redesign {selected.length}
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(videos || []).map((v) => (
                  selMode ? (
                    <button key={v.videoId}
                      onClick={() => setSelected((s) => (s.includes(v.videoId) ? s.filter((x) => x !== v.videoId) : [...s, v.videoId]))}
                      className={`relative text-left rounded-lg overflow-hidden border ${selected.includes(v.videoId) ? 'border-accent ring-1' : 'border-line hover:border-line-strong'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.thumb} alt="" className="w-full aspect-video object-cover opacity-70" />
                      {selected.includes(v.videoId) ? <span className="absolute top-1 right-1"><CheckCircle2 size={14} style={{ color: 'var(--accent)' }} /></span> : null}
                      <div className="p-1.5 text-[10.5px] text-muted leading-tight line-clamp-2">{v.title}</div>
                    </button>
                  ) : (
                    <button key={v.videoId} onClick={() => pickVideo(v)}
                      className={`text-left rounded-lg overflow-hidden border transition-colors ${video?.videoId === v.videoId ? 'border-accent' : 'border-line hover:border-line-strong'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.thumb} alt="" className="w-full aspect-video object-cover" />
                      <div className="p-1.5 text-[10.5px] text-muted leading-tight line-clamp-2">{v.title}</div>
                    </button>
                  )
                ))}
              </div>
              {bulkMsg ? <p className="text-[11.5px] mt-2" style={{ color: bulkMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{bulkMsg.text}</p> : null}
              </>
            )}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-muted flex items-center gap-1.5"><Wand2 size={12} /> 2 · Design</div>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {CATS.map((c) => (
                <button key={c.id} onClick={() => setCatTab(c.id)}
                  className={`text-[11.5px] px-2.5 py-1 rounded-full border ${catTab === c.id ? 'border-accent text-ink' : 'border-line text-muted hover:border-line-strong'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[240px] overflow-y-auto pr-1">
              {tpls.filter((t) => catTab === 'all' || t.category === catTab).map((t) => (
                <button key={t.id} onClick={() => pickTemplate(t)}
                  className={`relative text-left p-2.5 rounded-lg border ${template === t.id ? 'border-accent bg-bg-soft' : 'border-line hover:border-line-strong'}`}>
                  <span
                    onClick={(e) => { e.stopPropagation(); addToRotation(t.id); }}
                    title="add to this channel's thumbnail rotation"
                    className="absolute top-1.5 left-1.5 z-10 text-[9px] px-1.5 py-0.5 rounded-full border border-line text-muted hover:text-ink hover:border-line-strong cursor-pointer">
                    + rotation
                  </span>
                  {t.aiPreset ? <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full border border-line text-muted">AI</span> : null}
                  <div className="text-[12px] font-semibold pr-7">{t.label}</div>
                  <div className="text-[10px] text-muted leading-snug mt-0.5 line-clamp-2">{t.desc}</div>
                </button>
              ))}
            </div>
            {rotation.length ? (
              <div className="mb-2.5 border border-line rounded-lg p-2">
                <div className="text-[10.5px] text-muted mb-1.5">Template rotation — bulk redesign cycles these per video ({rotation.length} queued, click × to remove):</div>
                <div className="flex flex-wrap gap-1.5">
                  {rotation.map((id) => (
                    <span key={id} className="text-[10.5px] px-2 py-0.5 rounded-full bg-bg-soft border border-line flex items-center gap-1">
                      {(tpls.find((t) => t.id === id) || {}).label || id}
                      <button onClick={() => removeFromRotation(id)} className="text-muted hover:text-ink font-bold">×</button>
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-muted mt-1">Bulk redesign applies them in this order, looping. Video 1 → first, video 2 → second, …</div>
              </div>
            ) : null}
            <label className="block">
              <span className="text-[11px] text-muted">Headline (≤4 words clicks best)</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Silent Wealth Trap"
                className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-muted">Accent word (highlighted)</span>
                <input value={accentWord} onChange={(e) => setAccentWord(e.target.value)} placeholder="auto-picked if empty"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Category chip</span>
                <input value={chip} onChange={(e) => setChip(e.target.value)} placeholder="e.g. MARKETS"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Eyebrow (small top text)</span>
                <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} placeholder="optional"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted">Accent color</span>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                  className="mt-1 w-full h-[38px] rounded-lg border border-line bg-bg-soft" />
              </label>
            </div>
            <div>
              <span className="text-[11px] text-muted flex items-center gap-1.5 mb-1"><Search size={11} /> 3 · Photo — search Pexels or upload</span>
              <div className="flex gap-2">
                <input value={photoQuery} onChange={(e) => setPhotoQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchPhotos()}
                  placeholder="e.g. old money, wall street, marble statue"
                  className="flex-1 text-[13px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
                <button onClick={searchPhotos} disabled={photoBusy} className="text-[12.5px] font-medium px-3 py-2 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50 flex items-center gap-1.5">
                  {photoBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Search
                </button>
                <button onClick={() => fileRef.current?.click()} className="text-[12.5px] px-3 py-2 rounded-lg border border-line hover:bg-surface-2 flex items-center gap-1.5" title="Upload your own photo">
                  <Upload size={13} />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
              </div>
              {photos?.length ? (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {photos.map((p, i) => (
                    <button key={i} onClick={() => { setPhotoUrl(p.url); setPhotoDataUrl(''); }}
                      className={`rounded-lg overflow-hidden border ${photoUrl === p.url ? 'border-accent' : 'border-line hover:border-line-strong'}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt={p.alt} className="w-full aspect-video object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              {photoDataUrl ? <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: 'var(--ok)' }}><CheckCircle2 size={11} /> uploaded photo in use</p> : null}
              <div className="mt-3 border-t border-line pt-2.5">
                <span className="text-[11px] text-muted flex items-center gap-1.5 mb-1.5"><Sparkles size={11} /> Or generate an AI background (no text — the template adds it)</span>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {['cinematic', 'luxury', 'statue', 'illustration'].map((s) => (
                    <button key={s} onClick={() => setAiStyle(s)}
                      className={`text-[11px] px-2 py-1 rounded-full border ${aiStyle === s ? 'border-accent text-ink' : 'border-line text-muted hover:border-line-strong'}`}>
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="describe the scene… e.g. marble statue in fog"
                    className="flex-1 text-[12.5px] px-3 py-2 rounded-lg border border-line bg-bg-soft" />
                  <button onClick={generateBg} disabled={aiBusy || !aiPrompt.trim()}
                    className="text-[12.5px] font-medium px-3 py-2 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50 flex items-center gap-1.5">
                    {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate (~15s)
                  </button>
                </div>
                {aiMsg ? <p className="text-[11px] mt-1" style={{ color: aiMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{aiMsg.text}</p> : null}
              </div>
            </div>

          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><Palette size={12} /> Brand defaults for this channel</div>
            <p className="text-[11px] text-muted mb-2.5">Saves the current template + colors + chip as this channel&apos;s defaults — the editor opens with them every time.</p>
            <button onClick={saveBranding} className="text-[12.5px] font-medium px-3 py-2 rounded-lg border border-line hover:bg-surface-2 flex items-center gap-1.5">
              <Palette size={13} /> Save current look as default
            </button>
            {brandMsg ? <p className="text-[11.5px] mt-2" style={{ color: brandMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{brandMsg.text}</p> : null}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><Palette size={12} /> Your face library — appears on every thumbnail</div>
            <p className="text-[11px] text-muted mb-2.5">Upload your face once; every thumbnail this channel renders adds it as a crisp circle cutout. Upload several and they rotate — one per video. Bulk redesign rotates them too.</p>
            <div className="flex items-center gap-2">
              <input
                ref={faceInputRef}
                type="file" accept="image/jpeg,image/png" className="hidden"
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) uploadFace(f); e.target.value = ''; }}
              />
              <button onClick={() => faceInputRef.current && faceInputRef.current.click()} disabled={faceBusy || !slug}
                className="text-[12.5px] font-medium px-3 py-2 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50 flex items-center gap-1.5">
                {faceBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload face image
              </button>
              {faces && faces.length ? <span className="text-[11px] text-muted">{faces.length} in the library{faces.length > 1 ? ' — rotating' : ''}</span> : null}
            </div>
            {faces && faces.length ? (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {faces.map((f, i) => (
                  <span key={f.file} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.dataUrl} alt={'face ' + (i + 1)} className="w-14 h-14 rounded-full object-cover border-2 border-line" />
                    <button onClick={() => removeFace(i)} title="remove"
                      className="absolute -top-1 -right-1 w-5 h-5 leading-none text-[11px] rounded-full bg-surface border border-line text-muted hover:text-ink">×</button>
                  </span>
                ))}
              </div>
            ) : null}
            {faceMsg ? <p className="text-[11.5px] mt-2" style={{ color: faceMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{faceMsg.text}</p> : null}
          </div>
          </div>
        </div>

        {/* Right column: preview + checklist + attach */}
        <div className="space-y-4 lg:sticky lg:top-[76px] self-start">
          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2">4 · Preview {previewing ? '· rendering…' : ''}</div>
            {previewErr ? (
              <p className="text-[12px]" style={{ color: 'var(--bad)' }}>{previewErr}</p>
            ) : previewHint && !preview ? (
              <p className="text-[12px] py-4 text-center" style={{ color: 'var(--muted)' }}>{previewHint}</p>
            ) : preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.image} alt="thumbnail preview" className="w-full rounded-lg border border-line" />
                <div className="mt-3 flex items-end gap-4">
                  <button onClick={generateMore} disabled={moreBusy || !title.trim()}
                    className="w-full mb-3 text-[12px] font-medium px-3 py-2 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    {moreBusy ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />} Give me 3 more
                  </button>
                  {moreVariants.length ? (
                    <div className="flex gap-2 mb-3">
                      {moreVariants.map((v, i) => (
                        <button key={i} onClick={() => applyVariant(v)} title={`use accent ${v.accent}`}
                          className={`rounded-lg overflow-hidden border ${accent === v.accent ? 'border-accent' : 'border-line hover:border-line-strong'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={v.image} alt={`variant ${i + 1}`} className="w-[88px]" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide text-faint mb-1 flex items-center gap-1"><Mobile size={11} /> Mobile size</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview.image} alt="mobile preview" className="w-[168px] rounded border border-line" />
                  </div>
                  <div className="text-[11.5px] space-y-1.5">
                    <div className="flex items-center gap-1.5" style={{ color: ck?.wordsOk ? 'var(--ok)' : 'var(--warn)' }}>
                      {ck?.wordsOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {words} word{words === 1 ? '' : 's'} (≤7 recommended)
                    </div>
                    <div className="flex items-center gap-1.5" style={{ color: ck?.photoOk ? 'var(--ok)' : 'var(--warn)' }}>
                      {ck?.photoOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {template === 'poster' ? 'panel layout' : 'photo set'}
                    </div>
                    <div className="flex items-center gap-1.5" style={{ color: ck?.sizeOk ? 'var(--ok)' : 'var(--bad)' }}>
                      {ck?.sizeOk ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {(preview.bytes / 1024).toFixed(0)} KB (limit 2 MB)
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-muted py-6 text-center">Pick a video and type a headline — the preview renders here.</p>
            )}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2">5 · Attach to YouTube</div>
            <p className="text-[12px] text-muted leading-snug">
              {video ? <>Target: <span className="text-ink font-medium">{video.title.slice(0, 48)}{video.title.length > 48 ? '…' : ''}</span> ({fmtDay(video.publishedAt)})</> : 'Pick a video in step 1 first.'}
            </p>
            <button onClick={attach} disabled={!preview || !video || attaching}
              className="mt-3 w-full text-[13px] font-semibold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              {attaching ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} Attach thumbnail
            </button>
            <p className="text-[10.5px] text-faint mt-2">Goes live on YouTube within minutes · max 10 attaches per channel per day.</p>
            {attachMsg ? (
              <p className="text-[12px] mt-2 flex items-start gap-1.5" style={{ color: attachMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>
                {attachMsg.ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <XCircle size={13} className="shrink-0 mt-0.5" />} {attachMsg.text}
              </p>
            ) : null}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><FlaskConical size={12} /> A/B test (auto-swap)</div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={addVariant} disabled={!preview} className="text-[12px] px-2.5 py-1.5 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-40">
                + Add current design ({abVariants.length}/3)
              </button>
              <select value={abInterval} onChange={(e) => setAbInterval(Number(e.target.value))} className="text-[12px] px-2 py-1.5 rounded-lg border border-line bg-bg-soft">
                <option value={24}>swap every 24h</option>
                <option value={48}>swap every 48h</option>
              </select>
              <button onClick={startTest} disabled={abBusy === 'start' || abVariants.length < 2 || !video} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-line hover:bg-surface-2 disabled:opacity-40 flex items-center gap-1.5">
                {abBusy === 'start' ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />} Start test
              </button>
            </div>
            {abVariants.length ? (
              <div className="flex gap-1.5 mt-2">
                {abVariants.map((v, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={v} alt={`variant ${i}`} className="w-16 rounded border border-line" />
                ))}
                <button onClick={() => setAbVariants([])} className="text-[11px] text-muted hover:text-ink self-center">clear</button>
              </div>
            ) : null}
            {abMsg ? <p className="text-[11.5px] mt-2" style={{ color: abMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{abMsg.text}</p> : null}
            {tests?.length ? (
              <div className="mt-3 space-y-2">
                {tests.map((t) => (
                  <div key={t.videoId} className="inset-tile p-2.5">
                    <div className="flex items-center gap-2 text-[12px]">
                      <Trophy size={12} style={{ color: 'var(--accent)' }} />
                      <span className="truncate font-medium text-ink">{t.title || t.videoId}</span>
                      <span className="ml-auto text-[10.5px] text-faint">{t.ended ? 'ended' : `live · ${t.intervalHours}h`}</span>
                    </div>
                    <div className="grid gap-1 mt-1.5" style={{ gridTemplateColumns: `repeat(${t.variantMetrics.length || 1}, 1fr)` }}>
                      {t.variantMetrics.map((v) => (
                        <div key={v.variant} className={`text-[11px] p-1.5 rounded border ${v.variant === t.current ? 'border-accent' : 'border-line'}`}>
                          <div className="font-semibold">{v.variant} {v.variant === t.current ? '· live' : ''}</div>
                          <div className="text-muted">{v.viewsPerDay} views/day</div>
                          {v.avgPct != null ? <div className="text-faint">{v.avgPct}% watch</div> : null}
                        </div>
                      ))}
                    </div>
                    {!t.ended ? (
                      <button onClick={() => stopTest(t.videoId)} disabled={abBusy === t.videoId} className="text-[11px] text-muted hover:text-ink mt-1.5">
                        stop test (keep current)
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-faint mt-2">No tests yet — add 2+ designs above and start. Views/day per variant appears within a day.</p>
            )}
          </div>

          <div className="border border-line rounded-xl bg-surface p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5"><BarChart3 size={12} /> Performance · last 28 days</div>
            {!perf ? (
              <div className="flex items-center gap-2 text-muted text-[12px]"><Loader2 size={12} className="animate-spin" /> Loading…</div>
            ) : (
              <div className="space-y-1.5">
                {perf.map((v) => (
                  <div key={v.videoId} className="flex items-center gap-2 text-[11.5px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.thumb} alt="" className="w-12 rounded border border-line" />
                    <span className="truncate flex-1 text-muted">{v.title}</span>
                    <span className="font-medium text-ink shrink-0">{v.viewsPerDay}/day</span>
                    {v.avgPct != null ? <span className="text-faint shrink-0">{v.avgPct}%</span> : null}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10.5px] text-faint mt-2">{perf ? 'Ranked by views per day · real CTR unlocks when the channel joins YPP.' : ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
