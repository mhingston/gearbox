import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SKILLS_SRC = path.join(PKG_ROOT, 'src', 'skills');

/**
 * Collect all files under a directory recursively.
 */
async function collectFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(full, base)));
    } else {
      results.push({ src: full, rel: path.relative(base, full) });
    }
  }
  return results;
}

/**
 * Install skill directories from src/skills/ into <cwd>/{skillsDir}/
 *
 * @param {{ cwd?: string, skillsDir?: string, selectedSkills?: string[]|'all', dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function installSkills({
  cwd = process.cwd(),
  skillsDir = '.agents/skills',
  selectedSkills = 'all',
  dryRun = false,
} = {}) {
  const allSkills = await readdir(SKILLS_SRC, { withFileTypes: true });
  const skillNames = allSkills.filter(e => e.isDirectory()).map(e => e.name);

  const toInstall =
    selectedSkills === 'all'
      ? skillNames
      : skillNames.filter(n => selectedSkills.includes(n));

  const written = [];
  const skipped = [];

  for (const skill of toInstall) {
    const srcDir = path.join(SKILLS_SRC, skill);
    const files = await collectFiles(srcDir, SKILLS_SRC);

    for (const { src, rel } of files) {
      const destRel = path.join(skillsDir, rel);
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
  }

  return { written, skipped };
}
