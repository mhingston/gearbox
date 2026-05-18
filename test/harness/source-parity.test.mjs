import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

const PARITY_CASES = [
  ['src/hooks/context-compact.mjs', '.gearbox/hooks/context-compact.mjs'],
  ['src/hooks/markdown-eval.mjs', '.gearbox/hooks/markdown-eval.mjs'],
  ['src/hooks/prompts/consolidate-memory.md', '.gearbox/hooks/prompts/consolidate-memory.md'],
  ['src/harness/harness-audit.mjs', '.gearbox/scripts/harness-audit.mjs'],
  ['src/harness/sync-agent-config.mjs', '.gearbox/scripts/sync-agent-config.mjs'],
  ['src/harness/normalize-error.mjs', '.gearbox/scripts/normalize-error.mjs'],
  ['src/harness/paths.mjs', '.gearbox/scripts/paths.mjs'],
  ['src/harness/tmpdir.mjs', '.gearbox/scripts/tmpdir.mjs'],
  ['src/harness/validate-skill.mjs', '.gearbox/scripts/validate-skill.mjs'],
  ['src/skills/ci-monitor/SKILL.md', '.agents/skills/ci-monitor/SKILL.md'],
  ['src/skills/ci-monitor/references/monitoring-loop.md', '.agents/skills/ci-monitor/references/monitoring-loop.md'],
  ['src/skills/ci-monitor/references/outcomes.md', '.agents/skills/ci-monitor/references/outcomes.md'],
  ['src/skills/fix-merge-conflicts/SKILL.md', '.agents/skills/fix-merge-conflicts/SKILL.md'],
  ['src/skills/skill-creator/SKILL.md', '.agents/skills/skill-creator/SKILL.md'],
  ['src/skills/skill-creator/references/authoring.md', '.agents/skills/skill-creator/references/authoring.md'],
  ['src/skills/skill-creator/references/description-optimization.md', '.agents/skills/skill-creator/references/description-optimization.md'],
  ['src/skills/skill-creator/references/evaluation.md', '.agents/skills/skill-creator/references/evaluation.md'],
  ['src/skills/skill-creator/references/platform-notes.md', '.agents/skills/skill-creator/references/platform-notes.md'],
  ['src/skills/stuck-loop-detection/SKILL.md', '.agents/skills/stuck-loop-detection/SKILL.md'],
];

test('checked-in sample assets stay in sync with install source files', async () => {
  for (const [sourceRelativePath, sampleRelativePath] of PARITY_CASES) {
    const [sourceContent, sampleContent] = await Promise.all([
      readFile(path.join(repoRoot, sourceRelativePath), 'utf8'),
      readFile(path.join(repoRoot, sampleRelativePath), 'utf8'),
    ]);

    assert.equal(
      sampleContent,
      sourceContent,
      `${sampleRelativePath} drifted from ${sourceRelativePath}`
    );
  }
});
