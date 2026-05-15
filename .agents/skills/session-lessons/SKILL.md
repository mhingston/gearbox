---
name: session-lessons
description: Mine recent session history to surface evidence-backed recommendations for new skills, doc updates, or agent memory. Use when you want to turn recurring asks or friction into durable guidance.
---

# Session Lessons

> **Session mining, not promotion.** Use this to find evidence-backed
> codification candidates across recent sessions. Use `pr-retrospective` for a
> single merged PR, and use `memory-merger` only after lessons are mature and
> approved for promotion.

Turn recent session history into evidence-backed codification recommendations. This skill mines sessions, clusters repeated asks and friction points, compares them against existing coverage, and emits actionable candidates — without modifying any files by default.

**Announce at start:** "I'm using the session-lessons skill to analyse recent sessions."

**Boundary:** This skill is analysis-first. It does not edit docs, create tickets, or write skill drafts unless the operator explicitly requests an action after reviewing the output.

## When to use

- You want to know what recurring questions or friction points your team is hitting that are not yet covered by a skill or doc
- You are doing a periodic knowledge-base health check across recent sessions
- You spotted a theme in operator feedback and want evidence to decide whether to write a new skill or update `AGENTS.md`
- You are earlier in the learning loop than `pr-retrospective` (you have not yet merged a PR, or the signal comes from multiple sessions, not one PR)

**Not** a substitute for:

- `pr-retrospective` — use that for single merged-PR retrospectives and eval flywheel ingestion
- `memory-merger` — use that to promote already-approved lessons into instruction files

## Prerequisites

- Session store access (the `sql` tool with `database: "session_store"`)

## Input

| Parameter | Required | Default | Description |
| --------- | -------- | ------- | ----------- |
| `repo` | No | current repo | GitHub `owner/repo` slug to scope the session query |
| `window` | No | `30d` | Look-back period (e.g. `7d`, `P14D`, `"last 2 weeks"`) |
| `theme` | No | — | Keyword or phrase to narrow the cluster search |
| `--single-session` | No | off | Include patterns seen in only one session (below default threshold) |
| `--include-noop` | No | off | Show clusters routed to `no-op` in the output table |

## Output Contract

One row per surviving candidate cluster, sorted by evidence count descending.

| Field | Description |
| ----- | ----------- |
| `pattern` | Short kebab-case label for the cluster (≤ 6 words) |
| `evidence_count` | Number of distinct occurrences across all sessions |
| `session_count` | Number of distinct sessions contributing evidence |
| `current_coverage` | `absent` \| `partial` \| `adequate` |
| `recommended_destination` | `AGENTS.md` \| `repo docs` \| `existing skill` \| `new skill` \| `Jira ticket` \| `no-op` |
| `destination_detail` | Target file path, skill path, or proposed Jira summary |
| `reason` | One-sentence rationale |
| `confidence` | `HIGH` \| `MEDIUM` \| `LOW` |

## Common Workflows

### Periodic knowledge-base scan (no theme)

Run against the default 30-day window. Review the output table and decide which HIGH/MEDIUM candidates to act on.

### Theme-focused analysis

Pass a `theme` to narrow the search — for example `"authentication"` or `"database"` — to find skill or doc gaps in a specific area.

### Pre-skill-authoring evidence check

Before writing a new skill, run session-lessons to verify there is sufficient evidence (≥ 5 occurrences, MEDIUM or higher confidence) to justify the investment.

## Workflow

Full evidence threshold, clustering algorithm, coverage comparison, and candidate emission rules: [references/workflow.md](references/workflow.md).

## Routing

Destination assignment rules for all six recommended destinations: [references/routing.md](references/routing.md).

## References

- [references/workflow.md](references/workflow.md) — mining, thresholds, clustering, coverage comparison
- [references/routing.md](references/routing.md) — destination routing rules and confidence adjustment
