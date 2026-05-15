# CI Monitoring Loop Reference

> Detailed CI monitoring flow, retry cap enforcement, failure triage, and fix-loop dispatch contract for `ci-monitor`.

The `trim-build-output.mjs` commands in this reference are the repo's explicit
CI log filter. LeanCTX may already be active on the Bash path, but these pipes
remain the deterministic, repo-controlled way to shrink build/test logs.

---

## Inputs

| Variable     | Description                                  | Default                                              |
| ------------ | -------------------------------------------- | ---------------------------------------------------- |
| `BRANCH`     | Branch to monitor                            | Auto-detected from `git rev-parse --abbrev-ref HEAD` |
| `BASE_REF`   | Base ref for changed-files context           | `origin/main`                                        |
| `PR_NUMBER`  | Existing pull request number to update       | Auto-detected from branch head                       |
| `JIRA_KEY`   | Jira ticket key for downstream handoff       | Best-effort auto-detected from branch / PR metadata  |
| `MAX_ROUNDS` | Maximum CI fix rounds                        | `node utilities/scripts/harness/harness-config.mjs get retry.ci_fix_max_rounds` |

## Hard constraint

```bash
CONFIG_MAX_ROUNDS=$(node utilities/scripts/harness/harness-config.mjs get retry.ci_fix_max_rounds) || exit 1
REQUESTED_MAX_ROUNDS="${MAX_ROUNDS:-$CONFIG_MAX_ROUNDS}"

case "$REQUESTED_MAX_ROUNDS" in
  ''|*[!0-9]*)
    echo "❌ MAX_ROUNDS must be a positive integer"
    exit 1
    ;;
esac

MAX_ROUNDS="$REQUESTED_MAX_ROUNDS"
if [ "$MAX_ROUNDS" -gt "$CONFIG_MAX_ROUNDS" ]; then
  echo "⚠️ MAX_ROUNDS capped to harness-config retry.ci_fix_max_rounds=$CONFIG_MAX_ROUNDS"
  MAX_ROUNDS="$CONFIG_MAX_ROUNDS"
fi
```

The config-owned maximum (`retry.ci_fix_max_rounds`, default `2`) is a hard
architectural constraint, not a recommendation: there are diminishing returns
to an LLM iterating against a full CI loop indefinitely.

## Responsibilities and boundaries

- `ci-monitor` watches the **full PR check suite** using `gh pr checks`. This is
  the source of truth for pass/fail state.
- When checks fail, `ci-monitor` may resolve a **best-effort workflow run** for
  the PR head SHA using `gh run list --commit <head-sha>` so the caller can fetch
  logs with `gh run view`. PR checks remain authoritative even when no workflow
  run ID can be resolved.
- `ci-monitor` updates PR labels/comments in place.
- `ci-monitor` does **not** directly invoke `completion-verification` or
  `stuck-loop-detection`. The invoking agent does that after `ci-monitor`
  returns:
  - green CI → run `completion-verification KEY={JIRA_KEY} BASE_REF={BASE_REF}`
  - exhausted CI fix loop → run `stuck-loop-detection STUCK_TYPE=ci-failure`
- `ci-monitor` never creates PRs and never merges PRs.

---

## Step 1 — Resolve branch/PR/head SHA and wait for checks to appear

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "${BRANCH:-}")
BASE_REF="${BASE_REF:-origin/main}"
CONFIG_MAX_ROUNDS=$(node utilities/scripts/harness/harness-config.mjs get retry.ci_fix_max_rounds) || exit 1
REQUESTED_MAX_ROUNDS="${MAX_ROUNDS:-$CONFIG_MAX_ROUNDS}"

case "$REQUESTED_MAX_ROUNDS" in
  ''|*[!0-9]*)
    echo "❌ MAX_ROUNDS must be a positive integer"
    exit 1
    ;;
esac

MAX_ROUNDS="$REQUESTED_MAX_ROUNDS"
if [ "$MAX_ROUNDS" -gt "$CONFIG_MAX_ROUNDS" ]; then
  echo "⚠️ MAX_ROUNDS capped to harness-config retry.ci_fix_max_rounds=$CONFIG_MAX_ROUNDS"
  MAX_ROUNDS="$CONFIG_MAX_ROUNDS"
fi

extract_jira_key() {
  node utilities/scripts/harness/ticket-key.mjs "$1" 2>/dev/null || true
}

resolve_jira_key() {
  local candidate=""

  if [ -n "${JIRA_KEY:-}" ]; then
    echo "$JIRA_KEY"
    return 0
  fi

  candidate=$(extract_jira_key "$BRANCH")
  if [ -n "$candidate" ]; then
    echo "$candidate"
    return 0
  fi

  if [ -n "${PR_JSON:-}" ]; then
    candidate=$(extract_jira_key "$(echo "$PR_JSON" | jq -r '.title // empty')")
    if [ -n "$candidate" ]; then
      echo "$candidate"
      return 0
    fi

    candidate=$(extract_jira_key "$(echo "$PR_JSON" | jq -r '.body // empty')")
    if [ -n "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  fi
}

refresh_pr_context() {
  PR_JSON=$(gh pr view "$PR_NUMBER" --json url,title,body,headRefOid 2>/dev/null)
  PR_URL=$(echo "$PR_JSON" | jq -r '.url // empty')
  HEAD_SHA=$(echo "$PR_JSON" | jq -r '.headRefOid // empty')
}

resolve_latest_run_json() {
  if [ -z "${HEAD_SHA:-}" ]; then
    return 0
  fi

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

# Verify gh is authenticated before doing anything else
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ gh CLI is not authenticated. Run: gh auth login"
  exit 1
fi

REPO_JSON=$(gh repo view --json owner,name)
OWNER=$(echo "$REPO_JSON" | jq -r '.owner.login')
REPO=$(echo "$REPO_JSON" | jq -r '.name')
PR_JSON=""
PR_URL=""
HEAD_SHA=""

if [ -z "${PR_NUMBER:-}" ]; then
  PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)
fi

if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" = "null" ]; then
  echo "⚠️ No PR detected for $BRANCH — ci-monitor needs an existing PR because it watches PR checks, labels, and comments."
  exit 0
fi

refresh_pr_context
echo "✅ Monitoring PR #$PR_NUMBER — $PR_URL"

echo "⏳ Waiting for CI checks on PR $PR_NUMBER ($BRANCH)..."
CHECKS_READY=""
for i in $(seq 1 6); do
  CHECK_COUNT=$(gh pr checks "$PR_NUMBER" --json name --jq 'length' 2>/dev/null || echo "0")
  if [ "$CHECK_COUNT" -gt 0 ]; then
    echo "✅ CI checks detected ($CHECK_COUNT checks) on PR $PR_NUMBER"
    CHECKS_READY="true"
    break
  fi
  echo "  (attempt $i/6, waiting 10s...)"
  sleep 10
done

if [ -z "$CHECKS_READY" ]; then
  echo "⚠️ No CI checks detected on PR $PR_NUMBER after the short wait window. Stop here and re-run ci-monitor once GitHub has queued workflow runs."
  exit 0
fi
```

---

## Step 2 — Watch the full PR check suite to completion

Use `gh pr checks --watch` to wait for **all** checks on the PR's head commit.
This is the correct signal that the entire check suite has finished — not a
single workflow run. Fall back to polling `gh pr checks` if `--watch` is
unavailable.

```bash
echo "👁 Watching all checks on PR $PR_NUMBER..."

if gh pr checks --help 2>&1 | grep -q "\-\-watch"; then
  gh pr checks "$PR_NUMBER" --watch --fail-fast
  CI_EXIT=$?
else
  while true; do
    PENDING=$(gh pr checks "$PR_NUMBER" --json state \
      --jq '[.[] | select(.state == "PENDING" or .state == "IN_PROGRESS")] | length' 2>/dev/null || echo "1")
    if [ "$PENDING" = "0" ]; then
      break
    fi
    echo "  ($PENDING checks still pending — waiting 15s...)"
    sleep 15
  done

  FAILED=$(gh pr checks "$PR_NUMBER" --json state \
    --jq '[.[] | select(.state == "FAILURE" or .state == "ERROR")] | length' 2>/dev/null || echo "1")
  if [ "$FAILED" = "0" ]; then
    CI_EXIT=0
  else
    CI_EXIT=1
  fi
fi

CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket 2>/dev/null || echo '[]')
```

---

## Step 3 — On green CI, clean up PR status and return control to the caller

When CI turns green, `ci-monitor` does the PR-level CI bookkeeping and then
returns. The invoking agent immediately runs `completion-verification` with the
resolved Jira key and `BASE_REF`.

```bash
if [ "$CI_EXIT" -eq 0 ]; then
  echo "✅ CI passed on first attempt"
  if [ -n "$PR_NUMBER" ]; then
    gh pr edit "$PR_NUMBER" --remove-label ci-failing >/dev/null 2>&1 || true
    gh pr comment "$PR_NUMBER" --body "✅ CI checks passed on PR #$PR_NUMBER.

Next harness step: run \`completion-verification\` with \`KEY=$(resolve_jira_key)\` and \`BASE_REF=$BASE_REF\` before attempting any Jira transition." >/dev/null 2>&1 || true
  fi
  exit 0
fi
```

After recording the terminal CI outcome, archive the completed run:

```bash
node utilities/scripts/harness/archive-trace.mjs .pipeline/${KEY}.state.json
```

This preserves tool traces, event logs, and state snapshots for downstream
eval/ablation tooling.

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

while [ "$CI_EXIT" -ne 0 ] && [ "$ROUND" -lt "$MAX_ROUNDS" ]; do
  ROUND=$((ROUND + 1))
  echo "❌ CI failed — starting fix round $ROUND/$MAX_ROUNDS"

  refresh_pr_context
  CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket 2>/dev/null || echo '[]')
  FAILED_CHECKS=$(echo "$CHECKS_JSON" | jq -r '
    [.[] | select(.bucket == "fail" or .state == "FAILURE" or .state == "ERROR")
      | "\(.name) — \(.link // "no-link")"] | join("\n")
  ')

  RUN_JSON=$(resolve_latest_run_json || true)
  RUN_ID=$(printf '%s\n' "$RUN_JSON" | jq -r '.databaseId // empty' 2>/dev/null || true)
  RUN_URL=$(printf '%s\n' "$RUN_JSON" | jq -r '.url // empty' 2>/dev/null || true)

  if [ -n "$RUN_ID" ]; then
    FAILURE_LOG=$(gh run view "$RUN_ID" --log-failed 2>&1 | \
      node .github/hooks/scripts/trim-build-output.mjs)
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

  echo "Failed jobs/checks: ${FAILED_JOBS:-$FAILED_CHECKS}"

  if [ "$RUN_STATUS" = "cancelled" ]; then
    echo "⚠️ Latest workflow run was cancelled — re-watching the full PR check suite..."
    gh pr checks "$PR_NUMBER" --watch --fail-fast
    CI_EXIT=$?
    CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket 2>/dev/null || echo '[]')
    continue
  fi

  FLAKY_INDICATORS="connection|timeout|ECONNREFUSED|ETIMEDOUT|dial tcp|context deadline|no such host|DNS|unavailable"
  GENUINE_INDICATORS="error CS|error NETSDK|compilation|build failed|type error|undefined|null reference"

  if echo "$FAILURE_LOG" | grep -qiE "$FLAKY_INDICATORS"; then
    if ! echo "$FAILURE_LOG" | grep -qiE "$GENUINE_INDICATORS"; then
      echo "🔄 Flaky infrastructure failure detected — marking as environmental"
      FLAKY_FAILURE="true"
      ENVIRONMENTAL_FAILURE="true"
      break
    fi
  fi

  # Dispatch the fix sub-agent using the prompt template below.
  FIX_REPORT="<output of fix sub-agent>"

  if echo "$FIX_REPORT" | grep -qi "Cannot fix: environmental"; then
    echo "⚠️ Environmental failure detected — skipping remaining rounds"
    ENVIRONMENTAL_FAILURE="true"
    break
  fi

  echo "⏳ Waiting for PR checks to re-run after fix push (90s initial wait)..."
  sleep 90
  refresh_pr_context
  echo "👁 Watching all checks on PR $PR_NUMBER after fix push..."
  gh pr checks "$PR_NUMBER" --watch --fail-fast
  CI_EXIT=$?
  CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state,link,workflow,bucket 2>/dev/null || echo '[]')
done
```

### Fix sub-agent dispatch prompt template

When a CI round fails, dispatch a sub-agent using the **Task tool** with the
following prompt (substitute variables at runtime):

```
CI fix round {ROUND}/{MAX_ROUNDS} for branch: {BRANCH}

Base ref: {BASE_REF}
Failed jobs/checks: {FAILED_JOBS or FAILED_CHECKS}
Latest workflow run: {RUN_URL or "not resolved from PR head SHA"}

Failure log (compressed — errors/warnings preserved):
{FAILURE_LOG}

Changed files (vs {BASE_REF}):
{git diff --name-only {BASE_REF}...HEAD}

Your task:
1. Analyse the failure log to identify the root cause.
2. Fix the specific failure — do NOT change unrelated code.
3. Run the relevant local validation step to confirm the fix (pipe through trim-build-output.mjs):
   - Build failure  → dotnet build src/api/PureGym.Site.Payments.Api.sln 2>&1 | node .github/hooks/scripts/trim-build-output.mjs
   - Test failure   → run the specific failing test project | node .github/hooks/scripts/trim-build-output.mjs
   - TS error       → yarn workspace [workspace] type-check 2>&1 | node .github/hooks/scripts/trim-build-output.mjs
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
  echo "✅ CI passed after $ROUND fix round(s)"

  if [ -n "$PR_NUMBER" ]; then
    gh pr edit "$PR_NUMBER" --remove-label ci-failing >/dev/null 2>&1 || true
    gh pr comment "$PR_NUMBER" --body "✅ CI passed after $ROUND automated fix round(s).

Next harness step: run \`completion-verification\` with \`KEY=$(resolve_jira_key)\` and \`BASE_REF=$BASE_REF\` before any Jira transition." >/dev/null 2>&1 || true
  fi
else
  if [ -n "$FLAKY_FAILURE" ]; then
    CI_SUMMARY="Flaky infrastructure failure detected — not code related. Re-run CI to confirm."
  elif [ -n "$ENVIRONMENTAL_FAILURE" ]; then
    CI_SUMMARY="Environmental failure — not code related"
  else
    CI_SUMMARY="CI still failing after $MAX_ROUNDS automated fix round(s)"
  fi

  if [ -n "$PR_NUMBER" ]; then
    gh pr edit "$PR_NUMBER" --add-label ci-failing >/dev/null 2>&1 || true
    gh pr comment "$PR_NUMBER" --body "⚠️ $CI_SUMMARY

Last failed jobs/checks: ${FAILED_JOBS:-$FAILED_CHECKS}
Latest workflow run: ${RUN_URL:-not resolved from PR head SHA}" >/dev/null 2>&1 || true
  fi
fi
```

After recording the terminal CI outcome, archive the completed run:

```bash
node utilities/scripts/harness/archive-trace.mjs .pipeline/${KEY}.state.json
```

This preserves tool traces, event logs, and state snapshots for downstream
eval/ablation tooling.

---
