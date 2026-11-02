import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflows } from '../lib/workflow-validator.mjs';

test('validateWorkflows parses all .github/workflows without undefined load TypeError', async () => {
  const result = await validateWorkflows('.github/workflows');
  
  // Verify no undefined load errors
  const hasUndefinedLoadBug = result.problems.some(p => p.includes("Cannot read properties of undefined (reading 'load')"));
  assert.equal(hasUndefinedLoadBug, false, 'Should not throw TypeError on yaml.load');

  // Verify all workflows parse cleanly
  assert.equal(
    result.valid,
    true,
    `Expected all workflows to be valid, but found ${result.problems.length} problem(s):\n${result.problems.join('\n')}`
  );
  assert.deepEqual(result.problems, []);
});

test('validateWorkflows catches syntax errors gracefully on invalid yaml', async (t) => {
  // Test with invalid fixture to ensure validator actually catches bad yaml
  const tmpDir = 'tests/fixtures/bad-workflow';
  t.after(() => {
    import('node:fs').then(fs => fs.rmSync(tmpDir, { recursive: true, force: true }));
  });

  const fs = await import('node:fs');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(`${tmpDir}/broken.yml`, 'jobs:\n  bad: [unclosed array\n');

  const result = await validateWorkflows(tmpDir);
  assert.equal(result.valid, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /broken\.yml:/);
});
