import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTestWorkspace } from '../../src/harness/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const helperUrl = pathToFileURL(path.join(here, '..', '..', 'src', 'harness', 'paths.mjs')).href;

async function loadPathsModule() {
  return import(`${helperUrl}?cacheBust=${Date.now()}-${Math.random()}`);
}

async function writeFile(workspacePath, relativePath, content) {
  const fullPath = path.join(workspacePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
}

test('paths prefers an existing .worktrees directory over worktrees', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'paths-' });
  t.after(() => workspace.cleanup());

  await fs.mkdir(path.join(workspace.path, '.worktrees'), { recursive: true });
  await fs.mkdir(path.join(workspace.path, 'worktrees'), { recursive: true });

  const { resolveWorktreeRoot } = await loadPathsModule();
  const result = await resolveWorktreeRoot({
    cwd: workspace.path,
    project: 'gearbox',
    branch: 'feature/update-api',
  });

  assert.equal(result.source, 'existing-dot-worktrees');
  assert.equal(result.root, path.join(workspace.path, '.worktrees'));
  assert.equal(result.worktreePath, path.join(workspace.path, '.worktrees', 'feature', 'update-api'));
});

test('paths uses platform-aware separators for existing worktree roots', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'paths-' });
  t.after(() => workspace.cleanup());

  await fs.mkdir(path.join(workspace.path, '.worktrees'), { recursive: true });

  const { resolveWorktreeRoot } = await loadPathsModule();
  const result = await resolveWorktreeRoot({
    cwd: workspace.path,
    project: 'gearbox',
    branch: 'feature/update-api',
    platform: 'win32',
  });

  assert.equal(result.source, 'existing-dot-worktrees');
  assert.equal(result.worktreePath, path.win32.join(result.root, 'feature', 'update-api'));
});

test('paths rewrites traversal segments so worktree paths stay under the selected root', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'paths-' });
  t.after(() => workspace.cleanup());

  await fs.mkdir(path.join(workspace.path, '.worktrees'), { recursive: true });

  const { resolveWorktreeRoot } = await loadPathsModule();
  const cases = [
    {
      branch: '../../../etc/passwd',
      expectedSegments: ['branch', 'branch', 'branch', 'etc', 'passwd'],
    },
    {
      branch: 'good/../../bad',
      expectedSegments: ['good', 'branch', 'branch', 'bad'],
    },
    {
      branch: '..\\..\\secrets',
      expectedSegments: ['branch', 'branch', 'secrets'],
      platform: 'win32',
    },
  ];

  for (const { branch, expectedSegments, platform } of cases) {
    const result = await resolveWorktreeRoot({
      cwd: workspace.path,
      project: 'gearbox',
      branch,
      platform,
    });

    const pathApi = platform === 'win32' ? path.win32 : path;
    assert.equal(result.worktreePath, pathApi.join(result.root, ...expectedSegments));
    assert.equal(pathApi.relative(result.root, result.worktreePath).startsWith('..'), false);
  }
});

test('paths falls back to an existing worktrees directory when .worktrees is absent', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'paths-' });
  t.after(() => workspace.cleanup());

  await fs.mkdir(path.join(workspace.path, 'worktrees'), { recursive: true });

  const { resolveWorktreeRoot } = await loadPathsModule();
  const result = await resolveWorktreeRoot({
    cwd: workspace.path,
    project: 'gearbox',
    branch: 'feature/update-api',
  });

  assert.equal(result.source, 'existing-worktrees');
  assert.equal(result.root, path.join(workspace.path, 'worktrees'));
});

test('paths reads repo guidance from AGENTS.md or CLAUDE.md', async (t) => {
  await t.test('AGENTS.md guidance wins when present', async () => {
    const workspace = await createTestWorkspace({ prefix: 'paths-' });
    t.after(() => workspace.cleanup());

    await writeFile(workspace.path, 'AGENTS.md', 'Worktree directory: repo-guided-worktrees\n');

    const { resolveWorktreeRoot } = await loadPathsModule();
    const result = await resolveWorktreeRoot({
      cwd: workspace.path,
      project: 'gearbox',
      branch: 'feature/update-api',
    });

    assert.equal(result.source, 'repo-guidance');
    assert.equal(result.root, path.join(workspace.path, 'repo-guided-worktrees'));
  });

  await t.test('CLAUDE.md guidance is used when AGENTS.md is absent', async () => {
    const workspace = await createTestWorkspace({ prefix: 'paths-' });
    t.after(() => workspace.cleanup());

    await writeFile(workspace.path, 'CLAUDE.md', 'Preferred worktree directory: claude-worktrees\n');

    const { resolveWorktreeRoot } = await loadPathsModule();
    const result = await resolveWorktreeRoot({
      cwd: workspace.path,
      project: 'gearbox',
      branch: 'feature/update-api',
    });

    assert.equal(result.source, 'repo-guidance');
    assert.equal(result.root, path.join(workspace.path, 'claude-worktrees'));
  });
});

test('paths falls back to XDG_CONFIG_HOME when it is set', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'paths-' });
  t.after(() => workspace.cleanup());

  const xdgRoot = path.join(workspace.path, 'xdg-root');
  await fs.mkdir(xdgRoot, { recursive: true });

  const { resolveWorktreeRoot } = await loadPathsModule();
  const result = await resolveWorktreeRoot({
    cwd: workspace.path,
    project: 'gearbox',
    branch: 'feature/update-api',
    env: { ...process.env, XDG_CONFIG_HOME: xdgRoot },
    platform: 'linux',
  });

  assert.equal(result.source, 'xdg-config-home');
  assert.equal(result.root, path.join(xdgRoot, 'gearbox', 'worktrees', 'gearbox'));
});

test('paths uses OS-aware config roots when repo guidance and XDG are absent', async (t) => {
  const { resolveWorktreeRoot } = await loadPathsModule();

  await t.test('linux uses ~/.config', async () => {
    const workspace = await createTestWorkspace({ prefix: 'paths-' });
    t.after(() => workspace.cleanup());

    const result = await resolveWorktreeRoot({
      cwd: workspace.path,
      project: 'gearbox',
      branch: 'feature/update-api',
      platform: 'linux',
      env: { HOME: '/home/alice' },
    });

    assert.equal(result.source, 'platform-config-root');
    assert.equal(result.root, path.join('/home/alice', '.config', 'gearbox', 'worktrees', 'gearbox'));
  });

  await t.test('macOS uses ~/Library/Application Support', async () => {
    const workspace = await createTestWorkspace({ prefix: 'paths-' });
    t.after(() => workspace.cleanup());

    const result = await resolveWorktreeRoot({
      cwd: workspace.path,
      project: 'gearbox',
      branch: 'feature/update-api',
      platform: 'darwin',
      env: { HOME: '/Users/alice' },
    });

    assert.equal(result.source, 'platform-config-root');
    assert.equal(
      result.root,
      path.join('/Users/alice', 'Library', 'Application Support', 'gearbox', 'worktrees', 'gearbox'),
    );
  });

  await t.test('Windows uses %APPDATA%', async () => {
    const workspace = await createTestWorkspace({ prefix: 'paths-' });
    t.after(() => workspace.cleanup());

    const result = await resolveWorktreeRoot({
      cwd: workspace.path,
      project: 'gearbox',
      branch: 'feature/update-api',
      platform: 'win32',
      env: {
        APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming',
        USERPROFILE: 'C:\\Users\\Alice',
      },
    });

    assert.equal(result.source, 'platform-config-root');
    assert.equal(
      result.root,
      path.win32.join('C:\\Users\\Alice\\AppData\\Roaming', 'gearbox', 'worktrees', 'gearbox'),
    );
    assert.equal(result.worktreePath, path.win32.join(result.root, 'feature', 'update-api'));
  });
});
