import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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

function gitAdd(dir, file) {
  execFileSync('git', ['add', file], { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
}

describe('docs-drift-check', () => {
  let tmpDir;
  let analyzeDocsDrift, runDocsDriftCheck;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-docs-drift-'));
    const mod = await import('../../src/harness/docs-drift-check.mjs');
    analyzeDocsDrift = mod.analyzeDocsDrift;
    runDocsDriftCheck = mod.runDocsDriftCheck;
  });

  after(() => rm(tmpDir, { recursive: true, force: true }));

  describe('analyzeDocsDrift', () => {
    it('returns the expected report structure', async () => {
      const dir = path.join(tmpDir, 'clean-structure');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await analyzeDocsDrift({ repoRoot: dir });

      assert.ok(typeof result.repo_root === 'string', 'repo_root should be string');
      assert.ok(typeof result.files_checked === 'number', 'files_checked should be number');
      assert.ok(Array.isArray(result.findings), 'findings should be array');
      assert.ok(Array.isArray(result.scanned_files), 'scanned_files should be array');
      assert.ok(typeof result.score === 'number', 'score should be number');
      assert.ok(typeof result.summary === 'object', 'summary should be object');
      assert.ok(typeof result.summary.errors === 'number', 'summary.errors should be number');
      assert.ok(typeof result.summary.warnings === 'number', 'summary.warnings should be number');
    });

    it('score is 100 on empty repo with no markdown', async () => {
      const dir = path.join(tmpDir, 'empty');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const result = await analyzeDocsDrift({ repoRoot: dir });
      assert.equal(result.score, 100);
      assert.equal(result.findings.length, 0);
    });

    it('returns clean result for AGENTS.md with no links', async () => {
      const dir = path.join(tmpDir, 'clean-agents');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(path.join(dir, 'AGENTS.md'), '# Agents\n\nNo links here.\n');
      gitAdd(dir, 'AGENTS.md');

      const result = await analyzeDocsDrift({ repoRoot: dir });
      assert.equal(result.findings.length, 0);
      assert.equal(result.score, 100);
    });

    it('detects a broken markdown link in AGENTS.md', async () => {
      const dir = path.join(tmpDir, 'broken-link');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(
        path.join(dir, 'AGENTS.md'),
        '# Agents\n\nSee [missing file](docs/nonexistent.md) for details.\n',
      );
      gitAdd(dir, 'AGENTS.md');

      const result = await analyzeDocsDrift({ repoRoot: dir });
      const brokenLinks = result.findings.filter((f) => f.code === 'BROKEN_LINK');
      assert.ok(brokenLinks.length > 0, 'should find at least one BROKEN_LINK');
      assert.equal(brokenLinks[0].file, 'AGENTS.md');
      assert.ok(brokenLinks[0].message.includes('nonexistent.md'), 'message should name the missing file');
    });

    it('broken link reduces the score below 100', async () => {
      const dir = path.join(tmpDir, 'broken-score');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      await writeFile(
        path.join(dir, 'AGENTS.md'),
        '# Agents\n\nSee [gone](docs/gone.md).\n',
      );
      gitAdd(dir, 'AGENTS.md');

      const result = await analyzeDocsDrift({ repoRoot: dir });
      assert.ok(result.score < 100, 'score should be below 100 when errors exist');
    });

    it('detects oversized SKILL.md (over 800 lines)', async () => {
      const dir = path.join(tmpDir, 'oversized-skill');
      const skillDir = path.join(dir, '.agents', 'skills', 'big-skill');
      await mkdir(skillDir, { recursive: true });
      gitInit(dir);

      const bigContent = Array.from({ length: 850 }, (_, i) => `line ${i + 1}`).join('\n');
      await writeFile(path.join(skillDir, 'SKILL.md'), bigContent);
      gitAdd(dir, path.join('.agents', 'skills', 'big-skill', 'SKILL.md'));

      const result = await analyzeDocsDrift({ repoRoot: dir });
      const sizeWarnings = result.findings.filter((f) => f.code === 'OVERSIZED_SKILL');
      assert.ok(sizeWarnings.length > 0, 'should flag oversized SKILL.md');
      assert.equal(sizeWarnings[0].severity, 'warning');
    });

    it('does not flag a SKILL.md at exactly the line limit', async () => {
      const dir = path.join(tmpDir, 'exact-limit-skill');
      const skillDir = path.join(dir, '.agents', 'skills', 'ok-skill');
      await mkdir(skillDir, { recursive: true });
      gitInit(dir);

      const content = Array.from({ length: 800 }, (_, i) => `line ${i + 1}`).join('\n');
      await writeFile(path.join(skillDir, 'SKILL.md'), content);
      gitAdd(dir, path.join('.agents', 'skills', 'ok-skill', 'SKILL.md'));

      const result = await analyzeDocsDrift({ repoRoot: dir });
      const sizeWarnings = result.findings.filter((f) => f.code === 'OVERSIZED_SKILL');
      assert.equal(sizeWarnings.length, 0, 'should not flag SKILL.md at exactly 800 lines');
    });

    it('scans only specified files when files option is provided', async () => {
      const dir = path.join(tmpDir, 'files-filter');
      const docsDir = path.join(dir, 'docs');
      await mkdir(docsDir, { recursive: true });
      gitInit(dir);

      await writeFile(path.join(dir, 'AGENTS.md'), '# ok\n');
      await writeFile(path.join(docsDir, 'page.md'), 'See [broken](missing.md).\n');
      gitAdd(dir, 'AGENTS.md');
      gitAdd(dir, path.join('docs', 'page.md'));

      // Scan only AGENTS.md — broken link in docs/page.md should not appear
      const result = await analyzeDocsDrift({ repoRoot: dir, files: ['AGENTS.md'] });
      assert.equal(result.files_checked, 1);
      assert.equal(result.scanned_files[0], 'AGENTS.md');
      const brokenFromDocs = result.findings.filter((f) => f.file === 'docs/page.md');
      assert.equal(brokenFromDocs.length, 0, 'should not scan docs/page.md when not in files list');
    });
  });

  describe('runDocsDriftCheck (alias)', () => {
    it('returns the same structure as analyzeDocsDrift', async () => {
      const dir = path.join(tmpDir, 'alias-check');
      await mkdir(dir, { recursive: true });
      gitInit(dir);

      const direct = await analyzeDocsDrift({ repoRoot: dir });
      const alias = await runDocsDriftCheck(dir);
      assert.equal(alias.score, direct.score);
      assert.equal(alias.files_checked, direct.files_checked);
      assert.ok(Array.isArray(alias.findings));
    });
  });
});
