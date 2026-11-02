import fs from 'node:fs';

/**
 * Validates GitHub Actions workflow files for syntax and basic structure.
 * 
 * @param {string} [workflowsDir='.github/workflows'] - Path to workflows folder.
 * @returns {Promise<{ valid: boolean, problems: string[] }>}
 */
export async function validateWorkflows(workflowsDir = '.github/workflows') {
  const problems = [];
  
  if (!fs.existsSync(workflowsDir)) {
    return { valid: false, problems: [`Directory not found: ${workflowsDir}`] };
  }

  let yaml;
  try {
    const yamlMod = await import('js-yaml');
    yaml = yamlMod.default || yamlMod;
    if (typeof yaml.load !== 'function') {
      throw new Error("Loaded js-yaml module does not export a 'load' function");
    }
  } catch (err) {
    return {
      valid: false,
      problems: [`validator error: ${String(err.message).slice(0, 100)}`]
    };
  }

  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  
  for (const f of files) {
    const p = `${workflowsDir}/${f}`;
    try {
      const content = fs.readFileSync(p, 'utf8');
      const doc = yaml.load(content);
      if (!doc || typeof doc !== 'object' || (!doc.jobs && !doc['on'] && !doc[true])) {
        problems.push(`${f}: parses but has no jobs/triggers`);
      }
    } catch (e) {
      problems.push(`${f}: ${String(e.message).slice(0, 120)}`);
    }
  }

  return {
    valid: problems.length === 0,
    problems
  };
}
