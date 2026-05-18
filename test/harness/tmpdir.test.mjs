import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTestWorkspace } from '../../src/harness/common.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const helperUrl = pathToFileURL(path.join(here, '..', '..', 'src', 'harness', 'tmpdir.mjs')).href;

async function loadTmpdirModule() {
  return import(`${helperUrl}?cacheBust=${Date.now()}-${Math.random()}`);
}

test('tmpdir creates scoped directories under the host temp root', async (t) => {
  const workspace = await createTestWorkspace({ prefix: 'tmpdir-' });
  t.after(() => workspace.cleanup());

  const { createScopedTempDir } = await loadTmpdirModule();
  const result = await createScopedTempDir({
    scope: 'baseline-worktree',
    key: 'update-api',
  });

  const relativeToTempRoot = path.relative(os.tmpdir(), result.path);
  assert.notEqual(relativeToTempRoot, '');
  assert.ok(!relativeToTempRoot.startsWith('..'), `${result.path} was not rooted in ${os.tmpdir()}`);
  assert.match(result.path, /baseline-worktree/i);
  await fs.access(result.path);

  if (os.tmpdir() !== '/tmp') {
    assert.ok(!result.path.startsWith('/tmp/'), `expected ${result.path} to avoid a hardcoded /tmp root`);
  }

  await fs.rm(result.path, { recursive: true, force: true });
});
