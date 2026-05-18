import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(__dirname, '../../src/workflows');

const EXPECTED_WORKFLOWS = [
  'pr-retrospective',
  'convention-drift',
  'docs-freshness',
  'decisions-hygiene',
  'ci-health',
  'consolidate-memory',
  'daily-workflow-updater',
];

test('src/workflows contains exactly 14 files (7 .md + 7 .lock.yml)', () => {
  const files = readdirSync(workflowsDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));
  const lockFiles = files.filter(f => f.endsWith('.lock.yml'));
  assert.equal(files.length, 14, `Expected 14 files, got ${files.length}: ${files.join(', ')}`);
  assert.equal(mdFiles.length, 7, `Expected 7 .md files, got: ${mdFiles.join(', ')}`);
  assert.equal(lockFiles.length, 7, `Expected 7 .lock.yml files, got: ${lockFiles.join(', ')}`);
});

test('every .md file has valid YAML frontmatter between --- delimiters', () => {
  for (const name of EXPECTED_WORKFLOWS) {
    const content = readFileSync(join(workflowsDir, `${name}.md`), 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(match, `${name}.md is missing valid YAML frontmatter (--- delimiters)`);
  }
});

test('every .md file has an "on:" trigger in its frontmatter', () => {
  for (const name of EXPECTED_WORKFLOWS) {
    const content = readFileSync(join(workflowsDir, `${name}.md`), 'utf8');
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(match, `${name}.md missing frontmatter`);
    const frontmatter = match[1];
    assert.ok(
      frontmatter.startsWith('on:') || frontmatter.includes('\non:'),
      `${name}.md frontmatter missing "on:" trigger. Frontmatter:\n${frontmatter}`
    );
  }
});

test('every .lock.yml file is structurally valid (gh-aw metadata + name + jobs)', () => {
  for (const name of EXPECTED_WORKFLOWS) {
    const content = readFileSync(join(workflowsDir, `${name}.lock.yml`), 'utf8');
    assert.ok(
      content.includes('gh-aw-metadata:') || content.includes('# gh-aw-'),
      `${name}.lock.yml missing gh-aw metadata marker`
    );
    assert.ok(content.includes('name:'), `${name}.lock.yml missing "name:" field`);
    assert.ok(content.includes('jobs:'), `${name}.lock.yml missing "jobs:" field`);
  }
});

test('pr-retrospective.md body contains Learnings and Patterns sections', () => {
  const content = readFileSync(join(workflowsDir, 'pr-retrospective.md'), 'utf8');
  assert.ok(content.includes('Learnings'), 'pr-retrospective.md missing "Learnings" section');
  assert.ok(content.includes('Patterns'), 'pr-retrospective.md missing "Patterns" section');
});

test('ci-health.md does not hardcode workflow .yml filenames in a table', () => {
  const content = readFileSync(join(workflowsDir, 'ci-health.md'), 'utf8');
  const hardcodedPattern = /\|\s*`[^`]*\.yml`/;
  assert.ok(
    !hardcodedPattern.test(content),
    'ci-health.md appears to hardcode a .yml workflow filename in a table cell'
  );
});

test('consolidate-memory.md references the installed gearbox prompt asset', () => {
  const content = readFileSync(join(workflowsDir, 'consolidate-memory.md'), 'utf8');
  assert.match(content, /\.gearbox\/hooks\/prompts\/consolidate-memory\.md/);
});
