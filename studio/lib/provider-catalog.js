// Provider catalog (#104, Phase 2 BYOK vault v2, Task 1) — the SINGLE SOURCE
// OF TRUTH for which providers cover which registry capability. Retires the
// two hand-mirrored CAPABILITY_PROVIDERS tables (E2E finding M31/M34 class):
//   - studio/app/api/templates/assign/route.js (assignment-save validator)
//   - lib/template-preflight.mjs (generation preflight)
// both now import capabilityProviders() below. The vault-adds ruling itself
// stays in the consumers (CAPABILITY_BASELINE[cap] === true || a configured
// vault key for a covering provider) — only the provider->capability data
// moved here.
//
// Data provenance: research/free-doc-script-apis-2026-10-28.md (free-tier
// numbers, re-verified 2026-10-28) + research/platform-byok-providers-2026-10-24.md
// §1 (multi-modal provider matrix). Each entry carries freeTier.fetched — the
// date its numbers were last verified — and licenseClass per the 10-24 file's
// free taxonomy so the platform never defaults a monetized channel onto an
// NC/unclear license (e.g. ElevenLabs free tier has NO commercial license).
//
// Engine knowledge, not brand data (no-static-maps directive): brand/channel
// specifics stay in kit/registry data.
import { CAPABILITY_BASELINE } from './template-registry.js';

export { CAPABILITY_BASELINE };

export const PROVIDERS = {
  // ---- script-gen (order = the retired tables' baseline order; gemini first
  // per research: biggest free output cap of any platform) ----
  gemini: {
    id: 'gemini',
    capabilities: ['script-gen'],
    envVars: ['GEMINI_API_KEY'],
    baseUrl: 'https://generativelanguage.googleapis.com',
    models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'],
    freeTier: { rpd: 250, maxOutputTokens: 65536, fetched: '2026-10-28' },
    licenseClass: 'free-with-caveats',
    notes: 'PRIMARY script-gen. Per-PROJECT quota (one key per Google project; one project per Gmail x15); RPD unpublished since Dec-2025 — 250 flash / 1,000 flash-lite is the last published (Dec-2025 archive), orientation only. Free tier trains on prompts (paid does not). gemini-3.5-flash retired from the catalog.',
  },
  groq: {
    id: 'groq',
    capabilities: ['script-gen'],
    envVars: ['GROQ_API_KEY'],
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['openai/gpt-oss-120b', 'gpt-oss-20b', 'qwen/qwen3.8-27b', 'whisper-large-v3'],
    freeTier: { rpd: 1000, maxOutputTokens: 65536, fetched: '2026-10-28' },
    licenseClass: 'free',
    notes: 'FALLBACK #1. Developer base: 30 RPM / 1,000 RPD / 8K TPM / 200K TPD (~60 doc scripts/day per key). gpt-oss-120b is a reasoning model — send max_tokens 16000 + reasoning_effort "low" or the reasoning budget truncates the JSON. whisper-large-v3 doubles as hosted transcription (2K RPD).',
  },
  cerebras: {
    id: 'cerebras',
    capabilities: ['script-gen'],
    envVars: ['CEREBRAS_API_KEY'],
    baseUrl: 'https://api.cerebras.ai/v1',
    models: ['gpt-oss-120b', 'qwen-3.8-27b'],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-28' },
    licenseClass: 'free-with-caveats',
    notes: 'OPPORTUNISTIC ONLY — free tier is now a Free Trial: $5 credits EXPIRE 30 days after grant; 5 RPM / 30K uncached TPM / 1M TPD while credits last. Output cap not published. Do not build chain reliability on it.',
  },
  mistral: {
    id: 'mistral',
    capabilities: ['script-gen'],
    envVars: ['MISTRAL_API_KEY'],
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-small-latest'],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-28' },
    licenseClass: 'free',
    notes: 'FALLBACK #3. Free mode confirmed ("included monthly usage") but all quotas moved into the per-account console — numbers unverified. mistral-small-latest output cap not re-verified.',
  },
  hf: {
    id: 'hf',
    capabilities: ['script-gen'],
    envVars: ['HF_TOKEN'],
    baseUrl: 'https://router.huggingface.co/v1',
    models: [],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-28' },
    licenseClass: 'paid',
    notes: 'DISQUALIFIED as a free lane 2026-10-28 (free users get ZERO monthly credits; pay-per-token router). Retained in the script-gen projection ONLY so the Phase-1 consumers (vault-adds) rule byte-identically to the retired tables; Phase-2 removal candidate.',
  },
  openrouter: {
    id: 'openrouter',
    capabilities: ['script-gen'],
    envVars: ['OPENROUTER_API_KEY'],
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [],
    freeTier: { rpd: 50, maxOutputTokens: null, fetched: '2026-10-28' },
    licenseClass: 'free-with-caveats',
    notes: 'LAST RESORT. :free models 20 RPM / 50 RPD (1,000 RPD with >=$10 lifetime credits); today\'s free lineup has no frontier-class writer. Anti-multi-account: extra keys do NOT raise limits. BYOK costs 5% of list price.',
  },
  cloudflare: {
    id: 'cloudflare',
    capabilities: ['script-gen'],
    envVars: ['CLOUDFLARE_API_TOKEN'],
    baseUrl: 'https://api.cloudflare.com/client/v4',
    models: ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-28' },
    licenseClass: 'free',
    notes: 'FALLBACK #2 (new in chain). OpenAI-compatible .../accounts/{account_id}/ai/v1/chat/completions; 10,000 neurons/day (~20-45 doc scripts/account). max_tokens DEFAULTS TO 256 — always send explicitly (ceiling undocumented). Training policy unverified.',
  },
  openai: {
    id: 'openai',
    capabilities: ['tts', 'captions', 'script-gen'],
    envVars: ['OPENAI_API_KEY'],
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini-tts', 'whisper-1', 'gpt-4o-mini'],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-24' },
    licenseClass: 'paid',
    notes: 'NO free API tier exists (pricing page, via 10-24 file). Paid vault key slots as tts/captions slot 0 with zero code change. whisper-1 powers the SRT captions lane; API data not used for training. script-gen added per the Task 5 re-review follow-up: the paid chat lane (gpt-4o-mini, adapter-pinned) is ROUTABLE via real key application — user story 10\'s slot-0 UI action — never a zero-config baseline lane (paid lane must be opted into by an explicit route).',
  },
  tavily: {
    id: 'tavily',
    capabilities: ['search'],
    envVars: ['TAVILY_API_KEY'],
    baseUrl: 'https://api.tavily.com',
    models: [],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-24' },
    licenseClass: 'free',
    notes: 'Default search provider: 1,000 API credits/month, no card, resets 1st of month (recurring quota fits a cron pipeline better than one-time credits). PAYG $0.008/credit.',
  },
  serper: {
    id: 'serper',
    capabilities: ['search'],
    envVars: ['SERPER_API_KEY'],
    baseUrl: 'https://google.serper.dev',
    models: [],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-24' },
    licenseClass: 'free-with-caveats',
    notes: '2,500 free queries on signup, one-time (no card). Cheap volume after that; per-1k price not verified on the fetched page.',
  },
  elevenlabs: {
    id: 'elevenlabs',
    capabilities: ['tts'],
    envVars: ['ELEVENLABS_API_KEY'],
    baseUrl: 'https://api.elevenlabs.io/v1',
    models: ['eleven_turbo_v2_5', 'eleven_flash_v2_5'],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-24' },
    licenseClass: 'free-with-caveats',
    notes: '10,000 credits/month shared across TTS/STT/music/SFX (TTS = 1 credit/char; Flash/Turbo 0.5-1 credit/char). NO commercial license on the free tier — commercial starts at Starter ($6/mo); never route monetized channels through it by default.',
  },
  'edge-tts-local': {
    id: 'edge-tts-local',
    capabilities: ['tts'],
    envVars: [],
    baseUrl: null,
    models: [],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-24' },
    licenseClass: 'free-with-caveats',
    notes: 'Free-local baseline TTS lane (unmetered, no key; what makes CAPABILITY_BASELINE.tts true). Unofficial Edge client — ToS-gray, no license to the service; fallback only, never client-facing.',
  },
  'whisper-local': {
    id: 'whisper-local',
    capabilities: ['captions'],
    envVars: [],
    baseUrl: null,
    models: ['large-v3'],
    freeTier: { rpd: null, maxOutputTokens: null, fetched: '2026-10-24' },
    licenseClass: 'free',
    notes: 'Free-local baseline captions lane (faster-whisper/whisper.cpp, MIT, unlimited — what makes CAPABILITY_BASELINE.captions true). Cheapest capability to keep genuinely free.',
  },
};

/**
 * Ordered provider ids covering a capability (catalog insertion order —
 * the retired tables' baseline order: gemini first for script-gen, per
 * research/free-doc-script-apis-2026-10-28.md). image-gen -> [] (no
 * generator provider in the vault). Unknown capability -> [].
 * @param {string} cap registry capability ('script-gen' | 'tts' | 'captions' | 'image-gen' | 'search' | ...)
 * @returns {string[]}
 */
export function capabilityProviders(cap) {
  const out = [];
  for (const p of Object.values(PROVIDERS)) {
    if (p.capabilities.includes(cap)) out.push(p.id);
  }
  return out;
}
