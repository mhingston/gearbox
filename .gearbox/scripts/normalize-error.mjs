#!/usr/bin/env node

import os from 'node:os';
import process from 'node:process';

import { hasHelpFlag, isDirectRun, parseCliArgs, readStdin } from './common.mjs';

const GUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const POSITION_PATTERNS = [
  /:\d+:\d+\b/g,
  /:\d+,\d+\b/g,
  /:\d+\b/g,
  /\(\d+,\d+\)/g,
];
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{4}(?: \d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?)?\b/gi,
];
const HELP_TEXT = `Usage:
  node .gearbox/scripts/normalize-error.mjs <error text...>
  node .gearbox/scripts/normalize-error.mjs -- <error text beginning with dash>
  cat error.log | node .gearbox/scripts/normalize-error.mjs

Normalizes unstable values in error text, including temp paths, GUIDs, dates,
and source positions.
`;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTempPatterns() {
  const roots = new Set([os.tmpdir(), '/tmp', '/private/tmp']);
  const rootAlternatives = [
    ...Array.from(roots).map((root) => escapeRegex(root).replace(/[/\\]+/g, '[\\\\/]')),
    '[A-Za-z]:\\\\Users\\\\[^\\\\/\\s]+\\\\AppData\\\\Local\\\\Temp',
    '/var/folders/[^/\\s]+/[^/\\s]+/T',
  ];

  return [
    new RegExp(
      `(?:${rootAlternatives.join('|')})(?:[\\\\/][^\\\\/\\s:]+)+(?=(?:[\\\\/]worktrees[\\\\/])|(?::\\d+(?::\\d+)?)|[\\s)]|$)`,
      'g',
    ),
  ];
}

const TEMP_PATTERNS = buildTempPatterns();

export function normalizeErrorText(input) {
  let normalized = String(input ?? '');

  for (const pattern of TEMP_PATTERNS) {
    normalized = normalized.replace(pattern, '{tmpdir}');
  }

  normalized = normalized.replace(GUID_PATTERN, '{guid}');

  for (const pattern of DATE_PATTERNS) {
    normalized = normalized.replace(pattern, '{date}');
  }

  for (const pattern of POSITION_PATTERNS) {
    normalized = normalized.replace(pattern, '{pos}');
  }

  return normalized;
}

function printUsage(stream = process.stderr) {
  stream.write(HELP_TEXT);
}

export async function main({
  argv = process.argv.slice(2),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const cli = parseCliArgs(argv);
  if (hasHelpFlag(cli.flags)) {
    printUsage(stdout);
    return 0;
  }

  const stdinText = await readStdin(stdin);
  const argvText = cli.positionals.join(' ');
  const input = stdinText || argvText;

  if (!input) {
    stderr.write('No error text provided.\n');
    printUsage(stderr);
    return 1;
  }

  stdout.write(`${normalizeErrorText(input)}\n`);
  return 0;
}

if (isDirectRun(import.meta.url)) {
  process.exitCode = await main();
}
