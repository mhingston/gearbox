---
name: wrap-up
description: End-of-session reflection to surface learnings and persist them as documentation or skill improvements. Trigger with "wrap up", "session summary", or "anything to remember from this session".
---

# Wrap-Up

> Companion to `session-lessons` — which mines **past** sessions for patterns —
> this skill reflects on the **current** session and acts immediately on
> learnings before the conversation closes.

At session close, prompt the model to introspect: what was learned, what
friction occurred, and what deserves persisting? Produce a structured summary
and — unless the user opts out — apply the highest-priority action (e.g. draft
an AGENTS.md bullet, flag a doc gap, or open a skill-improvement ticket).

**Announce at start:** "I'm using the wrap-up skill to reflect on this session."

## When to use

- A complex investigation or implementation session is concluding
- The user says "wrap up", "session summary", or "anything to remember?"
- A multi-step implementation run is finishing and the coordinator wants to
  capture session-scoped learnings before closing
- The user ends the conversation without a specific next task

**Not** a substitute for:

- `session-lessons` — use that to mine evidence-backed patterns across
  **multiple past** sessions
- `pr-retrospective` — use that for post-merge PR retrospectives with eval
  artifact ingestion
- `memory-merger` — use that to promote **approved, mature** lessons into
  instruction files

## Prerequisites

- No external tools required — all analysis is from conversation context
- Optional: `documentation-writer` skill if the user wants a full doc draft
  instead of a bullet

## Workflow

### 1. Introspect

Review the conversation and identify:

- **Novel findings** — things not in existing docs or skills
- **Friction points** — steps that took longer than expected, repeated failures,
  or confusing flows
- **Skill gaps** — missing triggers, incomplete instructions, or outdated
  guidance
- **Doc gaps** — AGENTS.md bullets, docs, or inline comments that would help
  next time
- **What worked** — patterns worth reinforcing (e.g. a useful tool combination,
  a good naming convention)

### 2. Score and Prioritise

Assign each item a priority:

| Priority   | When to use                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| **High**   | Directly impacts next-session productivity; fix in this session if possible |
| **Medium** | Worth preserving; do it now or flag for follow-up                           |
| **Low**    | Nice-to-know; note it for `session-lessons` or future maintenance           |

### 3. Act

For each HIGH or MEDIUM item, determine the right destination:

| Destination          | When appropriate                                                           |
| -------------------- | -------------------------------------------------------------------------- |
| `AGENTS.md`          | Cross-cutting guidance, project conventions, newly discovered patterns     |
| `repo docs`          | Specific technical notes, troubleshooting steps, architecture notes        |
| `existing skill`     | Trigger refinement, instruction gaps, missing edge-case coverage           |
| `new skill`          | A reusable workflow with clear trigger conditions that has no current home |
| `user-directives.md` | Behavioural preferences stated by the user during the session              |
| `Jira ticket`        | A larger improvement that deserves a ticket for tracking                   |
| `no-op`              | One-off debugging artifact; not worth codifying                            |

### 4. Output

Produce a structured wrap-up report:

## Wrap-Up: {session-id-or-topic}

```markdown
## Learnings

| #   | Observation | Priority | Destination | Action         |
| --- | ----------- | -------- | ----------- | -------------- |
| 1   | ...         | High     | AGENTS.md   | Add bullet ... |

## Pending (deferred to session-lessons or follow-up)

- ...

## What went well

- ...
```

### 5. Confirm and Apply

- Present the report to the user
- If the user approves, apply the recommended actions (edit files, update
  skills, write directives)
- If the user declines or says "skip", record the items as `no-op` and close
  cleanly

## Reference

Detailed scoring rubric, destination routing rules, and edge-case handling:
[references/workflow.md](references/workflow.md).
