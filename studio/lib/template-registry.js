// Template registry metadata validator + loader (schema v1).
// Pure logic only — no DB, no UI. The metadata itself lives in
// template-registry.data.js and is seeded by a later task.

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FORMATS = ['short', 'long'];
const ALLOWED_CAPABILITIES = ['script-gen', 'tts', 'captions', 'image-gen'];
const ALLOWED_REVIEW_REQUIRED = ['health', 'finance', 'all'];

/**
 * Pipeline-truth capability baseline (Phase 1): what the production pipeline
 * fulfills TODAY with no owner action — script-gen via the script-brain chain
 * (server keys), tts via the local edge-tts/Kokoro lanes, captions via the
 * local faster-whisper/SRT lane. All ship in-repo and run in the current
 * workflows, so they count as available WITHOUT any vault key. image-gen has
 * no in-repo generator (pixabay/pexels are stock *search* keys, not
 * generators).
 * SHARED by both validator moments — the Studio assign route
 * (app/api/templates/assign/route.js) and the pipeline preflight
 * (lib/template-preflight.mjs) — so the same ruling can never drift into two
 * implementations (the E2E round-2 finding: route said tts/captions available,
 * preflight said unavailable, and an assigned channel fail-closed at
 * generation). The BYOK vault is REFINEMENT ONLY: a configured key can add
 * availability on top of this baseline and can never revoke it.
 * PHASE-2 UPGRADE: replace the baseline with per-provider truth (capability
 * registry) instead of asserting lane availability.
 */
export const CAPABILITY_BASELINE = {
  'script-gen': true,
  'tts': true,
  'captions': true,
  'image-gen': false,
};

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every(isNonEmptyString);
}

function isSubsetOf(arr, allowlist) {
  return Array.isArray(arr) && arr.every(v => allowlist.includes(v));
}

/**
 * Validate one registry metadata block against schema v1.
 * Collects all errors (not first-only). Pure and fail-closed.
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateRegistryMeta(meta) {
  const errors = [];

  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, errors: ['meta: must be an object'] };
  }

  if (!isNonEmptyString(meta.version) || !SEMVER_RE.test(meta.version)) {
    errors.push(`version: must be semver (MAJOR.MINOR.PATCH), got ${JSON.stringify(meta.version)}`);
  }

  if (!Array.isArray(meta.niches) || meta.niches.length === 0 || !meta.niches.every(isNonEmptyString)) {
    errors.push('niches: must be a non-empty array of non-empty strings');
  }

  if (!Array.isArray(meta.formats) || meta.formats.length === 0 || !isSubsetOf(meta.formats, ALLOWED_FORMATS)) {
    errors.push(`formats: must be a non-empty array drawn from {${ALLOWED_FORMATS.join(', ')}}`);
  }

  if (!isNonEmptyString(meta.renderer)) {
    errors.push('renderer: must be a non-empty string');
  }

  if (!Array.isArray(meta.required_capabilities) || !isSubsetOf(meta.required_capabilities, ALLOWED_CAPABILITIES)) {
    errors.push(`required_capabilities: must be an array drawn from {${ALLOWED_CAPABILITIES.join(', ')}}`);
  }

  if (!Array.isArray(meta.variation_rules) || meta.variation_rules.length === 0 || !meta.variation_rules.every(isNonEmptyString)) {
    errors.push('variation_rules: must be a non-empty array of non-empty strings');
  }

  const safety = meta.safety;
  if (safety === null || typeof safety !== 'object' || Array.isArray(safety)) {
    errors.push('safety: must be an object with required_sources and review_required');
  } else {
    if (typeof safety.required_sources !== 'boolean') {
      errors.push('safety.required_sources: must be a boolean');
    }
    if (!Array.isArray(safety.review_required) || !isSubsetOf(safety.review_required, ALLOWED_REVIEW_REQUIRED)) {
      errors.push(`safety.review_required: must be an array drawn from {${ALLOWED_REVIEW_REQUIRED.join(', ')}}`);
    }
  }

  if (typeof meta.deprecated !== 'boolean') {
    errors.push('deprecated: must be a boolean');
  } else if (meta.deprecated) {
    if (!isNonEmptyString(meta.deprecated_on) || !DATE_RE.test(meta.deprecated_on)) {
      errors.push('deprecated_on: required (YYYY-MM-DD) when deprecated is true');
    }
  } else if (meta.deprecated_on !== undefined && (!isNonEmptyString(meta.deprecated_on) || !DATE_RE.test(meta.deprecated_on))) {
    errors.push('deprecated_on: must be a YYYY-MM-DD date string');
  }

  if (!Array.isArray(meta.changelog)) {
    errors.push('changelog: must be an array of {version, date, note} entries');
  } else {
    meta.changelog.forEach((entry, i) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`changelog[${i}]: must be an object`);
        return;
      }
      if (!isNonEmptyString(entry.version) || !SEMVER_RE.test(entry.version)) {
        errors.push(`changelog[${i}].version: must be semver (MAJOR.MINOR.PATCH)`);
      }
      if (!isNonEmptyString(entry.date) || !DATE_RE.test(entry.date)) {
        errors.push(`changelog[${i}].date: must be a YYYY-MM-DD date string`);
      }
      if (!isNonEmptyString(entry.note)) {
        errors.push(`changelog[${i}].note: must be a non-empty string`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

/**
 * Resolve registry-assignable templates over catalog families, fail-closed.
 * - Families without registry metadata are simply absent from the result.
 * - Families whose metadata fails validation are excluded AND reported (AC-1).
 * Never throws on invalid metadata.
 * @param {Array<{id: string, name: string, family?: string, [k: string]: unknown}>} catalogFamilies
 * @param {Record<string, unknown>} metaData catalog family id -> metadata block
 * @returns {{ templates: Array<{familyId: string, name: string, catalog: object, registry: object}>, invalid: Array<{familyId: string, errors: string[]}> }}
 */
export function loadRegistryTemplates(catalogFamilies, metaData) {
  const templates = [];
  const invalid = [];

  for (const entry of catalogFamilies) {
    const familyId = entry.family || entry.id;
    const meta = metaData[familyId];
    if (!meta) continue; // no registry metadata -> not registry-assignable, simply absent

    const result = validateRegistryMeta(meta);
    if (!result.ok) {
      invalid.push({ familyId, errors: result.errors });
      continue;
    }

    templates.push({ familyId, name: entry.name, catalog: entry, registry: meta });
  }

  return { templates, invalid };
}

/**
 * Resolve a channel's pinned template assignment to the highest version
 * within the pinned major. Pure and fail-closed.
 * Adoption rules: minor/patch updates within the pinned major auto-adopt;
 * a higher major never auto-adopts — it is surfaced via
 * majorUpdateAvailable so the caller can decide (spec D2).
 * @param {{ familyId: string, pinned_major: number }} assignment
 * @param {Array<{ familyId?: string, version: string }>} registryBlocks registry metadata blocks (one per version)
 * @returns {{ ok: true, resolvedVersion: string, majorUpdateAvailable: boolean } | { ok: false, errors: string[] }}
 */
export function resolveAssignment(assignment, registryBlocks) {
  const inputErrors = [];
  if (assignment === null || typeof assignment !== 'object' || Array.isArray(assignment) || !Number.isInteger(assignment.pinned_major)) {
    inputErrors.push('assignment: must be an object with an integer pinned_major');
  }
  if (!Array.isArray(registryBlocks)) {
    inputErrors.push('registryBlocks: must be an array of metadata blocks');
  }
  if (inputErrors.length > 0) return { ok: false, errors: inputErrors };

  const versions = registryBlocks
    .filter(b => b !== null && typeof b === 'object' && !Array.isArray(b)
      && b.familyId === assignment.familyId
      && isNonEmptyString(b.version) && SEMVER_RE.test(b.version))
    .map(b => b.version.split('.').map(Number));

  const inMajor = versions.filter(v => v[0] === assignment.pinned_major);
  if (inMajor.length === 0) {
    return { ok: false, errors: ['no_version_in_major'] };
  }

  const highest = inMajor.reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[2] > a[2]) ? b : a));
  const majorUpdateAvailable = versions.some(v => v[0] > assignment.pinned_major);

  return { ok: true, resolvedVersion: highest.join('.'), majorUpdateAvailable };
}

/**
 * Derive the validator's channelConfig from the channel registry's real
 * entry shape (spec D4 "live data"). Shared by the GET templates route
 * (channel view) and the POST assign route so both always feed the
 * validator the same niches/formats the UI orders on:
 * - niches: the channel's main niche plus its configured sub-niches
 * - formats: the channel registry stores no per-channel format field; every
 *   lane is a Shorts-first vertical lane, so 'short' is always produced, and
 *   a channel with a long-form slot configured (kit.longSlot) also gets
 *   'long'. PHASE-2 UPGRADE: add an explicit per-channel formats field to the
 *   channels table instead of deriving it.
 * - brand_kit: present when the channel has any kit data saved.
 * @param {object} entry channel registry entry (slug, niche, kit)
 * @returns {{ formats: string[], niches: string[], brand_kit: boolean }}
 */
export function channelConfigFromRegistryEntry(entry) {
  const kit = entry?.kit || {};
  const niches = [...new Set([entry?.niche, ...(Array.isArray(kit.niches) ? kit.niches : [])]
    .filter((n) => typeof n === 'string' && n.length > 0))];
  const formats = kit.longSlot ? ['short', 'long'] : ['short'];
  const brand_kit = Boolean(entry?.kit && Object.keys(entry.kit).length > 0);
  return { formats, niches, brand_kit };
}

/**
 * Validate a template assignment against a channel's configuration and the
 * environment capability map (spec D4). Pure and fail-closed: a capability
 * (or renderer) counts as available only when the map holds it as exactly
 * `true`. Collects ALL blocking reasons — never first-only.
 * Stable blocking codes: `missing_capability:<cap>`, `format_mismatch`,
 * `niche_mismatch`, `renderer_unavailable`, `deprecated_template`.
 * @param {object} meta validated registry metadata block
 * @param {{ formats?: string[], niches?: string[], brand_kit?: boolean }} channelConfig
 * @param {Record<string, boolean>} capabilityMap
 * @returns {{ ok: true } | { ok: false, reasons: Array<{ code: string, detail: string }> }}
 */
export function validateAssignment(meta, channelConfig, capabilityMap) {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, reasons: [{ code: 'invalid_meta', detail: 'meta: must be an object' }] };
  }

  const reasons = [];
  const caps = Array.isArray(meta.required_capabilities) ? meta.required_capabilities : [];
  for (const cap of caps) {
    if (capabilityMap === null || typeof capabilityMap !== 'object' || capabilityMap[cap] !== true) {
      reasons.push({ code: `missing_capability:${cap}`, detail: `required capability "${cap}" is not available (map value must be exactly true)` });
    }
  }

  const metaFormats = Array.isArray(meta.formats) ? meta.formats : [];
  const channelFormats = channelConfig && Array.isArray(channelConfig.formats) ? channelConfig.formats : [];
  if (!metaFormats.some(f => channelFormats.includes(f))) {
    reasons.push({ code: 'format_mismatch', detail: `template formats [${metaFormats.join(', ')}] have no overlap with channel formats [${channelFormats.join(', ')}]` });
  }

  const metaNiches = Array.isArray(meta.niches) ? meta.niches : [];
  const channelNiches = channelConfig && Array.isArray(channelConfig.niches) ? channelConfig.niches : [];
  if (!metaNiches.some(n => channelNiches.includes(n))) {
    reasons.push({ code: 'niche_mismatch', detail: `template niches [${metaNiches.join(', ')}] have no overlap with channel niches [${channelNiches.join(', ')}]` });
  }

  if (capabilityMap === null || typeof capabilityMap !== 'object' || capabilityMap[meta.renderer] !== true) {
    reasons.push({ code: 'renderer_unavailable', detail: `renderer ${JSON.stringify(meta.renderer)} is not available (map value must be exactly true)` });
  }

  if (meta.deprecated === true) {
    reasons.push({ code: 'deprecated_template', detail: `template version ${meta.version} is deprecated${meta.deprecated_on ? ` on ${meta.deprecated_on}` : ''}` });
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}
