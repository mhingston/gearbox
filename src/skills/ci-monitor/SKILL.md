---
name: ci-monitor
description: Watch PR CI after push, run a bounded automated fix loop, and leave a clear PR handoff when checks pass or stall.
---

# ci-monitor

> **Existing PR CI only.** Use this after a branch is pushed and a pull request
> already exists.

Watch the full PR check suite, attempt a small number of targeted CI fixes, and
return a generic handoff the caller can continue from.

> **Announce at start:** "I'm using the ci-monitor skill to watch CI on
> {BRANCH}."

## When to use

- After a push when the branch already has a PR
- When the caller wants bounded CI fixing plus PR status updates
- When GitHub checks are the source of truth for pass/fail state

## Inputs

| Variable | Description | Default |
| --- | --- | --- |
| `BRANCH` | Branch to monitor | Current branch |
| `BASE_REF` | Base ref for changed-file context | `origin/main` |
| `PR_NUMBER` | Existing PR number | Auto-detected from branch head |
| `MAX_ROUNDS` | Requested CI fix rounds | Capped by harness config |

## Hard constraint

`MAX_ROUNDS` may be lower than requested, but it may never exceed
`node .gearbox/scripts/harness-config.mjs get retry.ci_fix_max_rounds`.

## Quick Reference

| Topic | Reference |
| --- | --- |
| Detailed monitoring loop, capped retries, and fix prompt | [monitoring-loop.md](references/monitoring-loop.md) |
| Final output, caller handoff, edge cases, and notes | [outcomes.md](references/outcomes.md) |

## Responsibilities and boundaries

- Use `gh pr checks` as the source of truth for PR status.
- Resolve workflow runs only as best-effort support for logs.
- Update the existing PR in place; do not create or merge PRs.
- Keep the fix loop bounded by harness config.
- Return a clear status handoff; the caller decides the next repo-specific step.

## Step 1 — Resolve branch, PR, and head SHA

Verify `gh` auth, detect the PR, resolve the current head SHA, and wait briefly
for checks to be queued. Detailed commands:
[references/monitoring-loop.md](references/monitoring-loop.md).

## Step 2 — Watch the full PR check suite to completion

Use `gh pr checks --watch` when available; otherwise poll `gh pr checks` until
the suite settles.

## Step 3 — On green CI, clean up PR status and return control

Remove `ci-failing` if present, post a short success comment, and return so the
caller can continue its normal review or merge flow.

## Step 4 — On failure, enter the bounded fix loop

Resolve failing jobs, fetch logs, and dispatch a focused fix sub-agent using the
bounded retry contract in [references/monitoring-loop.md](references/monitoring-loop.md).

## Step 5 — After the fix loop, either hand back green CI or mark the PR as failing

If CI turns green, return the success handoff. If retries are exhausted, leave
the PR clearly marked as failing and return the failure handoff.

## Step 6 — Optional escalation when work is blocked

If CI is still failing after the retry cap, the caller may escalate through
`stuck-loop-detection` with `STUCK_TYPE=ci-failure`.

## Step 7 — Final output

Use the standard success or still-failing output in
[references/outcomes.md](references/outcomes.md).

## Edge cases

Use the edge-case guidance in [references/outcomes.md](references/outcomes.md)
for missing PRs, absent checks, flaky failures, or missing workflow runs.

## References

- [monitoring-loop.md](references/monitoring-loop.md)
- [outcomes.md](references/outcomes.md)
