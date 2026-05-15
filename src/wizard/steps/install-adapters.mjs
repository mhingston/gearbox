import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const ADAPTER_MODULES = {
  copilot:  () => import(path.join(PKG_ROOT, 'src', 'adapters', 'copilot.mjs')),
  claude:   () => import(path.join(PKG_ROOT, 'src', 'adapters', 'claude.mjs')),
  codex:    () => import(path.join(PKG_ROOT, 'src', 'adapters', 'codex.mjs')),
  gemini:   () => import(path.join(PKG_ROOT, 'src', 'adapters', 'gemini.mjs')),
  opencode: () => import(path.join(PKG_ROOT, 'src', 'adapters', 'opencode.mjs')),
  pi:       () => import(path.join(PKG_ROOT, 'src', 'adapters', 'pi.mjs')),
};

/**
 * Run adapters for the selected platforms and write their output files.
 *
 * @param {{ cwd?: string, platforms?: string[], hooksDir?: string, existingSettings?: object, dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], warnings: string[] }>}
 */
export async function installAdapters({
  cwd = process.cwd(),
  platforms = [],
  hooksDir = '.gearbox/hooks',
  existingSettings = {},
  dryRun = false,
} = {}) {
  const written = [];
  const skipped = [];
  const warnings = [];

  for (const platform of platforms) {
    const loader = ADAPTER_MODULES[platform];
    if (!loader) {
      warnings.push(`Unknown platform: ${platform}`);
      continue;
    }

    const mod = await loader();
    const { files, warnings: adapterWarnings } = mod.generateConfig({ hooksDir });
    warnings.push(...adapterWarnings);

    for (const { path: filePath, content } of files) {
      const dest = path.join(cwd, filePath);

      if (existsSync(dest)) {
        skipped.push(filePath);
        continue;
      }

      written.push(filePath);
      if (!dryRun) {
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, content, 'utf8');
      }
    }
  }

  return { written, skipped, warnings };
}
