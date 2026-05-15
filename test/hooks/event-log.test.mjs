import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('event-log', () => {
  let tmpDir;
  let appendEvent, readEvents;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-test-'));
    const mod = await import('../../src/hooks/event-log.mjs');
    appendEvent = mod.appendEvent;
    readEvents = mod.readEvents;
  });

  after(() => rm(tmpDir, { recursive: true, force: true }));

  it('creates log file and appends JSON line', async () => {
    const logPath = path.join(tmpDir, 'session.jsonl');
    await appendEvent(logPath, 'sessionStart', { foo: 'bar' });
    const content = await readFile(logPath, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.event, 'sessionStart');
    assert.equal(entry.foo, 'bar');
    assert.ok(entry.timestamp, 'timestamp required');
  });

  it('appends multiple events in order', async () => {
    const logPath = path.join(tmpDir, 'session2.jsonl');
    await appendEvent(logPath, 'sessionStart', {});
    await appendEvent(logPath, 'postToolUse', { tool: 'edit' });
    await appendEvent(logPath, 'sessionEnd', {});
    const content = await readFile(logPath, 'utf8');
    const events = content.trim().split('\n').map(l => JSON.parse(l));
    assert.equal(events.length, 3);
    assert.equal(events[0].event, 'sessionStart');
    assert.equal(events[1].event, 'postToolUse');
    assert.equal(events[2].event, 'sessionEnd');
  });
});
