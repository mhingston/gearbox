import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig } from '../../src/adapters/opencode.mjs';

describe('opencode adapter', () => {
  it('generates a TypeScript plugin with all supported hooks', () => {
    const { files, warnings } = generateConfig();
    assert.equal(files[0].path, '.opencode/plugins/gearbox-harness.ts');
    const content = files[0].content;
    assert.ok(content.includes('tool.execute.before'), 'missing preToolUse event');
    assert.ok(content.includes('tool.execute.after'), 'missing postToolUse event');
    assert.ok(content.includes('session.created'), 'missing sessionStart event');
    assert.ok(warnings.some(w => w.includes('sessionEnd')), 'should warn about sessionEnd partial match');
  });

  it('uses await import not require for child_process', () => {
    const { files } = generateConfig();
    const content = files[0].content;
    assert.ok(content.includes('await import("child_process")'), 'must use ESM dynamic import');
    assert.ok(!content.includes('require('), 'must not use CommonJS require');
  });

  it('includes stdio configuration for hooks that pass input', () => {
    const { files } = generateConfig({ selectedHooks: ['preToolUse'] });
    const content = files[0].content;
    assert.ok(content.includes('stdio'), 'missing stdio option for input-passing hooks');
    assert.ok(content.includes('"pipe"'), 'stdin should be "pipe" for input option');
  });
});
