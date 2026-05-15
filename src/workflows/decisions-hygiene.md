---
on:
  schedule:
    - cron: '0 8 1 * *'
permissions:
  contents: read
safe-outputs:
  create-pull-request:
    title-prefix: '[agent-maintenance] '
    labels: [agent-maintenance]
    base-branch: main
    protected-files: fallback-to-issue
  noop:
    report-as-issue: false
---

## Decisions Hygiene

You are a maintenance agent. Your job is to keep `.github/agents/decisions.md`
accurate, non-redundant, and concise. Run once per month. Open a PR only when
changes are needed.

---

### Step 1 — Load the decisions file

Read `.github/agents/decisions.md` in full. Parse every `##`-level heading as
a separate decision entry. Note each entry's **Date** field.

---

### Step 2 — Assess each entry against four criteria

For every entry, apply each test below. Record your finding per entry before
making any edits. This evidence becomes the PR description.

#### 2a — Accuracy (is the code still consistent with the decision?)

A decision is **moot** when the codebase has changed to contradict or fully
supersede it such that the decision no longer guides future work.

Concrete checks:

For any entry that references a specific technology, tool, or directory, verify
the claim still holds by checking the relevant source file or running a targeted
`git grep` against the codebase.

For example:

- If a decision says "X lives inside module Y — no standalone Z", grep for any
  file or directory named Z outside Y's subtree.
- If a decision says "Tests run as executables, not via `<tool> test`", grep
  CI configs for any remaining `<tool> test` invocations.
- If a decision governs a canonical file location or symlink, verify the
  location still exists and the symlink target is correct.

A decision is **not** moot just because time has passed — it must be actively
wrong or irrelevant.

#### 2b — Duplication (is this entry subsumed by another?)

Two entries are **duplicates** when:

- They govern the same code path or component, AND
- One entry's **Decision** + **Consequences** fully covers the other's without
  loss of meaning.

Partial overlap is not duplication. Merge only when you can write a single
entry that preserves all actionable guidance from both. Discard the older
entry's date; keep the most-recent date.

#### 2c — Reasoning quality (has context changed enough to warrant re-framing?)

A decision's reasoning is **stale** when the **Rationale** references a
constraint that no longer exists (e.g. a library version that has been
upgraded, an API that has been replaced). Stale rationale does not invalidate
the decision — rewrite only the **Rationale** field to reflect current context.
Do not change the **Decision** or **Consequences** unless 2a requires it.

To detect rationale staleness: check version fields in `package.json` and any
lock files for version numbers mentioned in the **Rationale**.

#### 2d — Recency of reference (has this entry been used recently?)

Run:

```
git --no-pager log --since="6 months ago" --all --oneline --grep="ADR\|decisions.md\|<entry-keyword>"
```

Replace `<entry-keyword>` with 2–3 distinctive words from the entry's title.
An entry is **unreferenced** if no commit in the last 6 months mentions it or
the component it governs.

An unreferenced entry is **not** automatically removed. It is archived only
when it is **also** older than 6 months (Date field < today − 6 months). An
entry that is old but still accurately describes live code and has no
alternative guidance should be kept in the main body.

---

### Step 3 — Apply changes

Apply edits in this order:

1. **Remove moot entries** — delete the entire `##` block. Record: entry
   title, reason it is moot, evidence (file path or grep output).
2. **Merge duplicates** — write a single combined entry. Record: titles of
   both merged entries, what was kept, what was dropped.
3. **Rewrite stale rationale** — update only the **Rationale** field. Record:
   entry title, old rationale (one sentence), new rationale.
4. **Archive old unreferenced entries** — move the `##` block verbatim to a
   `## Archive` section at the bottom of the file (create the section if it
   does not exist). Add a note below the heading:
   ```
   **Archived:** YYYY-MM-DD — not referenced in git log for 6+ months
   ```
   Record: entry title, archive date.

Do **not** change entry wording beyond what the above tests require. Do not
reorder entries that are not being merged or archived.

---

### Step 4 — Validate the result

After all edits:

- Every surviving entry in the main body must have a **Date**, **Made by**,
  **Context**, **Decision**, **Rationale**, and **Consequences** field.
- The **Archive** section (if it exists) must contain only entries with an
  `**Archived:**` annotation.
- No entry in the main body should appear in the Archive section.

If any entry fails validation, fix it before opening the PR.

---

### Step 4b — Retro trends

Read authoritative retrospective comments from merged PRs updated in the last
30 days.

From each retrospective comment, extract:

- Failure categories found (from Review findings sections)
- Remedial ratio (from Remedial commits section)
- Agent signal data (first-push coverage, review iterations, complexity score)

Produce a summary:

1. **Top 3 failure categories by frequency** across all retrospectives in the
   window.
2. **Average remedial ratio** — compute the mean of all numeric remedial
   ratios found (skip `N/A` entries).
3. **Trend direction per category** — split the 30-day window into two halves.
   For each of the top 3 categories, compare the count in the first half vs
   the second half: **improving** / **declining** / **stable**.

If no retrospectives exist in the 30-day window, write "No retrospectives in
the last 30 days."

Include the trend summary in the PR body under a `### Retro trends (30-day)`
section.

---

### Step 5 — Open a PR or exit

**If no changes were made:** stop. Do not open a PR.

**If any changes were made:** open a pull request against `main` with:

- **Title:** `[agent-maintenance] decisions.md hygiene — <YYYY-MM>`
- **Labels:** `agent-maintenance`
- **Body:** Use the following template:

```
## What changed and why

### Removed as moot
<!-- For each removed entry: title, evidence (file/grep), one-sentence explanation -->

### Merged duplicates
<!-- For each merge: titles merged, what was retained, what was dropped -->

### Rationale updated
<!-- For each rewrite: title, old rationale, new rationale -->

### Archived (old + unreferenced)
<!-- For each archived entry: title, date, last commit that referenced it (or "none") -->

### No changes needed
<!-- If a section above has no items, write "None" rather than omitting the heading -->

### Retro trends (30-day)
<!-- Top 3 failure categories, average remedial ratio, trend direction. -->

---
_Generated by decisions-hygiene workflow on <date>_
```

A PR with an empty body or a body that does not account for every change is a
failure.

---

### Completing the workflow

The safe-output tools (`noop`, `create_issue`, `create_pull_request`) are
registered as MCP tools in the `safeoutputs` server — they appear in your tool
list alongside `get_file_contents` and other MCP tools. Call them as direct
tool calls. Do **not** invoke them via the skill system (`skill(noop)` will
fail). Do **not** output raw JSON — make an actual MCP tool call.
