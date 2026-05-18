import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTestWorkspace } from '../../src/harness/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const HELPERS = [
  'paths.mjs',
  'tmpdir.mjs',
  'normalize-error.mjs',
  'validate-skill.mjs',
];

function helperPath(helperName) {
  return path.join(here, '..', '..', 'src', 'harness', helperName);
}

function runHelper({ cwd, helperName, args = [], input = '' }) {
  return spawnSync(process.execPath, [helperPath(helperName), ...args], {
    cwd,
    encoding: 'utf8',
    input,
  });
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

for (const helperName of HELPERS) {
  test(`${helperName} prints usage for --help`, async (t) => {
    const workspace = await createTestWorkspace({ prefix: 'helper-help-' });
    t.after(() => workspace.cleanup());

    const result = runHelper({
      cwd: workspace.path,
      helperName,
      args: ['--help'],
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(combinedOutput(result), /Usage:/);
    assert.match(combinedOutput(result), new RegExp(helperName.replace('.', '\\.')));
  });
}

const INVALID_INVOCATIONS = [
  { helperName: 'validate-skill.mjs', args: [] },
  { helperName: 'paths.mjs', args: ['config-root', 'extra'] },
  { helperName: 'tmpdir.mjs', args: ['create', 'extra'] },
  { helperName: 'normalize-error.mjs', args: [] },
];

for (const { helperName, args } of INVALID_INVOCATIONS) {
  test(`${helperName} prints actionable usage for invalid invocation`, async (t) => {
    const workspace = await createTestWorkspace({ prefix: 'helper-invalid-' });
    t.after(() => workspace.cleanup());

    const result = runHelper({ cwd: workspace.path, helperName, args });

    assert.notEqual(result.status, 0);
    assert.match(combinedOutput(result), /Usage:/);
  });
}
