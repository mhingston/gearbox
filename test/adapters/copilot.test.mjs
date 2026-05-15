import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig } from '../../src/adapters/copilot.mjs';

describe('copilot adapter', () => {
  it('generates valid hooks.json with all 7 hooks', () => {
    const { files, warnings } = generateConfig();
    assert.equal(files.length, 1);
    assert.equal(files[0].path, '.github/copilot/hooks.json');
    const config = JSON.parse(files[0].content);
    assert.equal(config.version, 1);
    const hookNames = Object.keys(config.hooks);
    assert.ok(hookNames.includes('sessionStart'), 'missing sessionStart');
    assert.ok(hookNames.includes('preToolUse'), 'missing preToolUse');
    assert.ok(hookNames.includes('sessionEnd'), 'missing sessionEnd');
    assert.equal(warnings.length, 0);
  });

  it('uses custom hooksDir when specified', () => {
    const { files } = generateConfig({ hooksDir: '.custom/hooks' });
    const config = JSON.parse(files[0].content);
    const cmd = config.hooks.sessionStart[0].bash;
    assert.ok(cmd.includes('.custom/hooks'), `Expected .custom/hooks in: ${cmd}`);
  });

  it('only includes selected hooks when selectedHooks is provided', () => {
    const { files } = generateConfig({ selectedHooks: ['preToolUse', 'postToolUse'] });
    const config = JSON.parse(files[0].content);
    assert.ok(config.hooks.preToolUse);
    assert.ok(config.hooks.postToolUse);
    assert.equal(Object.keys(config.hooks).length, 2);
  });
});
