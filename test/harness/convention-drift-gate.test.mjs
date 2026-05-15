import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function gitInit(dir) {
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
}

describe('convention-drift-gate', () => {
  let tmpDir;
  let analyzeConventionDriftGate, runConventionDriftCheck;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-drift-gate-'));
    const mod = await import('../../src/harness/convention-drift-gate.mjs');
    analyzeConventionDriftGate = mod.analyzeConventionDriftGate;
    runConventionDriftCheck = mod.runConventionDriftCheck;
  });

  after(() => rm(tmpDir, { recursive: true, force: true }));

  describe('analyzeConventionDriftGate', () => {
    it('returns expected structure', async () => {
      const dir = path.join(tmpDir, 'structure');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await analyzeConventionDriftGate({ repoRoot: dir, changedFiles: [] });

      assert.ok(typeof result.repoRoot === 'string', 'repoRoot should be string');
      assert.ok(typeof result.baseRef === 'string', 'baseRef should be string');
      assert.ok(Array.isArray(result.changedFiles), 'changedFiles should be array');
      assert.ok(Array.isArray(result.findings), 'findings should be array');
      assert.ok(Array.isArray(result.warnings), 'warnings should be array');
    });

    it('empty changedFiles list produces no findings', async () => {
      const dir = path.join(tmpDir, 'empty-changed');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await analyzeConventionDriftGate({ repoRoot: dir, changedFiles: [] });
      assert.equal(result.findings.length, 0);
      assert.equal(result.changedFiles.length, 0);
    });

    it('ignores non-markdown changed files', async () => {
      const dir = path.join(tmpDir, 'non-markdown');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(path.join(dir, 'index.mjs'), 'export const x = 1;\n');

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['index.mjs'],
      });
      assert.equal(result.findings.length, 0, 'non-markdown files should produce no findings');
    });

    it('ignores .ts and .json changed files', async () => {
      const dir = path.join(tmpDir, 'non-md-files');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(path.join(dir, 'types.ts'), 'export type X = string;\n');
      await writeFile(path.join(dir, 'config.json'), '{}');

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['types.ts', 'config.json'],
      });
      assert.equal(result.findings.length, 0, 'non-markdown files should be skipped');
    });

    it('detects broken markdown link in a changed AGENTS.md', async () => {
      const dir = path.join(tmpDir, 'broken-link');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(
        path.join(dir, 'AGENTS.md'),
        '# Agents\n\nSee [missing](docs/gone.md) for details.\n',
      );

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['AGENTS.md'],
      });
      assert.ok(result.findings.length > 0, 'should report at least one finding');
      assert.ok(
        result.findings.some((f) => f.file === 'AGENTS.md'),
        'finding should reference AGENTS.md',
      );
    });

    it('detects broken link in a changed docs markdown file', async () => {
      const dir = path.join(tmpDir, 'broken-docs-link');
      const docsDir = path.join(dir, 'docs');
      await mkdir(docsDir, { recursive: true });
      gitInit(dir);

      await writeFile(
        path.join(docsDir, 'guide.md'),
        '# Guide\n\nSee [broken](../src/nonexistent.mjs).\n',
      );

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['docs/guide.md'],
      });
      assert.ok(result.findings.length > 0, 'should flag broken link in docs/guide.md');
      assert.ok(
        result.findings.some((f) => f.file === 'docs/guide.md'),
        'finding should reference docs/guide.md',
      );
    });

    it('detects oversized SKILL.md in changed files', async () => {
      const dir = path.join(tmpDir, 'oversized-skill');
      const skillDir = path.join(dir, '.agents', 'skills', 'big-skill');
      await mkdir(skillDir, { recursive: true });
      gitInit(dir);

      const bigContent = Array.from({ length: 850 }, (_, i) => `line ${i + 1}`).join('\n');
      await writeFile(path.join(skillDir, 'SKILL.md'), bigContent);

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['.agents/skills/big-skill/SKILL.md'],
      });
      assert.ok(result.findings.length > 0, 'should flag oversized SKILL.md');
      assert.equal(result.findings[0].check, 'Oversized skill files');
      assert.equal(result.findings[0].severity, 'warning');
    });

    it('does not flag SKILL.md at exactly the line limit', async () => {
      const dir = path.join(tmpDir, 'limit-skill');
      const skillDir = path.join(dir, '.agents', 'skills', 'ok-skill');
      await mkdir(skillDir, { recursive: true });
      gitInit(dir);

      const content = Array.from({ length: 800 }, (_, i) => `line ${i + 1}`).join('\n');
      await writeFile(path.join(skillDir, 'SKILL.md'), content);

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['.agents/skills/ok-skill/SKILL.md'],
      });
      const sizeFindings = result.findings.filter((f) => f.check === 'Oversized skill files');
      assert.equal(sizeFindings.length, 0, 'should not flag SKILL.md at exactly 800 lines');
    });

    it('only processes the files in changedFiles, not all repo files', async () => {
      const dir = path.join(tmpDir, 'scope-guard');
      const docsDir = path.join(dir, 'docs');
      await mkdir(docsDir, { recursive: true });
      gitInit(dir);

      // Both files have broken links, but only one is in changedFiles
      await writeFile(path.join(dir, 'AGENTS.md'), '# ok\n[gone](docs/missing-a.md)\n');
      await writeFile(path.join(docsDir, 'page.md'), '# ok\n[gone](missing-b.md)\n');

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['AGENTS.md'],
      });

      const fromPage = result.findings.filter((f) => f.file === 'docs/page.md');
      assert.equal(fromPage.length, 0, 'findings for docs/page.md should not appear');
    });

    it('handles duplicate changedFiles entries without errors', async () => {
      const dir = path.join(tmpDir, 'dedupe');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(path.join(dir, 'AGENTS.md'), '# ok\n');

      // Should not throw; exact dedup count depends on normalization order
      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['AGENTS.md', 'AGENTS.md', './AGENTS.md'],
      });
      assert.ok(Array.isArray(result.findings), 'findings should be an array');
      assert.ok(result.changedFiles.length <= 3, 'deduplicated entries should not exceed input size');
    });

    it('flags missing skills symlink as error', async () => {
      const dir = path.join(tmpDir, 'symlink-missing');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await analyzeConventionDriftGate({ repoRoot: dir, changedFiles: ['skills'] });
      const finding = result.findings.find(
        (f) => f.check === 'Skills canonical location — symlinks intact',
      );
      assert.ok(finding, 'Expected a symlink finding for missing skills path');
      assert.equal(finding.severity, 'error');
      assert.ok(finding.found.toLowerCase().includes('missing'));
    });

    it('flags real directory instead of skills symlink', async () => {
      const dir = path.join(tmpDir, 'symlink-realdir');
      await mkdir(dir, { recursive: true });
      gitInit(dir);
      await mkdir(path.join(dir, 'skills'), { recursive: true });

      const result = await analyzeConventionDriftGate({ repoRoot: dir, changedFiles: ['skills'] });
      const finding = result.findings.find(
        (f) => f.check === 'Skills canonical location — symlinks intact',
      );
      assert.ok(finding, 'Expected a symlink finding when skills is a real directory');
      assert.equal(finding.severity, 'error');
    });

    it('flags skills symlink pointing at wrong target', async () => {
      const dir = path.join(tmpDir, 'symlink-wrong');
      await mkdir(dir, { recursive: true });
      gitInit(dir);
      await symlink('wrong-target', path.join(dir, 'skills'));

      const result = await analyzeConventionDriftGate({ repoRoot: dir, changedFiles: ['skills'] });
      const finding = result.findings.find(
        (f) => f.check === 'Skills canonical location — symlinks intact',
      );
      assert.ok(finding, 'Expected a finding for wrong symlink target');
      assert.equal(finding.severity, 'error');
      assert.equal(finding.found, 'wrong-target');
    });

    it('does not flag skills symlink pointing at correct target', async () => {
      const dir = path.join(tmpDir, 'symlink-correct');
      await mkdir(dir, { recursive: true });
      gitInit(dir);
      await mkdir(path.join(dir, '.agents', 'skills'), { recursive: true });
      await symlink('.agents/skills', path.join(dir, 'skills'));

      const result = await analyzeConventionDriftGate({ repoRoot: dir, changedFiles: ['skills'] });
      const finding = result.findings.find(
        (f) => f.check === 'Skills canonical location — symlinks intact',
      );
      assert.equal(finding, undefined, 'Should not flag a correctly pointed symlink');
    });

    it('adds warning for NEEDS REVIEW marker in changed file', async () => {
      const dir = path.join(tmpDir, 'needs-review');
      await mkdir(dir, { recursive: true });
      gitInit(dir);
      await writeFile(
        path.join(dir, 'AGENTS.md'),
        '# Guide\n\n<!-- NEEDS REVIEW: check this section -->\n\nSome content.\n',
      );

      const result = await analyzeConventionDriftGate({
        repoRoot: dir,
        changedFiles: ['AGENTS.md'],
      });
      const warning = result.warnings.find((w) => w.check === 'Manual review marker');
      assert.ok(warning, 'Expected a NEEDS REVIEW warning');
      assert.equal(warning.file, 'AGENTS.md');
      // A NEEDS REVIEW marker is a warning, not an error finding
      const errorFinding = result.findings.find((f) => f.file === 'AGENTS.md');
      assert.equal(errorFinding, undefined, 'NEEDS REVIEW should not produce an error finding');
    });
  });

  describe('runConventionDriftCheck (alias)', () => {
    it('returns score, summary, violations, and full result fields', async () => {
      const dir = path.join(tmpDir, 'alias');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await runConventionDriftCheck(dir, { changedFiles: [] });

      assert.ok(typeof result.score === 'number', 'score should be number');
      assert.ok(typeof result.summary === 'string', 'summary should be string');
      assert.ok(Array.isArray(result.violations), 'violations should be array');
      assert.ok(Array.isArray(result.findings), 'findings should be array');
    });

    it('score is 100 with no changed files', async () => {
      const dir = path.join(tmpDir, 'alias-score');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await runConventionDriftCheck(dir, { changedFiles: [] });
      assert.equal(result.score, 100);
    });

    it('score drops below 100 when errors are found', async () => {
      const dir = path.join(tmpDir, 'alias-score-drop');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(path.join(dir, 'AGENTS.md'), '[gone](docs/nope.md)\n');

      const result = await runConventionDriftCheck(dir, { changedFiles: ['AGENTS.md'] });
      assert.ok(result.score < 100, 'score should drop when errors exist');
    });
  });
});
