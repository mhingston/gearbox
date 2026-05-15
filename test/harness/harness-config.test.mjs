import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('harness-config', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-harness-config-'));
  });

  after(() => rm(tmpDir, { recursive: true, force: true }));

  describe('loadHarnessConfig', () => {
    it('loads built-in defaults when no config path given', async () => {
      const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
      const { config, warnings } = await loadHarnessConfig({ noCache: true });
      assert.ok(config, 'config should be returned');
      assert.equal(typeof config.node.min_version, 'string');
      assert.equal(config.node.min_version, '20.12.1');
      assert.equal(config.$schema_version, '1.0.0');
    });

    it('loads from a custom config path', async () => {
      const customConfig = {
        $schema_version: '1.0.0',
        node: { min_version: '21.0.0' },
        audit: { max_prime_bytes: 8192 },
      };
      const configPath = path.join(tmpDir, 'custom-config.json');
      await writeFile(configPath, JSON.stringify(customConfig));

      const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
      const { config, warnings } = await loadHarnessConfig({ configPath, noCache: true });
      assert.equal(config.node.min_version, '21.0.0');
      assert.equal(config.audit.max_prime_bytes, 8192);
    });

    it('falls back to defaults when config file is missing', async () => {
      const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
      const { config, warnings } = await loadHarnessConfig({
        configPath: path.join(tmpDir, 'nonexistent.json'),
        noCache: true,
      });
      assert.equal(config.node.min_version, '20.12.1');
      assert.ok(warnings.length > 0, 'should have a warning about missing file');
    });

    it('falls back to defaults when config file has invalid JSON', async () => {
      const badPath = path.join(tmpDir, 'bad-config.json');
      await writeFile(badPath, 'not valid json {{{');

      const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
      const { config, warnings } = await loadHarnessConfig({ configPath: badPath, noCache: true });
      assert.equal(config.node.min_version, '20.12.1');
      assert.ok(warnings.length > 0, 'should have a warning about invalid JSON');
    });

    it('applies GEARBOX_NODE_MIN_VERSION env var override', async () => {
      process.env.GEARBOX_NODE_MIN_VERSION = '22.0.0';
      try {
        const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
        const { config } = await loadHarnessConfig({ noCache: true });
        assert.equal(config.node.min_version, '22.0.0');
      } finally {
        delete process.env.GEARBOX_NODE_MIN_VERSION;
      }
    });

    it('applies GEARBOX_AUDIT_MAX_PRIME_BYTES env var override', async () => {
      process.env.GEARBOX_AUDIT_MAX_PRIME_BYTES = '9999';
      try {
        const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
        const { config } = await loadHarnessConfig({ noCache: true });
        assert.equal(config.audit.max_prime_bytes, 9999);
      } finally {
        delete process.env.GEARBOX_AUDIT_MAX_PRIME_BYTES;
      }
    });

    it('returns warnings array (empty or not) always', async () => {
      const { loadHarnessConfig } = await import('../../src/harness/harness-config.mjs');
      const { config, warnings } = await loadHarnessConfig({ noCache: true });
      assert.ok(Array.isArray(warnings));
    });
  });

  describe('getConfig', () => {
    it('returns cached config on repeated calls', async () => {
      const { getConfig } = await import('../../src/harness/harness-config.mjs');
      const c1 = getConfig();
      const c2 = getConfig();
      assert.equal(c1, c2, 'should return same cached reference');
    });

    it('returns an object with expected top-level keys', async () => {
      const { getConfig } = await import('../../src/harness/harness-config.mjs');
      const config = getConfig();
      assert.ok(config.node, 'node key expected');
      assert.ok(config.audit, 'audit key expected');
      assert.ok(config.pipeline, 'pipeline key expected');
      assert.ok(config.budget, 'budget key expected');
    });
  });
});
