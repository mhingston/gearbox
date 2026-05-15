import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('harness event-log', () => {
  let tmpDir;
  let appendEvent, readEvents;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-event-log-'));
    const mod = await import('../../src/harness/event-log.mjs');
    appendEvent = mod.appendEvent;
    readEvents = mod.readEvents;
  });

  after(() => rm(tmpDir, { recursive: true, force: true }));

  it('appends an event to the .gearbox/events.jsonl file', () => {
    appendEvent({ type: 'sessionStart', source: 'test', summary: 'started', root: tmpDir });
    const events = readEvents({ root: tmpDir });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'sessionStart');
    assert.equal(events[0].source, 'test');
    assert.equal(events[0].summary, 'started');
    assert.ok(events[0].timestamp, 'should have timestamp');
  });

  it('appends multiple events in order', () => {
    const logDir = path.join(tmpDir, 'multi');
    appendEvent({ type: 'sessionStart', source: 'test', summary: 's1', root: logDir });
    appendEvent({ type: 'postToolUse', source: 'test', summary: 's2', payload: { tool: 'edit' }, root: logDir });
    appendEvent({ type: 'sessionEnd', source: 'test', summary: 's3', root: logDir });
    const events = readEvents({ root: logDir });
    assert.equal(events.length, 3);
    assert.equal(events[0].type, 'sessionStart');
    assert.equal(events[1].type, 'postToolUse');
    assert.equal(events[2].type, 'sessionEnd');
  });

  it('returns empty array when log file does not exist', () => {
    const events = readEvents({ root: path.join(tmpDir, 'nonexistent') });
    assert.deepEqual(events, []);
  });

  it('includes payload in appended event', () => {
    const payloadDir = path.join(tmpDir, 'payload');
    appendEvent({
      type: 'preToolUse',
      source: 'harness',
      summary: 'tool call',
      payload: { tool: 'bash', args: ['ls'] },
      root: payloadDir,
    });
    const events = readEvents({ root: payloadDir });
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].payload, { tool: 'bash', args: ['ls'] });
  });

  it('honours limit option in readEvents', () => {
    const limitDir = path.join(tmpDir, 'limit');
    for (let i = 0; i < 5; i++) {
      appendEvent({ type: 'tick', source: 'test', summary: `tick ${i}`, root: limitDir });
    }
    const events = readEvents({ root: limitDir, limit: 3 });
    assert.equal(events.length, 3);
    // limit returns last N
    assert.equal(events[0].summary, 'tick 2');
    assert.equal(events[2].summary, 'tick 4');
  });
});
