import { resolveHooks } from './base.mjs';

const DEFAULT_HOOKS_DIR = '.gearbox/hooks';

const GEMINI_EVENT_MAP = {
  sessionStart:        'SessionStart',
  userPromptSubmitted: 'BeforeAgent',
  preToolUse:          'BeforeTool',
  postToolUse:         'AfterTool',
  errorOccurred:       null, // not supported
  preCompact:          'PreCompress',
  sessionEnd:          'SessionEnd',
};

function buildEntry(hooksDir, hookName) {
  const cmdMap = {
    sessionStart:        `node ${hooksDir}/self-learning.mjs sessionStart`,
    userPromptSubmitted: `node ${hooksDir}/self-learning.mjs userPromptSubmitted`,
    preToolUse:          `node ${hooksDir}/policy-guard.mjs`,
    postToolUse:         `node ${hooksDir}/self-learning.mjs postToolUse`,
    preCompact:          `node ${hooksDir}/context-compact.mjs`,
    sessionEnd:          `node ${hooksDir}/self-learning.mjs sessionEnd`,
  };
  return [{ command: cmdMap[hookName] }];
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
    const eventName = GEMINI_EVENT_MAP[hookName];

    if (eventName === null) {
      warnings.push(`Gemini CLI does not support ${hookName} — this hook will not fire`);
      continue;
    }

    newHooks[eventName] = buildEntry(hooksDir, hookName);
  }

  const settings = { ...base, hooks: newHooks };

  return {
    files: [{ path: '.gemini/settings.json', content: JSON.stringify(settings, null, 2) }],
    warnings,
  };
}
