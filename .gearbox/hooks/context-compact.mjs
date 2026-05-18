#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeCheckpoint } from './session-checkpoint.mjs';
import { readRuntimeArtifactsForSession } from './runtime-artifacts.mjs';

function repoRuntimeDirFor(root) {
  return path.join(root, '.gearbox', 'hooks', '.runtime');
}

function runtimeDirFor(root) {
  return path.join(
    tmpdir(),
    'gearbox-hooks',
    Buffer.from(root).toString('base64url')
  );
}

function currentSessionPathFor(root) {
  return path.join(runtimeDirFor(root), 'current-session.json');
}

function compactContextPathFor(root) {
  return path.join(repoRuntimeDirFor(root), 'compact-context.txt');
}

function currentCheckpointPathFor(root) {
  return path.join(repoRuntimeDirFor(root), 'current-checkpoint.json');
}

function normalizeHookId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeHarnessProfile(value) {
  const profile = normalizeHookId(value);
  if (!profile) {
    return 'standard';
  }

  if (['minimal', 'standard', 'strict', 'off'].includes(profile)) {
    return profile;
  }

  return 'standard';
}

function parseDisabledHookIds(rawValue) {
  return new Set(
    String(rawValue ?? '')
      .split(',')
      .map((segment) => normalizeHookId(segment))
      .filter(Boolean)
  );
}

export function isCompactionHookEnabled(env = process.env) {
  const profile = normalizeHarnessProfile(env.HARNESS_PROFILE);
  const disabledHookIds = parseDisabledHookIds(env.HARNESS_DISABLED_HOOKS);

  if (profile === 'off' || profile === 'minimal') {
    return false;
  }

  return !disabledHookIds.has('precompact');
}

function readOptionalJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

function readOptionalJsonLines(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return [];
    }

    throw error;
  }
}

function normalizePathCandidate(root, candidate) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.replace(/^[`'"]+|[`'",]+$/g, '').trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(root, trimmed);
  if (!trimmed.includes('/') && !trimmed.includes('\\') && !existsSync(resolved)) {
    return null;
  }

  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..')) {
    return null;
  }

  return relative.replace(/\\/g, '/');
}

function extractToolArgPaths(rawArgs, root) {
  if (typeof rawArgs !== 'string' || rawArgs.length === 0) {
    return [];
  }

  const explicit = [
    ...rawArgs.matchAll(/"(?:file_path|path)"\s*:\s*"([^"]+)"/g),
  ].map((match) => match[1]);
  const generic =
    explicit.length > 0
      ? explicit
      : [...rawArgs.matchAll(/(?:\.{1,2}\/)?[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,10}/g)].map(
          (match) => match[0]
        );

  return generic
    .map((candidate) => normalizePathCandidate(root, candidate))
    .filter(Boolean);
}

export function extractRecentFiles(events, root, limit = 5) {
  const files = [];
  const seen = new Set();

  for (const event of [...events].reverse()) {
    if (event?.event !== 'postToolUse') {
      continue;
    }

    const toolArgs = event?.details?.toolArgs;
    for (const filePath of extractToolArgPaths(toolArgs, root)) {
      if (seen.has(filePath)) {
        continue;
      }

      seen.add(filePath);
      files.push(filePath);
      if (files.length >= limit) {
        return files;
      }
    }
  }

  return files;
}

export function collectCompactionSnapshot(rootInput = process.cwd(), options = {}) {
  const root = path.resolve(rootInput);
  const sessionState = options.sessionState ?? readOptionalJson(currentSessionPathFor(root));
  const sessionEvents = options.sessionEvents ?? (sessionState?.logPath ? readOptionalJsonLines(sessionState.logPath) : []);
  const checkpoint = options.checkpoint ?? readOptionalJson(currentCheckpointPathFor(root));
  const runtimeArtifacts = readRuntimeArtifactsForSession(root, sessionState?.sessionId ?? null);
  const modifiedFilesArtifact = options.modifiedFilesArtifact ?? runtimeArtifacts.modifiedFiles;
  const lastTestResult = options.lastTestResult ?? runtimeArtifacts.lastTestResult;

  const trackedModifiedFiles = Array.isArray(modifiedFilesArtifact?.files)
    ? modifiedFilesArtifact.files.slice(-5)
    : [];

  return {
    sessionId: sessionState?.sessionId ?? null,
    currentGoal: resolveCurrentGoal(sessionEvents, checkpoint),
    recentFiles: trackedModifiedFiles.length > 0 ? trackedModifiedFiles : extractRecentFiles(sessionEvents, root),
    lastTestResult,
  };
}

function resolveCurrentGoal(sessionEvents, checkpoint) {
  if (typeof checkpoint?.goal === 'string' && checkpoint.goal.trim()) {
    return checkpoint.goal.trim();
  }

  const promptEvent = [...sessionEvents].reverse().find((event) =>
    event?.event === 'userPromptSubmitted' && typeof event?.details?.prompt === 'string'
  );
  if (promptEvent?.details?.prompt?.trim()) {
    return promptEvent.details.prompt.trim();
  }

  const sessionStart = sessionEvents.find((event) =>
    event?.event === 'sessionStart' && typeof event?.details?.initialPrompt === 'string'
  );
  if (sessionStart?.details?.initialPrompt?.trim()) {
    return sessionStart.details.initialPrompt.trim();
  }

  return null;
}

export function buildCompactContext(snapshot) {
  const lines = [
    '# Gearbox Context (preserve across compaction)',
    '',
    '## Recent Files',
  ];

  if (snapshot.recentFiles && snapshot.recentFiles.length > 0) {
    for (const filePath of snapshot.recentFiles) {
      lines.push(`- ${filePath}`);
    }
  } else {
    lines.push('- No recent file paths captured');
  }

  lines.push('', '## Current Goal');

  if (snapshot.currentGoal) {
    lines.push(`- ${snapshot.currentGoal}`);
  } else {
    lines.push('- No active goal captured');
  }

  lines.push('', '## Latest Validation Result');

  if (snapshot.lastTestResult?.status) {
    const toolName = snapshot.lastTestResult.toolName ?? 'unknown tool';
    const command = snapshot.lastTestResult.command ?? 'unknown command';
    lines.push(`- Last test result: ${snapshot.lastTestResult.status} via ${toolName} (${command})`);
  } else {
    lines.push('- No test result captured');
  }

  lines.push('', '## Discard', 'Verbose tool outputs, intermediate grep/glob results, redundant file listings.');
  return `${lines.join('\n')}\n`;
}

export function writeCompactContext(rootInput, content) {
  const root = path.resolve(rootInput);
  mkdirSync(repoRuntimeDirFor(root), { recursive: true });
  const targetPath = compactContextPathFor(root);
  writeFileSync(targetPath, content, 'utf8');
  return targetPath;
}

export function runCli({ cwd = process.cwd(), stdout = process.stdout } = {}) {
  if (!isCompactionHookEnabled()) {
    return 0;
  }

  const snapshot = collectCompactionSnapshot(cwd);
  const content = buildCompactContext(snapshot);
  writeCompactContext(cwd, content);
  stdout.write(content);

  try {
    writeCheckpoint(cwd);
  } catch {
    // Checkpoint errors must never affect stdout or exit code.
  }

  return 0;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(runCli());
}
