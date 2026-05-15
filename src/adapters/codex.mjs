import { resolveHooks } from './base.mjs';

const DEFAULT_HOOKS_DIR = '.gearbox/hooks';

// Codex supports 5 of 7 hooks (no errorOccurred, no sessionEnd)
const CODEX_EVENT_MAP = {
  sessionStart:        'session-start',
  userPromptSubmitted: 'user-prompt-submitted',
  preToolUse:          'pre-tool-use',
  postToolUse:         'post-tool-use',
  preCompact:          'pre-compact',
};

const UNSUPPORTED = new Set(['errorOccurred', 'sessionEnd']);

function buildEntry(hooksDir, hookName) {
  const scriptMap = {
    sessionStart:        `node ${hooksDir}/self-learning.mjs sessionStart`,
    userPromptSubmitted: `node ${hooksDir}/self-learning.mjs userPromptSubmitted`,
    preToolUse:          `node ${hooksDir}/policy-guard.mjs`,
    postToolUse:         `node ${hooksDir}/self-learning.mjs postToolUse`,
    preCompact:          `node ${hooksDir}/context-compact.mjs`,
  };
  const cmd = scriptMap[hookName];
  return [{ type: 'command', bash: cmd, powershell: cmd }];
}

/**
 * @param {Object} options
 * @param {string[]} [options.selectedHooks]
 * @param {string} [options.hooksDir]
 * @param {boolean} [options.dryRun]
 * @returns {{ files: Array<{path: string, content: string}>, warnings: string[] }}
 */
export function generateConfig(options = {}) {
  const hooksDir = options.hooksDir ?? DEFAULT_HOOKS_DIR;
  const activeHooks = resolveHooks(options.selectedHooks);
  const warnings = [];

  const hooksObj = {};
  for (const hookName of activeHooks) {
    if (UNSUPPORTED.has(hookName)) {
      warnings.push(`Codex CLI does not support ${hookName} — this hook will not fire`);
      continue;
    }
    const eventName = CODEX_EVENT_MAP[hookName];
    if (eventName) {
      hooksObj[eventName] = buildEntry(hooksDir, hookName);
    }
  }

  const config = { version: 1, hooks: hooksObj };

  return {
    files: [{ path: '.codex/hooks.json', content: JSON.stringify(config, null, 2) }],
    warnings,
  };
}
