#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { emitOutput, isDirectRun, parseCliArgs } from './common.mjs';

const DEFAULT_BASE_REF = 'origin/main';
const SKILL_LINE_LIMIT = 800;
const SKIP_MARKDOWN_SCHEMES = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

function normalizeRelativePath(filePath) {
  return String(filePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function repoRelativePath(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function readChangedFilesFromGit(repoRoot, baseRef) {
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output
      .split('\n')
      .map((line) => normalizeRelativePath(line))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readChangedFilesFromFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split('\n')
    .map((line) => normalizeRelativePath(line))
    .filter(Boolean);
}

function stripMarkdownNoise(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .replace(/`[^`\n]+`/g, '');
}

function extractMarkdownLinks(content) {
  const links = [];
  const pattern = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1] === '!') continue;
    links.push(match[3].trim());
  }
  return links;
}

async function addMarkdownLinkFindings(repoRoot, relativePath, findings, warnings) {
  const absPath = path.join(repoRoot, relativePath);
  const content = await readText(absPath);
  if (content === null) return;

  const stripped = stripMarkdownNoise(content);

  for (const href of extractMarkdownLinks(stripped)) {
    const cleanHref = href.split('#')[0].trim();
    if (!cleanHref || SKIP_MARKDOWN_SCHEMES.test(cleanHref)) continue;
    const resolved = path.resolve(path.dirname(absPath), cleanHref);
    if (await pathExists(resolved)) continue;

    findings.push({
      check: 'Broken cross-links in docs',
      file: relativePath,
      expected: `A file at ${cleanHref}`,
      found: `Missing ${repoRelativePath(repoRoot, resolved) || resolved}`,
      suggestedAction: `Fix the link in ${relativePath}`,
      severity: 'error',
    });
  }

  if (/<!-- NEEDS REVIEW:/i.test(content)) {
    warnings.push({
      check: 'Manual review marker',
      file: relativePath,
      message: 'File contains a NEEDS REVIEW marker and should be checked manually.',
    });
  }
}

async function addSkillSizeFinding(repoRoot, relativePath, findings) {
  const absPath = path.join(repoRoot, relativePath);
  const content = await readText(absPath);
  if (content === null) return;

  const lineCount = content.split('\n').length;
  if (lineCount <= SKILL_LINE_LIMIT) return;

  findings.push({
    check: 'Oversized skill files',
    file: relativePath,
    expected: `SKILL.md at or below ${SKILL_LINE_LIMIT} lines`,
    found: `SKILL.md is ${lineCount} lines`,
    suggestedAction: 'Split the skill or move bulk reference data into references/',
    severity: 'warning',
  });
}

async function addSymlinkFinding(repoRoot, relativePath, findings) {
  const absPath = path.join(repoRoot, relativePath);
  const expectedTarget = relativePath === 'skills' ? '.agents/skills' : '../.agents/skills';

  try {
    const stat = await fs.lstat(absPath);
    if (!stat.isSymbolicLink()) {
      findings.push({
        check: 'Skills canonical location — symlinks intact',
        file: relativePath,
        expected: 'A symlink',
        found: 'A real file or directory',
        suggestedAction: `Recreate ${relativePath} as a symlink to ${expectedTarget}`,
        severity: 'error',
      });
      return;
    }

    const target = await fs.readlink(absPath);
    if (normalizeRelativePath(target) === normalizeRelativePath(expectedTarget)) return;

    findings.push({
      check: 'Skills canonical location — symlinks intact',
      file: relativePath,
      expected: expectedTarget,
      found: target,
      suggestedAction: `Point ${relativePath} at ${expectedTarget}`,
      severity: 'error',
    });
  } catch {
    findings.push({
      check: 'Skills canonical location — symlinks intact',
      file: relativePath,
      expected: `Symlink to ${expectedTarget}`,
      found: 'Missing',
      suggestedAction: `Restore the ${relativePath} symlink`,
      severity: 'error',
    });
  }
}

async function analyzeChangedFile(repoRoot, relativePath, findings, warnings) {
  if (relativePath === 'skills' || relativePath === '.github/skills') {
    await addSymlinkFinding(repoRoot, relativePath, findings);
    return;
  }

  if (relativePath.endsWith('/SKILL.md')) {
    await addSkillSizeFinding(repoRoot, relativePath, findings);
  }

  if (relativePath.endsWith('.md') || relativePath === 'AGENTS.md') {
    await addMarkdownLinkFindings(repoRoot, relativePath, findings, warnings);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function analyzeConventionDriftGate({
  repoRoot = process.cwd(),
  baseRef = DEFAULT_BASE_REF,
  changedFiles = null,
} = {}) {
  const changed = unique(
    changedFiles ?? readChangedFilesFromGit(repoRoot, baseRef)
  ).map(normalizeRelativePath);

  const findings = [];
  const warnings = [];

  for (const relativePath of changed) {
    await analyzeChangedFile(repoRoot, relativePath, findings, warnings);
  }

  return { repoRoot, baseRef, changedFiles: changed, findings, warnings };
}

/** Alias used in tests and external callers */
export async function runConventionDriftCheck(rootDir, options = {}) {
  const result = await analyzeConventionDriftGate({ repoRoot: rootDir, ...options });
  return {
    score: result.findings.length === 0 ? 100 : Math.max(0, 100 - result.findings.filter(f => f.severity === 'error').length * 10),
    summary: `${result.findings.length} finding(s) in ${result.changedFiles.length} changed file(s)`,
    violations: result.findings,
    ...result,
  };
}

function formatFinding(finding, index) {
  return [
    `### ${index + 1}. ${finding.check}`,
    '',
    `| Field | Detail |`,
    `|---|---|`,
    `| **File** | ${finding.file} |`,
    `| **Expected** | ${finding.expected} |`,
    `| **Found** | ${finding.found} |`,
    `| **Suggested action** | ${finding.suggestedAction} |`,
  ].join('\n');
}

function formatReport(result) {
  const lines = [`[convention-drift-gate] Scanned ${result.changedFiles.length} changed file(s)`];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of result.warnings) {
      lines.push(`- ${warning.check}: ${warning.file} — ${warning.message}`);
    }
  }

  if (result.findings.length === 0) {
    lines.push('', 'No convention drift detected in changed files.');
    return lines.join('\n');
  }

  lines.push('', `Findings: ${result.findings.length}`);
  for (const [index, finding] of result.findings.entries()) {
    lines.push('', formatFinding(finding, index));
  }

  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  const { flags } = parseCliArgs(argv);
  const repoRoot = path.resolve(String(flags['repo-root'] || process.cwd()));
  const baseRef = String(flags['base-ref'] || DEFAULT_BASE_REF);
  const changedFilesFile = flags['changed-files-file'] ? String(flags['changed-files-file']) : null;
  const json = flags.json === true || flags.j === true;

  const changedFiles = changedFilesFile
    ? await readChangedFilesFromFile(path.resolve(repoRoot, changedFilesFile))
    : null;

  const result = await analyzeConventionDriftGate({ repoRoot, baseRef, changedFiles });

  emitOutput(json ? result : formatReport(result), { json });

  return { ...result, exitCode: result.findings.length > 0 ? 1 : 0 };
}

if (isDirectRun(import.meta.url)) {
  const result = await main();
  process.exitCode = result.exitCode;
}
