// Template registry metadata — schema v1 (validated by template-registry.js).
// Keyed by catalog family id (studio/lib/templates-catalog.js `family` field).
//
// Seed notes (issue #102 Task 10):
// - niches are VERBATIM channel-registry strings (validateAssignment does exact
//   matching — never paraphrase):
//     'History stories'                          — studio/lib/niches.js:57 (wizard niche catalog)
//     'Investing psychology & market wisdom'     — studio/lib/brands.json:51 (investors-compass)
//     'Personal finance rules & money habits'    — studio/lib/brands.json:99 (money-rulebook)
//     'Old money habits & quiet wealth'          — studio/lib/brands.json:147 (debt-free-doctrine)
// - formats are derived from each family's catalog aspectRatios
//   (16:9 -> long, 9:16 -> short) — never declared beyond what the family ships.
// - renderer is 'remotion' for all six: every catalog family is a Remotion
//   template family shipping in-repo at explainer/remotion/families/.
// - required_capabilities never include 'image-gen': the Phase 1 key vault has
//   no generator provider (pixabay/pexels are stock search keys), so declaring
//   it would 422 every assignment. Photo-using families draw from the
//   stock/assets lane, not generation.

export const REGISTRY_META = {
  // ---- history lane ----
  'documentary-frames': {
    version: '1.0.0',
    niches: ['History stories'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — no two videos cover the same subject or arc',
      'no repeated hook across the channel\'s last 5 videos',
      'rotate opening variants (documentary-open / chapter-card / reconstruction-card) so consecutive videos do not open with the same frame style',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'timeline-history': {
    version: '1.0.0',
    niches: ['History stories'],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video\'s timeline spine covers a different era or conflict',
      'no repeated hook across the channel\'s last 5 videos',
      'no repeated timeline span: the start/end years and milestone events differ from every prior video on the channel',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'photo-stories': {
    version: '1.0.0',
    niches: ['History stories'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video portraits a different subject from stock/archival photo sets (no image generation)',
      'no repeated hook across the channel\'s last 5 videos',
      'no reused photo set: each video draws a different subject, year, and caption context',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },

  // ---- finance lane (YMYL: every seed requires sources + finance review) ----
  'finance-explainers': {
    version: '1.0.0',
    niches: [
      'Investing psychology & market wisdom',
      'Personal finance rules & money habits',
      'Old money habits & quiet wealth',
    ],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video models a different economic concept (compound growth, debt paydown, market cycle, unit economics — no repeats)',
      'no repeated hook across the channel\'s last 5 videos',
      'each video\'s numbers come from cited sources; no recycled figures from prior videos',
    ],
    safety: { required_sources: true, review_required: ['finance'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'stats-counters': {
    version: '1.0.0',
    niches: [
      'Investing psychology & market wisdom',
      'Personal finance rules & money habits',
      'Old money habits & quiet wealth',
    ],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video ticks toward a different target metric (revenue milestone, net worth reveal, historical figure)',
      'no repeated hook across the channel\'s last 5 videos',
      'the headline stat differs from every stat shown in the channel\'s last 10 videos',
    ],
    safety: { required_sources: true, review_required: ['finance'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'chart-animations': {
    version: '1.0.0',
    niches: [
      'Investing psychology & market wisdom',
      'Personal finance rules & money habits',
      'Old money habits & quiet wealth',
    ],
    formats: ['long'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video charts a different dataset and time range (market trend, GDP comparison, valuation history)',
      'no repeated hook across the channel\'s last 5 videos',
      'no repeated chart series: axes, labels, and data range differ from prior videos',
    ],
    safety: { required_sources: true, review_required: ['finance'] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-26', note: 'initial registry entry' }],
  },
  'editorial-headlines': {
    version: '1.0.0',
    niches: ['History stories'],
    formats: ['long', 'short'],
    renderer: 'remotion',
    required_capabilities: ['script-gen', 'tts', 'captions'],
    variation_rules: [
      'distinct storyline/focus per video — each video investigates a different event, era, or document set (no repeats)',
      'no repeated hook across the channel\'s last 5 videos',
    ],
    safety: { required_sources: true, review_required: [] },
    deprecated: false,
    changelog: [{ version: '1.0.0', date: '2026-10-27', note: 'registry entry #7 — exit-gate proof: data-only addition' }],
  },
};
