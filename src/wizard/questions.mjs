/**
 * Wizard question definitions — defaults and choice lists.
 */

export const PLATFORM_CHOICES = [
  { value: 'copilot',   label: 'GitHub Copilot' },
  { value: 'claude',    label: 'Claude (Anthropic)' },
  { value: 'codex',     label: 'Codex (OpenAI)' },
  { value: 'gemini',    label: 'Gemini (Google)' },
  { value: 'opencode',  label: 'OpenCode' },
  { value: 'pi',        label: 'Pi' },
];

export const WORKFLOW_CHOICES = [
  { value: 'pr-retrospective',       label: 'PR Retrospective' },
  { value: 'convention-drift',       label: 'Convention Drift' },
  { value: 'ci-health',              label: 'CI Health' },
  { value: 'consolidate-memory',     label: 'Consolidate Memory' },
  { value: 'daily-workflow-updater', label: 'Daily Workflow Updater' },
  { value: 'decisions-hygiene',      label: 'Decisions Hygiene' },
  { value: 'docs-freshness',         label: 'Docs Freshness' },
];

export const SKILLS_DIR_CHOICES = [
  { value: '.agents/skills',  label: '.agents/skills (recommended)' },
  { value: '.github/skills',  label: '.github/skills' },
];

export const DEFAULTS = {
  platforms:        ['copilot'],
  workflows:        ['pr-retrospective', 'convention-drift'],
  skillsDir:        '.agents/skills',
  selfImprovement:  true,
  secretScanning:   true,
};
