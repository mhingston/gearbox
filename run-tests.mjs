#!/usr/bin/env node
// Cross-platform test runner — finds all *.test.mjs files and passes them to node --test.
// Works on Node 20+ (node --test glob support requires Node 21+).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function findTests(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? findTests(full)
      : name.endsWith('.test.mjs') ? [full] : [];
  });
}

const files = findTests('test');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
