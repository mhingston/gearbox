#!/usr/bin/env node

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

import {
  extractModifiedFilesFromTool,
  normalizeToolPathCandidate,
} from './self-learning.mjs';

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  }
  return chunks.join('');
}

const SHELL_TOOL_NAMES = new Set(['bash', 'runinterminal', 'exec_command']);
const SHELL_SEPARATOR_TOKENS = new Set(['&&', ';', '|', '||', '&']);
const SHELL_WRAPPER_HEADS = new Set(['bash', 'dash', 'ksh', 'sh', 'zsh']);
const WRITE_TOOL_NAMES = new Set([
  'apply_patch',
  'create',
  'createfile',
  'edit',
  'editfiles',
  'write',
]);

function normalizeHookId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizeHarnessProfile(value) {
  const normalized = normalizeHookId(value);
  if (!normalized) return 'standard';
  if (['minimal', 'standard', 'strict', 'off'].includes(normalized)) {
    return normalized;
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

export function isPolicyGuardEnabled(env = process.env) {
  const profile = normalizeHarnessProfile(env.HARNESS_PROFILE);
  const disabledHookIds = parseDisabledHookIds(env.HARNESS_DISABLED_HOOKS);

  if (profile === 'off' || profile === 'minimal') {
    return false;
  }

  return !['pretooluse', 'harness-policy', 'harness-policy-guard'].some(
    (hookId) => disabledHookIds.has(hookId)
  );
}

function parseJsonMaybe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resolveRepoRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  return cwd;
}

function resolveRepoCwd(root, cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-prefix'], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status === 0) {
    return path.join(root, result.stdout.trim());
  }
  return cwd;
}

function runtimeDirFor(root) {
  return path.join(
    os.tmpdir(),
    'gearbox-hooks',
    Buffer.from(root).toString('base64url')
  );
}

function currentSessionPathFor(root) {
  return path.join(runtimeDirFor(root), 'current-session.json');
}

function readOptionalJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readOptionalJsonLines(filePath) {
  try {
    const text = readFileSync(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

const PACKET_FIELD_LABELS = [
  'marker',
  'role',
  'allowed paths',
  'allowed_paths',
  'allowed responsibilities',
  'forbidden work',
  'forbidden_work',
  'deliverables',
  'stop conditions',
  'validation expectations',
  'required return format',
  'tool_scope',
  'tool scope',
  'token_budget',
  'review-only scope',
  'inspectable change material',
  'acceptance criteria',
  'implementation plan slice',
  'prior_progress',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPromptField(prompt, labels) {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return null;
  }

  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();
  const labelPattern = labels.map(escapeRegExp).join('|');
  const stopPattern = PACKET_FIELD_LABELS.map(escapeRegExp).join('|');
  const regex = new RegExp(
    `(?:^|\\s)(?:${labelPattern}):\\s*(.+?)(?=\\s(?:${stopPattern}):|$)`,
    'i'
  );
  const match = normalizedPrompt.match(regex);
  return match?.[1]?.trim() ?? null;
}

function parseScopedPaths(root, rawPaths) {
  if (typeof rawPaths !== 'string' || rawPaths.trim().length === 0) {
    return [];
  }

  return rawPaths
    .replace(/(?:^|\s)-\s+/g, ',')
    .split(',')
    .map((candidate) => candidate.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .map((candidate) => normalizeToolPathCandidate(root, candidate, root))
    .filter(Boolean);
}

function readPacketContextFromRoot(root) {
  const sessionState = readOptionalJson(currentSessionPathFor(root));
  if (!sessionState?.logPath) {
    return null;
  }

  const lastPrompt = [...readOptionalJsonLines(sessionState.logPath)]
    .reverse()
    .find(
      (entry) =>
        entry?.event === 'userPromptSubmitted'
        && typeof entry?.details?.prompt === 'string'
    );
  if (!lastPrompt?.details?.prompt) {
    return null;
  }

  const prompt = lastPrompt.details.prompt;
  return {
    prompt,
    toolScope: extractPromptField(prompt, ['tool_scope', 'tool scope']),
    allowedPaths: parseScopedPaths(
      root,
      extractPromptField(prompt, ['allowed paths', 'allowed_paths'])
    ),
    forbiddenWork: parseScopedPaths(
      root,
      extractPromptField(prompt, ['forbidden work', 'forbidden_work'])
    ),
  };
}

function readActivePacketContext(root) {
  const candidates = [root];
  try {
    const realRoot = realpathSync(root);
    if (!candidates.includes(realRoot)) {
      candidates.push(realRoot);
    }
  } catch {
    // keep the original root only
  }

  for (const candidate of candidates) {
    const packetContext = readPacketContextFromRoot(candidate);
    if (packetContext) {
      return packetContext;
    }
  }

  return null;
}

function normalizeGuardMode(mode) {
  const normalized = normalizeHookId(mode);
  return ['warn', 'block'].includes(normalized) ? normalized : null;
}

function resolvePacketScopeGuardMode(env = process.env) {
  return normalizeGuardMode(env?.HARNESS_PACKET_SCOPE_GUARD_MODE) ?? 'warn';
}

function extractCommand(payload) {
  const toolName = normalizeHookId(payload?.toolName);
  if (!SHELL_TOOL_NAMES.has(toolName)) {
    return null;
  }

  const parsedToolArgs = parseJsonMaybe(payload?.toolArgs);
  if (parsedToolArgs && typeof parsedToolArgs === 'object') {
    for (const key of ['command', 'cmd']) {
      if (typeof parsedToolArgs[key] === 'string') {
        return parsedToolArgs[key];
      }
    }
  }

  return typeof payload?.toolArgs === 'string' ? payload.toolArgs : null;
}

function tokenizeShell(command) {
  const tokens = [];
  const pattern =
    /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  for (const match of command.matchAll(pattern)) {
    if (match[1] !== undefined) {
      tokens.push({ text: match[1], quoted: true });
    } else if (match[2] !== undefined) {
      tokens.push({ text: match[2], quoted: true });
    } else {
      tokens.push({ text: match[3], quoted: false });
    }
  }
  return tokens;
}

function isSeparatorToken(token) {
  return (
    Boolean(token) && !token.quoted && SHELL_SEPARATOR_TOKENS.has(token.text)
  );
}

function splitShellSegments(tokens) {
  const segments = [];
  let current = [];

  for (const token of tokens) {
    if (isSeparatorToken(token)) {
      if (current.length > 0) {
        segments.push(current);
      }
      current = [];
      continue;
    }
    current.push(token);
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function firstCommandTokenIndex(segment) {
  let index = 0;
  while (
    index < segment.length &&
    !segment[index].quoted &&
    /^[A-Za-z_][A-Za-z0-9_]*=/.test(segment[index].text)
  ) {
    index += 1;
  }
  return index;
}

function getSegmentHead(segment) {
  const headIndex = firstCommandTokenIndex(segment);
  return {
    headIndex,
    head: segment[headIndex]?.text ?? null,
  };
}

function getShellWrapperSubcommand(segment) {
  const { headIndex, head } = getSegmentHead(segment);
  if (!SHELL_WRAPPER_HEADS.has(head)) {
    return null;
  }

  let commandOptionSeen = false;
  for (let index = headIndex + 1; index < segment.length; index += 1) {
    const token = segment[index];
    if (isSeparatorToken(token)) {
      break;
    }

    if (!commandOptionSeen) {
      if (!token.quoted && /^-(?:[A-Za-z]*c[A-Za-z]*)$/i.test(token.text)) {
        commandOptionSeen = true;
      }
      continue;
    }

    return token.text;
  }

  return null;
}

function resolveCdTarget(cwd, segment, headIndex) {
  for (let index = headIndex + 1; index < segment.length; index += 1) {
    const token = segment[index];
    if (isSeparatorToken(token)) {
      break;
    }

    if (!token.quoted && token.text === '--') {
      continue;
    }

    if (!token.quoted && token.text.startsWith('-') && token.text !== '-') {
      continue;
    }

    if (token.text === '-') {
      return null;
    }

    return path.resolve(cwd, token.text);
  }

  return null;
}

function forEachShellCommand(command, baseDir, visitor) {
  if (typeof command !== 'string' || command.length === 0) {
    return true;
  }

  const tokens = tokenizeShell(command);
  if (tokens.length === 0) {
    return true;
  }

  let currentDir = baseDir;
  for (const segment of splitShellSegments(tokens)) {
    if (segment.length === 0) {
      continue;
    }

    const wrapperSubcommand = getShellWrapperSubcommand(segment);
    if (wrapperSubcommand) {
      if (!forEachShellCommand(wrapperSubcommand, currentDir, visitor)) {
        return false;
      }
      continue;
    }

    const { headIndex, head } = getSegmentHead(segment);
    if (!head) {
      continue;
    }

    if (head === 'cd') {
      const resolved = resolveCdTarget(currentDir, segment, headIndex);
      if (resolved) {
        currentDir = resolved;
      }
      continue;
    }

    if (visitor({ segment, cwd: currentDir, head, headIndex }) === false) {
      return false;
    }
  }

  return true;
}

function isLikelyRepoPathToken(token) {
  return /^[A-Za-z0-9_.\/-]+\.(?:cs|js|json|md|mjs|ps1|sh|ts|tsx|ya?ml)$/i.test(token);
}

function extractShellWritePaths(command, root, baseDir) {
  const candidates = [];

  forEachShellCommand(command, baseDir, ({ segment, cwd, head, headIndex }) => {
    const segmentTargets = [];

    for (let index = headIndex; index < segment.length; index += 1) {
      const token = segment[index];
      if (isSeparatorToken(token)) {
        break;
      }

      if (token.quoted) {
        continue;
      }

      const text = token.text;
      if (text === '>' || text === '>>' || /^\d?>$/.test(text)) {
        const nextToken = segment[index + 1];
        if (nextToken && !isSeparatorToken(nextToken)) {
          segmentTargets.push(nextToken.text);
        }
        continue;
      }

      const redirectionMatch = text.match(/^(?:\d?>|>>)(.+)$/);
      if (redirectionMatch) {
        segmentTargets.push(redirectionMatch[1]);
      }
    }

    if (head === 'tee') {
      for (let index = headIndex + 1; index < segment.length; index += 1) {
        const token = segment[index];
        if (isSeparatorToken(token)) {
          break;
        }
        if (!token.quoted && token.text.startsWith('-') && token.text !== '-') {
          continue;
        }
        if (token.text !== '-') {
          segmentTargets.push(token.text);
        }
      }
    }

    if (head === 'cp' || head === 'mv') {
      const destinationTokens = segment
        .slice(headIndex + 1)
        .filter(
          (token) =>
            !isSeparatorToken(token) &&
            (token.quoted || !token.text.startsWith('-') || token.text === '-')
        );
      const destination = destinationTokens.at(-1)?.text;
      if (destination) {
        segmentTargets.push(destination);
      }
    }

    if (head === 'sed') {
      const inPlace = segment
        .slice(headIndex + 1)
        .some(
          (token) =>
            !isSeparatorToken(token) &&
            !token.quoted &&
            (token.text === '-i' || token.text.startsWith('-i'))
        );
      if (inPlace) {
        for (const token of segment.slice(headIndex + 1)) {
          if (!isSeparatorToken(token) && isLikelyRepoPathToken(token.text)) {
            segmentTargets.push(token.text);
          }
        }
      }
    }

    for (const candidate of segmentTargets) {
      const normalized = normalizeToolPathCandidate(root, candidate, cwd);
      if (normalized) {
        candidates.push(normalized);
      }
    }
  });

  return candidates;
}

function extractTargetPaths(root, payload, baseDir = root) {
  const toolName = normalizeHookId(payload?.toolName);
  const command = extractCommand(payload);
  if (WRITE_TOOL_NAMES.has(toolName)) {
    return extractModifiedFilesFromTool(root, payload, baseDir);
  }

  if (!(SHELL_TOOL_NAMES.has(toolName) && command)) {
    return [];
  }

  return [...new Set(extractShellWritePaths(command, root, baseDir))];
}

function isGitPushCommand(command) {
  let matched = false;
  forEachShellCommand(command ?? '', '.', ({ segment, head, headIndex }) => {
    if (head !== 'git') {
      return;
    }

    for (let cursor = headIndex + 1; cursor < segment.length; cursor += 1) {
      const token = segment[cursor];
      if (isSeparatorToken(token)) {
        break;
      }

      if (
        !token.quoted &&
        [
          '-C',
          '-c',
          '--git-dir',
          '--work-tree',
          '--namespace',
          '--config-env',
        ].includes(token.text)
      ) {
        cursor += 1;
        continue;
      }

      if (!token.quoted && token.text.startsWith('-')) {
        continue;
      }

      if (token.text === 'push') {
        matched = true;
        return false;
      }
      break;
    }
  });

  return matched;
}

function isPrCreationSegment(segment, headIndex) {
  const text = segment
    .slice(headIndex)
    .map((token) => token.text)
    .join(' ');
  const ghApiPullsCreateEndpoint =
    /\bgh\s+api\b/i.test(text) && /\/pulls(?:[?\s]|$)/i.test(text);
  const ghApiExplicitGet = /(?:--method(?:=|\s+)GET|-X\s+GET)\b/i.test(text);
  const ghApiExplicitPost = /(?:--method(?:=|\s+)POST|-X\s+POST)\b/i.test(text);
  const ghApiFieldPost = /(?:^|\s)(?:-f|--field|-F|--raw-field)(?:\s|=)/i.test(
    text
  );

  return (
    /\bgh\s+pr\s+create\b/i.test(text) ||
    (/\bgh\s+stack\s+submit\b/i.test(text) &&
      /(?:^|\s)--auto(?:\s|$)/i.test(text)) ||
    (ghApiPullsCreateEndpoint &&
      !ghApiExplicitGet &&
      (ghApiExplicitPost || ghApiFieldPost))
  );
}

function isPrCreationCommand(command) {
  let matched = false;
  forEachShellCommand(command ?? '', '.', ({ segment, head, headIndex }) => {
    if (head !== 'gh') {
      return;
    }

    if (isPrCreationSegment(segment, headIndex)) {
      matched = true;
      return false;
    }
  });

  return matched;
}

function normalizeAllowedPath(allowedPath) {
  return String(allowedPath ?? '')
    .trim()
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');
}

function isWithinAllowedPath(targetPath, allowedPath) {
  const normalizedAllowedPath = normalizeAllowedPath(allowedPath).replace(
    /\/\*\*$/,
    ''
  );
  if (!normalizedAllowedPath) {
    return false;
  }

  return (
    targetPath === normalizedAllowedPath
    || targetPath.startsWith(`${normalizedAllowedPath}/`)
  );
}

function findOutOfScopeTargets(targetPaths, allowedPaths) {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return [];
  }

  if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) {
    return [];
  }

  return targetPaths.filter(
    (targetPath) =>
      !allowedPaths.some((allowedPath) =>
        isWithinAllowedPath(targetPath, allowedPath)
      )
  );
}

function findForbiddenTargets(targetPaths, forbiddenWork) {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return [];
  }

  if (!Array.isArray(forbiddenWork) || forbiddenWork.length === 0) {
    return [];
  }

  return targetPaths.filter((targetPath) =>
    forbiddenWork.some((forbiddenPath) =>
      isWithinAllowedPath(targetPath, forbiddenPath)
    )
  );
}

function buildWarning({
  code,
  message,
  guidance,
  selectedState,
  command = null,
  targetPaths = [],
  detail = null,
}) {
  return {
    code,
    severity: 'warning',
    ticket_key: selectedState?.state?.ticket_key ?? null,
    state_path: selectedState?.relativePath ?? null,
    message,
    guidance,
    command,
    target_paths: targetPaths,
    detail,
  };
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = warning.code;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function evaluatePolicyPayload(payload, { cwd = process.cwd(), env = process.env } = {}) {
  const payloadCwd = typeof payload?.cwd === 'string' && payload.cwd ? payload.cwd : cwd;
  const command = extractCommand(payload);
  const toolName = normalizeHookId(payload?.toolName);

  if (!isPolicyGuardEnabled(env)) {
    return { root: payloadCwd, command, targetPaths: [], selectedState: null, warnings: [] };
  }

  const root = resolveRepoRoot(payloadCwd);
  const repoCwd = resolveRepoCwd(root, payloadCwd);
  const shellWriteTargets = command ? extractShellWritePaths(command, root, repoCwd) : [];
  const packetContext = readActivePacketContext(root);
  const packetScopeGuardMode = resolvePacketScopeGuardMode(env);
  const relevant =
    (command && (isGitPushCommand(command) || isPrCreationCommand(command) || shellWriteTargets.length > 0)) ||
    WRITE_TOOL_NAMES.has(toolName);

  if (!relevant) {
    return { root: payloadCwd, command, targetPaths: [], selectedState: null, warnings: [] };
  }

  const targetPaths = extractTargetPaths(root, payload, repoCwd);
  const warnings = [];
  const repoWriteTargets = targetPaths;
  const writeRequested =
    WRITE_TOOL_NAMES.has(toolName) ||
    repoWriteTargets.length > 0 ||
    (command && (isGitPushCommand(command) || isPrCreationCommand(command)));

  if (packetContext?.toolScope === 'read-only' && writeRequested) {
    warnings.push(buildWarning({
      code: 'tool_scope_violation',
      selectedState: null,
      command,
      targetPaths: repoWriteTargets,
      message: 'Packet-scope guard observed a write request while the latest packet context is read-only.',
      guidance: 'Stay within the reviewer packet tool_scope or ask the coordinator to resend a read-write implementation packet.',
      detail: { guard_mode: packetScopeGuardMode, tool_scope: packetContext.toolScope },
    }));
  }

  const outOfScopeTargets = findOutOfScopeTargets(repoWriteTargets, packetContext?.allowedPaths ?? []);
  if (outOfScopeTargets.length > 0) {
    warnings.push(buildWarning({
      code: 'packet_scope_violation',
      selectedState: null,
      command,
      targetPaths: outOfScopeTargets,
      message: 'Packet-scope guard observed a repo write outside the latest packet allowed paths.',
      guidance: 'Stay within the approved allowed paths or ask the coordinator to resend a broadened packet before editing additional files.',
      detail: { guard_mode: packetScopeGuardMode, allowed_paths: packetContext.allowedPaths },
    }));
  }

  const forbiddenTargets = findForbiddenTargets(repoWriteTargets, packetContext?.forbiddenWork ?? []);
  if (forbiddenTargets.length > 0) {
    warnings.push(buildWarning({
      code: 'packet_forbidden_work_violation',
      selectedState: null,
      command,
      targetPaths: forbiddenTargets,
      message: 'Packet-scope guard observed a repo write that matches the latest packet forbidden work.',
      guidance: 'Avoid files or paths listed under forbidden work, or ask the coordinator to resend a revised packet before editing them.',
      detail: { guard_mode: packetScopeGuardMode, forbidden_work: packetContext.forbiddenWork },
    }));
  }

  return { root, command, targetPaths, selectedState: null, warnings: dedupeWarnings(warnings) };
}

function warningsArtifactPath(root) {
  return path.join(
    root,
    '.gearbox',
    'hooks',
    '.runtime',
    'policy-warnings.jsonl'
  );
}

function appendWarnings(root, payload, result, now = new Date()) {
  if (result.warnings.length === 0) return null;

  try {
    const artifactPath = warningsArtifactPath(root);
    mkdirSync(path.dirname(artifactPath), { recursive: true });
    const lines = result.warnings.map((warning) =>
      JSON.stringify({
        timestamp: now.toISOString(),
        code: warning.code,
        severity: warning.severity,
        ticket_key: warning.ticket_key,
        state_path: warning.state_path,
        tool_name: payload?.toolName ?? null,
        command: warning.command,
        target_paths: warning.target_paths,
        message: warning.message,
        guidance: warning.guidance,
        detail: warning.detail,
      })
    );

    writeFileSync(artifactPath, `${lines.join('\n')}\n`, {
      encoding: 'utf8',
      flag: 'a',
    });

    return artifactPath;
  } catch {
    return null;
  }
}

function writeWarningsToStderr(warnings, stderr = process.stderr) {
  for (const warning of warnings) {
    stderr.write(
      `Policy warning [${warning.code}]: ${warning.message}\n`
    );
    stderr.write(`Next: ${warning.guidance}\n`);
  }
}

function parsePayload(rawInput) {
  if (!rawInput) return null;
  try {
    return JSON.parse(rawInput);
  } catch {
    return null;
  }
}

export async function runCli({ cwd = process.cwd(), env = process.env, stderr = process.stderr } = {}) {
  const rawInput = await readStdin();
  const payload = parsePayload(rawInput);
  if (!payload) return 0;
  try {
    const result = evaluatePolicyPayload(payload, { cwd, env });
    appendWarnings(result.root, payload, result);
    writeWarningsToStderr(result.warnings, stderr);
  } catch {
    // warn-only
  }
  return 0;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(await runCli());
}
