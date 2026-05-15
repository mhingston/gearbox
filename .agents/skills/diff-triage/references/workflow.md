# Diff Triage — Classification Workflow

This reference defines the full staged/unstaged classification flow, hunk-level risk signals, and the decision rules that assign each file or hunk to an output bucket.

## Step 1 — Establish Context

Before reading any diff, collect context that drives classification:

1. **Ticket intent** — if `ticket_key` is provided, read the Jira ticket summary and acceptance criteria (use the `jira` skill). Record the stated scope in one sentence.
2. **Branch purpose** — read `git log --oneline origin/main..HEAD` to understand what commits are already on the branch. If no commits exist yet, treat the branch name as the sole intent signal.
3. **Base ref** — confirm the diff base. Default: `origin/main`. Override with `base_ref` input if provided.
4. **Operator question** — if a free-text `question` was supplied, parse it for file-path or component constraints that should narrow the classification.

## Step 2 — Inspect the Working Tree

Run the following in order:

```bash
# 1. High-level status (staged vs unstaged separation)
git status --short

# 2. Unstaged diff (scope = unstaged or both)
git diff --stat
git diff

# 3. Staged diff (scope = staged or both)
git diff --cached --stat
git diff --cached

# 4. Full branch diff from base (always, for scope check)
git diff origin/main --stat
```

Record every file that appears in any of the above outputs. Each file enters the classification pipeline independently.

## Step 3 — Classify Each File

For each file, answer these questions in order. The first matching rule determines the bucket.

### 3a. Is the file in a merge-conflict state?

```bash
git diff --name-only --diff-filter=U
```

If yes → **stop**: route to `fix-merge-conflicts` before running triage. Do not classify merge-conflicted files.

### 3b. Is the file clearly on-ticket?

A file is on-ticket when it matches at least one of:

- Path directly referenced in the ticket AC or description
- Same package/namespace/component as explicitly changed files (collateral edit)
- Test file whose subject class is on-ticket
- Config or migration directly required by the on-ticket code change

If yes → proceed to **Step 3c** (hunk-level risk scan).
If no → bucket: `out of scope` (see Step 3e).

### 3c. Hunk-level risk scan

Read each hunk (`git diff [-cached] -- <file>`) and check for risk signals:

| Signal | Severity | Bucket |
| ------ | -------- | ------ |
| Debug/console/logging statement left in (e.g. `Console.WriteLine`, `debugger`, `console.log`) | LOW | `fix before commit` |
| `TODO`, `FIXME`, `HACK` marker added in this diff | LOW | `fix before commit` |
| Lint or format error visible in the hunk (trailing whitespace, mixed indent) | LOW | `fix before commit` |
| Business logic change in a payment processor, brand-conditional block (`Brand == .PGUK`), or public API surface | HIGH | `risky / needs review` |
| Method or class signature change (rename, added/removed parameter) | HIGH | `risky / needs review` |
| Cross-cutting infrastructure change (DI registration, middleware, feature flag gate) | HIGH | `risky / needs review` |
| Incomplete hunk — function body missing closing brace, dangling `if`, obviously unfinished | HIGH | `fix before commit` |
| Change to a file the operator marked as WIP or `leave-untouched` | — | `leave untouched` |
| No risk signals | — | `safe to commit` |

A file with both LOW and HIGH signals → HIGH wins: `risky / needs review`.

### 3d. Staged vs unstaged split

When `scope = both`, classify the staged and unstaged hunks of the same file independently. A file may produce two separate bucket entries (e.g. staged portion is `safe to commit`, unstaged portion is `risky / needs review`).

### 3e. Out-of-scope handling

For files that fail the on-ticket test in Step 3b:

1. State which file is out of scope and why (no connection to ticket intent or branch purpose).
2. If the change looks accidental (e.g. auto-formatter touched an unrelated file), say so.
3. Do **not** auto-stage, discard, or revert. Flag for operator decision only.

## Step 4 — Emit the Bucket Report

Output one section per non-empty bucket, in this order:

```
### ✅ Safe to commit
- <file or file:hunk range> — <one-line reason>

### 🔧 Fix before commit
- <file> — <what to fix>
  [fix inline if the issue is local and unambiguous — see guardrails.md]

### 🔍 Out of scope
- <file> — <why it does not belong>
  Action required: operator decides whether to stash, revert, or carry forward.

### ⚠️ Risky / needs review
- <file:hunk> — <risk signal>
  Recommended next step: `requesting-code-review`

### ⏸ Leave untouched
- <file> — <reason operator marked or implied WIP>
```

Omit any bucket that has no entries. Always emit at least one bucket.

After the bucket report, if any `fix before commit` issues were resolved inline, list them under:

```
### 🛠 Fixes applied
- <file> — <what was fixed>
```

## Step 5 — Recommend Next Step

Close with a single recommended next step:

- All safe → "Proceed to commit."
- Fix-before-commit items resolved → "Re-run triage to confirm, then commit."
- Risky items → "Route flagged files to `requesting-code-review` before committing."
- Out-of-scope items → "Resolve out-of-scope files (stash or revert) before committing."
- Multiple categories → prioritise in the order: risky > out-of-scope > fix-before-commit > safe.
