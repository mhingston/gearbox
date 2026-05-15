import { readdir, copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HARNESS_SRC = path.join(PKG_ROOT, 'src', 'harness');

/**
 * Collect all files under a directory recursively.
 * Returns entries as { src: absolute, rel: relative-to-base } pairs.
 */
async function collectFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(full, base)));
    } else {
      results.push({ src: full, rel });
    }
  }
  return results;
}

/**
 * Install harness scripts into <cwd>/.gearbox/scripts/ and
 * harness-config.json into <cwd>/.gearbox/harness-config.json
 *
 * @param {{ cwd?: string, dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function installHarness({ cwd = process.cwd(), dryRun = false } = {}) {
  const files = await collectFiles(HARNESS_SRC);
  const written = [];
  const skipped = [];

  for (const { src, rel } of files) {
    let destRel;
    if (rel === 'harness-config.json') {
      destRel = path.join('.gearbox', 'harness-config.json');
    } else {
      destRel = path.join('.gearbox', 'scripts', rel);
    }

    const dest = path.join(cwd, destRel);

    if (existsSync(dest)) {
      skipped.push(destRel);
      continue;
    }

    written.push(destRel);
    if (!dryRun) {
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
    }
  }

  return { written, skipped };
}
