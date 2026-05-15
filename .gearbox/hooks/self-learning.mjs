#!/usr/bin/env node

import { existsSync, rmSync } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { writeCheckpoint } from './session-checkpoint.mjs';
import {
  resetRuntimeArtifacts as resetSessionRuntimeArtifacts,
  writeLastTestResultArtifact,
  writeModifiedFilesArtifact,
} from './runtime-artifacts.mjs';
export { resetRuntimeArtifacts } from './runtime-artifacts.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readPayload(payloadFile) {
  if (!payloadFile) {
    return await readStdin();
  }

  const rawInput = await readFile(payloadFile, 'utf-8');
  try {
    await rm(payloadFile, { force: true });
  } catch {
    // Best-effort cleanup for hook payload temp files.
  }
  return rawInput;
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

function isHookEnabled(eventName, env = process.env) {
  const hookId = normalizeHookId(eventName);
  const profile = normalizeHarnessProfile(env.HARNESS_PROFILE);
  const disabledHookIds = parseDisabledHookIds(env.HARNESS_DISABLED_HOOKS);

  if (profile === 'off' || disabledHookIds.has(hookId)) {
    return false;
  }

  if (profile === 'minimal') {
    return hookId === 'sessionstart';
  }

  return true;
}

function isAuxiliaryHookEnabled(hookId, env = process.env) {
  const profile = normalizeHarnessProfile(env.HARNESS_PROFILE);
  const disabledHookIds = parseDisabledHookIds(env.HARNESS_DISABLED_HOOKS);
  if (profile === 'off') {
    return false;
  }

  return !disabledHookIds.has(normalizeHookId(hookId));
}

function runtimeDirFor(root) {
  return join(
    tmpdir(),
    'gearbox-hooks',
    Buffer.from(root).toString('base64url')
  );
}

function repoRuntimeDirFor(root) {
  return join(root, '.gearbox', 'hooks', '.runtime');
}

function recordsDirFor(root) {
  return join(repoRuntimeDirFor(root), 'records');
}

function statePathFor(root) {
  return join(runtimeDirFor(root), 'current-session.json');
}

function evalScriptPathFor(root) {
  return join(root, '.gearbox', 'hooks', 'markdown-eval.mjs');
}

function latestSessionPathFor(root) {
  return join(repoRuntimeDirFor(root), 'last-session.md');
}

function excerpt(value, max = 160) {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function parseToolArgsPayload(rawToolArgs) {
  if (!rawToolArgs) {
    return null;
  }

  if (typeof rawToolArgs === 'object') {
    return rawToolArgs;
  }

  if (typeof rawToolArgs !== 'string') {
    return null;
  }

  try {
    return JSON.parse(rawToolArgs);
  } catch {
    return null;
  }
}

export function normalizeToolPathCandidate(root, candidate, baseDir = root) {
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.replace(/^[`'"]+|[`'",:]+$/g, '').trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const resolvedPath = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(baseDir, trimmed);
  const repoRelative = relative(root, resolvedPath).replace(/\\/g, '/');
  if (!repoRelative || repoRelative.startsWith('..')) {
    return null;
  }

  return repoRelative;
}

function extractPatchPaths(rawToolArgs) {
  if (typeof rawToolArgs !== 'string' || rawToolArgs.length === 0) {
    return [];
  }

  return [
    ...rawToolArgs.matchAll(/^\*\*\* (?:Add|Delete|Update) File: (.+)$/gm),
    ...rawToolArgs.matchAll(/^\*\*\* Move to: (.+)$/gm),
  ].map((match) => match[1]);
}

const WRITE_TOOL_NAMES = new Set([
  'apply_patch',
  'create',
  'createfile',
  'edit',
  'editfiles',
  'write',
]);

export function extractModifiedFilesFromTool(root, payload, baseDir = root) {
  const toolName = String(payload?.toolName ?? '').toLowerCase();
  if (!WRITE_TOOL_NAMES.has(toolName)) {
    return [];
  }

  const rawToolArgs =
    typeof payload?.toolArgs === 'string' ? payload.toolArgs : '';
  const parsedToolArgs = parseToolArgsPayload(payload?.toolArgs);
  const candidates = [];

  if (toolName === 'apply_patch') {
    candidates.push(...extractPatchPaths(rawToolArgs));
  }

  if (parsedToolArgs && typeof parsedToolArgs === 'object') {
    for (const key of ['file_path', 'path']) {
      if (typeof parsedToolArgs[key] === 'string') {
        candidates.push(parsedToolArgs[key]);
      }
    }
  }

  if (candidates.length === 0 && rawToolArgs) {
    for (const match of rawToolArgs.matchAll(
      /"(?:file_path|path)"\s*:\s*"([^"]+)"/g
    )) {
      candidates.push(match[1]);
    }
  }

  return [
    ...new Set(
      candidates
        .map((candidate) => normalizeToolPathCandidate(root, candidate, baseDir))
        .filter(Boolean)
    ),
  ];
}

function resolveToolCommand(payload) {
  const parsedToolArgs = parseToolArgsPayload(payload?.toolArgs);
  if (
    parsedToolArgs &&
    typeof parsedToolArgs === 'object' &&
    typeof parsedToolArgs.command === 'string'
  ) {
    return parsedToolArgs.command;
  }

  return typeof payload?.toolArgs === 'string' ? payload.toolArgs : null;
}

const TEST_COMMAND_PATTERN =
  /\b(node --test|npm test|yarn test|pnpm test|bun test|vitest|jest|pytest|go test|cargo test|dotnet test)\b|\/bin\/Debug\/net10\.0\//i;

export function extractTestCommand(payload) {
  const toolName = String(payload?.toolName ?? '').toLowerCase();
  if (!['bash', 'runinterminal'].includes(toolName)) {
    return null;
  }

  const command = resolveToolCommand(payload);
  if (typeof command !== 'string' || !TEST_COMMAND_PATTERN.test(command)) {
    return null;
  }

  return excerpt(command, 240) ?? null;
}

function normalizeToolResult(resultType) {
  const normalized = String(resultType ?? '').toLowerCase();
  if (['denied', 'rejected', 'blocked'].includes(normalized)) {
    return 'denied';
  }

  if (['failure', 'failed', 'error'].includes(normalized)) {
    return 'failure';
  }

  return 'success';
}

function extractTokenCount(payload) {
  const candidates = [
    payload?.toolResult?.token_count,
    payload?.toolResult?.tokenCount,
    payload?.toolResult?.metadata?.token_count,
    payload?.toolResult?.metadata?.tokenCount,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function recordRuntimeArtifacts(root, payload, sessionId = null) {
  const baseDir = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : root;
  const modifiedFiles = extractModifiedFilesFromTool(root, payload, baseDir);
  if (modifiedFiles.length > 0) {
    await writeModifiedFilesArtifact(root, sessionId, modifiedFiles);
  }

  const testCommand = extractTestCommand(payload);
  if (!testCommand) {
    return;
  }

  const resultType = payload?.toolResult?.resultType;
  const status =
    resultType === 'failure'
      ? 'failed'
      : resultType === 'denied'
        ? 'denied'
        : 'passed';

  await writeLastTestResultArtifact(root, sessionId, {
    status,
    toolName: payload?.toolName ?? 'bash',
    command: testCommand,
  });
}

function mapReasonToOutcome(reason) {
  switch (reason) {
    case 'complete':
      return 'success';
    case 'error':
    case 'timeout':
      return 'failure';
    default:
      return 'partial';
  }
}

async function readSessionState(path) {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
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

async function writeSessionState(path, state) {
  if (state === null) {
    if (existsSync(path)) {
      await rm(path, { force: true });
    }
    return;
  }
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

function createSessionState(root, payload) {
  const sessionId = String(payload.timestamp ?? Date.now());
  const runtimeDir = runtimeDirFor(root);
  return {
    sessionId,
    startedAt: new Date(payload.timestamp ?? Date.now()).toISOString(),
    logPath: join(runtimeDir, `session-${sessionId}.jsonl`),
    recordPath: join(recordsDirFor(root), `${sessionId}.json`),
  };
}

async function ensureSessionState(root, payload) {
  const runtimeDir = runtimeDirFor(root);
  const repoRuntimeDir = repoRuntimeDirFor(root);
  const statePath = statePathFor(root);
  await mkdir(runtimeDir, { recursive: true });
  await mkdir(repoRuntimeDir, { recursive: true });
  await mkdir(recordsDirFor(root), { recursive: true });

  const existing = await readSessionState(statePath);
  if (existing) {
    return existing;
  }

  const state = createSessionState(root, payload);
  await writeSessionState(statePath, state);
  return state;
}

async function appendEvent(logPath, event, details) {
  const entry = {
    event,
    recordedAt: new Date().toISOString(),
    details,
  };
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf-8');
}

async function readEvents(logPath) {
  try {
    const raw = await readFile(logPath, 'utf-8');
    return raw
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

async function runCommand(command, cwd, input) {
  return await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      resolve({
        ok: false,
        stdout,
        stderr: stderr ? `${stderr}\n${message}` : message,
        code: null,
      });
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        stdout,
        stderr,
        code,
      });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function runGit(root, args) {
  return await runCommand(['git', ...args], root);
}

function spawnBackgroundEval(root, env = process.env) {
  if (!isAuxiliaryHookEnabled('markdown-eval', env)) {
    return;
  }

  const evalScriptPath = evalScriptPathFor(root);
  if (!existsSync(evalScriptPath)) {
    return;
  }

  const child = spawn(
    process.execPath,
    [evalScriptPath, '--record-outcomes', '--synthesise', '--limit', '10'],
    {
      cwd: root,
      detached: true,
      stdio: 'ignore',
    }
  );
  child.unref();
}

async function getChangedFiles(root, baseline) {
  const statusResult = await runGit(root, [
    'status',
    '--short',
    '--untracked-files=all',
  ]);
  if (!statusResult.ok) {
    return [];
  }

  const baselineSet = new Set(baseline ?? []);
  const changed = new Set();
  for (const line of statusResult.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const candidate = line.slice(3).trim();
    if (!candidate) continue;
    const filePath = candidate.includes(' -> ')
      ? candidate.split(' -> ').at(-1)
      : candidate;
    if (filePath && !baselineSet.has(filePath)) {
      changed.add(filePath);
    }
  }
  return [...changed];
}

function summarizeTools(events) {
  const summary = new Map();

  for (const event of events) {
    if (event.event !== 'postToolUse') continue;

    const toolName =
      typeof event.details.toolName === 'string'
        ? event.details.toolName
        : 'unknown';
    const resultType =
      typeof event.details.resultType === 'string'
        ? event.details.resultType
        : 'success';

    if (!summary.has(toolName)) {
      summary.set(toolName, { success: 0, failure: 0, denied: 0 });
    }

    const counts = summary.get(toolName);
    if (!counts) continue;

    if (resultType === 'failure') {
      counts.failure += 1;
    } else if (resultType === 'denied') {
      counts.denied += 1;
    } else {
      counts.success += 1;
    }
  }

  return [...summary.entries()].map(([toolName, counts]) => {
    const parts = [];
    if (counts.success > 0) parts.push(`${counts.success} success`);
    if (counts.failure > 0) parts.push(`${counts.failure} failure`);
    if (counts.denied > 0) parts.push(`${counts.denied} denied`);
    return `- ${toolName}: ${parts.join(', ') || 'no activity'}`;
  });
}

function summarizeFailures(events) {
  const failures = [];

  for (const event of events) {
    if (
      event.event === 'postToolUse' &&
      event.details.resultType === 'failure'
    ) {
      const toolName =
        typeof event.details.toolName === 'string'
          ? event.details.toolName
          : 'unknown';
      const text =
        typeof event.details.textResult === 'string'
          ? event.details.textResult
          : 'tool execution failed';
      failures.push(`- ${toolName}: ${text}`);
    }

    if (event.event === 'errorOccurred') {
      const name =
        typeof event.details.name === 'string' ? event.details.name : 'Error';
      const message =
        typeof event.details.message === 'string'
          ? event.details.message
          : 'unexpected agent error';
      failures.push(`- ${name}: ${message}`);
    }
  }

  return failures.slice(0, 5);
}

function buildSessionMarkdown(
  state,
  promptSummary,
  changedFiles,
  toolSummary,
  failureSummary,
  agentsUpdated,
  reason
) {
  const lines = [
    '# Gearbox session',
    '',
    `- Session: ${state.sessionId}`,
    `- Started: ${state.startedAt}`,
    `- End reason: ${reason ?? 'unknown'}`,
    `- Durable docs updated: ${agentsUpdated ? 'yes' : 'no'}`,
    '',
    '## Prompt summary',
    ...(promptSummary.length > 0
      ? promptSummary.map((prompt) => `- ${prompt}`)
      : ['- No prompts captured']),
    '',
    '## Changed files',
    ...(changedFiles.length > 0
      ? changedFiles.map((file) => `- ${file}`)
      : ['- No changed files']),
    '',
    '## Tool outcomes',
    ...(toolSummary.length > 0 ? toolSummary : ['- No tool usage captured']),
  ];

  if (failureSummary.length > 0) {
    lines.push('', '## Failures observed', ...failureSummary);
  }

  return lines.join('\n');
}

export function classifySession(changedFiles, prompts) {
  const files = changedFiles.join('\n').toLowerCase();
  const text = prompts.join('\n').toLowerCase();
  const types = [];

  if (
    /src\/api\//.test(files) ||
    /architect|infrastructure|provider|processor/.test(text)
  ) {
    types.push('architecture');
  }

  if (/src\/ui(?:-v2|\/|$)|src\/sandbox\/ui/.test(files)) {
    types.push('frontend');
  }

  if (/tests\/|\.spec\.|\.test\.|spectests|tunit|playwright/.test(files)) {
    types.push('testing');
  }

  if (
    /kubernetes\/|tilt\/|docs\/deployment|docs\/infrastructure|\.tf\b|\.bicep\b|docker/.test(
      files
    )
  ) {
    types.push('infrastructure');
  }

  if (/docs\/|agents\.md|\.github\/|hooks/.test(files)) {
    types.push('workflow');
  }

  if (
    /\.agents\/skills\/|skill|create skill|update skill/.test(files) ||
    /skill|create skill|update skill/.test(text)
  ) {
    types.push('skill');
  }

  if (
    /migrat|chose|decided|switch|replac|moved to|adopt|because|due to/.test(text)
  ) {
    types.push('decision');
  }

  const knowledgeTypes = types.length > 0 ? types : ['general'];

  const semanticTypes = [];
  if (
    /\b(failed|failing|error(?:ed)?|broke|broken|exception|crash(?:ed)?|debug(?:ging)?|regression)\b/i.test(
      text
    )
  ) {
    semanticTypes.push('problem');
  }
  if (
    /\b(completed|done|merged|shipped|landed|deployed|released)\b/i.test(text)
  ) {
    semanticTypes.push('milestone');
  }
  const wordBoundaryPref = /\b(prefer(?:red|ring)?|always use|we use)\b/i;
  const colonLabelPref = /\b(convention|standard|pattern):(?=\s|$)/i;
  if (wordBoundaryPref.test(text) || colonLabelPref.test(text)) {
    semanticTypes.push('preference');
  }

  const internalCategory = classifyInternalCategory(text, files, semanticTypes);
  return { knowledgeTypes, semanticTypes, internalCategory };
}

function classifyInternalCategory(text, files, semanticTypes) {
  const lowerText = text.toLowerCase();
  const lowerFiles = files.toLowerCase();

  const hasFailureKeyword = /\b(fail(?:ed|ing)?|broken?|broke|error(?:ed)?|crash(?:ed)?|exception|debug(?:ging)?|regression)\b/i.test(lowerText);
  const hasFixKeyword = /\b(fix(?:ed|ing)?|resolv(?:ed|ing)?|correct(?:ed|ing)?|repaired?|address(?:ed|ing)?)\b/i.test(lowerText);
  if (hasFailureKeyword && hasFixKeyword) {
    return 'resolved_failure';
  }

  if (/\b(invariant|undocumented|constraint|rule that must|must always|must never|never allowed)\b/i.test(lowerText)) {
    return 'undocumented_invariant';
  }

  const isHarnessFile = /\.gearbox\/hooks\//.test(lowerFiles);
  const hasGapKeyword = /\b(missing|gap|guardrail|workflow|harness|pipeline)\b/i.test(lowerText);
  if (isHarnessFile && hasGapKeyword) {
    return 'workflow_gap';
  }

  if (/\b(always use|never use|in this repo|you must|we must|must use|must not|always follow|use .+ for)\b/i.test(lowerText)) {
    return 'user_directive';
  }

  const wordBoundaryPref = /\b(prefer(?:red|ring)?|always use|we use)\b/i;
  const colonLabelPref = /\b(convention|standard|pattern):(?=\s|$)/i;
  const isDocsFile = /docs\//.test(lowerFiles);
  if ((wordBoundaryPref.test(lowerText) || colonLabelPref.test(lowerText)) || (isDocsFile && /\b(prefer|convention|standard|pattern)\b/i.test(lowerText))) {
    return 'preference';
  }

  if (semanticTypes.includes('milestone')) {
    return 'milestone';
  }

  return null;
}

async function handleSessionStart(root, payload) {
  const state = await ensureSessionState(root, payload);
  await resetSessionRuntimeArtifacts(root, state.sessionId);

  const baselineFiles = await getChangedFiles(root);
  state.baselineFiles = baselineFiles;
  await writeSessionState(statePathFor(root), state);

  await appendEvent(state.logPath, 'sessionStart', {
    source: payload.source ?? 'unknown',
    initialPrompt: excerpt(payload.initialPrompt, 240),
  });
}

async function handlePrompt(root, payload) {
  const state = await ensureSessionState(root, payload);
  await appendEvent(state.logPath, 'userPromptSubmitted', {
    prompt: excerpt(payload.prompt, 400),
  });

  try {
    writeCheckpoint(root);
  } catch {
    // Checkpoint errors must not affect this handler.
  }
}

async function handleTool(root, payload) {
  const state = await ensureSessionState(root, payload);
  await appendEvent(state.logPath, 'postToolUse', {
    toolName: payload.toolName ?? 'unknown',
    resultType: payload.toolResult?.resultType ?? 'success',
    toolArgs: excerpt(payload.toolArgs, 240),
    textResult: excerpt(payload.toolResult?.textResultForLlm, 240),
  });
  await recordRuntimeArtifacts(root, payload, state.sessionId);
}

async function handleError(root, payload) {
  const state = await ensureSessionState(root, payload);
  await appendEvent(state.logPath, 'errorOccurred', {
    name: payload.error?.name ?? 'Error',
    message: excerpt(payload.error?.message, 240),
  });
}

async function handleSessionEnd(root, payload) {
  const state = await ensureSessionState(root, payload);
  await appendEvent(state.logPath, 'sessionEnd', {
    reason: payload.reason ?? 'unknown',
  });

  const events = await readEvents(state.logPath);
  const promptSummary = events
    .filter((event) => event.event === 'userPromptSubmitted')
    .map((event) =>
      typeof event.details.prompt === 'string'
        ? event.details.prompt
        : undefined
    )
    .filter(Boolean);
  const changedFiles = await getChangedFiles(root, state.baselineFiles ?? []);
  const toolSummary = summarizeTools(events);
  const failureSummary = summarizeFailures(events);
  const agentsUpdated = changedFiles.some(
    (f) => f === 'AGENTS.md' || f.startsWith('docs/')
  );

  if (
    changedFiles.length === 0 &&
    promptSummary.length === 0 &&
    failureSummary.length === 0
  ) {
    await writeSessionState(statePathFor(root), null);
    try {
      rmSync(join(repoRuntimeDirFor(root), 'current-checkpoint.json'), {
        force: true,
      });
    } catch {
      // ignore
    }
    return;
  }

  const description = buildSessionMarkdown(
    state,
    promptSummary,
    changedFiles,
    toolSummary,
    failureSummary,
    agentsUpdated,
    payload.reason
  );

  const classify = classifySession(changedFiles, promptSummary);

  const record = {
    type: 'reference',
    name: `Gearbox session ${state.startedAt}`,
    description,
    classification: 'tactical',
    recorded_at: new Date().toISOString(),
    files: changedFiles.slice(0, 25),
    tags: [
      'gearbox',
      'hooks',
      'self-learning',
      'session',
      ...classify.knowledgeTypes,
    ],
    evidence: {
      date: state.startedAt,
      ...(changedFiles[0] ? { file: changedFiles[0] } : {}),
    },
    metadata: {
      agentsUpdated,
      promptCount: promptSummary.length,
      toolCount: toolSummary.length,
      knowledgeTypes: classify.knowledgeTypes,
      semanticTypes: classify.semanticTypes,
      internalCategory: classify.internalCategory,
    },
    outcomes: [
      {
        status: mapReasonToOutcome(payload.reason),
        agent: 'github-copilot',
        notes: excerpt(promptSummary[0] ?? 'Gearbox session summary', 240),
        test_results: `reason=${payload.reason ?? 'unknown'}; agentsUpdated=${agentsUpdated}`,
        recorded_at: new Date().toISOString(),
      },
    ],
  };

  await writeFile(
    state.recordPath,
    `${JSON.stringify(record, null, 2)}\n`,
    'utf-8'
  );
  await writeFile(latestSessionPathFor(root), `${description}\n`, 'utf-8');
  await writeSessionState(statePathFor(root), null);

  try {
    rmSync(join(repoRuntimeDirFor(root), 'current-checkpoint.json'), {
      force: true,
    });
  } catch {
    // Checkpoint cleanup errors must not affect session end behaviour
  }

  spawnBackgroundEval(root, process.env);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const eventName = process.argv[2];
  if (!eventName) {
    process.exit(0);
  }

  let payloadFile;
  for (let i = 3; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--payload-file') {
      const next = process.argv[i + 1];
      if (!next) {
        throw new Error('Missing value for --payload-file');
      }
      payloadFile = next;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const rawInput = await readPayload(payloadFile);
  const payloadText = rawInput.replace(/^\uFEFF/, '');
  const payload = payloadText.trim() ? JSON.parse(payloadText) : {};
  const root = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();

  if (!isHookEnabled(eventName, process.env)) {
    process.exit(0);
  }

  switch (eventName) {
    case 'sessionStart':
      await handleSessionStart(root, payload);
      break;
    case 'userPromptSubmitted':
      await handlePrompt(root, payload);
      break;
    case 'postToolUse':
      await handleTool(root, payload);
      break;
    case 'errorOccurred':
      await handleError(root, payload);
      break;
    case 'sessionEnd':
      await handleSessionEnd(root, payload);
      break;
    default:
      break;
  }
}
