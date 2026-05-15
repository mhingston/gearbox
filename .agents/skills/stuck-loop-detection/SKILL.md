---
name: stuck-loop-detection
description:
  Detects stuck patterns where the agent is burning tokens without making
  progress. Writes a structured summary to .pipeline/{KEY}-stuck-summary*.md,
  posts it as a Jira comment, and emits a BLOCKED status with escalation
  request.
---

# Stuck-Loop Detection

Detects when the agent is stuck in a loop and escalates with a structured
summary.

**Announce at start:** "I'm using the stuck-loop-detection skill to escalate a
stuck pattern."

## When to use

- When the agent is stuck in a loop (same error repeatedly, no progress)
- When a delegate returns BLOCKED multiple times with the same issue
- When validation keeps failing with the same error after multiple attempts

## When to invoke

- When any of the stuck signals from `docs/agent-harness.md` are detected
- When a coordinator delegate returns BLOCKED twice with the same packet fields
- When pre-push validation fails with the same error 3 times (exact or
  semantically equivalent)
- When CI monitor caps at 2 rounds and CI is still failing
- When brainstorming node runs for > 20 tool calls without producing a brief
- When memory exhaustion is detected (OOM, process killed, out of memory)
- When external service is unavailable after one retry with a different approach
- When the same operation retries ≥ 5 times without making progress
- When a coordinator or specialist appears to be in a velocity spike: 10+ tool
  calls (grep, view, bash reads) without a single file write or state change
  signal. This often manifests as repeated search-and-read cycles before
  realising the approach is blocked.
- When stuck-loop-detection has already been invoked once for this ticket key
  with the same or semantically equivalent STUCK_TYPE, and the same pattern is
  happening again. This indicates the previous escalation+fix attempt did not
  resolve the root cause.
- When the coordinator's goal drift check flagged DRIFTED and the specialist has
  now returned BLOCKED or two consecutive DONE_WITH_CONCERNS without addressing
  the drift.

## Stuck signals (from `docs/agent-harness.md`)

1. Same error message returned from a tool call 3+ times in the same session
2. Same file edited 5+ times without downstream validation changing state
3. Coordinator → delegate → BLOCKED cycle repeats ≥ 2 times with same packet
   fields
4. Brainstorming node runs for > 20 tool calls without producing
   `docs/superpowers/briefs/{KEY}-brief.md`
5. **Memory exhaustion** — agent runtime is killed or OOMed (detected via tool
   error, system message, or process exit code 137 / SIGKILL / SIGTERM)
6. **External service unavailable** — DNS failure, API unreachable, or
   persistent timeout after retrying with a different method or endpoint
7. **Infinite retry loop** — same operation retries ≥ 5 times with same error
   without exponential backoff or alternative approach being tried
8. **Velocity spike** — 10+ consecutive bash/tool calls (grep, view, bash reads)
   within a short sequence without any `edit`, `create`, or file-writing
   operation in between, AND the pipeline state file's `signals` array has not
   been updated in the last N tool calls. Only applies during implementation or
   validation phases where file changes are expected; NOT triggered during a
   genuine exploratory codebase investigation phase before the first edit.
9. **Alert frequency** — the same `STUCK_TYPE` appears across
   `.pipeline/{KEY}-stuck-summary*.md` files more than once, OR the same
   stuck-summary error signature (normalized per the fuzzy error equivalence
   rules) appears in both the current attempt and any previous stuck summary for
   the same ticket key. This indicates a human-attempted fix failed to resolve
   the root cause. When this fires, name the summary file with a counter:
   `.pipeline/{KEY}-stuck-summary-2.md`, `.pipeline/{KEY}-stuck-summary-3.md`,
   etc. (the first is still `.pipeline/{KEY}-stuck-summary.md` for backwards
   compatibility).
10. **Goal drift unresolved** — the coordinator signal `goal_drift_check` equals
    `DRIFTED` in the pipeline state file (written by the eval-check loop as
    described in `docs/agent-harness.md`), AND the specialist's latest return is
    BLOCKED or is the second consecutive DONE_WITH_CONCERNS without addressing
    the original goal.

### Fuzzy error equivalence

"Same error" for signal #1 and the pre-push validation trigger includes
**semantically equivalent errors**, not just bit-for-bit identical strings. Two
errors are considered equivalent when they share the same **error family**:

**Error family detection (normalization rules applied in order):**

1. **Strip variable values** — replace with `{}`:

   - UUIDs: `abcd-1234-efgh-5678` → `{}`
   - Numeric literals: `index 5` → `index {}`
   - Temporary worktree paths: `{tmpdir}/worktree-abc123/` → `{tmpdir}`
   - Port numbers: `localhost:8080` → `localhost:{}`

2. **Extract error signature** — the first line or error code after
   normalization:

   ```bash
   # Example: these two errors are equivalent
   # "Build failed: {tmpdir}/worktree-abc123/src/api/foo.cs(10,45): error CS1002: ; expected"
   # "Build failed: {tmpdir}/worktree-def456/src/api/bar.cs(20,12): error CS1002: ; expected"
   # Both normalize to:
   # "Build failed: {tmpdir}/src/api/*.cs(*,*): error CS1002: ; expected"
   ```

3. **Match if**:
   - Normalized signatures are identical, OR
   - Both contain the same error code (e.g., `CS1002`, `CS0246`) even if
     different file/line references

**Implementation:**

```bash
# Normalize an error message for fuzzy matching
NEW_NORMALIZED=$(node utilities/scripts/harness/normalize-error.mjs "$CURRENT_ERROR")
ERROR_CODE=$(node -e 'const match = (process.argv[1] ?? "").match(/error (CS[0-9]+|NETSDK[0-9]+|DOTNET[0-9]+)/); process.stdout.write(match ? match[0] : "");' "$NEW_NORMALIZED")
SIGNATURE="${ERROR_CODE:-$NEW_NORMALIZED}"

# Track normalized errors in a helper-resolved temp file
ERROR_TRACKER="$(node utilities/scripts/harness/tmpdir.mjs path --scope stuck-errors --key "$KEY")tracker.txt"
mkdir -p "$(dirname "$ERROR_TRACKER")"
touch "$ERROR_TRACKER"

SEEN_COUNT=$(grep -F -c "$SIGNATURE" "$ERROR_TRACKER" || echo 0)

if [ "$SEEN_COUNT" -ge 2 ]; then
  # Third equivalent error — trigger stuck-loop
  echo "⚠️ Semantically equivalent error seen $((SEEN_COUNT + 1)) times"
  echo "Triggering stuck-loop detection"
else
  echo "$SIGNATURE" >> "$ERROR_TRACKER"
fi
```

```powershell
$NewNormalized = node utilities/scripts/harness/normalize-error.mjs $CURRENT_ERROR
$ErrorCodeMatch = [regex]::Match($NewNormalized, 'error (CS[0-9]+|NETSDK[0-9]+|DOTNET[0-9]+)')
$Signature = if ($ErrorCodeMatch.Success) { $ErrorCodeMatch.Value } else { $NewNormalized }

$TrackerBase = node utilities/scripts/harness/tmpdir.mjs path --scope stuck-errors --key $KEY
$ErrorTracker = "${TrackerBase}tracker.txt"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ErrorTracker) | Out-Null
if (-not (Test-Path $ErrorTracker)) {
  New-Item -ItemType File -Path $ErrorTracker | Out-Null
}

$SeenCount = ([string[]](Get-Content $ErrorTracker -ErrorAction SilentlyContinue | Where-Object { $_ -eq $Signature })).Count

if ($SeenCount -ge 2) {
  Write-Host "⚠️ Semantically equivalent error seen $($SeenCount + 1) times"
  Write-Host 'Triggering stuck-loop detection'
} else {
  Add-Content -Path $ErrorTracker -Value $Signature
}
```

**Error codes that always indicate the same family (exact match required):**

- Compiler error codes: `CS0128`, `CS0246`, `CS1002`, etc.
- Dotnet build errors: `error DOTNET101`, `error NETSDKxxxx`
- Playwright/test errors: `page.goto...timeout`, `expect...toBeVisible`
- Bash exit codes: `exit code 1` (group all exit-code-1 failures together)

## Input

| Variable     | Description                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEY`        | Jira ticket key                                                                                                                                                                                          |
| `STUCK_TYPE` | One of: `error-loop`, `file-edit-loop`, `coordinator-blocked`, `brainstorming-no-output`, `validation-failure`, `ci-failure`, `memory-exhaustion`, `external-service-unavailable`, `infinite-retry-loop`, `velocity-spike`, `repeated-stuck-pattern`, `goal-drift-unresolved` |
| `DETAILS`    | Structured details about what was tried                                                                                                                                                                  |

## Steps

### 1. Choose `SUMMARY_PATH` and write the structured summary

Choose the first available summary path for this ticket key:

- first detection: `.pipeline/{KEY}-stuck-summary.md`
- second detection: `.pipeline/{KEY}-stuck-summary-2.md`
- third detection: `.pipeline/{KEY}-stuck-summary-3.md`

Set `SUMMARY_PATH` to that path before writing. When the attempt number is
greater than 1, also set `PREVIOUS_SUMMARY_PATH` to the most recent previous
summary file so repeated-pattern escalations can point at the last attempt.

Create a file with the following structure:

```markdown
# Stuck-Loop Summary — {KEY}

## Stuck type

{STUCK_TYPE}

## What was tried

{List of actions attempted}

## What the blocker is

{Description of the blocker}

## Last error (verbatim)
```

{ERROR_OUTPUT}

```

## Attempt count
{N} attempts made

## Escalation request
This stuck pattern requires human intervention.
```

When `STUCK_TYPE` is `repeated-stuck-pattern`, append this section to the
summary:

```markdown
## Repeated stuck pattern

This is the Nth time this stuck pattern has been detected for {KEY}.
Previous stuck summary: `{PREVIOUS_SUMMARY_PATH}`

Root cause appears unresolved from previous escalation.
```

### 2. Post summary as a Jira comment

Use the jira skill to add a comment to the ticket:

```bash
# Read the summary content
SUMMARY_CONTENT=$(cat "$SUMMARY_PATH")

# Use the jira skill's add-comment operation (see jira/SKILL.md)
# Post comment with stuck summary
```

If issue tracker credentials are missing, skip the comment and note the warning.

### 3. Emit BLOCKED status with escalation request

Output the following status:

```
Status: BLOCKED
Summary: Stuck-loop detected — {STUCK_TYPE}
Files changed: n/a
Validation run and result: n/a
Acceptance criteria / plan coverage: n/a
Deviations / concerns:
- Stuck pattern requires human intervention
- Summary written to {SUMMARY_PATH}
- Jira comment posted (if credentials available)
```

## Output

```
⚠️ Stuck-loop detected — {STUCK_TYPE}

Ticket: {KEY}
Summary: {SUMMARY_PATH}
Jira: Comment posted (or warning if missing credentials)

This pattern requires human intervention. The agent cannot proceed without
changing the approach.
```

## Notes

- This skill does not attempt to fix the stuck pattern — it only escalates.
- The structured summary should be detailed enough for a human to understand
  what was tried and why it failed.
- Always write the summary file even if Jira comment fails.
- The BLOCKED status follows the coordinator-delegated packet return format.
