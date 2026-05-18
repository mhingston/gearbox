#!/usr/bin/env node

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { access, readFile } from 'node:fs/promises';

import {
  emitOutput,
  hasHelpFlag,
  hasJsonFlag,
  isDirectRun,
  parseCliArgs,
  sanitizePathSegments,
} from './common.mjs';

const HELP_TEXT = `Usage:
  node .gearbox/scripts/paths.mjs [worktree-root] [--project <name>] [--branch <name>] [--json]
  node .gearbox/scripts/paths.mjs config-root [--json]

Resolves harness-managed config and worktree paths.
`;

const GUIDANCE_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  path.join('.github', 'copilot-instructions.md'),
];
const GUIDANCE_PATTERN =
  /(?:^|\n)\s*(?:Worktree|Preferred worktree|Canonical worktree)\s+directory:\s*([^\n\r#]+?)\s*(?:\r?\n|$)/i;
const CURRENT_NAMESPACE = 'gearbox';
const LEGACY_NAMESPACE = 'superpowers';

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function readGuidedWorktreeRoot(cwd) {
  for (const relativePath of GUIDANCE_FILES) {
    const absolutePath = path.join(cwd, relativePath);
    if (!(await exists(absolutePath))) {
      continue;
    }

    const content = await readFile(absolutePath, 'utf8');
    const match = GUIDANCE_PATTERN.exec(content);
    if (!match) {
      continue;
    }

    return {
      source: 'repo-guidance',
      guidanceFile: relativePath,
      root: path.resolve(cwd, match[1].trim()),
    };
  }

  return null;
}

function getPlatformPath(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function getHomeDirectory({ env, platform }) {
  if (platform === 'win32') {
    const home =
      env.USERPROFILE ||
      (env.HOMEDRIVE && env.HOMEPATH ? path.win32.join(env.HOMEDRIVE, env.HOMEPATH) : null) ||
      os.homedir();
    return home && path.win32.isAbsolute(home) ? home : os.homedir();
  }

  return env.HOME || os.homedir();
}

export function resolveConfigRoot({
  env = process.env,
  platform = process.platform,
  namespace = CURRENT_NAMESPACE,
} = {}) {
  const platformPath = getPlatformPath(platform);

  if (env.XDG_CONFIG_HOME) {
    return {
      source: 'xdg-config-home',
      configRoot: env.XDG_CONFIG_HOME,
      namespace,
      root: platformPath.join(env.XDG_CONFIG_HOME, namespace),
    };
  }

  if (platform === 'darwin') {
    const home = getHomeDirectory({ env, platform });
    const configRoot = platformPath.join(home, 'Library', 'Application Support');
    return {
      source: 'platform-config-root',
      configRoot,
      namespace,
      root: platformPath.join(configRoot, namespace),
    };
  }

  if (platform === 'win32') {
    const configRoot =
      env.APPDATA || path.win32.join(getHomeDirectory({ env, platform }) || '', 'AppData', 'Roaming');
    return {
      source: 'platform-config-root',
      configRoot,
      namespace,
      root: path.win32.join(configRoot, namespace),
    };
  }

  const home = getHomeDirectory({ env, platform });
  const configRoot = platformPath.join(home, '.config');
  return {
    source: 'platform-config-root',
    configRoot,
    namespace,
    root: platformPath.join(configRoot, namespace),
  };
}

function buildWorktreePath(root, branch, platformPath) {
  return platformPath.join(root, ...sanitizePathSegments(branch, { fallback: 'branch' }));
}

async function resolveExistingGlobalWorktreeRoot({ env, platform, project }) {
  for (const namespace of [CURRENT_NAMESPACE, LEGACY_NAMESPACE]) {
    const config = resolveConfigRoot({ env, platform, namespace });
    const root = getPlatformPath(platform).join(config.root, 'worktrees', project);
    if (await exists(root)) {
      return {
        source: namespace === CURRENT_NAMESPACE ? 'existing-global-worktrees' : 'legacy-global-worktrees',
        configRoot: config.configRoot,
        namespace,
        root,
      };
    }
  }

  return null;
}

export async function resolveWorktreeRoot({
  cwd = process.cwd(),
  project = path.basename(cwd),
  branch = 'default',
  env = process.env,
  platform = process.platform,
} = {}) {
  const platformPath = getPlatformPath(platform);
  const dotWorktrees = path.join(cwd, '.worktrees');
  if (await exists(dotWorktrees)) {
    return {
      source: 'existing-dot-worktrees',
      root: dotWorktrees,
      worktreePath: buildWorktreePath(dotWorktrees, branch, platformPath),
      project,
      branch,
    };
  }

  const worktrees = path.join(cwd, 'worktrees');
  if (await exists(worktrees)) {
    return {
      source: 'existing-worktrees',
      root: worktrees,
      worktreePath: buildWorktreePath(worktrees, branch, platformPath),
      project,
      branch,
    };
  }

  const guided = await readGuidedWorktreeRoot(cwd);
  if (guided) {
    return {
      ...guided,
      worktreePath: buildWorktreePath(guided.root, branch, platformPath),
      project,
      branch,
    };
  }

  const existingGlobal = await resolveExistingGlobalWorktreeRoot({ env, platform, project });
  if (existingGlobal) {
    return {
      ...existingGlobal,
      worktreePath: buildWorktreePath(existingGlobal.root, branch, platformPath),
      project,
      branch,
    };
  }

  const config = resolveConfigRoot({ env, platform });
  const root = platformPath.join(config.root, 'worktrees', project);

  return {
    source: config.source,
    configRoot: config.configRoot,
    namespace: config.namespace,
    root,
    worktreePath: buildWorktreePath(root, branch, platformPath),
    project,
    branch,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(HELP_TEXT);
}

export async function main({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const cli = parseCliArgs(argv);
  if (hasHelpFlag(cli.flags)) {
    printUsage(stdout);
    return 0;
  }

  const json = hasJsonFlag(cli.flags);
  const project = cli.flags.project || path.basename(process.cwd());
  const branch = cli.flags.branch || 'default';

  if (cli.command === 'config-root') {
    if (cli.subcommand || cli.args.length > 0) {
      stderr.write('Unsupported paths command: config-root\n');
      printUsage(stderr);
      return 1;
    }

    const result = resolveConfigRoot();
    emitOutput(json ? result : result.root, { json, stream: stdout });
    return 0;
  }

  if (cli.command && cli.command !== 'worktree-root') {
    stderr.write(`Unsupported paths command: ${cli.command}\n`);
    printUsage(stderr);
    return 1;
  }

  if (cli.subcommand || cli.args.length > 0) {
    stderr.write('Unsupported paths command: worktree-root\n');
    printUsage(stderr);
    return 1;
  }

  const result = await resolveWorktreeRoot({ project, branch });
  emitOutput(json ? result : result.root, { json, stream: stdout });
  return 0;
}

if (isDirectRun(import.meta.url)) {
  process.exitCode = await main();
}
