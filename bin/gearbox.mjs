#!/usr/bin/env node
// Node version guard — must run before any ESM imports
const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 12) || (major === 20 && minor === 12 && patch < 1)) {
  process.stderr.write(
    `gearbox requires Node.js >=20.12.1. You are running ${process.versions.node}.\n` +
    `Please upgrade: https://nodejs.org\n`
  );
  process.exit(1);
}

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pc from 'picocolors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`gearbox v${pkg.version}\n`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    `${pc.bold('gearbox')} — AI agent harness bootstrap\n\n` +
    `Usage: npx gearbox [options]\n\n` +
    `Options:\n` +
    `  --version, -v   Print version\n` +
    `  --help, -h      Print this help\n` +
    `  --dry-run       Show files that would be written without writing them\n` +
    `  --yes           Run with all defaults (non-interactive)\n`
  );
  process.exit(0);
}

if (process.env.GEARBOX_NO_WIZARD === '1') {
  process.stdout.write(`gearbox v${pkg.version}\n`);
  process.exit(0);
}

// Parse additional flags
const dryRun = args.includes('--dry-run');
const yes = args.includes('--yes');

// --platforms <comma-separated>
let platforms = null;
const platformsIdx = args.indexOf('--platforms');
if (platformsIdx !== -1 && args[platformsIdx + 1]) {
  platforms = args[platformsIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
}

// --skills-dir <path>
let skillsDir = null;
const skillsDirIdx = args.indexOf('--skills-dir');
if (skillsDirIdx !== -1 && args[skillsDirIdx + 1]) {
  skillsDir = args[skillsDirIdx + 1];
}

import { runWizard } from '../src/wizard/index.mjs';

try {
  await runWizard({ dryRun, yes, platforms, skillsDir });
} catch (err) {
  process.stderr.write(`\nError: ${err.message}\n`);
  process.exit(1);
}
process.exit(0);
