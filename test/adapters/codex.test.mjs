import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig } from '../../src/adapters/codex.mjs';

describe('codex adapter', () => {
  it('generates hooks.json with 5 supported hooks', () => {
    const { files } = generateConfig();
    const config = JSON.parse(files[0].content);
    const hookNames = Object.keys(config.hooks);
    assert.ok(hookNames.includes('session-start'));
    assert.ok(hookNames.includes('pre-tool-use'));
    assert.ok(!hookNames.includes('errorOccurred'), 'errorOccurred not supported');
    assert.ok(!hookNames.includes('sessionEnd'), 'sessionEnd not supported');
  });

  it('includes warnings for unsupported hooks', () => {
    const { warnings } = generateConfig();
    assert.ok(warnings.some(w => w.includes('errorOccurred')));
    assert.ok(warnings.some(w => w.includes('sessionEnd')));
  });
});
