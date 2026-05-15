# Session Lessons — Evidence & Clustering Workflow

This reference defines how the skill mines sessions, applies evidence thresholds, clusters friction points, and emits only durable candidates.

## 1. Session Mining

Query the session store for recent activity scoped to the requested repo and time window.

```sql
SELECT s.id, s.branch, s.summary, t.user_message, t.assistant_response, t.timestamp
FROM turns t
JOIN sessions s ON t.session_id = s.id
WHERE s.repository = '<repo>'
  AND t.timestamp >= date('now', '-<window>')
ORDER BY t.timestamp DESC;
```

Default window: **30 days**. Accept ISO-8601 durations (`P7D`, `P30D`) or natural language (`"last 2 weeks"`).

Use full-text search to narrow to a theme when one is provided:

```sql
SELECT content, session_id, source_type
FROM search_index
WHERE search_index MATCH '<theme-keywords>'
ORDER BY rank;
```

## 2. Evidence Threshold

A pattern must appear **≥ 3 times** across **≥ 2 distinct sessions** to qualify as a durable candidate. Patterns that appear in a single session are discarded unless the user explicitly passes `--single-session`.

| Evidence count | Confidence tier |
| -------------- | --------------- |
| ≥ 10 | HIGH |
| 5 – 9 | MEDIUM |
| 3 – 4 | LOW |
| < 3 | DISCARD |

## 3. Clustering

Group raw observations into named patterns using these signals:

- **Repeated ask** — user asks the same question or invokes the same workflow multiple times
- **Friction point** — assistant required more than 2 back-and-forth turns to resolve a request that should be routine
- **Workaround** — assistant produced a manual sequence to compensate for absent skill or doc coverage
- **Error recovery** — session contains explicit error → retry → success arcs that indicate a knowledge gap

Label each cluster with a short pattern name (kebab-case, ≤ 6 words). Record the session IDs that contribute evidence.

## 4. Coverage Comparison

For each candidate cluster, check whether coverage already exists:

1. Search `AGENTS.md`, `docs/**/*.md`, and `**/SKILL.md` for the cluster's keyword set.
2. Query `tests/skills/tasks.jsonl` to see if a matching skill is already in the validation manifest.
3. If coverage is **adequate** (the existing text directly addresses the ask with actionable guidance), mark `current_coverage: adequate` and route to `no-op`.
4. If coverage is **partial** (exists but lacks actionable detail or a worked example), mark `current_coverage: partial` and route to the most appropriate destination.
5. If coverage is **absent**, mark `current_coverage: absent` and route per the destination rules in [routing.md](routing.md).

## 5. Emitting Candidates

Produce one row per surviving cluster in the output contract format. Sort by evidence count descending. Suppress rows marked `no-op` unless the user passes `--include-noop`.

Do not edit any files. Do not create Jira tickets. Do not write skill drafts. This skill is **analysis-first** by default. Surface recommendations to the operator and wait for explicit instruction before acting.

## 6. Optional Theme Filter

If the user provides a `theme` or `filter`, apply it as an additional keyword constraint during mining (step 1) and discard clusters that do not match the theme — even if they meet the evidence threshold.
