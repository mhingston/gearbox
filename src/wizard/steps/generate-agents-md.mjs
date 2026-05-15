import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const GEARBOX_SECTION_HEADING = '## Gearbox harness';

function buildStub(projectName) {
  return `# ${projectName} — Agent Instructions

## Project overview

TODO: Describe your project here.

## Gearbox harness

This repo uses [gearbox](https://github.com/mark-hingston/gearbox) for AI agent harness setup.
Run \`node .gearbox/scripts/harness-audit.mjs health\` to check harness health.

## Architecture guardrails

TODO: Add your conventions here.
`;
}

const GEARBOX_APPEND = `
## Gearbox harness

This repo uses [gearbox](https://github.com/mark-hingston/gearbox) for AI agent harness setup.
Run \`node .gearbox/scripts/harness-audit.mjs health\` to check harness health.
`;

/**
 * Write or append an AGENTS.md file in the project root.
 *
 * @param {{ cwd?: string, projectName?: string, dryRun?: boolean }} options
 * @returns {Promise<{ written: string[], skipped: string[] }>}
 */
export async function generateAgentsMd({
  cwd = process.cwd(),
  projectName = 'Project',
  dryRun = false,
} = {}) {
  const agentsPath = path.join(cwd, 'AGENTS.md');
  const relPath = 'AGENTS.md';

  if (!existsSync(agentsPath)) {
    if (!dryRun) {
      await writeFile(agentsPath, buildStub(projectName), 'utf8');
    }
    return { written: [relPath], skipped: [] };
  }

  const existing = await readFile(agentsPath, 'utf8');

  if (existing.includes(GEARBOX_SECTION_HEADING)) {
    return { written: [], skipped: [relPath] };
  }

  if (!dryRun) {
    await appendFile(agentsPath, GEARBOX_APPEND, 'utf8');
  }
  return { written: [relPath], skipped: [] };
}
