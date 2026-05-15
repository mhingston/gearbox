import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HOOKS_SRC = path.join(PKG_ROOT, 'src', 'hooks');

/**
 * Install hook scripts into <cwd>/.gearbox/hooks/
 *
 * @param {{ cwd?: string, dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function installHooks({ cwd = process.cwd(), dryRun = false } = {}) {
  const entries = await readdir(HOOKS_SRC);
  const destDir = path.join(cwd, '.gearbox', 'hooks');
  const written = [];
  const skipped = [];

  for (const entry of entries) {
    const rel = path.join('.gearbox', 'hooks', entry);
    const dest = path.join(destDir, entry);

    if (existsSync(dest)) {
      skipped.push(rel);
      continue;
    }

    written.push(rel);
    if (!dryRun) {
      await mkdir(destDir, { recursive: true });
      await copyFile(path.join(HOOKS_SRC, entry), dest);
    }
  }

  return { written, skipped };
}
