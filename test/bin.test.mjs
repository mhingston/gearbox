import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.join(__dirname, '..', 'bin', 'gearbox.mjs');

describe('bin/gearbox.mjs', () => {
  it('exits 0 and prints welcome banner', () => {
    const result = spawnSync('node', [binPath, '--version'], {
      encoding: 'utf8',
      env: { ...process.env, GEARBOX_NO_WIZARD: '1' },
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.match(result.stdout, /gearbox/, 'Expected "gearbox" in stdout');
  });

  it('prints version when --version flag used', () => {
    const result = spawnSync('node', [binPath, '--version'], {
      encoding: 'utf8',
      env: { ...process.env, GEARBOX_NO_WIZARD: '1' },
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\d+\.\d+\.\d+/, 'Expected semver in stdout');
  });

  it('--help exits 0 and prints usage', () => {
    const result = spawnSync('node', [binPath, '--help'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /--dry-run/);
    assert.match(result.stdout, /--yes/);
  });

  it('--dry-run accepted without error', () => {
    const result = spawnSync('node', [binPath, '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, GEARBOX_NO_WIZARD: '1' },
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  });

  it('--yes accepted without error', () => {
    const result = spawnSync('node', [binPath, '--yes'], {
      encoding: 'utf8',
      env: { ...process.env, GEARBOX_NO_WIZARD: '1' },
    });
    assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  });
});
