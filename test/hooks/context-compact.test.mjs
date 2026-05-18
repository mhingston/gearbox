import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompactContext,
  collectCompactionSnapshot,
} from '../../src/hooks/context-compact.mjs';

describe('context-compact', () => {
  it('carries forward the current goal from checkpoint data', () => {
    const snapshot = collectCompactionSnapshot('/virtual/repo', {
      sessionState: { sessionId: 'session-1' },
      sessionEvents: [],
      checkpoint: { goal: 'Restore the shipped flywheel contract' },
    });

    assert.equal(snapshot.currentGoal, 'Restore the shipped flywheel contract');
  });

  it('renders the current goal in the compacted context output', () => {
    const content = buildCompactContext({
      currentGoal: 'Restore the shipped flywheel contract',
      recentFiles: ['src/hooks/self-learning.mjs'],
      lastTestResult: {
        status: 'passed',
        toolName: 'bash',
        command: 'node --test test/hooks/context-compact.test.mjs',
      },
    });

    assert.match(content, /## Current Goal/);
    assert.match(content, /Restore the shipped flywheel contract/);
  });
});
