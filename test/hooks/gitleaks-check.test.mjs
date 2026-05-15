import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '../../src/hooks/gitleaks-check.sh');

describe('gitleaks-check.sh', () => {
  it('exits 0 when gitleaks is not installed (fail-open)', () => {
    const result = spawnSync('bash', [scriptPath], {
      input: JSON.stringify({ toolName: 'edit', toolInput: { content: 'hello world' } }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    assert.ok(result.status === 0, `Expected exit 0 (fail-open if no gitleaks). stderr: ${result.stderr}`);
  });
});
