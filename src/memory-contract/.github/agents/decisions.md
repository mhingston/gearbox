---
description:
  Durable repository decisions and invariants read at session start. Reference
  only; not a callable agent.
disable-model-invocation: true
user-invocable: false
---

# Durable decisions

This file lives under `.github/agents/` so agent loaders can discover it at
session start. The frontmatter above is compatibility metadata only; treat this
as a durable reference, not an agent to invoke.

Use this file for decisions that should stay true across many sessions.

## What belongs here

- Stable architecture or workflow decisions
- Invariants that code review or automation should preserve
- Decision updates or retirements when the repo changes

## What does not belong here

- One-off debugging notes
- Personal preferences better stored in `.github/agents/user-directives.md`
- General repo instructions that already belong in `AGENTS.md`

## Entry template

## <Decision title>

- Status: proposed | accepted | superseded
- Date: YYYY-MM-DD
- Context: why this mattered
- Decision: what we chose
- Consequences: what needs to stay aligned

## Current decisions

_No durable decisions recorded yet._
