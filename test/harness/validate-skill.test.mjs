import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTestWorkspace } from '../../src/harness/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(here, '..', '..', 'src', 'harness', 'validate-skill.mjs');
const helperUrl = pathToFileURL(helperPath).href;

async function loadValidateSkillModule() {
  return import(`${helperUrl}?cacheBust=${Date.now()}-${Math.random()}`);
}

async function writeSkill(workspacePath, relativePath, content) {
  const fullPath = path.join(workspacePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}

function runValidateSkill({ cwd, args = [], env = {} }) {
  return spawnSync(process.execPath, [helperPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('validate-skill parses wrapped multiline descriptions', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  const skillPath = await writeSkill(
    workspace.path,
    'skills/sample/SKILL.md',
    `---
name: sample-skill
description:
  Create new skills, modify existing skills, and measure skill performance
  without breaking validation on wrapped YAML values.
---

# Sample Skill

This body is deliberately longer than one hundred characters so the structural
checks pass while we focus on the frontmatter parser regression.
`,
  );

  const { validateSkill } = await loadValidateSkillModule();
  const result = validateSkill(skillPath);

  assert.equal(result.success, true);
  assert.equal(result.failed, 0);
  assert.equal(result.metadata.frontmatter.description.includes('wrapped YAML values'), true);
});

test('validate-skill parses block scalar descriptions', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  const skillPath = await writeSkill(
    workspace.path,
    'skills/block/SKILL.md',
    `---
name: block-skill
description: |
  Patterns and techniques for evaluating and improving AI agent outputs.
  Use this skill when you want strong validation coverage.
---

# Block Skill

This body is deliberately longer than one hundred characters so the validator
can confirm headings and structure while exercising block scalar parsing.
`,
  );

  const { validateSkill } = await loadValidateSkillModule();
  const result = validateSkill(skillPath);

  assert.equal(result.success, true);
  assert.equal(result.failed, 0);
  assert.match(
    result.metadata.frontmatter.description,
    /Patterns and techniques for evaluating and improving AI agent outputs/,
  );
});

test('validate-skill treats description length and total size as advisory warnings', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  const { validateSkill, DESCRIPTION_LENGTH_LIMIT, SKILL_SIZE_LIMIT } = await loadValidateSkillModule();

  const longDescription = `description: "${'trigger guidance '.repeat(Math.ceil((DESCRIPTION_LENGTH_LIMIT + 100) / 16)).trim()}"`;
  const largeBody = `# Large Skill\n\n${'body '.repeat(Math.ceil((SKILL_SIZE_LIMIT + 4000) / 5)).trim()}`;

  const skillPath = await writeSkill(
    workspace.path,
    'skills/warnings/SKILL.md',
    `---
name: warning-skill
${longDescription}
---

${largeBody}
`,
  );

  const result = validateSkill(skillPath);
  const descriptionConstraint = result.constraints.find(
    (constraint) => constraint.name === 'description_length',
  );
  const sizeConstraint = result.constraints.find((constraint) => constraint.name === 'size_limit');

  assert.equal(result.success, true);
  assert.equal(result.failed, 0);
  assert.equal(result.warnings, 2);
  assert.equal(descriptionConstraint?.passed, false);
  assert.equal(descriptionConstraint?.level, 'warning');
  assert.equal(sizeConstraint?.passed, false);
  assert.equal(sizeConstraint?.level, 'warning');
});

test('validate-skill JSON mode exits zero when only warnings are present', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  const skillPath = await writeSkill(
    workspace.path,
    'skills/json/SKILL.md',
    `---
name: json-warning-skill
description: "${'advisory '.repeat(80).trim()}"
---

# JSON Warning Skill

${'content '.repeat(2500).trim()}
`,
  );

  const result = runValidateSkill({
    cwd: workspace.path,
    args: ['--json', skillPath],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.trim(), '');

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.success, true);
  assert.equal(parsed.failed, 0);
  assert.equal(parsed.warnings, 2);
});

test('validate-skill CLI accepts a skill directory path', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  await writeSkill(
    workspace.path,
    'skills/directory-skill/SKILL.md',
    `---
name: directory-skill
description: Validate a skill by passing the skill directory path.
---

# Directory Skill

This body is deliberately longer than one hundred characters so the validator
can prove directory arguments resolve to the SKILL.md entrypoint without
weakening the existing structural checks.
`,
  );

  const result = runValidateSkill({
    cwd: workspace.path,
    args: ['--json', 'skills/directory-skill'],
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.success, true);
  assert.equal(parsed.skillPath.endsWith(path.join('skills', 'directory-skill', 'SKILL.md')), true);
});

test('validate-skill exits non-zero for blocking failures', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  const skillPath = await writeSkill(
    workspace.path,
    'skills/invalid/SKILL.md',
    `# Missing Frontmatter

This file is intentionally invalid so the validator keeps failing blocking
constraints when the structure is not present.
`,
  );

  const result = runValidateSkill({
    cwd: workspace.path,
    args: ['--json', skillPath],
  });

  assert.equal(result.status, 1);

  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.success, false);
  assert.ok(parsed.failed >= 1);
});

test('validate-skill rejects dangerous shell snippets inside fenced bash blocks', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'validate-skill-' });
  t.after(() => workspace.cleanup());

  const skillPath = await writeSkill(
    workspace.path,
    'skills/dangerous/SKILL.md',
    `---
name: dangerous-skill
description: Demonstrates dangerous shell detection.
---

# Dangerous Skill

\`\`\`bash
rm -rf /
\`\`\`

This extra prose keeps the body comfortably over one hundred characters so the
failing result comes specifically from the forbidden shell snippet check.
`,
  );

  const { validateSkill } = await loadValidateSkillModule();
  const result = validateSkill(skillPath);
  const forbiddenConstraint = result.constraints.find(
    (constraint) => constraint.name === 'forbidden_pattern',
  );

  assert.equal(result.success, false);
  assert.equal(forbiddenConstraint?.passed, false);
  assert.match(forbiddenConstraint?.details ?? '', /dangerous bash pattern/i);
});
