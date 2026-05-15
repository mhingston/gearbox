# Session Lessons — Destination Routing Rules

This reference defines how each surviving candidate cluster is assigned a recommended destination. Apply these rules after the coverage comparison step in [workflow.md](workflow.md).

## Routing Decision Tree

```
Is the pattern a cross-cutting convention or guardrail?
  YES → AGENTS.md

Is the pattern a detailed domain topic (architecture, testing, deployment, infra)?
  YES → repo docs (docs/**/*.md) — pick the most specific existing file or propose a new one

Is the pattern a well-defined, repeatable operator workflow with clear inputs/outputs?
  YES → existing skill (extend) or new skill (create)

Is the pattern a one-off investigation or a proposed feature with uncertain scope?
  YES → Jira ticket

Is coverage already adequate?
  YES → no-op
```

## Destination Rules

### `AGENTS.md`

Route here when:

- The pattern is a repo-wide guardrail, naming convention, or architectural constraint that every agent needs to see
- The guidance is short enough to fit a single bullet or a two-line note
- The pattern is not specific to a single domain or service

Do **not** route here for long reference payloads — use `repo docs` instead.

### `repo docs`

Route here when:

- The pattern is domain-specific (e.g., deployment, CosmosDB schema, brand-specific config)
- The pattern warrants its own section in an existing `docs/**/*.md` file
- The content is too long for `AGENTS.md` but does not justify a standalone skill

Set `destination_detail` to the most specific target file (e.g., `docs/agent-harness.md`, `docs/infrastructure/azure-environments.md`). If no suitable file exists, propose a new path following the `docs/<area>/<topic>.md` convention.

### `existing skill`

Route here when:

- A current `SKILL.md` already addresses the same domain but is missing coverage of the observed pattern
- The fix is additive — a new section, a worked example, or an updated Quick Reference row

Set `destination_detail` to the skill path (e.g., `.agents/skills/payment-trace/SKILL.md`).

### `new skill`

Route here when:

- The pattern is a self-contained, repeatable operator workflow
- No existing skill covers it
- Evidence count is MEDIUM or HIGH (≥ 5 occurrences)

A LOW-evidence candidate (3 – 4 occurrences) may still warrant a new skill if it is clearly self-contained and operator-facing. Flag it as `confidence: LOW` in the output.

### `Jira ticket`

Route here when:

- The pattern reveals a capability gap that requires implementation work (not just documentation)
- The scope is uncertain and needs team discussion before any skill or doc can be written
- The pattern is a recurring bug or user-facing friction point that should be tracked

The skill does not create Jira tickets automatically. It emits the recommendation; the operator decides.

### `no-op`

Route here when:

- Coverage is already adequate (existing skill, doc, or `AGENTS.md` bullet directly addresses the ask)
- The pattern is too narrow, too noisy, or too session-specific to generalise
- Evidence count is below the threshold (< 3 occurrences)

## Confidence Adjustment Rules

Lower the confidence by one tier if any of the following apply:

- The cluster spans only one theme keyword (single-signal cluster)
- More than half of the contributing sessions share the same author or branch (single-contributor risk)
- The session summaries are absent or very short (low-quality evidence)

Raise the confidence by one tier if:

- The same pattern was previously identified in a `pr-retrospective` instincts payload
- The pattern appears in both session turns and checkpoint notes
