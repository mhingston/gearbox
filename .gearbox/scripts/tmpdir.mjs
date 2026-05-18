#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  emitOutput,
  hasHelpFlag,
  hasJsonFlag,
  isDirectRun,
  parseCliArgs,
  sanitizeSegment,
} from './common.mjs';

const HELP_TEXT = `Usage:
  node .gearbox/scripts/tmpdir.mjs create [--scope <scope>] [--key <key>] [--json]
  node .gearbox/scripts/tmpdir.mjs path [--scope <scope>] [--key <key>] [--json]

Creates or previews scoped temporary directories for helper workflows.
`;

function buildScopedPrefix({ scope, key, prefix = '' }) {
  const pieces = [prefix, scope, key].filter(Boolean).map((piece) => sanitizeSegment(piece));
  return `${pieces.join('-')}-`;
}

export function getScopedTempBase({ scope, key, root = os.tmpdir(), prefix = 'gearbox' } = {}) {
  return path.join(root, sanitizeSegment(prefix), buildScopedPrefix({ scope, key }));
}

export async function createScopedTempDir({ scope, key, root = os.tmpdir(), prefix = 'gearbox' } = {}) {
  const parent = path.join(root, sanitizeSegment(prefix));
  await fs.mkdir(parent, { recursive: true });
  const tempPath = await fs.mkdtemp(path.join(parent, buildScopedPrefix({ scope, key })));

  return {
    root,
    parent,
    path: tempPath,
    scope,
    key,
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
  const command = cli.command || 'create';
  const options = {
    scope: cli.flags.scope || 'task',
    key: cli.flags.key || '',
  };

  if (command === 'path') {
    if (cli.subcommand || cli.args.length > 0) {
      stderr.write('Unsupported tmpdir command: path\n');
      printUsage(stderr);
      return 1;
    }

    emitOutput(json ? { path: getScopedTempBase(options), ...options } : getScopedTempBase(options), {
      json,
      stream: stdout,
    });
    return 0;
  }

  if (command !== 'create') {
    stderr.write(`Unsupported tmpdir command: ${command}\n`);
    printUsage(stderr);
    return 1;
  }

  if (cli.subcommand || cli.args.length > 0) {
    stderr.write('Unsupported tmpdir command: create\n');
    printUsage(stderr);
    return 1;
  }

  const result = await createScopedTempDir(options);
  emitOutput(json ? result : result.path, { json, stream: stdout });
  return 0;
}

if (isDirectRun(import.meta.url)) {
  process.exitCode = await main();
}
