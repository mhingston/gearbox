import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MEMORY_CONTRACT_SRC = path.join(PKG_ROOT, 'src', 'memory-contract');

async function collectFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, base)));
      continue;
    }

    files.push({ src: fullPath, rel: path.relative(base, fullPath) });
  }

  return files;
}

/**
 * Install durable memory contract files into the target repository.
 *
 * @param {{ cwd?: string, dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function installMemoryContract({ cwd = process.cwd(), dryRun = false } = {}) {
  const entries = await collectFiles(MEMORY_CONTRACT_SRC);
  const written = [];
  const skipped = [];

  for (const entry of entries) {
    const destRel = entry.rel;
    const dest = path.join(cwd, destRel);

    if (existsSync(dest)) {
      skipped.push(destRel);
      continue;
    }

    written.push(destRel);
    if (!dryRun) {
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(entry.src, dest);
    }
  }

  return { written, skipped };
}
