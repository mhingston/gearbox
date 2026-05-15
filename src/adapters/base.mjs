// Canonical hook definitions — single source of truth for all adapters
export const HOOKS = {
  sessionStart:        { description: 'Session begins' },
  userPromptSubmitted: { description: 'User submits a prompt' },
  preToolUse:          { description: 'Before tool executes (can block execution)' },
  postToolUse:         { description: 'After tool executes' },
  errorOccurred:       { description: 'Error or failure event' },
  preCompact:          { description: 'Before context compaction' },
  sessionEnd:          { description: 'Session terminates' },
};

export const ALL_HOOK_NAMES = Object.keys(HOOKS);

/**
 * Resolve the hooks to generate from selectedHooks option.
 * Returns all hooks if selectedHooks is null/undefined/empty.
 */
export function resolveHooks(selectedHooks) {
  if (!selectedHooks || selectedHooks.length === 0) return ALL_HOOK_NAMES;
  return selectedHooks.filter(h => HOOKS[h]);
}
