# CI Outcomes and Edge Cases Reference

> Caller handoff, final output, edge-case guidance, and notes for `ci-monitor`.

---

## Step 6 — When CI is still failing, the caller invokes stuck-loop-detection

If CI is still failing after max rounds (`$CI_EXIT -ne 0` and
`$ROUND -eq $MAX_ROUNDS`), the invoking agent should call
`stuck-loop-detection` with:

- `KEY`: resolved Jira ticket key
- `STUCK_TYPE`: `ci-failure`
- `DETAILS`: failed jobs/checks, latest run URL (if resolved), and failure log

Suggested details payload:

```text
CI fix loop exhausted after {MAX_ROUNDS} rounds.
Failed jobs/checks: {FAILED_JOBS or FAILED_CHECKS}
Latest workflow run: {RUN_URL or "not resolved from PR head SHA"}
Branch: {BRANCH}
PR: {PR_URL}
Last error:
{FAILURE_LOG}
```

---

## Step 7 — Final output

### CI passed

```
✅ CI monitor complete

Rounds needed: {N}
CI status:     passing
PR:            {PR_URL or "not detected"}
Next step:     run completion-verification with KEY={resolved Jira key or "not detected"} BASE_REF={BASE_REF}
```

### CI still failing

```
⚠️ CI monitor complete — PR updated with ci-failing label

Rounds attempted: {MAX_ROUNDS}
CI status:        failing
PR:               {PR_URL or "not detected"}

The PR exists but CI is still failing.
A human needs to resolve the remaining CI failures before this can be merged.

Last failed jobs/checks: {FAILED_JOBS or FAILED_CHECKS}
Latest workflow run:     {RUN_URL or "not resolved from PR head SHA"}
Next step:               invoking agent should call stuck-loop-detection with STUCK_TYPE: ci-failure
```

After recording the terminal CI outcome, archive the completed run:

```bash
node utilities/scripts/harness/archive-trace.mjs .pipeline/${KEY}.state.json
```

This preserves tool traces, event logs, and state snapshots for downstream
eval/ablation tooling.

---

## Harness signal recording

When `ci-monitor` is running inside `ticket-to-pr` with a writable state file,
record the canonical Node 9 health signals before returning:

- `node: "ci-monitor"`, `event: "fix_rounds_used"`, `value: <integer rounds consumed>`
- `node: "ci-monitor"`, `event: "ci_first_pass"`, `value: true` only when CI
  turned green with `fix_rounds_used = 0`; otherwise `false`
- `node: "ci-monitor"`, `event: "flaky_failure_detected"`, `value: true|false`
  when the failure classifier made a flake/no-flake decision

Do **not** use free-form status markers like `ci_status` or `ci_monitoring` as
replacements for these health signals.

---

## Edge cases

| Situation                                          | Behaviour                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| No PR detected for the branch                      | Stop early — `ci-monitor` requires an existing PR because it watches PR checks                                |
| No CI runs triggered at all                        | Wait briefly, then stop and re-run once GitHub has queued checks                                              |
| Latest workflow run cannot be resolved             | Continue using failed PR checks as the source of truth; omit run-log links from comments/output               |
| CI run cancelled by another push                   | Refresh PR head SHA, re-watch the full PR check suite                                                         |
| Flaky infrastructure failure detected              | Mark as environmental failure; skip fix rounds; apply `ci-failing` label with "flaky" note                   |
| Fix sub-agent reports "Cannot fix: environmental"  | Skip remaining rounds; apply `ci-failing` label and note "Environmental failure — not code related"          |
| Branch PR already exists                           | `ci-monitor` reuses it and updates labels/comments in place                                                   |
| `gh` CLI not authenticated                         | Stop immediately: "❌ gh CLI is not authenticated. Run: gh auth login"                                        |
| Jira key cannot be determined on green CI          | Warn in final output; caller may still run completion-verification manually with an explicit `KEY`           |
| CI turns green after fix rounds                    | Remove `ci-failing`, comment success, then return control to the caller for completion-verification          |
| CI still failing after max rounds                  | Return BLOCKED context; invoking agent should call `stuck-loop-detection` with `STUCK_TYPE: ci-failure`      |

---

## Notes

- `ci-monitor` **never merges PRs**. Merging is always a human action.
- `ci-monitor` **never creates PRs**. Canonical pipeline order is
  `push` → `create-pr` → `ci-monitor`.
- The 2-round maximum is a hard architectural constraint. Do not make it
  configurable beyond capping at 2.
- This skill is designed to be called from `ticket-to-pr` after `create-pr`, but
  works standalone after any `git push` so long as a PR already exists.
- Upstream pipeline steps should pass both `JIRA_KEY` and `BASE_REF` when they
  already know them; branch / PR parsing is best-effort fallback only.
- `ci-monitor` watches **all PR checks** triggered for the PR head commit, not a
  single workflow run. Workflow-run lookup is best-effort log enrichment only.
- On green CI, the next harness step is always `completion-verification`. Jira
  transition logic belongs to the caller after that gate returns a verdict.
