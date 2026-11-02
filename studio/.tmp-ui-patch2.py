import io

def patch(path, old, new, count=1):
    s = io.open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == count, f'{path}: expected {count}, got {n} of {old[:70]!r}'
    io.open(path, 'w', encoding='utf-8', newline='').write(s.replace(old, new, count))
    print('OK', path)

P = 'app/thumbs/page.js'

# 4. saveBranding: include rotation
patch(P,
  "      body: JSON.stringify({ slug, accent, shade, chip, eyebrow, template }),",
  "      body: JSON.stringify({ slug, accent, shade, chip, eyebrow, template, templateRotation: rotation }),")

# 5. gallery card: rotation add chip (before AI badge span)
patch(P,
  "                  {t.aiPreset ? <span className=\"absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full border border-line text-muted\">AI</span> : null}",
  """                  <span
                    onClick={(e) => { e.stopPropagation(); addToRotation(t.id); }}
                    title="add to this channel's thumbnail rotation"
                    className="absolute top-1.5 left-1.5 z-10 text-[9px] px-1.5 py-0.5 rounded-full border border-line text-muted hover:text-ink hover:border-line-strong cursor-pointer">
                    + rotation
                  </span>
                  {t.aiPreset ? <span className=\"absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full border border-line text-muted\">AI</span> : null}""")

# 6. rotation panel inside the Design card (after template grid, before Headline label)
patch(P,
  """            <label className="block">
              <span className="text-[11px] text-muted">Headline (≤4 words clicks best)</span>""",
  """            {rotation.length ? (
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
              <span className="text-[11px] text-muted">Headline (≤4 words clicks best)</span>""")

# 7. face library card after the Brand defaults card
patch(P,
  """            {brandMsg ? <p className="text-[11.5px] mt-2" style={{ color: brandMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{brandMsg.text}</p> : null}
          </div>""",
  """            {brandMsg ? <p className="text-[11.5px] mt-2" style={{ color: brandMsg.ok ? 'var(--ok)' : 'var(--bad)' }}>{brandMsg.text}</p> : null}
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
          </div>""")

# 8. faceInputRef declaration (near fileRef)
patch(P,
  "  const fileRef = useRef(null);",
  "  const fileRef = useRef(null);\n  const faceInputRef = useRef(null);")

print('UI-PATCH2-DONE')
