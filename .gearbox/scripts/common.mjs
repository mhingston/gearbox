import { once } from 'node:events';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function readStdin(stream = process.stdin) {
  if (!stream || stream.isTTY) {
    return '';
  }

  if (stream.readableEnded) {
    return '';
  }

  if (typeof stream.setEncoding === 'function') {
    stream.setEncoding('utf8');
  }

  const chunks = [];
  stream.on('data', (chunk) => {
    chunks.push(chunk);
  });

  await Promise.race([
    once(stream, 'end'),
    once(stream, 'error').then(([error]) => {
      throw error;
    }),
  ]);

  return chunks.join('');
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith('--')) {
      const raw = token.slice(2);
      const [name, inlineValue] = raw.split('=', 2);

      if (inlineValue !== undefined) {
        flags[name] = inlineValue;
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && (!next.startsWith('-') || isNegativeNumberToken(next))) {
        flags[name] = next;
        index += 1;
      } else {
        flags[name] = true;
      }

      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const letters = token.slice(1).split('');
      for (const letter of letters) {
        flags[letter] = true;
      }
      continue;
    }

    positionals.push(token);
  }

  return {
    command: positionals[0] ?? null,
    subcommand: positionals[1] ?? null,
    args: positionals.slice(2),
    positionals,
    flags,
  };
}

function isNegativeNumberToken(token) {
  return /^-\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(token);
}

export function formatOutput(value, { json = false } = {}) {
  if (json) {
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

export function emitOutput(value, { json = false, stream = process.stdout } = {}) {
  const text = formatOutput(value, { json });
  stream.write(`${text}\n`);
  return text;
}

export async function createTestWorkspace({ prefix = 'harness-', root = os.tmpdir() } = {}) {
  const workspacePath = await fsPromises.mkdtemp(path.join(root, prefix));

  return {
    path: workspacePath,
    async cleanup() {
      await fsPromises.rm(workspacePath, { recursive: true, force: true });
    },
  };
}

export function hasJsonFlag(flags = {}) {
  return flags.json === true || flags.j === true;
}

export function hasHelpFlag(flags = {}) {
  return flags.help === true || flags.h === true;
}

export function sanitizeSegment(value, { fallback = 'item' } = {}) {
  const input = String(value ?? '')
    .trim()
    .replace(/[/\\]+/g, '-');
  const sanitized = input.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || fallback;
}

function sanitizePathSegment(value, options = {}) {
  const sanitized = sanitizeSegment(value, options);
  if (sanitized !== '.' && sanitized !== '..') {
    return sanitized;
  }

  const fallback = sanitizeSegment(options.fallback ?? 'item');
  return fallback === '.' || fallback === '..' ? 'item' : fallback;
}

export function sanitizePathSegments(value, options) {
  return String(value ?? '')
    .split(/[/\\]+/)
    .filter(Boolean)
    .map((segment) => sanitizePathSegment(segment, options));
}

export function isDirectRun(moduleUrl) {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}

export const writeOutput = emitOutput;
