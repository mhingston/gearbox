import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOWS_SRC = path.join(PKG_ROOT, 'src', 'workflows');

/**
 * Install workflow files (.md + .lock.yml) to <cwd>/.github/workflows/
 * Files are prefixed with "gearbox-" in the destination.
 *
 * @param {{ cwd?: string, selectedWorkflows?: string[], dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function installWorkflows({
  cwd = process.cwd(),
  selectedWorkflows = [],
  dryRun = false,
} = {}) {
  const entries = await readdir(WORKFLOWS_SRC);

  // Build a set of base names (strip extension) for all available workflows
  const available = new Set(
    entries.map(e => e.replace(/\.(md|lock\.yml)$/, ''))
  );

  const toInstall =
    selectedWorkflows.length === 0
      ? [...available]
      : selectedWorkflows.filter(w => available.has(w));

  const destDir = path.join(cwd, '.github', 'workflows');
  const written = [];
  const skipped = [];

  for (const name of toInstall) {
    for (const ext of ['.md', '.lock.yml']) {
      const srcFile = path.join(WORKFLOWS_SRC, `${name}${ext}`);
      if (!existsSync(srcFile)) continue;

      const destName = `gearbox-${name}${ext}`;
      const destRel = path.join('.github', 'workflows', destName);
      const dest = path.join(destDir, destName);

      if (existsSync(dest)) {
        skipped.push(destRel);
        continue;
      }

      written.push(destRel);
      if (!dryRun) {
        await mkdir(destDir, { recursive: true });
        await copyFile(srcFile, dest);
      }
    }
  }

  return { written, skipped };
}
