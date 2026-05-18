---
name: stuck-loop-detection
description: Detects repeated failure patterns or stalled progress, writes a structured escalation note under .gearbox/escalations/, and emits a generic BLOCKED handoff.
---

# Stuck-Loop Detection

Detect when the agent is burning tokens without making progress, then escalate
with a structured local summary instead of thrashing.

**Announce at start:** "I'm using the stuck-loop-detection skill to escalate a
stuck pattern."

## When to use

- When the same error or equivalent error appears 3+ times in one session
- When validation keeps failing after multiple targeted fixes
- When `ci-monitor` exhausts its retry cap and the work is now blocked
- When a delegate returns `BLOCKED` repeatedly with the same blocker
- When the agent is stuck in a read/search loop without changing state
- When memory exhaustion or persistent external-service failure blocks progress

## Stuck signals

Treat these as generic escalation triggers:

1. Same error message returned from a tool call 3+ times in the same session
2. Same file edited 5+ times without validation changing state
3. Delegate → `BLOCKED` cycle repeats 2+ times with the same blocker
4. Validation or CI retries keep failing with the same root-cause signature
5. Memory exhaustion (`OOM`, killed process, exit 137, SIGKILL, SIGTERM)
6. External service unavailable after retrying with a different approach
7. Same operation retries 5+ times without meaningful progress
8. 10+ consecutive read/search tool calls during implementation without a file
   write, commit, or state change
9. A previous stuck summary for the same context already exists and the current
   blocker matches it after normalization

## Fuzzy error equivalence

"Same error" includes semantically equivalent errors, not just byte-for-byte
matches. Normalize unstable values first:

- temp paths → `{tmpdir}`
- GUIDs → `{guid}`
- dates/timestamps → `{date}`
- source positions (`:12:4`, `:12,4`, `(12,4)`) → `{pos}`

Use the shipped helpers:

```bash
NEW_NORMALIZED=$(printf '%s\n' "$CURRENT_ERROR" | node .gearbox/scripts/normalize-error.mjs)
TRACKER_BASE=$(node .gearbox/scripts/tmpdir.mjs path --scope stuck-errors --key "${CONTEXT_KEY:-local-session}")
ERROR_TRACKER="${TRACKER_BASE}tracker.txt"
mkdir -p "$(dirname "$ERROR_TRACKER")"
touch "$ERROR_TRACKER"

SEEN_COUNT=$(grep -F -c "$NEW_NORMALIZED" "$ERROR_TRACKER" || echo 0)
if [ "$SEEN_COUNT" -ge 2 ]; then
  echo "⚠️ Semantically equivalent error seen $((SEEN_COUNT + 1)) times"
else
  echo "$NEW_NORMALIZED" >> "$ERROR_TRACKER"
fi
```

PowerShell 7:

```powershell
$NewNormalized = $CURRENT_ERROR | node .gearbox/scripts/normalize-error.mjs
$TrackerBase = node .gearbox/scripts/tmpdir.mjs path --scope stuck-errors --key ($env:CONTEXT_KEY ?? "local-session")
$ErrorTracker = "${TrackerBase}tracker.txt"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ErrorTracker) | Out-Null
if (-not (Test-Path $ErrorTracker)) {
  New-Item -ItemType File -Path $ErrorTracker | Out-Null
}

$SeenCount = ([string[]](Get-Content $ErrorTracker -ErrorAction SilentlyContinue | Where-Object { $_ -eq $NewNormalized })).Count
if ($SeenCount -ge 2) {
  Write-Host "⚠️ Semantically equivalent error seen $($SeenCount + 1) times"
} else {
  Add-Content -Path $ErrorTracker -Value $NewNormalized
}
```

## Inputs

| Variable | Description |
| --- | --- |
| `CONTEXT_KEY` | Optional context label (branch, PR number, feature slug); defaults to current branch or `local-session` |
| `STUCK_TYPE` | One of: `error-loop`, `validation-failure`, `ci-failure`, `delegate-blocked`, `memory-exhaustion`, `external-service-unavailable`, `velocity-spike`, `repeated-stuck-pattern` |
| `DETAILS` | Structured details about what was tried |
| `CURRENT_ERROR` | Optional latest raw error text for normalization |
| `SUMMARY_DIR` | Optional override; defaults to `.gearbox/escalations` |

## Steps

### 1. Choose a summary path under `.gearbox/escalations/`

Write escalation notes to the repo, not a pipeline state folder.

- first detection: `.gearbox/escalations/{CONTEXT_KEY}-stuck-summary.md`
- second detection: `.gearbox/escalations/{CONTEXT_KEY}-stuck-summary-2.md`
- third detection: `.gearbox/escalations/{CONTEXT_KEY}-stuck-summary-3.md`

Use a safe file-name slug derived from `CONTEXT_KEY`. If no context is known,
use `local-session`.

### 2. Write the structured summary

Create a file with this structure:

```markdown
# Stuck-Loop Summary — {CONTEXT_KEY}

## Stuck type

{STUCK_TYPE}

## What was tried

{List of actions attempted}

## What the blocker is

{Description of the blocker}

## Last error (verbatim)
```

{CURRENT_ERROR or "not captured"}

```

## Recommended human handoff

{The smallest next action that needs human judgement or a different approach}
```

If this is a repeated stuck pattern, append:

```markdown
## Repeated stuck pattern

This blocker has already been escalated for the same context.
Previous summary: `{PREVIOUS_SUMMARY_PATH}`
```

### 3. Emit a generic BLOCKED handoff

Output:

```text
Status: BLOCKED
Summary: Stuck-loop detected — {STUCK_TYPE}
Files changed: n/a
Validation run and result: n/a
Acceptance criteria / plan coverage: n/a
Deviations / concerns:
- Stuck pattern requires human intervention or a materially different approach
- Summary written to {SUMMARY_PATH}
```

## Output

```text
⚠️ Stuck-loop detected — {STUCK_TYPE}

Context: {CONTEXT_KEY}
Summary: {SUMMARY_PATH}

This pattern requires human intervention or a different execution strategy.
The agent should stop thrashing and hand off the blocker clearly.
```

## Notes

- This skill does not attempt to fix the stuck pattern — it only escalates.
- Always write the summary file even if no tracker or PR exists.
- Keep the summary detailed enough that someone new to the session can take over.
