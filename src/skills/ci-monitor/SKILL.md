---
name: ci-monitor
description: Watch PR CI, run a bounded fix loop, and update the existing PR with status.
---

# ci-monitor

> **Existing PR CI only.** Use this after PR creation to watch checks and run
> bounded CI fixes. Use `pre-push-validation` before push, and use
> `completion-verification` after CI is green.

Watch the full PR check suite after push, attempt bounded CI fixes, and hand control back to the caller with the next action.

> **Announce at start:** "I'm using the ci-monitor skill to watch CI on {BRANCH}."

## When to use

- After branch push and PR creation
- When the caller wants bounded CI fixing plus PR status updates

## Prerequisites

- `gh` authenticated against the target repo
- An existing PR for the branch
- Harness config available so `retry.ci_fix_max_rounds` can be enforced

## Inputs

| Variable | Description | Default |
| --- | --- | --- |
| `BRANCH` | Branch to monitor | Current branch |
| `BASE_REF` | Base ref for changed-file context | `origin/main` |
| `PR_NUMBER` | Existing PR number | Auto-detected from branch head |
| `JIRA_KEY` | Jira ticket key for handoff text | Auto-detected when possible |
| `MAX_ROUNDS` | Requested CI fix rounds | Capped by harness config |

## Hard constraint

`MAX_ROUNDS` may be lower than requested, but it may never exceed `node utilities/scripts/harness/harness-config.mjs get retry.ci_fix_max_rounds`.

## Quick Reference

| Topic | Reference |
| --- | --- |
| Detailed monitoring loop, capped retries, and fix prompt | [monitoring-loop.md](references/monitoring-loop.md) |
| Final output, caller handoff, edge cases, and notes | [outcomes.md](references/outcomes.md) |

## Common Workflows

### First monitoring pass after PR creation

Wait for checks to appear, watch the suite to completion, and hand green CI back to the caller.

### Re-run after a CI fix push

Use the same bounded loop after a targeted fix round when the caller wants refreshed PR status and next-step guidance.

## Responsibilities and boundaries

- Use `gh pr checks` as the source of truth for PR status.
- Resolve workflow runs only as best-effort support for logs.
- Treat LeanCTX as the default Bash-path context reducer when the environment
  has been bootstrapped for it, but keep using the explicit
  `trim-build-output.mjs` pipes from the reference when you need deterministic
  repo-owned CI log filtering.
- Update the existing PR in place; do not create or merge PRs.
- Do not invoke `completion-verification` or `stuck-loop-detection` directly; the caller does that after this skill returns.

## Step 1 — Resolve branch/PR/head SHA and wait for checks to appear

Resolve the branch, PR, head SHA, and Jira key. Verify `gh` auth, detect the PR, and wait briefly for checks to be queued. Detailed commands: [references/monitoring-loop.md](references/monitoring-loop.md).

## Step 2 — Watch the full PR check suite to completion

Use `gh pr checks --watch` when available; otherwise poll `gh pr checks` until the suite settles.

## Step 3 — On green CI, clean up PR status and return control to the caller

Remove `ci-failing` if present, post the success handoff comment, and return so the caller can run `completion-verification`.

## Step 4 — On failure, enter the bounded fix loop

Resolve failing jobs, fetch logs, and dispatch the fix sub-agent using the bounded retry contract in [references/monitoring-loop.md](references/monitoring-loop.md).

## Step 5 — After the fix loop, either hand back green CI or mark the PR as failing

If CI turns green, return the success handoff. If retries are exhausted, leave the PR clearly marked as failing and return the failure handoff.

## Step 6 — When CI is still failing, the caller invokes stuck-loop-detection

The caller, not this skill, decides whether to escalate through `stuck-loop-detection` after the retry cap is exhausted.

## Step 7 — Final output

Use the standard success or still-failing output in [references/outcomes.md](references/outcomes.md).

## Edge cases

Use the edge-case guidance in [references/outcomes.md](references/outcomes.md) for missing PRs, absent checks, flaky failures, or missing workflow runs.

## References

- [monitoring-loop.md](references/monitoring-loop.md)
- [outcomes.md](references/outcomes.md)
