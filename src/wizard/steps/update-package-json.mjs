import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const GEARBOX_SCRIPTS = {
  'gearbox:health':     'node .gearbox/scripts/harness-audit.mjs health',
  'gearbox:audit':      'node .gearbox/scripts/harness-audit.mjs preflight',
  'gearbox:check-docs': 'node .gearbox/scripts/docs-drift-check.mjs',
};

/**
 * Add gearbox scripts to package.json in cwd.
 * Creates a minimal package.json if none exists.
 *
 * @param {{ cwd?: string, dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function updatePackageJson({ cwd = process.cwd(), dryRun = false } = {}) {
  const pkgPath = path.join(cwd, 'package.json');
  const relPath = 'package.json';

  let pkg;
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  } else {
    pkg = { name: path.basename(cwd), version: '0.1.0', scripts: {} };
  }

  if (!pkg.scripts) pkg.scripts = {};

  const toAdd = Object.entries(GEARBOX_SCRIPTS).filter(
    ([key]) => !pkg.scripts[key]
  );

  if (toAdd.length === 0) {
    return { written: [], skipped: [relPath] };
  }

  for (const [key, value] of toAdd) {
    pkg.scripts[key] = value;
  }

  if (!dryRun) {
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  return { written: [relPath], skipped: [] };
}
