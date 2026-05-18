# CI Monitoring Loop Reference

> Detailed CI monitoring flow, retry-cap enforcement, failure triage, and
> fix-loop dispatch contract for `ci-monitor`.

---

## Inputs

| Variable | Description | Default |
| --- | --- | --- |
| `BRANCH` | Branch to monitor | Auto-detected from `git rev-parse --abbrev-ref HEAD` |
| `BASE_REF` | Base ref for changed-file context | `origin/main` |
| `PR_NUMBER` | Existing pull request number to update | Auto-detected from branch head |
| `MAX_ROUNDS` | Maximum CI fix rounds | `node .gearbox/scripts/harness-config.mjs get retry.ci_fix_max_rounds` |

## Hard constraint

```bash
CONFIG_MAX_ROUNDS=$(node .gearbox/scripts/harness-config.mjs get retry.ci_fix_max_rounds) || exit 1
REQUESTED_MAX_ROUNDS="${MAX_ROUNDS:-$CONFIG_MAX_ROUNDS}"

case "$REQUESTED_MAX_ROUNDS" in
  ''|*[!0-9]*)
    echo "❌ MAX_ROUNDS must be a positive integer"
    exit 1
    ;;
esac

MAX_ROUNDS="$REQUESTED_MAX_ROUNDS"
if [ "$MAX_ROUNDS" -gt "$CONFIG_MAX_ROUNDS" ]; then
  echo "⚠️ MAX_ROUNDS capped to retry.ci_fix_max_rounds=$CONFIG_MAX_ROUNDS"
  MAX_ROUNDS="$CONFIG_MAX_ROUNDS"
fi
```

The config-owned maximum is a hard limit, not a suggestion.

## Responsibilities and boundaries

- `ci-monitor` watches the **full PR check suite** using `gh pr checks`.
- When checks fail, `ci-monitor` may resolve a **best-effort workflow run** for
  the PR head SHA using `gh run list --commit <head-sha>` so the caller can
  fetch logs with `gh run view`.
- `ci-monitor` updates PR labels/comments in place.
- `ci-monitor` never creates PRs and never merges PRs.
- `ci-monitor` returns a clear result; the caller decides what broader workflow
  comes next.

---

## Step 1 — Resolve branch, PR, head SHA, and wait for checks

```bash
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
BASE_REF="${BASE_REF:-origin/main}"

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

if [ -z "${PR_NUMBER:-}" ]; then
  PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)
fi

if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" = "null" ]; then
  echo "⚠️ No PR detected for $BRANCH — ci-monitor needs an existing PR."
  exit 0
fi

PR_JSON=$(gh pr view "$PR_NUMBER" --json url,headRefOid,title 2>/dev/null) || exit 1
PR_URL=$(echo "$PR_JSON" | jq -r '.url // empty')
HEAD_SHA=$(echo "$PR_JSON" | jq -r '.headRefOid // empty')

echo "✅ Monitoring PR #$PR_NUMBER — $PR_URL"
echo "⏳ Waiting for CI checks on PR $PR_NUMBER ($BRANCH)..."

CHECKS_READY=""
for i in $(seq 1 6); do
  CHECK_COUNT=$(gh pr checks "$PR_NUMBER" --json name --jq 'length' 2>/dev/null || echo "0")
  if [ "$CHECK_COUNT" -gt 0 ]; then
    CHECKS_READY="true"
    echo "✅ CI checks detected ($CHECK_COUNT checks)"
    break
  fi
  echo "  (attempt $i/6, waiting 10s...)"
  sleep 10
done

if [ -z "$CHECKS_READY" ]; then
  echo "⚠️ No CI checks detected after the short wait window. Re-run once GitHub has queued them."
  exit 0
fi
```

---

## Step 2 — Watch the full PR check suite to completion

```bash
echo "👁 Watching all checks on PR $PR_NUMBER..."

if gh pr checks --help 2>&1 | grep -q "\-\-watch"; then
  gh pr checks "$PR_NUMBER" --watch --fail-fast
  CI_EXIT=$?
else
  while true; do
    PENDING=$(gh pr checks "$PR_NUMBER" --json state \
      --jq '[.[] | select(.state == "PENDING" or .state == "IN_PROGRESS")] | length' 2>/dev/null || echo "1")
    [ "$PENDING" = "0" ] && break
    echo "  ($PENDING checks still pending — waiting 15s...)"
    sleep 15
  done

  FAILED=$(gh pr checks "$PR_NUMBER" --json state \
    --jq '[.[] | select(.state == "FAILURE" or .state == "ERROR")] | length' 2>/dev/null || echo "1")
  CI_EXIT=$([ "$FAILED" = "0" ] && echo 0 || echo 1)
fi

CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket 2>/dev/null || echo '[]')
```

---

## Step 3 — On green CI, clean up PR status and return

```bash
if [ "$CI_EXIT" -eq 0 ]; then
  gh pr edit "$PR_NUMBER" --remove-label ci-failing >/dev/null 2>&1 || true
  gh pr comment "$PR_NUMBER" --body "✅ CI checks are green on PR #$PR_NUMBER.

Continue with your normal review/merge flow." >/dev/null 2>&1 || true
  exit 0
fi
```

---

## Step 4 — On failure, enter the bounded fix loop

```bash
ROUND=0
FAILED_JOBS=""
FAILED_CHECKS=""
RUN_ID=""
RUN_URL=""
ENVIRONMENTAL_FAILURE=""
FLAKY_FAILURE=""

resolve_latest_run_json() {
  [ -z "${HEAD_SHA:-}" ] && return 0
  gh run list --branch "$BRANCH" --commit "$HEAD_SHA" \
    --json databaseId,url,status,conclusion,workflowName,displayTitle,createdAt \
    --limit 20 2>/dev/null | jq -c '
      map(
        select(
          .conclusion == "failure" or
          .conclusion == "cancelled" or
          .status == "in_progress" or
          .status == "queued"
        )
      ) | .[0] // empty
    '
}

while [ "$CI_EXIT" -ne 0 ] && [ "$ROUND" -lt "$MAX_ROUNDS" ]; do
  ROUND=$((ROUND + 1))
  echo "❌ CI failed — starting fix round $ROUND/$MAX_ROUNDS"

  PR_JSON=$(gh pr view "$PR_NUMBER" --json url,headRefOid 2>/dev/null || echo '{}')
  HEAD_SHA=$(echo "$PR_JSON" | jq -r '.headRefOid // empty')
  CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket 2>/dev/null || echo '[]')

  FAILED_CHECKS=$(echo "$CHECKS_JSON" | jq -r '
    [.[] | select(.bucket == "fail" or .state == "FAILURE" or .state == "ERROR")
      | "\(.name) — \(.link // "no-link")"] | join("\n")
  ')

  RUN_JSON=$(resolve_latest_run_json || true)
  RUN_ID=$(printf '%s\n' "$RUN_JSON" | jq -r '.databaseId // empty' 2>/dev/null || true)
  RUN_URL=$(printf '%s\n' "$RUN_JSON" | jq -r '.url // empty' 2>/dev/null || true)

  if [ -n "$RUN_ID" ]; then
    FAILURE_LOG=$(gh run view "$RUN_ID" --log-failed 2>&1 | tail -n 200)
    FAILED_JOBS=$(gh run view "$RUN_ID" --json jobs \
      --jq '[.jobs[] | select(.conclusion == "failure") | .name] | join(", ")' 2>/dev/null || true)
    RUN_STATUS=$(gh run view "$RUN_ID" --json status,conclusion \
      --jq 'if .conclusion == "cancelled" then "cancelled" else .status end' 2>/dev/null || true)
  else
    FAILURE_LOG=$(printf '%s\n' "$FAILED_CHECKS")
    FAILED_JOBS=$(echo "$CHECKS_JSON" | jq -r '
      [.[] | select(.bucket == "fail" or .state == "FAILURE" or .state == "ERROR") | .name] | join(", ")
    ')
    RUN_STATUS=""
  fi

  if [ "$RUN_STATUS" = "cancelled" ]; then
    echo "⚠️ Latest workflow run was cancelled — re-watching the full PR check suite..."
    gh pr checks "$PR_NUMBER" --watch --fail-fast
    CI_EXIT=$?
    continue
  fi

  FLAKY_INDICATORS="connection|timeout|ECONNREFUSED|ETIMEDOUT|dial tcp|context deadline|no such host|DNS|unavailable"
  if echo "$FAILURE_LOG" | grep -qiE "$FLAKY_INDICATORS"; then
    echo "🔄 Flaky or environmental failure detected"
    FLAKY_FAILURE="true"
    ENVIRONMENTAL_FAILURE="true"
    break
  fi

  # Dispatch the fix sub-agent using the prompt template below.
  FIX_REPORT="<output of fix sub-agent>"

  if echo "$FIX_REPORT" | grep -qi "Cannot fix: environmental"; then
    ENVIRONMENTAL_FAILURE="true"
    break
  fi

  echo "⏳ Waiting for PR checks to re-run after fix push (90s initial wait)..."
  sleep 90
  gh pr checks "$PR_NUMBER" --watch --fail-fast
  CI_EXIT=$?
done
```

### Fix sub-agent dispatch prompt template

When a CI round fails, dispatch a sub-agent using the **Task tool** with the
following prompt (substitute variables at runtime):

```text
CI fix round {ROUND}/{MAX_ROUNDS} for branch: {BRANCH}

Base ref: {BASE_REF}
Failed jobs/checks: {FAILED_JOBS or FAILED_CHECKS}
Latest workflow run: {RUN_URL or "not resolved from PR head SHA"}

Failure log (tail):
{FAILURE_LOG}

Changed files (vs {BASE_REF}):
{git diff --name-only {BASE_REF}...HEAD}

Your task:
1. Analyse the failure log to identify the root cause.
2. Fix the specific failure — do NOT change unrelated code.
3. Run the narrowest existing local validation command that covers the failing job.
4. Commit the fix with message: "fix(ci): [brief description] [round {ROUND}]"
5. Push the branch: git push origin {BRANCH}
6. Report exactly one of:
   - "Fixed: [what was changed]"
   - "Cannot fix: [reason]"
   - "Cannot fix: environmental"

CONSTRAINTS:
- Do not introduce new functionality.
- Do not change test expectations to make tests pass artificially.
- Do not push if local validation fails.
- If the failure is environmental (infra, external service, flaky test), report "Cannot fix: environmental".
```

---

## Step 5 — After the fix loop, either hand back green CI or mark the PR as failing

```bash
if [ "$CI_EXIT" -eq 0 ]; then
  gh pr edit "$PR_NUMBER" --remove-label ci-failing >/dev/null 2>&1 || true
  gh pr comment "$PR_NUMBER" --body "✅ CI passed after $ROUND automated fix round(s).

Continue with your normal review/merge flow." >/dev/null 2>&1 || true
else
  if [ -n "$FLAKY_FAILURE" ]; then
    CI_SUMMARY="Flaky or environmental failure detected — re-run CI to confirm."
  elif [ -n "$ENVIRONMENTAL_FAILURE" ]; then
    CI_SUMMARY="Environmental failure — not code related"
  else
    CI_SUMMARY="CI still failing after $MAX_ROUNDS automated fix round(s)"
  fi

  gh pr edit "$PR_NUMBER" --add-label ci-failing >/dev/null 2>&1 || true
  gh pr comment "$PR_NUMBER" --body "⚠️ $CI_SUMMARY

Last failed jobs/checks: ${FAILED_JOBS:-$FAILED_CHECKS}
Latest workflow run: ${RUN_URL:-not resolved from PR head SHA}" >/dev/null 2>&1 || true
fi
```
