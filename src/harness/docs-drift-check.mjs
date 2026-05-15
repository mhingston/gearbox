#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { emitOutput, hasJsonFlag, isDirectRun, parseCliArgs } from './common.mjs';

const execFileAsync = promisify(execFile);
const SKILL_LINE_LIMIT = 800;
const KNOWN_PATH_PREFIXES = [
  'src/',
  '.github/',
  '.agents/',
  'tests/',
  'utilities/',
  'docs/',
];
const SKIP_MARKDOWN_SCHEMES = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;
const COMMAND_PREFIX = /^(?:node|yarn|npm|pnpm|bun)\b/;
const HTTP_METHOD_PREFIX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//;
const TEMPLATE_PLACEHOLDER = /[<>{}\[\]]/;
const WILDCARD_PATTERN = /[*?]/;
const EXAMPLE_TICKET_PATTERN = /\b[A-Z]{2,10}-\d+\b/;
const PLACEHOLDER_WORDS = /(?:^|[/_.-])(?:new|example|your|sample|my|foo|bar|placeholder|template|someproject)(?:[/_.-]|$)/i;
const IGNORED_DIRS = new Set([
  '.git',
  '.worktrees',
  'worktrees',
  'node_modules',
  'dist',
  'coverage',
]);
// No payments-specific optional artifact paths
const OPTIONAL_LOCAL_ARTIFACT_PREFIXES = [];
const OPTIONAL_LOCAL_ARTIFACT_FILES = new Set();

function normalizeRelativePath(filePath) {
  return String(filePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function repoRelativePath(repoRoot, absolutePath) {
  return normalizeRelativePath(path.relative(repoRoot, absolutePath));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isRepoRelativePathToken(value) {
  return value === 'AGENTS.md'
    || value === 'skills'
    || value === '.github/skills'
    || KNOWN_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function stripQuotes(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '');
}

function cleanToken(value) {
  return stripQuotes(String(value || '').trim()).replace(/[),.;:]+$/g, '');
}

function tokenizeCommand(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

function isNotAPath(value) {
  if (!value) return true;
  if (HTTP_METHOD_PREFIX.test(value)) return true;
  if (value.startsWith('/') && !/\.[A-Za-z0-9]+$/.test(value)) return true;
  if (/[=();,]/.test(value) || /["']/.test(value)) return true;
  return false;
}

function containsPlaceholder(value) {
  return TEMPLATE_PLACEHOLDER.test(value)
    || value.includes('${')
    || value.includes('…')
    || PLACEHOLDER_WORDS.test(value)
    || EXAMPLE_TICKET_PATTERN.test(value);
}

function looksLikePathClaim(value) {
  if (!value || containsPlaceholder(value) || isNotAPath(value)) return false;
  if (WILDCARD_PATTERN.test(value)) return false;
  return isRepoRelativePathToken(value);
}

function splitCommandSequence(command) {
  return String(command || '')
    .split(/\s*(?:&&|\|\||;)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function lineCount(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function createIssue({
  code, severity, category, file, line = null, message,
  currentText = null, expected = null, found = null, suggestedAction = null,
}) {
  return { code, severity, category, file, line, message, current_text: currentText, expected, found, suggested_action: suggestedAction };
}

function computeDocsDriftScore(issues) {
  const deductions = { error: 10, warning: 3, info: 1 };
  return Math.max(0, 100 - issues.reduce((total, issue) => total + (deductions[issue.severity] ?? 0), 0));
}

function summarizeIssues(issues) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };
}

function formatDocsDriftQuiet(report) {
  const parts = [];
  if (report.summary.errors > 0) parts.push(`${report.summary.errors} error${report.summary.errors === 1 ? '' : 's'}`);
  if (report.summary.warnings > 0) parts.push(`${report.summary.warnings} warning${report.summary.warnings === 1 ? '' : 's'}`);
  if (report.summary.info > 0) parts.push(`${report.summary.info} info`);
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `docs-drift: score ${report.score}/100${suffix}`;
}

function formatDocsDriftReport(report) {
  const lines = [
    `[docs-drift-check] Scanned ${report.files_checked} file(s)`,
    `Docs drift score: ${report.score}/100 — ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info`,
  ];

  if (report.findings.length === 0) {
    lines.push('', 'No deterministic docs drift detected.');
    return lines.join('\n');
  }

  const grouped = new Map();
  for (const issue of report.findings) {
    if (!grouped.has(issue.file)) grouped.set(issue.file, []);
    grouped.get(issue.file).push(issue);
  }

  for (const [file, issues] of grouped.entries()) {
    lines.push('', `## ${file}`);
    for (const issue of issues) {
      const location = issue.line ? `:${issue.line}` : '';
      lines.push(`- [${issue.severity}] ${issue.code}${location} — ${issue.message}`);
      if (issue.current_text) lines.push(`  Current: ${issue.current_text}`);
      if (issue.expected) lines.push(`  Expected: ${issue.expected}`);
      if (issue.found) lines.push(`  Found: ${issue.found}`);
      if (issue.suggested_action) lines.push(`  Suggested action: ${issue.suggested_action}`);
    }
  }

  return lines.join('\n');
}

async function walkFiles(rootDir, predicate) {
  const results = [];

  async function visit(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (entry.isFile() && predicate(fullPath, entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await visit(rootDir);
  return results;
}

async function listGitTrackedFiles(repoRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'ls-files', '-z'], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.split('\0').filter(Boolean).map(normalizeRelativePath);
  } catch {
    return null;
  }
}

function isScannableDocumentationPath(filePath) {
  return filePath === 'AGENTS.md'
    || (filePath.startsWith('docs/') && filePath.endsWith('.md'))
    || (filePath.startsWith('.agents/') && filePath.endsWith('/SKILL.md'));
}

async function buildRepoFileIndex(repoRoot) {
  const trackedFiles = await listGitTrackedFiles(repoRoot);
  if (trackedFiles) return trackedFiles;
  const files = await walkFiles(repoRoot, () => true);
  return files.map((filePath) => repoRelativePath(repoRoot, filePath));
}

async function listScanFiles(repoRoot) {
  const trackedFiles = await listGitTrackedFiles(repoRoot);
  if (trackedFiles) {
    return trackedFiles
      .filter(isScannableDocumentationPath)
      .map((filePath) => path.resolve(repoRoot, filePath))
      .sort((a, b) => a.localeCompare(b));
  }

  const results = [];
  const agentsPath = path.join(repoRoot, 'AGENTS.md');
  if (await pathExists(agentsPath)) results.push(agentsPath);

  const docsDir = path.join(repoRoot, 'docs');
  if (await pathExists(docsDir)) {
    results.push(...await walkFiles(docsDir, (p) => p.endsWith('.md')));
  }

  const skillsDir = path.join(repoRoot, '.agents');
  if (await pathExists(skillsDir)) {
    results.push(...await walkFiles(skillsDir, (_p, name) => name === 'SKILL.md'));
  }

  return results.sort((a, b) => a.localeCompare(b));
}

async function loadWorkspaceInfo(repoRoot) {
  const rootPackage = await readJson(path.join(repoRoot, 'package.json'));
  const rootScripts = new Set(Object.keys(rootPackage?.scripts ?? {}));
  const workspaceMap = new Map();

  const workspaces = Array.isArray(rootPackage?.workspaces)
    ? rootPackage.workspaces
    : Array.isArray(rootPackage?.workspaces?.packages)
      ? rootPackage.workspaces.packages
      : [];

  for (const workspacePath of workspaces) {
    if (typeof workspacePath !== 'string' || workspacePath.includes('*')) continue;
    const packageJsonPath = path.join(repoRoot, workspacePath, 'package.json');
    const workspacePackage = await readJson(packageJsonPath);
    if (!workspacePackage) continue;
    const scripts = new Set(Object.keys(workspacePackage.scripts ?? {}));
    const keys = [normalizeRelativePath(workspacePath), workspacePackage.name].filter(Boolean);
    for (const key of keys) workspaceMap.set(String(key), scripts);
  }

  return { rootScripts, workspaces: workspaceMap };
}

function stripCommentSegments(line, commentState) {
  let result = '';
  let index = 0;
  let inComment = commentState;

  while (index < line.length) {
    if (inComment) {
      const endIndex = line.indexOf('-->', index);
      if (endIndex === -1) return { text: result, inComment: true };
      inComment = false;
      index = endIndex + 3;
      continue;
    }
    const commentIndex = line.indexOf('<!--', index);
    if (commentIndex === -1) { result += line.slice(index); break; }
    result += line.slice(index, commentIndex);
    const endIndex = line.indexOf('-->', commentIndex + 4);
    if (endIndex === -1) return { text: result, inComment: true };
    index = endIndex + 3;
  }

  return { text: result, inComment };
}

function resolveTargetPath({ repoRoot, sourceFilePath, token }) {
  if (token.startsWith('./') || token.startsWith('../')) {
    return path.resolve(path.dirname(sourceFilePath), token);
  }
  if (token === 'AGENTS.md' || token === 'skills' || token === '.github/skills'
    || KNOWN_PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) {
    return path.resolve(repoRoot, token);
  }
  return path.resolve(path.dirname(sourceFilePath), token);
}

function isOptionalLocalArtifactPath(repoRoot, absolutePath) {
  const relativePath = repoRelativePath(repoRoot, absolutePath);
  if (!relativePath) return false;
  if (OPTIONAL_LOCAL_ARTIFACT_FILES.has(relativePath)) return true;
  return OPTIONAL_LOCAL_ARTIFACT_PREFIXES.some((prefix) =>
    relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalized = normalizeRelativePath(pattern);
  let regex = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (character === '*' && next === '*') { regex += '.*'; index += 1; continue; }
    if (character === '*') { regex += '[^/]*'; continue; }
    if (character === '?') { regex += '[^/]'; continue; }
    regex += escapeRegExp(character);
  }
  return new RegExp(`^${regex}$`);
}

function matchPatternAgainstRepo(pattern, repoFiles) {
  const expression = globToRegExp(pattern);
  return repoFiles.some((filePath) => expression.test(filePath));
}

async function verifyPathToken({ repoRoot, sourceFilePath, sourceRelativePath, token, lineNumber, currentText, repoFiles }) {
  const normalizedToken = cleanToken(token);
  if (!looksLikePathClaim(normalizedToken)) return [];
  const targetPath = resolveTargetPath({ repoRoot, sourceFilePath, token: normalizedToken });
  if (isOptionalLocalArtifactPath(repoRoot, targetPath)) return [];
  if (await pathExists(targetPath)) return [];
  return [createIssue({
    code: 'MISSING_PATH', severity: 'error', category: 'path',
    file: sourceRelativePath, line: lineNumber,
    message: `Referenced path does not exist: ${normalizedToken}`,
    currentText, expected: `A file or directory at ${normalizedToken}`,
    found: `Missing ${repoRelativePath(repoRoot, targetPath) || normalizedToken}`,
    suggestedAction: `Update the reference in ${sourceRelativePath}`,
  })];
}

function shouldSkipHref(href) {
  return !href || href.startsWith('/') || SKIP_MARKDOWN_SCHEMES.test(href) || /[{][^}]+[}]/.test(href);
}

async function verifyMarkdownLink({ repoRoot, sourceFilePath, sourceRelativePath, href, lineNumber, currentText }) {
  const rawTarget = String(href || '').split(/\s+/)[0];
  const cleanHref = rawTarget.split('#')[0].trim();
  if (shouldSkipHref(cleanHref)) return [];

  const targetPath = cleanHref.startsWith('./') || cleanHref.startsWith('../')
    || (!KNOWN_PATH_PREFIXES.some((prefix) => cleanHref.startsWith(prefix)) && cleanHref !== 'AGENTS.md')
    ? path.resolve(path.dirname(sourceFilePath), cleanHref)
    : path.resolve(repoRoot, cleanHref);

  if (isOptionalLocalArtifactPath(repoRoot, targetPath)) return [];
  if (await pathExists(targetPath)) return [];

  return [createIssue({
    code: 'BROKEN_LINK', severity: 'error', category: 'link',
    file: sourceRelativePath, line: lineNumber,
    message: `Markdown link target does not exist: ${cleanHref}`,
    currentText, expected: `A file at ${cleanHref}`,
    found: `Missing ${repoRelativePath(repoRoot, targetPath) || cleanHref}`,
    suggestedAction: `Fix the link in ${sourceRelativePath}`,
  })];
}

async function verifyWorkspaceCommand({ command, sourceRelativePath, lineNumber, currentText, workspaceInfo }) {
  const match = command.match(/^yarn\s+workspace\s+(\S+)\s+(\S+)/);
  if (!match) return [];
  const workspaceKey = cleanToken(match[1]);
  const scriptName = cleanToken(match[2]);
  if (containsPlaceholder(workspaceKey) || containsPlaceholder(scriptName)) return [];
  const scripts = workspaceInfo.workspaces.get(workspaceKey);
  if (!scripts) {
    return [createIssue({
      code: 'DEAD_COMMAND', severity: 'error', category: 'command',
      file: sourceRelativePath, line: lineNumber,
      message: `Workspace "${workspaceKey}" is not defined for documented command: ${command}`,
      currentText, expected: `A workspace named ${workspaceKey}`, found: 'Workspace missing',
      suggestedAction: `Update the documented yarn workspace command in ${sourceRelativePath}`,
    })];
  }
  if (scripts.has(scriptName)) return [];
  return [createIssue({
    code: 'DEAD_COMMAND', severity: 'error', category: 'command',
    file: sourceRelativePath, line: lineNumber,
    message: `Workspace script "${scriptName}" is not defined for documented command: ${command}`,
    currentText, expected: `A ${scriptName} script in workspace ${workspaceKey}`, found: 'Script missing',
    suggestedAction: `Update the documented yarn workspace command in ${sourceRelativePath}`,
  })];
}

async function verifyRootScriptCommand({ command, sourceRelativePath, lineNumber, currentText, workspaceInfo }) {
  const match = command.match(/^(?:npm|pnpm|bun)\s+run\s+(\S+)/);
  if (!match) return [];
  const scriptName = cleanToken(match[1]);
  if (containsPlaceholder(scriptName)) return [];
  if (workspaceInfo.rootScripts.has(scriptName)) return [];
  return [createIssue({
    code: 'DEAD_COMMAND', severity: 'error', category: 'command',
    file: sourceRelativePath, line: lineNumber,
    message: `Root script "${scriptName}" is not defined for documented command: ${command}`,
    currentText, expected: `A ${scriptName} script in the root package.json`, found: 'Script missing',
    suggestedAction: `Update the documented root package command in ${sourceRelativePath}`,
  })];
}

async function verifyCommandPathTokens({ repoRoot, sourceFilePath, sourceRelativePath, command, lineNumber, currentText, repoFiles }) {
  const issues = [];
  const tokens = tokenizeCommand(command);

  for (const rawToken of tokens) {
    const token = cleanToken(rawToken);
    if (!token || token.startsWith('-') || token.startsWith('$') || token.startsWith('./')
      || token.startsWith('../') || token === '<' || token === '>' || containsPlaceholder(token)) {
      continue;
    }

    if (token === 'AGENTS.md' || token === 'skills' || token === '.github/skills'
      || token.startsWith('./') || token.startsWith('../')
      || KNOWN_PATH_PREFIXES.some((prefix) => token.startsWith(prefix))) {
      if (WILDCARD_PATTERN.test(token)) {
        const resolvedPattern = repoRelativePath(repoRoot, resolveTargetPath({ repoRoot, sourceFilePath, token }));
        if (!resolvedPattern.startsWith('..') && matchPatternAgainstRepo(resolvedPattern, repoFiles)) continue;
        issues.push(createIssue({
          code: 'DEAD_COMMAND', severity: 'error', category: 'command',
          file: sourceRelativePath, line: lineNumber,
          message: `Documented command path pattern does not match any files: ${token}`,
          currentText, expected: `At least one file matching ${token}`, found: 'No matching files',
          suggestedAction: `Update the documented command in ${sourceRelativePath}`,
        }));
        continue;
      }

      const targetPath = resolveTargetPath({ repoRoot, sourceFilePath, token });
      if (isOptionalLocalArtifactPath(repoRoot, targetPath)) continue;
      if (await pathExists(targetPath)) continue;

      issues.push(createIssue({
        code: 'DEAD_COMMAND', severity: 'error', category: 'command',
        file: sourceRelativePath, line: lineNumber,
        message: `Documented command references a missing path: ${token}`,
        currentText, expected: `A file or directory at ${token}`,
        found: `Missing ${repoRelativePath(repoRoot, targetPath) || token}`,
        suggestedAction: `Update the documented command in ${sourceRelativePath}`,
      }));
    }
  }

  return issues;
}

async function verifyCommand({ repoRoot, sourceFilePath, sourceRelativePath, command, lineNumber, currentText, workspaceInfo, repoFiles }) {
  if (!command) return [];
  const issues = [];
  issues.push(...await verifyWorkspaceCommand({ command, sourceRelativePath, lineNumber, currentText, workspaceInfo }));
  issues.push(...await verifyRootScriptCommand({ command, sourceRelativePath, lineNumber, currentText, workspaceInfo }));
  issues.push(...await verifyCommandPathTokens({ repoRoot, sourceFilePath, sourceRelativePath, command, lineNumber, currentText, repoFiles }));
  return issues;
}

async function analyzeMarkdownFile({ repoRoot, filePath, workspaceInfo, repoFiles }) {
  const content = await fs.readFile(filePath, 'utf8');
  const issues = [];
  const lines = content.split(/\r?\n/);
  const sourceRelativePath = repoRelativePath(repoRoot, filePath);
  const isSkillFile = sourceRelativePath.endsWith('/SKILL.md');

  if (isSkillFile && lineCount(content) > SKILL_LINE_LIMIT) {
    issues.push(createIssue({
      code: 'OVERSIZED_SKILL', severity: 'warning', category: 'size',
      file: sourceRelativePath, line: null,
      message: `SKILL.md is ${lineCount(content)} lines (limit: ${SKILL_LINE_LIMIT})`,
      expected: `SKILL.md at or below ${SKILL_LINE_LIMIT} lines`,
      found: `${lineCount(content)} lines`,
      suggestedAction: 'Split bulk reference content into references/ or helper files',
    }));
  }

  let inFrontmatter = lines[0]?.trim() === '---';
  let inFence = false;
  let inComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();

    if (inFrontmatter) {
      if (lineNumber > 1 && trimmed === '---') inFrontmatter = false;
      continue;
    }

    if (/<!--\s*NEEDS REVIEW:/i.test(rawLine)) {
      issues.push(createIssue({
        code: 'NEEDS_REVIEW_MARKER', severity: 'warning', category: 'manual-review',
        file: sourceRelativePath, line: lineNumber,
        message: 'File contains a NEEDS REVIEW marker',
        currentText: rawLine.trim(),
        suggestedAction: `Review the marker in ${sourceRelativePath}`,
      }));
    }

    if (trimmed.startsWith('```')) { inFence = !inFence; continue; }

    if (inFence) {
      const command = trimmed;
      if (COMMAND_PREFIX.test(command)) {
        for (const part of splitCommandSequence(command)) {
          issues.push(...await verifyCommand({
            repoRoot, sourceFilePath: filePath, sourceRelativePath,
            command: part, lineNumber, currentText: rawLine.trim(),
            workspaceInfo, repoFiles,
          }));
        }
      }
      continue;
    }

    const { text: visibleLine, inComment: nextCommentState } = stripCommentSegments(rawLine, inComment);
    inComment = nextCommentState;
    if (!visibleLine.trim()) continue;

    const linkLine = visibleLine.replace(/`[^`\n]+`/g, '');
    const linkPattern = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkPattern.exec(linkLine)) !== null) {
      issues.push(...await verifyMarkdownLink({
        repoRoot, sourceFilePath: filePath, sourceRelativePath,
        href: linkMatch[2], lineNumber, currentText: rawLine.trim(),
      }));
    }

    const inlineCodePattern = /`([^`\n]+)`/g;
    let inlineMatch;
    while ((inlineMatch = inlineCodePattern.exec(visibleLine)) !== null) {
      const token = cleanToken(inlineMatch[1]);
      if (COMMAND_PREFIX.test(token)) {
        for (const part of splitCommandSequence(token)) {
          issues.push(...await verifyCommand({
            repoRoot, sourceFilePath: filePath, sourceRelativePath,
            command: part, lineNumber, currentText: rawLine.trim(),
            workspaceInfo, repoFiles,
          }));
        }
        continue;
      }
      issues.push(...await verifyPathToken({
        repoRoot, sourceFilePath: filePath, sourceRelativePath,
        token, lineNumber, currentText: rawLine.trim(), repoFiles,
      }));
    }
  }

  return dedupeIssues(issues);
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = JSON.stringify([issue.code, issue.severity, issue.file, issue.line, issue.message, issue.current_text]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function analyzeDocsDrift({ repoRoot = process.cwd(), files = null } = {}) {
  const scanFiles = files
    ? files.map((filePath) => path.resolve(repoRoot, filePath))
    : await listScanFiles(repoRoot);
  const workspaceInfo = await loadWorkspaceInfo(repoRoot);
  const repoFiles = await buildRepoFileIndex(repoRoot);
  const findings = [];

  for (const filePath of scanFiles) {
    findings.push(...await analyzeMarkdownFile({ repoRoot, filePath, workspaceInfo, repoFiles }));
  }

  const summary = summarizeIssues(findings);
  return {
    repo_root: repoRoot,
    files_checked: scanFiles.length,
    scanned_files: scanFiles.map((filePath) => repoRelativePath(repoRoot, filePath)),
    findings,
    warnings: findings.filter((i) => i.severity !== 'error'),
    score: computeDocsDriftScore(findings),
    summary,
    timestamp: new Date().toISOString(),
  };
}

/** Alias used in tests and external callers */
export async function runDocsDriftCheck(rootDir, options = {}) {
  return analyzeDocsDrift({ repoRoot: rootDir, ...options });
}

export async function main(argv = process.argv.slice(2)) {
  const { flags, positionals } = parseCliArgs(argv);
  const repoRoot = path.resolve(String(flags['repo-root'] || process.cwd()));
  const json = hasJsonFlag(flags);
  const quiet = flags.quiet === true || flags.q === true;
  const files = positionals.length > 0 ? positionals.map(String) : null;

  const report = await analyzeDocsDrift({ repoRoot, files });

  const output = json
    ? report
    : quiet
      ? formatDocsDriftQuiet(report)
      : formatDocsDriftReport(report);

  emitOutput(output, { json });

  return { ...report, exitCode: report.summary.errors > 0 ? 1 : 0 };
}

if (isDirectRun(import.meta.url)) {
  const result = await main();
  process.exitCode = result.exitCode;
}
