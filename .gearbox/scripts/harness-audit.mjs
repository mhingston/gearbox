#!/usr/bin/env node
/**
 * harness-audit.mjs
 *
 * Health and preflight audit for a gearbox installation.
 *
 * Commands:
 *   health   [--json] [--root <path>]   — 0-100 health score
 *   preflight [--format json] [--root <path>] — pre-push checks
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { emitOutput, hasJsonFlag, isDirectRun, parseCliArgs } from './common.mjs';

// ── Constants ────────────────────────────────────────────────────────────────
const MIN_NODE_VERSION = '20.12.1';

const REQUIRED_HOOK_FILES = [
  'self-learning.mjs',
  'policy-guard.mjs',
  'context-compact.mjs',
  'event-log.mjs',
  'session-checkpoint.mjs',
];

const ADAPTER_PATHS = [
  '.github/copilot/hooks.json',
  '.claude/settings.json',
  '.codex/hooks.json',
  '.gemini/settings.json',
  '.opencode/plugins/gearbox-harness.ts',
  '.pi/extensions/gearbox-harness.ts',
];

// ── Utilities ────────────────────────────────────────────────────────────────
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, predicate) {
  const results = [];
  async function visit(d) {
    let entries = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      if (entry.isFile() && predicate(entry.name)) results.push(full);
    }
  }
  await visit(dir);
  return results;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isGitleaksInstalled() {
  try {
    execFileSync('gitleaks', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ── Health check ─────────────────────────────────────────────────────────────
export async function runHealthCheck(root = process.cwd()) {
  const categories = {};

  // 30pts: hooks
  {
    const hooksDir = path.join(root, '.gearbox', 'hooks');
    const checks = [];
    let score = 0;
    const dirExists = await pathExists(hooksDir);
    if (dirExists) {
      const missing = [];
      for (const file of REQUIRED_HOOK_FILES) {
        if (!(await pathExists(path.join(hooksDir, file)))) {
          missing.push(file);
        }
      }
      if (missing.length === 0) {
        score = 30;
        checks.push(`hook scripts present (${REQUIRED_HOOK_FILES.length} files)`);
      } else {
        checks.push(`missing hook scripts: ${missing.join(', ')}`);
      }
    } else {
      checks.push('.gearbox/hooks/ directory not found');
    }
    categories.hooks = { score, max: 30, checks };
  }

  // 20pts: adapters
  {
    const checks = [];
    let score = 0;
    let found = null;
    for (const adapterPath of ADAPTER_PATHS) {
      const abs = path.join(root, adapterPath);
      if (await pathExists(abs)) {
        found = adapterPath;
        break;
      }
    }
    if (found) {
      score = 20;
      checks.push(`adapter configured: ${found}`);
    } else {
      checks.push('no platform adapter configuration found');
    }
    categories.adapters = { score, max: 20, checks };
  }

  // 20pts: skills
  {
    const checks = [];
    let score = 0;
    const skillsDir = path.join(root, '.agents', 'skills');
    if (await pathExists(skillsDir)) {
      const skillFiles = await walkFiles(skillsDir, (name) => name === 'SKILL.md');
      if (skillFiles.length > 0) {
        score = 20;
        checks.push(`skills directory has ${skillFiles.length} skill(s)`);
      } else {
        checks.push('.agents/skills/ exists but contains no SKILL.md files');
      }
    } else {
      checks.push('.agents/skills/ directory not found');
    }
    categories.skills = { score, max: 20, checks };
  }

  // 15pts: security (gitleaks)
  {
    const checks = [];
    let score = 0;
    if (isGitleaksInstalled()) {
      score = 15;
      checks.push('gitleaks is installed');
    } else {
      checks.push('gitleaks not found on PATH');
    }
    categories.security = { score, max: 15, checks };
  }

  // 15pts: runtime (Node version)
  {
    const checks = [];
    let score = 0;
    const nodeVersion = process.version.replace(/^v/, '');
    if (compareVersions(nodeVersion, MIN_NODE_VERSION) >= 0) {
      score = 15;
      checks.push(`Node.js ${nodeVersion} satisfies >=${MIN_NODE_VERSION}`);
    } else {
      checks.push(`Node.js ${nodeVersion} is below minimum ${MIN_NODE_VERSION}`);
    }
    categories.runtime = { score, max: 15, checks };
  }

  const totalScore = Object.values(categories).reduce((s, c) => s + c.score, 0);
  const maxScore = Object.values(categories).reduce((s, c) => s + c.max, 0);

  return {
    score: totalScore,
    max_score: maxScore,
    pass: totalScore >= 70,
    categories,
  };
}

// ── Preflight audit ──────────────────────────────────────────────────────────
export async function runPreflightAudit({ root = process.cwd() } = {}) {
  const checks = [];

  // Node version check
  const nodeVersion = process.version.replace(/^v/, '');
  const nodeOk = compareVersions(nodeVersion, MIN_NODE_VERSION) >= 0;
  checks.push({
    id: 'node_version',
    ok: nodeOk,
    message: nodeOk
      ? `Node.js ${nodeVersion} satisfies >=${MIN_NODE_VERSION}`
      : `Node.js ${nodeVersion} is below minimum ${MIN_NODE_VERSION}`,
  });

  // gitleaks check
  const gitleaksOk = isGitleaksInstalled();
  checks.push({
    id: 'gitleaks_installed',
    ok: gitleaksOk,
    message: gitleaksOk ? 'gitleaks is installed' : 'gitleaks not found on PATH',
  });

  // Branch check — not on main/master
  let branch = null;

  // Try .git/HEAD first (works in isolated dirs too)
  try {
    const { readFileSync } = await import('node:fs');
    const headPath = path.join(root, '.git', 'HEAD');
    const head = readFileSync(headPath, 'utf8').trim();
    const m = head.match(/^ref: refs\/heads\/(.+)$/);
    if (m) branch = m[1];
  } catch { /* no .git/HEAD */ }

  if (branch === null) {
    try {
      branch = execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim() || null;
    } catch { /* not a git repo */ }
  }

  const protectedBranches = new Set(['main', 'master']);
  let branchOk;
  let branchMessage;

  if (branch === null) {
    branchOk = true;
    branchMessage = 'Not a git repository or branch unknown — skipping branch check';
  } else if (protectedBranches.has(branch)) {
    branchOk = false;
    branchMessage = `Branch ${branch} is a protected branch (main/master)`;
  } else {
    branchOk = true;
    branchMessage = `Branch ${branch} is not main/master`;
  }

  checks.push({ id: 'branch_isolated', ok: branchOk, message: branchMessage });

  const failedCheck = checks.find((c) => !c.ok) ?? null;

  return {
    ok: checks.every((c) => c.ok),
    checks,
    failed_check: failedCheck,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main(argv = process.argv.slice(2)) {
  const { command, flags } = parseCliArgs(argv);
  const root = flags.root ? path.resolve(String(flags.root)) : process.cwd();
  const json = hasJsonFlag(flags) || flags.format === 'json';

  if (command === 'health' || !command) {
    const result = await runHealthCheck(root);
    emitOutput(result, { json });
    process.exitCode = result.pass ? 0 : 1;
    return;
  }

  if (command === 'preflight') {
    const result = await runPreflightAudit({ root });
    emitOutput(result, { json });
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  process.stderr.write(`Unknown command: ${command}\nUsage: harness-audit.mjs health|preflight [--json] [--root <path>]\n`);
  process.exitCode = 1;
}

if (isDirectRun(import.meta.url)) {
  await main();
}
