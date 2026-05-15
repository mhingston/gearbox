import { resolveHooks } from './base.mjs';

const DEFAULT_HOOKS_DIR = '.gearbox/hooks';

// opencode event name mapping
const OPENCODE_EVENT_MAP = {
  sessionStart:        { event: 'session.created',                    warn: null },
  userPromptSubmitted: { event: 'tui.prompt.append',                   warn: null },
  preToolUse:          { event: 'tool.execute.before',                  warn: null },
  postToolUse:         { event: 'tool.execute.after',                   warn: null },
  errorOccurred:       { event: 'session.error',                        warn: null },
  preCompact:          { event: 'experimental.session.compacting',      warn: null },
  sessionEnd:          { event: 'session.idle',                         warn: 'opencode sessionEnd maps to session.idle (partial match — may not fire on every exit)' },
};

function renderHandler(hookName, hooksDir, eventName) {
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
  const paramName = hookName === 'preToolUse' ? 'tool'
    : hookName === 'postToolUse' ? 'result'
    : hookName === 'errorOccurred' ? 'err'
    : '';
  const asyncParam = paramName ? `(${paramName})` : '()';

  const spawnArgs = needsInput
    ? `[${scriptMap[hookName]}], { input: JSON.stringify(${paramName}), stdio: ["pipe", "inherit", "inherit"] }`
    : `[${scriptMap[hookName]}], { stdio: "inherit" }`;

  return `    app.on("${eventName}", async ${asyncParam} => {
      const { spawnSync } = await import("child_process")
      spawnSync("node", ${spawnArgs})
    })`;
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

  const handlerLines = [];
  for (const hookName of activeHooks) {
    const mapping = OPENCODE_EVENT_MAP[hookName];
    if (!mapping) continue;
    if (mapping.warn) warnings.push(mapping.warn);
    handlerLines.push(renderHandler(hookName, hooksDir, mapping.event));
  }

  const content = `import type { App } from "opencode"

export default {
  name: "gearbox-harness",
  description: "AI agent harness self-improvement hooks",

  init(app: App) {
${handlerLines.join('\n\n')}
  }
}
`;

  return {
    files: [{ path: '.opencode/plugins/gearbox-harness.ts', content }],
    warnings,
  };
}
