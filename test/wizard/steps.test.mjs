import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { installHooks } from '../../src/wizard/steps/install-hooks.mjs';
import { installHarness } from '../../src/wizard/steps/install-harness.mjs';
import { installSkills } from '../../src/wizard/steps/install-skills.mjs';
import { installWorkflows } from '../../src/wizard/steps/install-workflows.mjs';
import { installAdapters } from '../../src/wizard/steps/install-adapters.mjs';
import { generateAgentsMd } from '../../src/wizard/steps/generate-agents-md.mjs';
import { updatePackageJson } from '../../src/wizard/steps/update-package-json.mjs';

// Helper to create a fresh temp dir for each test group
async function makeTmp() {
  return mkdtemp(path.join(os.tmpdir(), 'gearbox-test-'));
}

describe('wizard step: installHooks', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('dry-run returns paths without writing files', async () => {
    const { written, skipped } = await installHooks({ cwd: tmpDir, dryRun: true });
    assert.ok(written.length > 0, 'Expected some paths in written');
    assert.ok(written.every(p => p.startsWith('.gearbox/hooks/')), 'All paths should be under .gearbox/hooks/');
    // No files should be created
    assert.equal(existsSync(path.join(tmpDir, '.gearbox')), false, 'Should not create directory in dry-run');
  });

  it('actual run creates hook files in .gearbox/hooks/', async () => {
    const { written, skipped } = await installHooks({ cwd: tmpDir });
    assert.ok(written.length > 0, 'Expected files to be written');
    // Verify at least one file actually exists
    const firstFile = path.join(tmpDir, written[0]);
    assert.ok(existsSync(firstFile), `Expected file to exist: ${written[0]}`);
  });

  it('second run skips already-existing files', async () => {
    const { written, skipped } = await installHooks({ cwd: tmpDir });
    assert.equal(written.length, 0, 'Should write nothing on second run');
    assert.ok(skipped.length > 0, 'Should skip existing files');
  });
});

describe('wizard step: installHarness', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('dry-run returns paths without writing', async () => {
    const { written, skipped } = await installHarness({ cwd: tmpDir, dryRun: true });
    assert.ok(written.length > 0, 'Expected some paths');
    assert.equal(existsSync(path.join(tmpDir, '.gearbox')), false);
  });

  it('actual run creates .gearbox/scripts/ files', async () => {
    const { written } = await installHarness({ cwd: tmpDir });
    assert.ok(written.length > 0);
    const scriptsExist = existsSync(path.join(tmpDir, '.gearbox', 'scripts'));
    assert.ok(scriptsExist, 'Expected .gearbox/scripts/ to be created');
  });

  it('includes harness-config.json at .gearbox/harness-config.json', async () => {
    const configPath = path.join(tmpDir, '.gearbox', 'harness-config.json');
    assert.ok(existsSync(configPath), 'Expected harness-config.json to exist');
  });

  it('second run skips existing files', async () => {
    const { written, skipped } = await installHarness({ cwd: tmpDir });
    assert.equal(written.length, 0);
    assert.ok(skipped.length > 0);
  });
});

describe('wizard step: installSkills', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('dry-run with selectedSkills brainstorming returns brainstorming paths only', async () => {
    const { written } = await installSkills({
      cwd: tmpDir,
      selectedSkills: ['brainstorming'],
      dryRun: true,
    });
    assert.ok(written.length > 0, 'Expected paths for brainstorming');
    assert.ok(written.every(p => p.includes('brainstorming')), 'All paths should include brainstorming');
    assert.equal(existsSync(path.join(tmpDir, '.agents')), false);
  });

  it('actual run installs brainstorming skill files', async () => {
    const { written } = await installSkills({
      cwd: tmpDir,
      selectedSkills: ['brainstorming'],
    });
    assert.ok(written.length > 0);
    assert.ok(existsSync(path.join(tmpDir, '.agents', 'skills', 'brainstorming')));
  });

  it('selectedSkills=all installs all 33 skills in dry-run', async () => {
    const freshDir = await makeTmp();
    try {
      const { written } = await installSkills({
        cwd: freshDir,
        selectedSkills: 'all',
        dryRun: true,
      });
      // Should have files from all 33 skills
      const skillDirs = new Set(written.map(p => p.split('/')[2]));
      assert.ok(skillDirs.size === 33, `Expected 33 skill dirs, got ${skillDirs.size}`);
    } finally {
      await rm(freshDir, { recursive: true, force: true });
    }
  });

  it('custom skillsDir is respected', async () => {
    const { written } = await installSkills({
      cwd: tmpDir,
      skillsDir: '.github/skills',
      selectedSkills: ['brainstorming'],
      dryRun: true,
    });
    assert.ok(written.every(p => p.startsWith('.github/skills/')), 'Expected .github/skills prefix');
  });
});

describe('wizard step: installWorkflows', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('dry-run with convention-drift returns 2 paths (.md + .lock.yml)', async () => {
    const { written } = await installWorkflows({
      cwd: tmpDir,
      selectedWorkflows: ['convention-drift'],
      dryRun: true,
    });
    assert.equal(written.length, 2, `Expected 2 paths, got ${written.length}: ${written.join(', ')}`);
    assert.ok(written.some(p => p.endsWith('.md')), 'Expected a .md file');
    assert.ok(written.some(p => p.endsWith('.lock.yml')), 'Expected a .lock.yml file');
  });

  it('dry-run with empty selectedWorkflows installs all workflows', async () => {
    const { written } = await installWorkflows({
      cwd: tmpDir,
      selectedWorkflows: [],
      dryRun: true,
    });
    // 7 workflows × 2 files = 14
    assert.equal(written.length, 14, `Expected 14 paths, got ${written.length}`);
  });

  it('actual run creates workflow files in .github/workflows/', async () => {
    const { written } = await installWorkflows({
      cwd: tmpDir,
      selectedWorkflows: ['convention-drift'],
    });
    assert.equal(written.length, 2);
    for (const rel of written) {
      assert.ok(existsSync(path.join(tmpDir, rel)), `Expected file: ${rel}`);
    }
  });

  it('workflow files are prefixed with gearbox-', async () => {
    const { written } = await installWorkflows({
      cwd: tmpDir,
      selectedWorkflows: ['pr-retrospective'],
      dryRun: true,
    });
    assert.ok(written.every(p => path.basename(p).startsWith('gearbox-')), 'Expected gearbox- prefix');
  });
});

describe('wizard step: installAdapters', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('platforms=copilot writes .github/copilot/hooks.json', async () => {
    const { written, warnings } = await installAdapters({
      cwd: tmpDir,
      platforms: ['copilot'],
    });
    assert.ok(written.includes('.github/copilot/hooks.json'), `Expected hooks.json in written: ${written}`);
    assert.ok(existsSync(path.join(tmpDir, '.github', 'copilot', 'hooks.json')));
  });

  it('dry-run does not write files', async () => {
    const tmpDir2 = await makeTmp();
    try {
      const { written } = await installAdapters({
        cwd: tmpDir2,
        platforms: ['copilot'],
        dryRun: true,
      });
      assert.ok(written.length > 0, 'Expected paths in written');
      assert.equal(existsSync(path.join(tmpDir2, '.github')), false, 'Should not create .github in dry-run');
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });

  it('second run skips already-existing files', async () => {
    const { written, skipped } = await installAdapters({ cwd: tmpDir, platforms: ['copilot'] });
    assert.equal(written.length, 0, 'Should write nothing on second run');
    assert.ok(skipped.length > 0, 'Should skip existing adapter files');
  });

  it('warnings array is returned', async () => {
    const { warnings } = await installAdapters({ cwd: tmpDir, platforms: ['copilot'] });
    assert.ok(Array.isArray(warnings));
  });
});

describe('wizard step: generateAgentsMd', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('creates AGENTS.md stub when file does not exist', async () => {
    const { written, skipped } = await generateAgentsMd({
      cwd: tmpDir,
      projectName: 'test-project',
    });
    assert.ok(written.includes('AGENTS.md'), 'Expected AGENTS.md in written');
    const content = await readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes('test-project'), 'Expected project name in AGENTS.md');
    assert.ok(content.includes('Gearbox harness'), 'Expected Gearbox harness section');
  });

  it('appends gearbox section when AGENTS.md exists without it', async () => {
    const tmpDir2 = await makeTmp();
    try {
      await writeFile(path.join(tmpDir2, 'AGENTS.md'), '# Existing\n\nSome content.\n');
      const { written } = await generateAgentsMd({
        cwd: tmpDir2,
        projectName: 'my-project',
      });
      assert.ok(written.includes('AGENTS.md'));
      const content = await readFile(path.join(tmpDir2, 'AGENTS.md'), 'utf8');
      assert.ok(content.includes('Existing'), 'Should preserve original content');
      assert.ok(content.includes('Gearbox harness'), 'Should append gearbox section');
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });

  it('skips AGENTS.md when gearbox section already present', async () => {
    const tmpDir2 = await makeTmp();
    try {
      await writeFile(path.join(tmpDir2, 'AGENTS.md'), '# Existing\n\n## Gearbox harness\n\nAlready here.\n');
      const { written, skipped } = await generateAgentsMd({
        cwd: tmpDir2,
        projectName: 'my-project',
      });
      assert.equal(written.length, 0, 'Should not write when section exists');
      assert.ok(skipped.includes('AGENTS.md'));
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });
});

describe('wizard step: updatePackageJson', () => {
  let tmpDir;
  before(async () => { tmpDir = await makeTmp(); });
  after(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('adds gearbox scripts to existing package.json', async () => {
    await writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2)
    );
    const { written } = await updatePackageJson({ cwd: tmpDir });
    assert.ok(written.includes('package.json'));
    const pkg = JSON.parse(await readFile(path.join(tmpDir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['gearbox:health'], 'node .gearbox/scripts/harness-audit.mjs health');
    assert.equal(pkg.scripts['gearbox:audit'], 'node .gearbox/scripts/harness-audit.mjs preflight');
    assert.equal(pkg.scripts['gearbox:check-docs'], 'node .gearbox/scripts/docs-drift-check.mjs');
    // preserves existing scripts
    assert.equal(pkg.scripts.test, 'node --test');
  });

  it('creates minimal package.json when none exists', async () => {
    const tmpDir2 = await makeTmp();
    try {
      const { written } = await updatePackageJson({ cwd: tmpDir2 });
      assert.ok(written.includes('package.json'));
      const pkg = JSON.parse(await readFile(path.join(tmpDir2, 'package.json'), 'utf8'));
      assert.ok(pkg.scripts['gearbox:health']);
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });

  it('dry-run returns path without writing', async () => {
    const tmpDir2 = await makeTmp();
    try {
      const { written } = await updatePackageJson({ cwd: tmpDir2, dryRun: true });
      assert.ok(written.includes('package.json'));
      assert.equal(existsSync(path.join(tmpDir2, 'package.json')), false);
    } finally {
      await rm(tmpDir2, { recursive: true, force: true });
    }
  });

  it('is idempotent — skips scripts already present', async () => {
    const { written: w1 } = await updatePackageJson({ cwd: tmpDir });
    assert.equal(w1.length, 0, 'Second run should skip already-present scripts');
  });
});
