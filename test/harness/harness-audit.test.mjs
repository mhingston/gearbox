import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('harness-audit', () => {
  let tmpDir;
  let runHealthCheck, runPreflightAudit;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-audit-'));
    const mod = await import('../../src/harness/harness-audit.mjs');
    runHealthCheck = mod.runHealthCheck;
    runPreflightAudit = mod.runPreflightAudit;
  });

  after(() => rm(tmpDir, { recursive: true, force: true }));

  async function writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  describe('runHealthCheck', () => {
    it('returns a health result with score and categories', async () => {
      const result = await runHealthCheck(tmpDir);
      assert.ok(typeof result.score === 'number', 'score should be a number');
      assert.ok(typeof result.max_score === 'number', 'max_score should be a number');
      assert.ok(typeof result.pass === 'boolean', 'pass should be boolean');
      assert.ok(result.categories, 'categories should be present');
      assert.ok(result.categories.hooks, 'hooks category expected');
      assert.ok(result.categories.adapters, 'adapters category expected');
      assert.ok(result.categories.skills, 'skills category expected');
      assert.ok(result.categories.security, 'security category expected');
      assert.ok(result.categories.runtime, 'runtime category expected');
    });

    it('returns advisory subsystems alongside install-health categories', async () => {
      const root = path.join(tmpDir, 'subsystems-shape');
      await mkdir(root, { recursive: true });
      const result = await runHealthCheck(root);
      assert.ok(result.subsystems, 'subsystems should be present');
      for (const name of ['instructions', 'state', 'verification', 'scope', 'lifecycle']) {
        const subsystem = result.subsystems[name];
        assert.ok(subsystem, `${name} subsystem expected`);
        assert.ok(typeof subsystem.score === 'number', `${name}.score should be number`);
        assert.ok(typeof subsystem.max === 'number', `${name}.max should be number`);
        assert.ok(Array.isArray(subsystem.checks), `${name}.checks should be array`);
      }
    });

    it('score is between 0 and 100', async () => {
      const result = await runHealthCheck(tmpDir);
      assert.ok(result.score >= 0);
      assert.ok(result.score <= 100);
      assert.equal(result.max_score, 100);
    });

    it('main health score still sums only install-health categories', async () => {
      const root = path.join(tmpDir, 'subsystems-do-not-change-main-score');
      await mkdir(root, { recursive: true });
      const result = await runHealthCheck(root);
      const categoryScore = Object.values(result.categories).reduce((sum, category) => sum + category.score, 0);
      const categoryMax = Object.values(result.categories).reduce((sum, category) => sum + category.max, 0);
      assert.equal(result.score, categoryScore);
      assert.equal(result.max_score, categoryMax);
    });

    it('hooks score is 30 when all hook files are present', async () => {
      const hooksDir = path.join(tmpDir, 'hooks-full', '.gearbox', 'hooks');
      await mkdir(hooksDir, { recursive: true });
      const hookFiles = [
        'self-learning.mjs',
        'markdown-eval.mjs',
        'policy-guard.mjs',
        'context-compact.mjs',
        'event-log.mjs',
        'session-checkpoint.mjs',
        path.join('prompts', 'consolidate-memory.md'),
      ];
      for (const file of hookFiles) {
        await mkdir(path.dirname(path.join(hooksDir, file)), { recursive: true });
        await writeFile(path.join(hooksDir, file), '// hook');
      }
      const result = await runHealthCheck(path.join(tmpDir, 'hooks-full'));
      assert.equal(result.categories.hooks.score, 30);
      assert.equal(result.categories.hooks.max, 30);
    });

    it('hooks score is 0 when hook directory is missing', async () => {
      const emptyDir = path.join(tmpDir, 'no-hooks');
      await mkdir(emptyDir, { recursive: true });
      const result = await runHealthCheck(emptyDir);
      assert.equal(result.categories.hooks.score, 0);
    });

    it('adapters score is 20 when a platform adapter config exists', async () => {
      const adapterRoot = path.join(tmpDir, 'with-adapter');
      const ghDir = path.join(adapterRoot, '.github', 'copilot');
      await mkdir(ghDir, { recursive: true });
      await writeFile(path.join(ghDir, 'hooks.json'), '{}');
      const result = await runHealthCheck(adapterRoot);
      assert.equal(result.categories.adapters.score, 20);
    });

    it('skills score is 20 when at least one SKILL.md exists', async () => {
      const skillRoot = path.join(tmpDir, 'with-skills');
      const skillDir = path.join(skillRoot, '.agents', 'skills', 'my-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill');
      const result = await runHealthCheck(skillRoot);
      assert.equal(result.categories.skills.score, 20);
    });

    it('each category has score, max, and checks array', async () => {
      const result = await runHealthCheck(tmpDir);
      for (const [name, cat] of Object.entries(result.categories)) {
        assert.ok(typeof cat.score === 'number', `${name}.score should be number`);
        assert.ok(typeof cat.max === 'number', `${name}.max should be number`);
        assert.ok(Array.isArray(cat.checks), `${name}.checks should be array`);
      }
    });

    it('instructions subsystem scores durable memory routing files and AGENTS links', async () => {
      const root = path.join(tmpDir, 'instructions-subsystem');
      await mkdir(path.join(root, 'docs', 'agents'), { recursive: true });
      await mkdir(path.join(root, '.github', 'agents'), { recursive: true });
      await writeFile(
        path.join(root, 'AGENTS.md'),
        [
          '# Project',
          '',
          '## Gearbox harness',
          '',
          '- [durable learning guide](docs/agents/learning-guide.md)',
          '- [decisions log](.github/agents/decisions.md)',
          '- [user directives](.github/agents/user-directives.md)',
          '',
        ].join('\n'),
      );
      await writeFile(path.join(root, 'docs', 'agents', 'learning-guide.md'), '# Learning guide\n');
      await writeFile(path.join(root, '.github', 'agents', 'decisions.md'), '# Decisions\n');
      await writeFile(path.join(root, '.github', 'agents', 'user-directives.md'), '# User directives\n');

      const result = await runHealthCheck(root);
      assert.equal(result.subsystems.instructions.score, 5);
      assert.equal(result.subsystems.instructions.max, 5);
    });

    it('state subsystem scores session continuity scaffolding', async () => {
      const root = path.join(tmpDir, 'state-subsystem');
      await mkdir(path.join(root, 'docs', 'agents'), { recursive: true });
      await writeFile(path.join(root, 'docs', 'agents', 'progress.md'), '# Progress\n');
      await writeFile(path.join(root, 'docs', 'agents', 'session-handoff.md'), '# Handoff\n');
      await writeFile(path.join(root, 'docs', 'agents', 'clean-state-checklist.md'), '# Checklist\n');

      const result = await runHealthCheck(root);
      assert.equal(result.subsystems.state.score, 3);
      assert.equal(result.subsystems.state.max, 3);
    });

    it('verification subsystem scores gearbox package scripts', async () => {
      const root = path.join(tmpDir, 'verification-subsystem');
      await mkdir(root, { recursive: true });
      await writeJson(path.join(root, 'package.json'), {
        name: 'fixture',
        scripts: {
          'gearbox:health': 'node .gearbox/scripts/harness-audit.mjs health',
          'gearbox:audit': 'node .gearbox/scripts/harness-audit.mjs preflight',
          'gearbox:check-docs': 'node .gearbox/scripts/docs-drift-check.mjs',
        },
      });

      const result = await runHealthCheck(root);
      assert.equal(result.subsystems.verification.score, 3);
      assert.equal(result.subsystems.verification.max, 3);
    });

    it('verification subsystem handles invalid package.json gracefully', async () => {
      const root = path.join(tmpDir, 'verification-invalid-package-json');
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, 'package.json'), '{ invalid json\n');

      const result = await runHealthCheck(root);
      assert.equal(result.subsystems.verification.score, 0);
      assert.match(result.subsystems.verification.checks.join('\n'), /invalid package\.json/i);
    });

    it('scope subsystem scores core planning and verification skills', async () => {
      const root = path.join(tmpDir, 'scope-subsystem');
      for (const skill of [
        'brainstorming',
        'writing-plans',
        'test-driven-development',
        'verification-before-completion',
      ]) {
        const skillDir = path.join(root, '.agents', 'skills', skill);
        await mkdir(skillDir, { recursive: true });
        await writeFile(path.join(skillDir, 'SKILL.md'), `# ${skill}\n`);
      }

      const result = await runHealthCheck(root);
      assert.equal(result.subsystems.scope.score, 4);
      assert.equal(result.subsystems.scope.max, 4);
    });

    it('lifecycle subsystem scores generated runtime artifacts', async () => {
      const root = path.join(tmpDir, 'lifecycle-subsystem');
      const runtimeDir = path.join(root, '.gearbox', 'hooks', '.runtime');
      await mkdir(path.join(runtimeDir, 'records'), { recursive: true });
      await writeJson(path.join(runtimeDir, 'current-checkpoint.json'), { goal: 'Ship feature' });
      await writeFile(path.join(runtimeDir, 'latest-eval.md'), '# Latest eval\n');
      await writeFile(path.join(runtimeDir, 'last-session.md'), '# Last session\n');
      await writeJson(path.join(runtimeDir, 'records', 'record-1.json'), { status: 'success' });

      const result = await runHealthCheck(root);
      assert.equal(result.subsystems.lifecycle.score, 4);
      assert.equal(result.subsystems.lifecycle.max, 4);
    });
  });

  describe('runPreflightAudit', () => {
    it('returns ok, checks array, and failed_check', async () => {
      const result = await runPreflightAudit({ root: tmpDir });
      assert.ok(typeof result.ok === 'boolean');
      assert.ok(Array.isArray(result.checks));
      // failed_check is null or an object
      assert.ok(result.failed_check === null || typeof result.failed_check === 'object');
    });

    it('each check has id, ok, and message', async () => {
      const result = await runPreflightAudit({ root: tmpDir });
      for (const check of result.checks) {
        assert.ok(typeof check.id === 'string', 'check.id should be string');
        assert.ok(typeof check.ok === 'boolean', 'check.ok should be boolean');
        assert.ok(typeof check.message === 'string', 'check.message should be string');
      }
    });

    it('node_version check is present', async () => {
      const result = await runPreflightAudit({ root: tmpDir });
      const nodeCheck = result.checks.find(c => c.id === 'node_version');
      assert.ok(nodeCheck, 'node_version check should be present');
    });

    it('gitleaks_installed check is present', async () => {
      const result = await runPreflightAudit({ root: tmpDir });
      const glCheck = result.checks.find(c => c.id === 'gitleaks_installed');
      assert.ok(glCheck, 'gitleaks_installed check should be present');
    });

    it('branch_isolated check is present', async () => {
      const result = await runPreflightAudit({ root: tmpDir });
      const branchCheck = result.checks.find(c => c.id === 'branch_isolated');
      assert.ok(branchCheck, 'branch_isolated check should be present');
    });

    it('overall ok is false when any check fails', async () => {
      // We can force a branch check failure by using a fake git repo on main
      const fakeRoot = path.join(tmpDir, 'fake-main');
      await mkdir(path.join(fakeRoot, '.git'), { recursive: true });
      await writeFile(path.join(fakeRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      const result = await runPreflightAudit({ root: fakeRoot });
      const branchCheck = result.checks.find(c => c.id === 'branch_isolated');
      assert.equal(branchCheck.ok, false);
      assert.equal(result.ok, false);
      // failed_check is whichever check fails first (environment-dependent, e.g. gitleaks may not be installed in CI)
      assert.ok(result.failed_check, 'failed_check should be set');
      assert.equal(result.failed_check.ok, false);
    });
  });
});
