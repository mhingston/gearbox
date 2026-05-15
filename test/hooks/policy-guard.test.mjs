import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guardPath = path.join(__dirname, '../../src/hooks/policy-guard.mjs');

function runGuard(payload) {
  const result = spawnSync('node', [guardPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 5000,
  });
  return result;
}

describe('policy-guard', () => {
  it('allows safe bash commands', () => {
    const result = runGuard({
      toolName: 'bash',
      toolInput: { command: 'git status' },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });

  it('allows file edits', () => {
    const result = runGuard({
      toolName: 'edit',
      toolInput: { path: 'src/foo.mjs', content: 'hello' },
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });

  it('handles empty/malformed input gracefully (exits 0)', () => {
    const result = spawnSync('node', [guardPath], {
      input: '',
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  });
});
