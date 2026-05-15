import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('package.json', () => {
  it('has correct name', () => assert.equal(pkg.name, 'gearbox'));
  it('has type:module', () => assert.equal(pkg.type, 'module'));
  it('has bin entry', () => assert.ok(pkg.bin?.gearbox, 'bin.gearbox must be defined'));
  it('has node engines constraint >= 20.12.1', () => {
    assert.ok(pkg.engines?.node, 'engines.node must be defined');
    assert.match(pkg.engines.node, />=20\.12\.1/);
  });
  it('has version field', () => assert.match(pkg.version, /^\d+\.\d+\.\d+$/));
});
