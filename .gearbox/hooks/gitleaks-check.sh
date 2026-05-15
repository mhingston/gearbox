#!/bin/bash
# preToolUse hook: scan content about to be written for secrets using gitleaks
# Fires on: edit, create, bash
# Denies the tool call if a secret pattern is detected.

set -e

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')
PROFILE=$(printf '%s' "${HARNESS_PROFILE:-standard}" | tr '[:upper:]' '[:lower:]')
case "$PROFILE" in
  ""|minimal|standard|strict) ;;
  off) exit 0 ;;
  *) PROFILE=standard ;;
esac

DISABLED_HOOKS=$(printf '%s' "${HARNESS_DISABLED_HOOKS:-}" | tr '[:upper:]' '[:lower:]')
hook_disabled() {
  printf '%s' "$DISABLED_HOOKS" | tr ',' '\n' | grep -Fx "$1" > /dev/null
}

if hook_disabled "pretooluse" || hook_disabled "gitleaks" || hook_disabled "gitleaks-check"; then
  exit 0
fi

# Only check tools that write content
case "$TOOL_NAME" in
  edit|create|bash) ;;
  *) exit 0 ;;
esac

# Check gitleaks is installed — warn but do not block if missing
if ! command -v gitleaks &> /dev/null; then
  echo "⚠️  WARNING: gitleaks is not installed — secret scanning is disabled for this tool call." >&2
  echo "   Install it to enable pre-tool secret scanning: brew install gitleaks (macOS)" >&2
  echo "   Or download from: https://github.com/gitleaks/gitleaks/releases" >&2
  exit 0
fi

TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs')

# Extract the content to scan based on the tool being called
case "$TOOL_NAME" in
  edit)
    CONTENT=$(echo "$TOOL_ARGS" | jq -r '.new_str // empty')
    ;;
  create)
    CONTENT=$(echo "$TOOL_ARGS" | jq -r '.file_text // empty')
    ;;
  bash)
    CONTENT=$(echo "$TOOL_ARGS" | jq -r '.command // empty')
    ;;
esac

if [ -z "$CONTENT" ]; then
  exit 0
fi

REPO_ROOT=$(git -C "$(echo "$INPUT" | jq -r '.cwd')" rev-parse --show-toplevel 2>/dev/null || echo "$(echo "$INPUT" | jq -r '.cwd')")
CONFIG_FILE="$REPO_ROOT/.gitleaks.toml"

# Run gitleaks against the content via stdin
GITLEAKS_ARGS=(detect --pipe --no-banner --no-color --log-level error --redact --report-format json --report-path -)
if [ -f "$CONFIG_FILE" ]; then
  GITLEAKS_ARGS+=(-c "$CONFIG_FILE")
fi

set +e
RESULT=$(printf '%s' "$CONTENT" | gitleaks "${GITLEAKS_ARGS[@]}" 2>&1)
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ]; then
  jq -n --arg result "$RESULT" '{
    permissionDecision: "deny",
    permissionDecisionReason: ("gitleaks detected a potential secret in the content about to be written. Review and remove it before proceeding.\n\n" + $result)
  }' | jq -c
fi
