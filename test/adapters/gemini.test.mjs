import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig } from '../../src/adapters/gemini.mjs';

describe('gemini adapter', () => {
  it('generates settings.json with Gemini event names', () => {
    const { files } = generateConfig();
    const settings = JSON.parse(files[0].content);
    assert.ok(settings.hooks.BeforeTool, 'missing BeforeTool');
    assert.ok(settings.hooks.AfterTool, 'missing AfterTool');
    assert.ok(!settings.hooks.preToolUse, 'should not use gearbox names');
  });

  it('includes warning for unsupported errorOccurred', () => {
    const { warnings } = generateConfig();
    assert.ok(warnings.some(w => w.includes('errorOccurred')));
  });

  it('preserves existing settings when merging', () => {
    const existing = JSON.stringify({ theme: 'dark', hooks: {} });
    const { files } = generateConfig({ existingSettings: existing });
    const settings = JSON.parse(files[0].content);
    assert.equal(settings.theme, 'dark');
    assert.ok(settings.hooks.BeforeTool);
  });

  it('returns a warning and empty base when existingSettings is invalid JSON', () => {
    const { files, warnings } = generateConfig({ existingSettings: '{invalid' });
    assert.ok(warnings.some(w => w.toLowerCase().includes('invalid json')));
    const settings = JSON.parse(files[0].content);
    assert.ok(settings.hooks, 'should still generate hooks section');
  });
});
