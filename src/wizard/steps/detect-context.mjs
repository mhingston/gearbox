import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Detect project context from the given working directory.
 *
 * @param {string} cwd
 * @returns {Promise<{projectName: string, hasGitRepo: boolean, existingHooks: string[], existingAdapters: string[]}>}
 */
export async function detectContext(cwd) {
  // Resolve project name from package.json or directory basename
  let projectName = path.basename(cwd);
  const pkgPath = path.join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
      if (pkg.name) projectName = pkg.name;
    } catch {
      // fall back to directory name
    }
  }

  // Check for git remote
  let hasGitRepo = false;
  try {
    execSync('git remote', { cwd, stdio: 'pipe' });
    hasGitRepo = true;
  } catch {
    hasGitRepo = false;
  }

  // Collect existing hook files
  const hooksDir = path.join(cwd, '.gearbox', 'hooks');
  let existingHooks = [];
  if (existsSync(hooksDir)) {
    const { readdir } = await import('node:fs/promises');
    existingHooks = await readdir(hooksDir).catch(() => []);
  }

  // Detect existing adapter config paths
  const adapterPaths = [
    '.github/copilot/hooks.json',
    '.claude/settings.json',
    '.gemini/settings.json',
  ];
  const existingAdapters = adapterPaths.filter(p => existsSync(path.join(cwd, p)));

  return { projectName, hasGitRepo, existingHooks, existingAdapters };
}
