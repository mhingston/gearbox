#!/usr/bin/env node

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

import { emitOutput, hasJsonFlag, isDirectRun, parseCliArgs } from './common.mjs';

const PLATFORMS = [
  {
    id: 'claude',
    name: 'Claude Code',
    configPath: '.claude/settings.json',
    instructionSymlinks: [{ target: 'CLAUDE.md', source: 'AGENTS.md' }],
    skillsDir: '.claude/skills/',
    skillsFormat: 'compatible',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    configPath: '.github/copilot/hooks.json',
    instructionSymlinks: [
      { target: 'CLAUDE.md', source: 'AGENTS.md' },
      { target: '.github/copilot-instructions.md', source: 'AGENTS.md' },
    ],
    skillsDir: '.github/skills/',
    skillsFormat: 'compatible',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    configPath: '.codex/hooks.json',
    instructionSymlinks: [],
    skillsDir: null,
    note: 'Natively reads AGENTS.md and .agents/skills/ — no symlinks needed',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    configPath: '.gemini/settings.json',
    instructionSymlinks: [{ target: 'GEMINI.md', source: 'AGENTS.md', optional: true }],
    skillsDir: null,
    note: 'Uses GEMINI.md by default; configurable to AGENTS.md via settings.json',
  },
  {
    id: 'opencode',
    name: 'opencode',
    configPath: '.opencode/plugins/gearbox-harness.ts',
    instructionSymlinks: [],
    skillsDir: null,
    note: 'Natively reads AGENTS.md and .agents/skills/ — no symlinks needed',
  },
  {
    id: 'pi',
    name: 'pi.dev',
    configPath: '.pi/extensions/gearbox-harness.ts',
    instructionSymlinks: [],
    skillsDir: null,
    note: 'Natively reads AGENTS.md — no symlinks needed',
  },
];

const SKILLS_SOURCE_DIR = '.agents/skills/';

async function readlineQuestion(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function symlinkTargetKind(targetPath) {
  try {
    const stat = await fsPromises.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      const linkTarget = await fsPromises.readlink(targetPath);
      const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
      return { kind: 'symlink', linkTarget, resolvedTarget };
    }
    if (stat.isDirectory()) return { kind: 'directory' };
    return { kind: 'file' };
  } catch (err) {
    if (err.code === 'ENOENT') return { kind: 'empty' };
    return { kind: 'error', error: err };
  }
}

function isMineSymlink(state, expectedSourcePath) {
  return state.kind === 'symlink' && expectedSourcePath && state.resolvedTarget === path.resolve(expectedSourcePath);
}

function relativeSource(sourceFile, targetFile) {
  const targetDir = path.dirname(targetFile);
  return path.relative(targetDir, sourceFile);
}

async function createSymlink(sourceFile, targetFile, dryRun) {
  const sourceRel = relativeSource(sourceFile, targetFile);
  const targetDir = path.dirname(targetFile);

  await fsPromises.mkdir(targetDir, { recursive: true });

  if (dryRun) {
    return `Would create: ${targetFile} -> ${sourceRel}`;
  }

  await fsPromises.symlink(sourceRel, targetFile);
  return `Created: ${targetFile} -> ${sourceRel}`;
}

async function createDirSymlink(sourceDir, targetDir, dryRun) {
  const sourceRel = relativeSource(sourceDir, targetDir);
  const parentDir = path.dirname(targetDir);

  await fsPromises.mkdir(parentDir, { recursive: true });

  if (dryRun) {
    return `Would create: ${targetDir} -> ${sourceRel}`;
  }

  await fsPromises.symlink(sourceRel, targetDir);
  return `Created: ${targetDir} -> ${sourceRel}`;
}

async function auditPlatforms(rootDir) {
  const results = [];

  for (const platform of PLATFORMS) {
    const configExists = await symlinkTargetKind(path.join(rootDir, platform.configPath));
    const instructionResults = [];

    for (const sym of platform.instructionSymlinks) {
      const targetPath = path.join(rootDir, sym.target);
      const sourcePath = path.join(rootDir, sym.source);
      const state = await symlinkTargetKind(targetPath);

      instructionResults.push({
        target: sym.target,
        source: sym.source,
        kind: state.kind,
        linkTarget: state.linkTarget,
        isMine: isMineSymlink(state, sourcePath),
        optional: sym.optional || false,
      });
    }

    let skillsState = null;
    if (platform.skillsDir && platform.skillsFormat === 'compatible') {
      const skillsTargetPath = path.join(rootDir, platform.skillsDir);
      const skillsSourcePath = path.join(rootDir, SKILLS_SOURCE_DIR);
      const rawState = await symlinkTargetKind(skillsTargetPath);
      skillsState = { ...rawState, isMine: isMineSymlink(rawState, skillsSourcePath) };
    }

    results.push({
      platform,
      adapterConfigured: configExists.kind !== 'empty',
      instructionResults,
      skillsState,
    });
  }

  return results;
}

function formatAudit(results) {
  const lines = [];
  lines.push('─'.repeat(60));
  lines.push('  Platform Config Audit');
  lines.push('─'.repeat(60));

  for (const r of results) {
    const adapterBadge = r.adapterConfigured ? '✅ adapter' : '⬜ adapter';
    lines.push(`\n  ${r.platform.name}  ${adapterBadge}`);

    if (r.platform.note) {
      lines.push(`    ${r.platform.note}`);
    }

    const configPath = r.platform.configPath.padEnd(38);
    lines.push(`    Config: ${configPath}`);

    for (const ir of r.instructionResults) {
      const stateStr = describeState(ir);
      lines.push(`    Instr:  ${(ir.source + ' -> ' + ir.target).padEnd(42)} ${stateStr}`);
    }

    if (r.skillsState) {
      const stateStr = describeState(r.skillsState);
      lines.push(`    Skills: ${r.platform.skillsDir.padEnd(38)} ${stateStr}`);
    }
  }

  lines.push('\n' + '─'.repeat(60));
  return lines.join('\n');
}

function describeState(state) {
  if (typeof state === 'object' && state !== null) {
    if (state.kind === 'empty') return '⬜ (not present)';
    if (state.kind === 'symlink') return state.isMine ? '✅ (already linked)' : `⚠ (points to ${state.linkTarget})`;
    if (state.kind === 'file') return '⚠ (real file exists)';
    if (state.kind === 'directory') return '⚠ (directory exists)';
    return `❌ (${state.error?.message || 'error'})`;
  }
  if (state === 'empty' || state === null) return '⬜ (not present)';
  return state;
}

async function promptYesNo(question, defaultYes = true) {
  const prompt = defaultYes ? `${question} [Y/n] ` : `${question} [y/N] `;
  const answer = await readlineQuestion(prompt);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

async function selectPlatformInteractively(auditResults) {
  const selected = [];

  for (const r of auditResults) {
    const hasWork = r.instructionResults.some((ir) => ir.kind !== 'symlink' || !ir.isMine)
      || (r.skillsState && !r.skillsState.isMine && r.skillsState.kind !== 'directory');

    if (!hasWork && !r.instructionResults.some((ir) => ir.optional)) {
      continue;
    }

    const wants = await promptYesNo(`Configure ${r.platform.name}?`, false);
    if (wants) selected.push(r);
  }

  return selected.map((r) => r.platform.id);
}

function platformById(id) {
  return PLATFORMS.find((p) => p.id === id);
}

async function applyConfig(platformIds, rootDir, dryRun, auditResults) {
  const yes = auditResults === true; // shorthand: pass `true` for auto-confirm
  if (auditResults === true) auditResults = undefined;
  const messages = [];

  for (const id of platformIds) {
    const platform = platformById(id);
    if (!platform) {
      messages.push(`Unknown platform: ${id}`);
      continue;
    }

    if (dryRun) messages.push(`\n[${platform.name}]`);

    for (const sym of platform.instructionSymlinks) {
      const sourcePath = path.join(rootDir, sym.source);
      const targetPath = path.join(rootDir, sym.target);

      const sourceExists = await symlinkTargetKind(sourcePath);
      if (sourceExists.kind === 'empty') {
        messages.push(`  Skip ${sym.target}: source ${sym.source} does not exist`);
        continue;
      }

      const targetState = await symlinkTargetKind(targetPath);

      if (isMineSymlink(targetState, sourcePath)) {
        continue;
      }

      if (targetState.kind === 'symlink' && !isMineSymlink(targetState, sourcePath)) {
        const replace = dryRun || yes || await promptYesNo(`  ${sym.target} already points to ${targetState.linkTarget}. Replace?`, false);
        if (!replace || dryRun) {
          if (!dryRun) messages.push(`  Skip ${sym.target}: would overwrite existing symlink`);
          if (dryRun) messages.push(`  Would replace ${sym.target} (currently -> ${targetState.linkTarget})`);
          continue;
        }
        await fsPromises.unlink(targetPath);
      }

      if (targetState.kind === 'file' || targetState.kind === 'directory') {
        if (!dryRun) messages.push(`  Skip ${sym.target}: real file/directory exists at path`);
        continue;
      }

      const msg = await createSymlink(sourcePath, targetPath, dryRun);
      messages.push(`  ${msg}`);
    }

    if (platform.skillsDir && platform.skillsFormat === 'compatible') {
      const targetSkillsDir = path.join(rootDir, platform.skillsDir);
      const sourceSkillsDir = path.join(rootDir, SKILLS_SOURCE_DIR);

      const sourceExists = await symlinkTargetKind(sourceSkillsDir);
      if (sourceExists.kind === 'empty' || sourceExists.kind === 'file') {
        messages.push(`  Skip skills/: source ${SKILLS_SOURCE_DIR} does not exist or is not a directory`);
        continue;
      }

      const targetState = await symlinkTargetKind(targetSkillsDir);

      if (isMineSymlink(targetState, sourceSkillsDir)) {
        continue;
      }

      if (targetState.kind === 'symlink' && !isMineSymlink(targetState, sourceSkillsDir)) {
        const replace = dryRun || yes || await promptYesNo(`  ${platform.skillsDir} already points to ${targetState.linkTarget}. Replace?`, false);
        if (!replace || dryRun) {
          if (!dryRun) messages.push(`  Skip ${platform.skillsDir}: would overwrite existing symlink`);
          if (dryRun) messages.push(`  Would replace ${platform.skillsDir} (currently -> ${targetState.linkTarget})`);
          continue;
        }
        await fsPromises.unlink(targetSkillsDir);
      }

      if (targetState.kind === 'file') {
        messages.push(`  Skip ${platform.skillsDir}: real file exists at path`);
        continue;
      }

      if (targetState.kind === 'directory') {
        if (dryRun) {
          messages.push(`  Would replace ${platform.skillsDir} (real directory -> symlink)`);
          continue;
        }
        const replace = yes || await promptYesNo(`  ${platform.skillsDir} is a real directory. Replace with symlink?`, false);
        if (!replace) {
          messages.push(`  Skip ${platform.skillsDir}: real directory exists`);
          continue;
        }
        await fsPromises.rm(targetSkillsDir, { recursive: true, force: true });
      }

      const msg = await createDirSymlink(sourceSkillsDir, targetSkillsDir, dryRun);
      messages.push(`  ${msg}`);
    }
  }

  return messages.join('\n');
}

async function main() {
  const { command, subcommand, args, flags } = parseCliArgs();
  const rootDir = flags.root ? path.resolve(flags.root) : process.cwd();
  const dryRun = flags['dry-run'] || flags.dryRun || flags.d;
  const yes = flags.yes || flags.y;
  const json = hasJsonFlag(flags);

  if (flags.help || flags.h || command === 'help') {
    emitOutput(`Usage: sync-agent-config.mjs [command] [options]

Commands:
  audit                Show current symlink state (default if no command given)
  apply                Apply configuration (interactive by default)

Options:
  --platforms <list>   Comma-separated platform IDs (copilot,claude,codex,gemini,opencode,pi)
  --dry-run, -d        Preview changes without writing
  --yes, -y            Auto-confirm replacements (for scripts/wizard)
  --json, -j           JSON output
  --root <path>        Repository root directory (default: cwd)
  --help, -h           Show this help`);
    return;
  }

  const auditResults = await auditPlatforms(rootDir);

  if (!command || command === 'audit') {
    if (json) {
      emitOutput(JSON.stringify(auditResults, null, 2), { json: true });
    } else {
      emitOutput(formatAudit(auditResults));
    }
    return;
  }

  if (command === 'apply') {
    if (json) {
      emitOutput(JSON.stringify({ error: 'JSON output not supported for apply command' }, null, 2), { json: true });
      return;
    }

    if (!yes) emitOutput(formatAudit(auditResults));

    let platformIds;

    if (flags.platforms) {
      platformIds = flags.platforms.split(',').map((s) => s.trim()).filter(Boolean);
      const invalid = platformIds.filter((id) => !platformById(id));
      if (invalid.length > 0) {
        emitOutput(`\nUnknown platform(s): ${invalid.join(', ')}`);
        emitOutput(`Valid platforms: ${PLATFORMS.map((p) => p.id).join(', ')}`);
        return;
      }
    } else {
      emitOutput('');
      platformIds = await selectPlatformInteractively(auditResults);
    }

    if (platformIds.length === 0) {
      emitOutput('\nNo platforms selected. Nothing to do.');
      return;
    }

    const summary = await applyConfig(platformIds, rootDir, dryRun, yes ? true : auditResults);
    emitOutput('\n' + summary);

    if (dryRun) {
      emitOutput('\n── Dry run — no changes written ──');
    }
  }
}

if (isDirectRun(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export async function syncForPlatforms(platformIds, rootDir, dryRun) {
  return applyConfig(platformIds, rootDir, dryRun, true);
}

export { PLATFORMS, auditPlatforms, applyConfig, formatAudit };
