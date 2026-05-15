#!/usr/bin/env node
/**
 * session-checkpoint.mjs
 * Writes a mid-session checkpoint to .gearbox/hooks/.runtime/current-checkpoint.json.
 * Called as a side-effect from context-compact.mjs (preCompact hook).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function runtimeDirFor(root) {
  return path.join(os.tmpdir(), 'gearbox-hooks', Buffer.from(root).toString('base64url'));
}

function currentSessionPathFor(root) {
  return path.join(runtimeDirFor(root), 'current-session.json');
}

function repoRuntimeDirFor(root) {
  return path.join(root, '.gearbox', 'hooks', '.runtime');
}

function checkpointPathFor(root) {
  return path.join(repoRuntimeDirFor(root), 'current-checkpoint.json');
}

function readOptionalJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function readOptionalJsonLines(filePath) {
  if (!filePath) return [];
  try {
    const text = readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

function detectGitBranch(root) {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: root, encoding: 'utf8', stdio: 'pipe',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function resolveTouchedFiles(root, baseline = []) {
  const result = spawnSync('git', ['status', '--short', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', stdio: 'pipe',
  });
  if (result.status !== 0) return [];
  const baselineSet = new Set(baseline);
  return result.stdout.split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const candidate = line.slice(3).trim();
      return candidate.includes(' -> ') ? candidate.split(' -> ').at(-1) : candidate;
    })
    .filter(f => f && !baselineSet.has(f));
}

function resolveGoal(sessionEvents) {
  const sessionStart = sessionEvents.find(e => e.event === 'sessionStart');
  if (typeof sessionStart?.details?.initialPrompt === 'string' && sessionStart.details.initialPrompt.trim()) {
    return sessionStart.details.initialPrompt.trim();
  }
  const lastPrompt = [...sessionEvents].reverse().find(e => e.event === 'userPromptSubmitted');
  if (typeof lastPrompt?.details?.prompt === 'string' && lastPrompt.details.prompt.trim()) {
    return lastPrompt.details.prompt.trim();
  }
  return '(no goal captured)';
}

export function buildCheckpoint(root, options = {}) {
  const sessionState = options.sessionState ?? readOptionalJson(currentSessionPathFor(root));
  if (!sessionState?.sessionId) return null;

  const sessionEvents = options.sessionEvents ?? readOptionalJsonLines(sessionState.logPath ?? '');
  const hasUserPrompt = sessionEvents.some(e => e.event === 'userPromptSubmitted');
  if (!hasUserPrompt) return null;

  const goal = options.goal ?? resolveGoal(sessionEvents);
  const touched_files = options.touched_files ?? resolveTouchedFiles(root, sessionState.baselineFiles ?? []);
  const branch = options.branch ?? detectGitBranch(root);

  return {
    sessionId: sessionState.sessionId,
    startedAt: sessionState.startedAt,
    updatedAt: new Date().toISOString(),
    branch,
    goal,
    touched_files,
    last_5_events: sessionEvents.slice(-5),
  };
}

export function writeCheckpoint(root) {
  try {
    const cpPath = checkpointPathFor(root);
    const sessionState = readOptionalJson(currentSessionPathFor(root));
    if (!sessionState?.sessionId) {
      rmSync(cpPath, { force: true });
      return;
    }
    const checkpoint = buildCheckpoint(root, { sessionState });
    if (!checkpoint) return;
    mkdirSync(repoRuntimeDirFor(root), { recursive: true });
    writeFileSync(cpPath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  } catch {
    // Fail silently — must never affect callers
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  writeCheckpoint(process.cwd());
}
