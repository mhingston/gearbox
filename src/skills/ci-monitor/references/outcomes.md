# CI Outcomes and Edge Cases Reference

> Caller handoff, final output, edge-case guidance, and notes for `ci-monitor`.

---

## Final output

### CI passed

```text
✅ CI monitor complete

Rounds used:    {N}
CI status:      passing
PR:             {PR_URL or "not detected"}
Next step:      Continue with your normal review/merge flow
```

### CI still failing

```text
⚠️ CI monitor complete — PR updated with ci-failing label

Rounds attempted: {MAX_ROUNDS}
CI status:        failing
PR:               {PR_URL or "not detected"}

The PR exists but CI is still failing.
A human needs to resolve the remaining CI failures before this can be merged.

Last failed jobs/checks: {FAILED_JOBS or FAILED_CHECKS}
Latest workflow run:     {RUN_URL or "not resolved from PR head SHA"}
Next step:               optionally invoke stuck-loop-detection with STUCK_TYPE=ci-failure if the work is blocked
```

---

## Edge cases

| Situation | Behaviour |
| --- | --- |
| No PR detected for the branch | Stop early — `ci-monitor` requires an existing PR because it watches PR checks |
| No CI runs triggered at all | Wait briefly, then stop and re-run once GitHub has queued checks |
| Latest workflow run cannot be resolved | Continue using failed PR checks as the source of truth; omit run-log links from comments/output |
| CI run cancelled by another push | Refresh PR head SHA and re-watch the full PR check suite |
| Flaky infrastructure failure detected | Mark as environmental failure; skip fix rounds; apply `ci-failing` with a note |
| Fix sub-agent reports "Cannot fix: environmental" | Skip remaining rounds; apply `ci-failing` and note that the failure is environmental |
| Branch PR already exists | `ci-monitor` reuses it and updates labels/comments in place |
| `gh` CLI not authenticated | Stop immediately: `❌ gh CLI is not authenticated. Run: gh auth login` |
| CI turns green after fix rounds | Remove `ci-failing`, comment success, then return control to the caller |
| CI still failing after max rounds | Return blocked context and suggest optional escalation through `stuck-loop-detection` |

---

## Notes

- `ci-monitor` **never merges PRs**. Merging is always a human action.
- `ci-monitor` **never creates PRs**. It assumes a PR already exists.
- The retry cap is governed by `.gearbox/scripts/harness-config.mjs`.
- `ci-monitor` works in any repo where GitHub PR checks are available.
- Workflow-run lookup is best-effort log enrichment only.
