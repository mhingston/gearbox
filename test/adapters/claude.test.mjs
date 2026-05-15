import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig } from '../../src/adapters/claude.mjs';

describe('claude adapter', () => {
  it('generates settings.json with hook entries', () => {
    const { files, warnings } = generateConfig();
    assert.equal(files[0].path, '.claude/settings.json');
    const settings = JSON.parse(files[0].content);
    assert.ok(settings.hooks, 'missing hooks key');
    assert.ok(settings.hooks.PreToolUse, 'missing PreToolUse');
    assert.ok(settings.hooks.PostToolUse, 'missing PostToolUse');
  });

  it('preserves existing keys when merging into existing settings', () => {
    const existing = JSON.stringify({
      model: 'claude-opus-4-5',
      someOtherKey: true,
      hooks: { ExistingHook: [{ matcher: '.*', hooks: [] }] }
    });
    const { files } = generateConfig({ existingSettings: existing });
    const settings = JSON.parse(files[0].content);
    assert.equal(settings.model, 'claude-opus-4-5');
    assert.equal(settings.someOtherKey, true);
    assert.ok(settings.hooks.ExistingHook, 'existing hook should be preserved');
    assert.ok(settings.hooks.PreToolUse, 'gearbox PreToolUse should be added');
  });

  it('maps errorOccurred to both StopFailure and PostToolUseFailure', () => {
    const { files } = generateConfig({ selectedHooks: ['errorOccurred'] });
    const settings = JSON.parse(files[0].content);
    assert.ok(settings.hooks.StopFailure, 'missing StopFailure');
    assert.ok(settings.hooks.PostToolUseFailure, 'missing PostToolUseFailure');
  });

  it('returns a warning and empty base when existingSettings is invalid JSON', () => {
    const { files, warnings } = generateConfig({ existingSettings: '{invalid' });
    assert.ok(warnings.some(w => w.toLowerCase().includes('invalid json')));
    const settings = JSON.parse(files[0].content);
    assert.ok(settings.hooks, 'should still generate hooks section');
  });
});
