import { resolveHooks } from './base.mjs';

const DEFAULT_HOOKS_DIR = '.gearbox/hooks';

// pi.dev lifecycle method mapping
const PI_METHOD_MAP = {
  sessionStart:        'onSessionStart',
  userPromptSubmitted: 'onInput',
  preToolUse:          'onToolCall',
  postToolUse:         'onToolResult',
  errorOccurred:       'onError',
  preCompact:          'onBeforeCompact',
  sessionEnd:          'onSessionEnd',
};

function renderMethod(hookName, hooksDir, methodName) {
  const scriptMap = {
    sessionStart:        `"${hooksDir}/self-learning.mjs", "sessionStart"`,
    userPromptSubmitted: `"${hooksDir}/self-learning.mjs", "userPromptSubmitted"`,
    preToolUse:          `"${hooksDir}/policy-guard.mjs"`,
    postToolUse:         `"${hooksDir}/self-learning.mjs", "postToolUse"`,
    errorOccurred:       `"${hooksDir}/self-learning.mjs", "errorOccurred"`,
    preCompact:          `"${hooksDir}/context-compact.mjs"`,
    sessionEnd:          `"${hooksDir}/self-learning.mjs", "sessionEnd"`,
  };

  const needsInput = ['preToolUse', 'postToolUse', 'errorOccurred'].includes(hookName);
  const paramName = hookName === 'preToolUse' ? 'toolCall'
    : hookName === 'postToolUse' ? 'toolResult'
    : hookName === 'errorOccurred' ? 'error'
    : '';
  const asyncParam = paramName ? `(${paramName})` : '()';

  const spawnArgs = needsInput
    ? `[${scriptMap[hookName]}], { input: JSON.stringify(${paramName}), stdio: ["pipe", "inherit", "inherit"] }`
    : `[${scriptMap[hookName]}], { stdio: "inherit" }`;

  return `  ${methodName}: async ${asyncParam} => {
    const { spawnSync } = await import("child_process")
    spawnSync("node", ${spawnArgs})
  }`;
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

  const methodLines = [];
  for (const hookName of activeHooks) {
    const methodName = PI_METHOD_MAP[hookName];
    if (!methodName) continue;
    methodLines.push(renderMethod(hookName, hooksDir, methodName));
  }

  const content = `import type { Extension } from "@pi/sdk"

export const gearboxHarness: Extension = {
  name: "gearbox-harness",

${methodLines.join(',\n\n')}
}
`;

  return {
    files: [{ path: '.pi/extensions/gearbox-harness.ts', content }],
    warnings,
  };
}
