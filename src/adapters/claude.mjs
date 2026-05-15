import { resolveHooks } from './base.mjs';

const DEFAULT_HOOKS_DIR = '.gearbox/hooks';

/**
 * Claude Code event name mapping.
 * errorOccurred maps to two events; sessionEnd maps to Stop.
 */
const CLAUDE_EVENT_MAP = {
  sessionStart:        null, // not supported; warn
  userPromptSubmitted: 'UserPromptSubmit',
  preToolUse:          'PreToolUse',
  postToolUse:         'PostToolUse',
  errorOccurred:       ['StopFailure', 'PostToolUseFailure'],
  preCompact:          'PreCompact',
  sessionEnd:          'Stop',
};

function makeEntry(hooksDir, hookName) {
  const commandMap = {
    sessionStart:        `node ${hooksDir}/self-learning.mjs sessionStart`,
    userPromptSubmitted: `node ${hooksDir}/self-learning.mjs userPromptSubmitted`,
    preToolUse:          `node ${hooksDir}/policy-guard.mjs`,
    postToolUse:         `node ${hooksDir}/self-learning.mjs postToolUse`,
    errorOccurred:       `node ${hooksDir}/self-learning.mjs errorOccurred`,
    preCompact:          `node ${hooksDir}/context-compact.mjs`,
    sessionEnd:          `node ${hooksDir}/self-learning.mjs sessionEnd`,
  };

  return [
    {
      matcher: '.*',
      hooks: [{ type: 'command', command: commandMap[hookName] }],
    },
  ];
}

/**
 * @param {Object} options
 * @param {string[]} [options.selectedHooks]
 * @param {string} [options.hooksDir]
 * @param {string|null} [options.existingSettings]
 * @param {boolean} [options.dryRun]
 * @returns {{ files: Array<{path: string, content: string}>, warnings: string[] }}
 */
export function generateConfig(options = {}) {
  const hooksDir = options.hooksDir ?? DEFAULT_HOOKS_DIR;
  const activeHooks = resolveHooks(options.selectedHooks);
  const warnings = [];

  let base = {};
  if (options.existingSettings) {
    try {
      base = JSON.parse(options.existingSettings);
    } catch {
      warnings.push('Invalid JSON in existingSettings — ignoring existing settings');
    }
  }

  const existingHooks = base.hooks ?? {};
  const newHooks = { ...existingHooks };

  for (const hookName of activeHooks) {
    const target = CLAUDE_EVENT_MAP[hookName];

    if (target === null) {
      warnings.push(`Claude Code does not support ${hookName} — this hook will not fire`);
      continue;
    }

    const entry = makeEntry(hooksDir, hookName);

    if (Array.isArray(target)) {
      for (const eventName of target) {
        newHooks[eventName] = entry;
      }
    } else {
      newHooks[target] = entry;
    }
  }

  const settings = { ...base, hooks: newHooks };

  return {
    files: [{ path: '.claude/settings.json', content: JSON.stringify(settings, null, 2) }],
    warnings,
  };
}
