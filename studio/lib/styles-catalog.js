// Video style catalog — every style the engine can render, with REAL preview
// frames pulled from actual outputs (reels, episodes, demos). Shared by the
// Styles gallery and the Add Channel wizard's style picker.
// status: 'live' = runs in daily production · 'demo' = renders proven, not in daily rotation yet.

export const STYLE_CATALOG = [
  {
    id: 'cinematic',
    name: 'Cinematic Stock Shorts',
    status: 'live',
    preview: '/styles/cinematic.jpg',
    formats: ['Short 9:16'],
    usedBy: 'All 4 daily channels · FB/IG reels',
    desc: 'Real 4K stock footage, giant numbered type, word-by-word karaoke captions with yellow highlight, grade + grain. The daily shorts engine.',
  },
  {
    id: 'photoposter',
    name: 'Photo-Poster',
    status: 'live',
    preview: '/styles/photoposter.jpg',
    formats: ['Thumbnail 16:9', 'Long-form cover', 'Shorts'],
    usedBy: 'Every long-form upload + 34 backfilled thumbnails',
    desc: 'Navy/gold editorial poster with a real photo and huge condensed type. The thumbnail style you picked from the design lab.',
  },
  {
    id: 'doc',
    name: 'Market Documentary',
    status: 'live',
    preview: '/styles/doc.jpg',
    formats: ['Long 16:9 · 10+ min'],
    usedBy: 'IC · MR · DFD · QQ daily episodes',
    desc: 'Dark documentary frame, chaptered storytelling, photo panels, sentence-synced captions, looping score. The 10-minute episode engine.',
  },
  {
    id: 'tech',
    name: 'Dark Mode Minimalist Tech',
    status: 'live',
    preview: '/styles/tech.jpg',
    formats: ['Explainer 16:9'],
    usedBy: 'Tech channel (cloud render path)',
    desc: 'Near-black frames, numbered points, one narration sentence per visual event, yellow karaoke captions. Sentence-choreographed dev explainers.',
  },
  {
    id: 'paper',
    name: 'Paper Editorial Explainer',
    status: 'demo',
    preview: '/styles/paper.jpg',
    formats: ['Explainer 16:9'],
    usedBy: 'Cloud demos (v7 reference render)',
    desc: 'Newspaper serif headlines on cream paper, yellow-highlight karaoke captions, raised photos. Your accepted reference format — next to scale up.',
  },
  {
    id: 'posters',
    name: 'Social Poster Cards',
    status: 'live',
    preview: '/styles/posters.jpg',
    formats: ['Still post'],
    usedBy: 'Facebook + Instagram daily posters',
    desc: 'Branded quote/rule cards with channel accents. Not video — the daily FB/IG image posts.',
  },
];

export const STYLE_BY_ID = Object.fromEntries(STYLE_CATALOG.map((s) => [s.id, s]));
