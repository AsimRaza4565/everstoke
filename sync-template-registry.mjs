// Registry sync CLI (issue #102 Phase 1, Task 6).
// Thin orchestration over the tested core: loads the template catalog,
// resolves registry-assignable families via loadRegistryTemplates()
// (studio/lib/template-registry.js), and syncs them into the
// template_registry_index table via getRegistryDb().syncRegistry()
// (studio/lib/template-registry-db.js).
//
// Usage:
//   node sync-template-registry.mjs          # real sync (needs DATABASE_URL)
//   node sync-template-registry.mjs --dry    # compute + print only, no DB touch
//
// Exit 0 on a clean sync, exit 1 on any skipped-invalid family,
// removal-refused family, or database unavailability.
import { loadEnv } from './lib/env.mjs';
import { TEMPLATES_DATA } from './studio/lib/templates-catalog.js';
import { REGISTRY_META } from './studio/lib/template-registry.data.js';
import { loadRegistryTemplates } from './studio/lib/template-registry.js';

loadEnv();

const DRY = process.argv.includes('--dry');
const log = (m) => console.log(m);

// ---- Resolve registry-assignable families over the catalog -------------------
const { templates, invalid } = loadRegistryTemplates(TEMPLATES_DATA, REGISTRY_META);

let failed = false;

log('── Template registry sync (issue #102) ' + (DRY ? '[DRY] ' : '') + '──');

if (invalid.length > 0) {
  failed = true;
  log(`skipped-invalid: ${invalid.length} family(ies)`);
  for (const inv of invalid) {
    log(`  [${inv.familyId}] ${inv.errors[0]}${inv.errors.length > 1 ? ` (+${inv.errors.length - 1} more)` : ''}`);
  }
} else {
  log('skipped-invalid: 0');
}

// ---- Sync into the registry index --------------------------------------------
if (DRY) {
  log(`[dry] registry-assignable families resolved: ${templates.length}`);
  log('[dry] no writes performed — database not touched');
} else {
  try {
    const db = await (await import('./studio/lib/template-registry-db.js')).getRegistryDb();
    await db.ensureSchema(); // fresh database needs its tables before the first sync
    const result = await db.syncRegistry(templates);
    log(`placed/updated: ${result.synced.length} of ${templates.length} registry-assignable family(ies)`);
    if (result.synced.length) log(`  written: ${result.synced.join(', ')}`);
    if (result.removedRefused.length > 0) {
      failed = true;
      log(`removal-refused: ${result.removedRefused.length} family(ies) absent from input but actively assigned (nothing deleted):`);
      for (const familyId of result.removedRefused) log(`  [${familyId}]`);
    } else {
      log('removal-refused: 0');
    }
  } catch (e) {
    failed = true;
    log(`database unavailable: ${String(e.message || e).slice(0, 200)}`);
  }
}

log(failed ? 'SYNC FAILED' : 'SYNC OK');
process.exit(failed ? 1 : 0);
