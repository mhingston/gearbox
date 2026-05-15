---
name: diff-triage
description: Inspect staged and/or unstaged changes, classify each file or hunk by intent and risk relative to the branch purpose, and emit an action-oriented bucket report without touching the index.
---

# Diff Triage

> **Scope boundary.** This skill triages what is already in your working tree. It does not perform full code review (use `requesting-code-review`) and it does not resolve merge conflicts (use `fix-merge-conflicts`).

Decide what in your current diff is **safe to commit**, **needs fixing first**, **out of scope**, **risky**, or best left alone — and act on the clear cases when the answer is unambiguous.

**Announce at start:** "I'm using the diff-triage skill to classify the current diff."

## When to Use

Trigger this skill when you ask yourself (or an operator asks you):

- "Is this safe to commit?"
- "Which changes belong in this ticket?"
- "Did I accidentally edit something outside my task?"
- "Are there any risky or incomplete hunks in here?"
- "What should I fix before I push?"

**Not** a substitute for:

- `requesting-code-review` — use that for correctness, security, and architecture review after triage clears
- `fix-merge-conflicts` — use that when `git status` shows unmerged files

## Inputs

| Parameter | Required | Default | Description |
| --------- | -------- | ------- | ----------- |
| `scope` | No | `both` | `staged`, `unstaged`, or `both` |
| `ticket_key` | No | — | Jira key (e.g. `PAY-1234`) to check intent against |
| `base_ref` | No | `origin/main` | Base ref for the diff when no staged area is set |
| `question` | No | — | Free-text framing question from the operator (e.g. "did I touch anything outside the session API?") |

## Output Buckets

Every file or hunk lands in exactly one bucket:

| Bucket | Meaning | Default action |
| ------ | ------- | -------------- |
| `safe to commit` | Clearly on-ticket, complete, no risk signals | State explicitly — no changes needed |
| `fix before commit` | On-ticket but has a local, unambiguous issue (debug code, lint error, TODO placeholder) | Fix inline when the fix is small and certain |
| `out of scope` | No connection to the stated ticket or branch purpose | Flag for operator decision; do **not** stage or discard |
| `risky / needs review` | Logic change, public API surface, brand-conditional path, or high-impact hunk | Escalate to `requesting-code-review` |
| `leave untouched` | Intentionally dirty (WIP, stash candidate, or operator-marked) | Note and skip |

## Workflow

Full classification flow — how to read the diff, assign hunks to buckets, and decide when to act:

[references/workflow.md](references/workflow.md)

## Guardrails

Non-destructive rules this skill must always follow — what it will never do to your working tree:

[references/guardrails.md](references/guardrails.md)

## Quick Reference

```bash
# See what is staged vs unstaged
git status --short
git diff --stat          # unstaged
git diff --cached --stat # staged

# Diff against base when no staged area set
git diff origin/main --stat
git diff origin/main -- path/to/file
```

## Integration Points

| Skill | When to chain |
| ----- | ------------- |
| `requesting-code-review` | After triage clears — send `risky / needs review` hunks |
