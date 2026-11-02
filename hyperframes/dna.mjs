// Component kit for codeberry: brain MUST paste this <style> verbatim and build scenes only with these classes.
export const CODEBERRY_KIT = `
:root{--card:#0d0d10;--line:rgba(255,255,255,.14);--violet:#a78bfa;--e1:#4ade80;--e2:#059669;--g1:#fbbf24;--g2:#d97706;--p1:#ec4899;--p2:#be185d;--red:#ef4444;}
#root{background:radial-gradient(1200px 520px at 50% -12%,rgba(167,139,250,.10),transparent 60%),#050505;}
#root::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:90px 90px;pointer-events:none;}
.hf-kicker{position:absolute;top:54px;left:50%;transform:translateX(-50%);font:500 15px 'JetBrains Mono',monospace;letter-spacing:.35em;color:rgba(255,255,255,.58);text-transform:uppercase;display:flex;gap:14px;align-items:center;}
.hf-kicker::before{content:'';width:10px;height:10px;border-radius:50%;background:var(--violet);box-shadow:0 0 14px var(--violet);}
.hf-head{position:absolute;top:118px;left:50%;transform:translateX(-50%);width:84%;text-align:center;font:700 56px/1.22 'Poppins',sans-serif;color:#fff;}
.hf-head .em{color:var(--violet);text-shadow:0 0 30px rgba(167,139,250,.45);}
.hf-stage{position:absolute;top:392px;bottom:104px;left:50%;transform:translateX(-50%);width:88%;display:flex;align-items:center;justify-content:center;}
.hf-window{background:var(--card);border:1.5px solid var(--line);border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.65);overflow:hidden;}
.hf-bar{display:flex;align-items:center;gap:9px;padding:15px 22px;border-bottom:1px solid var(--line);font:500 16px 'JetBrains Mono',monospace;color:rgba(255,255,255,.65);}
.hf-bar i{width:11px;height:11px;border-radius:50%;background:#ef4444;display:inline-block;}
.hf-bar i:nth-child(1){background:#fbbf24}.hf-bar i:nth-child(2){background:#34d399}
.hf-body{padding:26px 32px;display:flex;gap:22px;align-items:center;justify-content:center;}
.hf-pill{display:inline-flex;align-items:center;gap:14px;height:60px;padding:0 26px;border-radius:16px;font:700 26px 'Poppins',sans-serif;color:#050505;white-space:nowrap;}
.hf-pill .ic{width:38px;height:38px;border-radius:10px;background:rgba(0,0,0,.30);display:inline-flex;align-items:center;justify-content:center;flex:none;}
.hf-pill .ic svg{width:24px;height:24px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-pill.emerald{background:linear-gradient(135deg,var(--e1),var(--e2));box-shadow:0 0 46px rgba(52,211,153,.45);}
.hf-pill.gold{background:linear-gradient(135deg,var(--g1),var(--g2));box-shadow:0 0 46px rgba(251,191,36,.45);}
.hf-pill.pink{background:linear-gradient(135deg,var(--p1),var(--p2));box-shadow:0 0 46px rgba(236,72,153,.4);}
.hf-tile{width:122px;border-radius:18px;background:#101014;border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:18px 10px;font:500 14px 'JetBrains Mono',monospace;color:rgba(255,255,255,.78);letter-spacing:.14em;text-transform:uppercase;}
.hf-tile svg{width:46px;height:46px;stroke:#fff;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
.hf-tile.g svg{stroke:var(--g1);filter:drop-shadow(0 0 8px rgba(251,191,36,.6));}
.hf-tile.e svg{stroke:var(--e1);filter:drop-shadow(0 0 8px rgba(52,211,153,.6));}
.hf-tile.v svg{stroke:var(--violet);filter:drop-shadow(0 0 8px rgba(167,139,250,.6));}
.hf-conn{height:4px;flex:1;min-width:90px;background:repeating-linear-gradient(90deg,var(--g1) 0 14px,transparent 14px 26px);border-radius:2px;position:relative;box-shadow:0 0 16px rgba(251,191,36,.5);}
.hf-conn.e{background:repeating-linear-gradient(90deg,var(--e1) 0 14px,transparent 14px 26px);box-shadow:0 0 16px rgba(52,211,153,.5);}
.hf-conn::before,.hf-conn::after{content:'';position:absolute;top:50%;width:11px;height:11px;border-radius:50%;background:var(--g1);transform:translateY(-50%);box-shadow:0 0 12px var(--g1);}
.hf-conn.e::before,.hf-conn.e::after{background:var(--e1);box-shadow:0 0 12px var(--e1);}
.hf-conn::before{left:-2px}.hf-conn::after{right:-2px}
.hf-search{width:100%;height:72px;border-radius:18px;background:linear-gradient(135deg,var(--p1),var(--p2));display:flex;align-items:center;gap:18px;padding:0 28px;box-shadow:0 0 44px rgba(236,72,153,.4);font:700 27px 'JetBrains Mono',monospace;color:#1a0510;}
.hf-search svg{width:30px;height:30px;stroke:#1a0510;fill:none;stroke-width:3;stroke-linecap:round;}
.hf-rbar{height:38px;border-radius:10px;background:linear-gradient(135deg,var(--e1),var(--e2));box-shadow:0 0 24px rgba(52,211,153,.35);}
.hf-label{font:500 17px 'JetBrains Mono',monospace;letter-spacing:.3em;color:rgba(255,255,255,.58);text-transform:uppercase;}
.hf-code{font:500 25px/1.7 'JetBrains Mono',monospace;color:rgba(255,255,255,.85);}
.hf-code .k{color:var(--g1)}.hf-code .s{color:var(--e1)}.hf-code .u{color:var(--violet)}
.hf-row{display:flex;align-items:center;gap:20px;justify-content:center;}
.hf-col{display:flex;flex-direction:column;align-items:center;gap:18px;}
.hf-num{font:800 84px 'Poppins',sans-serif;color:var(--g1);text-shadow:0 0 34px rgba(251,191,36,.5);}`;

const CODEBERRY_ICONS = `READY ICONS (copy the inner markup, do not invent new paths):
globe: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.6 4 5.6 4 9s-1.2 6.4-4 9c-2.8-2.6-4-5.6-4-9s1.2-6.4 4-9z"/></svg>
lock: <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
server: <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 8h.01M8 17h.01"/></svg>
link: <svg viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19"/></svg>
search: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
id-card: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 9h4M14 13h4M6 16c.8-1.2 4.2-1.2 5 0"/></svg>
book: <svg viewBox="0 0 24 24"><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13"/></svg>
phone: <svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>
code: <svg viewBox="0 0 24 24"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/></svg>
tag: <svg viewBox="0 0 24 24"><path d="M3 11V4a1 1 0 0 1 1-1h7l10 10-8 8L3 11z"/><circle cx="8" cy="8" r="1.6"/></svg>`;


// Each DNA: fonts (Google Fonts), palette (WCAG-checked against its own bg), motion feel, texture recipe.
// accentWords = how many emphasis words per beat the design may color.

export const DNAS = {
  luxury: {
    label: 'Old Money Luxury',
    fonts: "family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Inter:wght@400;500;600",
    fontStack: "'Cormorant Garamond', Georgia, serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#0d0c0a', bgGlow: 'rgba(217,193,137,0.08)', text: '#f2ead9', accent: '#d9c189', subtle: 'rgba(242,234,217,0.55)' },
    motion: { ease: 'power3.out', wordStagger: 0.07, riseY: 46, wordDur: 0.62 },
    texture: 'thin hairline frame inset 70px (1px, rgba(242,234,217,0.14)), radial gold glows, soft vignette, static film grain (feTurbulence, opacity 0.05)',
    kickerStyle: 'uppercase letterspaced 0.42em small Inter label + 1px gradient rule under it',
    accentWords: 1,
    beatCss: 'font-size 104px serif, line-height 1.2, accent word italic',
    rules: 'Slow, quiet, expensive. Vast empty space above and below the beat text (text block sits at ~45% height). Never rush a reveal.',
  },
  'neon-tech': {
    label: 'Neon Tech',
    fonts: "family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;700",
    fontStack: "'Space Grotesk', 'Inter', sans-serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#05070d', bgGlow: 'rgba(76,201,240,0.10)', text: '#e8f0ff', accent: '#4cc9f0', subtle: 'rgba(232,240,255,0.6)' },
    motion: { ease: 'back.out(1.6)', wordStagger: 0.05, riseY: 30, wordDur: 0.45 },
    texture: 'subtle 1px grid lines (rgba(76,201,240,0.07), 80px cells), one horizontal scanline glow drifting, corner bracket marks',
    kickerStyle: 'monospace-feel Inter 500 uppercase 0.3em letterspace with leading index number like [01]',
    accentWords: 2,
    beatCss: 'font-size 96px weight 700, tight line-height 1.15, accent words in accent color with soft cyan text-shadow (never solid glow blocks)',
    rules: 'Fast, precise, electric. Snappy entrances with slight overshoot. Diagram-like decorations allowed (thin lines, brackets, node dots). No blur-heavy blooms.',
  },
  codeberry: {
    label: 'Code Berry Dev Explainer',
    fonts: "family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700",
    fontStack: "'Poppins', 'Inter', sans-serif",
    uiStack: "'JetBrains Mono', monospace",
    palette: { bg: '#050505', bgGlow: 'rgba(167,139,250,0.09)', text: '#ffffff', accent: '#a78bfa', subtle: 'rgba(255,255,255,0.62)' },
    motion: { ease: 'back.out(1.5)', wordStagger: 0.06, riseY: 36, wordDur: 0.5 },
    texture: 'pure black stage with radial violet top glow + faint 90px grid + tiny brand watermark top-right (all provided by the KIT css). Scene graphics come ONLY from the REQUIRED KIT classes below.',
    kickerStyle: 'tiny uppercase JetBrains Mono label top-center, 0.35em letterspaced, 15px, rgba(255,255,255,0.55), with a single glowing 5px accent dot before the text',
    accentWords: 2,
    beatCss: 'font-size 58px weight 700 Poppins, line-height 1.22, max-width 82% centered, TOP HEADLINE ZONE only (y 10%-34%), accent words in #a78bfa with soft violet text-shadow (never solid glow blocks)',
    rules: `TWO-ZONE LAYOUT (law): beat text lives ONLY in .hf-head (top zone); graphics live ONLY in .hf-stage (below) — the KIT css already fixes both zones, so overlap is impossible if you follow the skeleton. Each beat = ONE big scene composition filling the stage: a window mockup, a search-bar panel, a node chain (.hf-row of tiles + .hf-conn), or an ellipse/venn SVG with gradient pills inside. One idea per scene, HUGE and confident. Consecutive beats may extend the previous composition (one new piece enters with a back.out snap + glow flash) or cut to a fresh related mockup. Color language: emerald = the general/good thing, gold = the valuable/highlight thing, pink = search/query, red = error/empty. Icons: use the READY ICONS provided, never invent abstract shapes. End card: fade stages out, brand name Poppins 84px + violet dot. Never call play() — engine owns media.`,
    kit: CODEBERRY_KIT,
    icons: CODEBERRY_ICONS,
  },
  'vox-paper': {
    label: 'Vox Paper Editorial',
    fonts: "family=Archivo:wght@600;800&family=Inter:wght@400;500;700",
    fontStack: "'Archivo', 'Inter', sans-serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#f4efe6', bgGlow: 'rgba(217,79,48,0.05)', text: '#1a1611', accent: '#c2401f', subtle: 'rgba(26,22,17,0.62)' },
    motion: { ease: 'power2.out', wordStagger: 0.06, riseY: 38, wordDur: 0.5 },
    texture: 'warm paper tone, thin editorial column rule on the left, small stepped index cards behind beat text (2px solid border, offset shadow), static paper grain (feTurbulence opacity 0.04)',
    kickerStyle: 'small caps section label with thick 4px accent underline bar',
    accentWords: 1,
    beatCss: 'font-size 92px weight 800, line-height 1.14, accent word boxed with 3px accent underline',
    rules: 'Confident editorial magazine energy. Flat inks, hard offsets, generous margins. Light background — all text dark ink. Accent used sparingly like a highlighter.',
  },
  cinematic: {
    label: 'Cinematic Trailer',
    fonts: "family=Anton&family=Inter:wght@400;500;600",
    fontStack: "'Anton', 'Arial Black', sans-serif",
    uiStack: "'Inter', sans-serif",
    palette: { bg: '#0b1013', bgGlow: 'rgba(255,178,122,0.09)', text: '#f5f2ec', accent: '#ffb27a', subtle: 'rgba(245,242,236,0.5)' },
    motion: { ease: 'expo.out', wordStagger: 0.08, riseY: 60, wordDur: 0.7 },
    texture: 'teal-orange grade: deep teal base with warm top-left glow, heavy soft vignette, letterbox bars top+bottom (6% height, pure black), slow zoom drift on the whole stage (scale 1.0 -> 1.04 over full duration), static grain opacity 0.07',
    kickerStyle: 'centered uppercase 0.5em letterspaced tiny label between two 1px rules',
    accentWords: 1,
    beatCss: 'font-size 120px Anton uppercase, line-height 1.05, tight letter-spacing, centered block',
    rules: 'Movie-trailer gravity. Everything centered, huge, slow. Words land like title cards. Accent color only on the single most important word per beat.',
  },
};

export function dnaPrompt(name) {
  const d = DNAS[name];
  if (!d) throw new Error(`unknown dna: ${name} (have: ${Object.keys(DNAS).join(', ')})`);
  const base = [
    `STYLE DNA — ${d.label} (hard constraints, do not deviate):`,
    `- Google Fonts link: https://fonts.googleapis.com/css2?${d.fonts}&display=swap`,
    `- Palette: bg ${d.palette.bg}, main text ${d.palette.text}, accent ${d.palette.accent} (use on ${d.accentWords} emphasis word(s) per beat), secondary text ${d.palette.subtle}`,
    `- Texture: ${d.texture}`,
    `- Kicker/label treatment: ${d.kickerStyle}`,
    `- Beat text treatment: ${d.beatCss}`,
    `- Motion: entrance ease ${d.motion.ease}, word stagger ${d.motion.wordStagger}s, rise distance ${d.motion.riseY}px, word duration ${d.motion.wordDur}s`,
    `- Feel rules: ${d.rules}`,
  ];
  if (d.kit) {
    base.push(
      '',
      'REQUIRED STYLE KIT — include this exact <style> block in <head> VERBATIM. You may ONLY append extra rules after it, never modify it:',
      '<style>' + d.kit + '</style>',
      '',
      d.icons || '',
      '',
      'REQUIRED PAGE SKELETON (follow exactly):',
      '<div id="root" data-composition-id="main" ...>',
      '  <div class="hf-kicker">KICKER TEXT</div>  (always-on, no clip attributes)',
      '  per beat i:  <div id="beatN" class="clip hf-head" data-start=S data-duration=D data-track-index=T>EXACT beat text with <span class="em">accent word</span></div>',
      '  per beat i:  <div id="stageN" class="clip hf-stage" data-start=S data-duration=D_until_next_beat data-track-index=T> ONLY graphics from .hf-* classes </div>',
      '  voiceover + music <audio> clips, then the endcard clip',
      '</div>',
      'Stage graphics use ONLY the kit classes (.hf-window .hf-bar .hf-body .hf-pill .hf-tile .hf-conn .hf-search .hf-rbar .hf-label .hf-code .hf-row .hf-col .hf-num) + your appended rules. The accent-word span in each headline uses class="em".',
    );
  }
  return base.join('\n');
}

// ---------- Genre packs: STRUCTURE rules (DNA owns the look, genre owns the shape) ----------
export const GENRES = {
  documentary: {
    name: 'Documentary',
    prompt: 'STRUCTURE — documentary narrative: hook → escalating reveals → payoff. Beats flow as one story; tension rises to the last beat.',
  },
  listicle: {
    name: 'Listicle',
    prompt: 'STRUCTURE — ranked list: the design MUST show a big index number card (1, 2, 3…) synced to each beat\'s start, with the item text beside or below it. Number styling is a first-class design element.',
  },
  tutorial: {
    name: 'Tutorial',
    prompt: 'STRUCTURE — step-by-step teaching: each beat = one visible STEP (label "STEP 1", "STEP 2"… plus progress dots showing position in the total). Final beat shows the result/payoff.',
  },
  news: {
    name: 'News Recap',
    prompt: 'STRUCTURE — newsroom recap: first beat gets a date/BREAKING stamp treatment; each following beat is one headline card. Factual tone, present tense, tight layout.',
  },
  fun: {
    name: 'Fun / Social',
    prompt: 'STRUCTURE — fast entertainment: short punchy beats, comedic rhythm, exaggerated motion personality (snappier eases, bounce on landings). Captions carry the joke.',
  },
};

export function genrePrompt(name) {
  const g = GENRES[name];
  return g ? g.prompt : GENRES.documentary.prompt;
}
