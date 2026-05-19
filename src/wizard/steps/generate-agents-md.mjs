import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const GEARBOX_SECTION_HEADING = '## Gearbox harness';
const REQUIRED_GEARBOX_SNIPPETS = [
  '[durable learning guide](docs/agents/learning-guide.md)',
  '[decisions log](.github/agents/decisions.md)',
  '[user directives](.github/agents/user-directives.md)',
  '[progress log](docs/agents/progress.md)',
  '[session handoff](docs/agents/session-handoff.md)',
  '[clean-state checklist](docs/agents/clean-state-checklist.md)',
];
const SESSION_CONTINUITY_SECTION_HEADING = 'Session continuity docs live in `docs/agents/`:';
const SESSION_CONTINUITY_BLOCK = `Session continuity docs live in \`docs/agents/\`:

- [progress log](docs/agents/progress.md) — track what changed, what is in flight, and what to resume next
- [session handoff](docs/agents/session-handoff.md) — leave restart context for the next agent session
- [clean-state checklist](docs/agents/clean-state-checklist.md) — wrap up work without leaving a confusing repo state`;
const GEARBOX_SECTION_BODY = `## Gearbox harness

This repo uses [gearbox](https://github.com/mark-hingston/gearbox) for AI agent harness setup.
Run \`node .gearbox/scripts/harness-audit.mjs health\` to check harness health.

Durable memory lives in:

- \`AGENTS.md\` — top-level repo guardrails and conventions
- [durable learning guide](docs/agents/learning-guide.md) — where new lessons should go
- [decisions log](.github/agents/decisions.md) — long-lived decisions and invariants
- [user directives](.github/agents/user-directives.md) — explicit user preferences to honour

${SESSION_CONTINUITY_BLOCK}
`;

function buildStub(projectName) {
  return `# ${projectName} — Agent Instructions

## Project overview

TODO: Describe your project here.

${GEARBOX_SECTION_BODY}

## Architecture guardrails

TODO: Add your conventions here.
`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasRequiredGearboxLinks(content) {
  return REQUIRED_GEARBOX_SNIPPETS.every((snippet) => content.includes(snippet));
}

function extractLinkSnippet(line) {
  return line.match(/\[[^\]]+\]\([^)]+\)/)?.[0] ?? null;
}

function updateExistingGearboxSection(content) {
  const sectionPattern = new RegExp(`${escapeRegExp(GEARBOX_SECTION_HEADING)}[\\s\\S]*?(?=\\n##\\s|$)`);
  const match = content.match(sectionPattern);

  if (!match) {
    return { content, changed: false };
  }

  const section = match[0];
  if (hasRequiredGearboxLinks(section)) {
    return { content, changed: false };
  }

  let updatedSection = section.trimEnd();
  if (!updatedSection.includes(SESSION_CONTINUITY_SECTION_HEADING)) {
    updatedSection = `${updatedSection}\n\n${SESSION_CONTINUITY_BLOCK}`;
  } else {
    const missingLines = SESSION_CONTINUITY_BLOCK
      .split('\n')
      .filter((line) => {
        if (!line.startsWith('- ')) {
          return false;
        }

        const linkSnippet = extractLinkSnippet(line);
        return linkSnippet !== null && !updatedSection.includes(linkSnippet);
      });

    if (missingLines.length > 0) {
      updatedSection = `${updatedSection}\n${missingLines.join('\n')}`;
    }
  }

  return {
    content: `${content.slice(0, match.index)}${updatedSection}${content.slice(match.index + match[0].length)}`,
    changed: true,
  };
}

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
    const { content, changed } = updateExistingGearboxSection(existing);
    if (!changed) {
      return { written: [], skipped: [relPath] };
    }

    if (!dryRun) {
      await writeFile(agentsPath, content, 'utf8');
    }
    return { written: [relPath], skipped: [] };
  }

  if (!dryRun) {
    await appendFile(agentsPath, `\n${GEARBOX_SECTION_BODY}`, 'utf8');
  }
  return { written: [relPath], skipped: [] };
}
