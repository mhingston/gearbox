# Diff Triage — Non-Destructive Guardrails

This reference defines what the `diff-triage` skill must never do to the working tree, and the narrow conditions under which it may make cleanup edits. These rules apply unconditionally — no operator instruction overrides them.

## Absolute Prohibitions

### Never auto-stage

The skill **must not** run `git add` or `git add -p` on any file under any circumstances.

Staging is an explicit operator decision. Triage classifies; the operator acts.

### Never auto-commit

The skill **must not** run `git commit`, `git commit --amend`, or any variant.

### Never discard or revert user work

The skill **must not** run:

- `git checkout -- <file>` (discard unstaged changes)
- `git restore <file>` or `git restore --staged <file>`
- `git reset HEAD <file>` (unstage)
- `git stash` or `git stash pop`
- `git clean -f` or any variant

Even if a change is classified `out of scope`, the skill only flags it. The operator decides what to do with it.

### Never sweep unrelated dirty-tree changes into the task

The skill **must not** reclassify an out-of-scope file as on-ticket to reduce the operator's decision burden. If a file does not connect to the stated ticket or branch purpose, it stays `out of scope` regardless of how minor the change appears.

### Do not replace full code review

Classification as `safe to commit` means the change has no obvious risk signals relative to the ticket scope. It does **not** mean the change is correct, secure, or architecturally sound. Always route high-impact changes through `requesting-code-review` after triage.

### Do not attempt merge conflict resolution

If `git diff --name-only --diff-filter=U` returns any files, stop and route to `fix-merge-conflicts`. Do not attempt to read, classify, or edit files in a conflict state.

## Permitted Cleanup Edits

The skill may make inline edits **only** when all of the following conditions hold:

1. The file is classified `fix before commit` — not `risky / needs review`, `out of scope`, or `leave untouched`.
2. The issue is **local** — it is entirely contained within the hunk already in the diff (no edits to surrounding lines that were not part of the change).
3. The fix is **unambiguous** — there is exactly one correct resolution (e.g. remove a `Console.WriteLine` debug line, delete a `debugger` statement, trim trailing whitespace).
4. The fix does **not** alter logic, change method signatures, or affect any code path outside the hunk.

If any condition fails, the skill reports the issue and leaves the file unchanged.

## Permitted Inline Fix Examples

| Issue | Permitted | Rationale |
| ----- | --------- | --------- |
| Remove `Console.WriteLine("debug")` added in the diff | ✅ Yes | Local, unambiguous, no logic change |
| Remove `debugger;` statement added in the diff | ✅ Yes | Local, unambiguous |
| Trim trailing whitespace added in the diff | ✅ Yes | Local, unambiguous |
| Remove `// TODO: remove before merge` comment added in the diff | ✅ Yes | Local, unambiguous |
| Fix a misspelled variable name introduced in the diff | ❌ No | Potentially logic-affecting |
| Complete an unfinished method body | ❌ No | Logic change |
| Remove a `TODO` in a line that was not changed in this diff | ❌ No | Outside the hunk — not local |
| Reformat a file's indentation globally | ❌ No | Not local to the hunk |

## Reporting Inline Fixes

When the skill makes a permitted inline fix, it must:

1. Show the before and after hunk.
2. State why the fix qualifies (local, unambiguous, no logic change).
3. List the fix under `### 🛠 Fixes applied` in the bucket report.
4. Re-evaluate the file's bucket after the fix (it should move to `safe to commit` if the fix was the only issue).

The operator still stages and commits — the skill only edits the file content.

## Out-of-Scope File Guidance

For files in the `out of scope` bucket, the skill may suggest (but never perform) one of:

- `git stash -- <file>` — if the change is exploratory and not ready
- `git restore <file>` — if the change was accidental
- Carry it forward explicitly — if the operator decides it belongs in a follow-up ticket

State the suggestion clearly, then wait for the operator to act.
