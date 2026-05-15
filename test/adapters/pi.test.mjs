import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig } from '../../src/adapters/pi.mjs';

describe('pi adapter', () => {
  it('generates a TypeScript extension with all supported hooks', () => {
    const { files } = generateConfig();
    assert.equal(files[0].path, '.pi/extensions/gearbox-harness.ts');
    const content = files[0].content;
    assert.ok(content.includes('onToolCall'), 'missing preToolUse method');
    assert.ok(content.includes('onToolResult'), 'missing postToolUse method');
    assert.ok(content.includes('onSessionStart'), 'missing sessionStart method');
    assert.ok(content.includes('onSessionEnd'), 'missing sessionEnd method');
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
