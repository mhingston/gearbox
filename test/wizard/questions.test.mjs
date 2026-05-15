import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PLATFORM_CHOICES, WORKFLOW_CHOICES, SKILLS_DIR_CHOICES } from '../../src/wizard/questions.mjs';

describe('wizard questions', () => {
  it('default platforms include copilot', () => {
    assert.ok(DEFAULTS.platforms.includes('copilot'), 'Expected copilot in default platforms');
  });

  it('default workflows include pr-retrospective and convention-drift', () => {
    assert.ok(DEFAULTS.workflows.includes('pr-retrospective'), 'Expected pr-retrospective');
    assert.ok(DEFAULTS.workflows.includes('convention-drift'), 'Expected convention-drift');
  });

  it('default skillsDir is .agents/skills', () => {
    assert.equal(DEFAULTS.skillsDir, '.agents/skills');
  });

  it('platform choices cover all 6 supported platforms', () => {
    const values = PLATFORM_CHOICES.map(c => c.value);
    assert.ok(values.includes('copilot'), 'missing copilot');
    assert.ok(values.includes('claude'), 'missing claude');
    assert.ok(values.includes('codex'), 'missing codex');
    assert.ok(values.includes('gemini'), 'missing gemini');
    assert.ok(values.includes('opencode'), 'missing opencode');
    assert.ok(values.includes('pi'), 'missing pi');
  });

  it('skills dir choices include .agents/skills and .github/skills', () => {
    const values = SKILLS_DIR_CHOICES.map(c => c.value);
    assert.ok(values.includes('.agents/skills'), 'missing .agents/skills');
    assert.ok(values.includes('.github/skills'), 'missing .github/skills');
  });

  it('workflow choices include all 7 bundled workflows', () => {
    const values = WORKFLOW_CHOICES.map(c => c.value);
    const expected = [
      'pr-retrospective',
      'convention-drift',
      'ci-health',
      'consolidate-memory',
      'daily-workflow-updater',
      'decisions-hygiene',
      'docs-freshness',
    ];
    for (const w of expected) {
      assert.ok(values.includes(w), `missing workflow: ${w}`);
    }
  });

  it('defaults enable self-improvement loop', () => {
    assert.equal(DEFAULTS.selfImprovement, true);
  });

  it('defaults enable secret scanning', () => {
    assert.equal(DEFAULTS.secretScanning, true);
  });
});
