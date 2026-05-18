import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createTestWorkspace } from '../../src/harness/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const helperPath = path.join(here, '..', '..', 'src', 'harness', 'normalize-error.mjs');

function runNormalizeError({ cwd, input }) {
  return spawnSync(process.execPath, [helperPath], {
    cwd,
    encoding: 'utf8',
    input,
  });
}

test('normalize-error replaces unstable identifiers with stable placeholders', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'normalize-error-' });
  t.after(() => workspace.cleanup());

  const input = [
    'Request 123e4567-e89b-12d3-a456-426614174000 failed at /var/folders/ab/cd123/T/baseline-worktree-update-api/worktrees/feature-update-api/src/worker.mjs:42:11',
    'Created 2026-03-29T12:34:56.000Z while replaying 03/29/2026 12:34:56',
  ].join('\n');

  const result = runNormalizeError({ cwd: workspace.path, input });

  assert.equal(result.status, 0, result.stderr);
  const normalized = result.stdout.trim();
  assert.match(normalized, /\{guid\}/);
  assert.match(normalized, /\{pos\}/);
  assert.match(normalized, /\{date\}/);
  assert.match(normalized, /\{tmpdir\}/);
  assert.doesNotMatch(normalized, /123e4567-e89b-12d3-a456-426614174000/);
  assert.doesNotMatch(normalized, /:42:11/);
  assert.doesNotMatch(normalized, /2026-03-29/);
  assert.doesNotMatch(normalized, /baseline-worktree-update-api/);
});

test('normalize-error generalizes guid and position variants to the same placeholders', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'normalize-error-' });
  t.after(() => workspace.cleanup());

  const input = [
    'Non-RFC guid deadbeef-cafe-0bad-7eed-0123456789ab leaked from parser.mjs:7',
    'Comma position parser.mjs:12,24 should collapse',
    'Paren position parser.mjs(5,9) should collapse too',
  ].join('\n');

  const result = runNormalizeError({ cwd: workspace.path, input });

  assert.equal(result.status, 0, result.stderr);
  const normalized = result.stdout.trim();
  assert.match(normalized, /\{guid\}/);
  assert.equal((normalized.match(/\{pos\}/g) ?? []).length, 3, normalized);
  assert.doesNotMatch(normalized, /deadbeef-cafe-0bad-7eed-0123456789ab/);
  assert.doesNotMatch(normalized, /:7\b/);
  assert.doesNotMatch(normalized, /:12,24/);
  assert.doesNotMatch(normalized, /\(5,9\)/);
});
