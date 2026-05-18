---
description:
  Explicit user preferences that should shape future agent behaviour. Reference
  only; not a callable agent.
disable-model-invocation: true
user-invocable: false
---

# User directives

This file lives under `.github/agents/` so agent loaders can discover it at
session start. The frontmatter above is compatibility metadata only; treat this
as a durable reference, not an agent to invoke.

Record only preferences the user stated explicitly.

## What belongs here

- Preferred workflow or response style
- Explicit do and do-not instructions that should persist
- Scope boundaries the user wants remembered in future sessions

## What does not belong here

- Inferred preferences
- Repo architecture rules better captured in `AGENTS.md` or `decisions.md`
- Temporary requests that only matter for one task

## Entry template

## <Directive title>

- Stated by: <name or role>
- Applies when: <situation>
- Direction: <what to do or avoid>
- Source: <ticket, PR, or session note if helpful>

## Current directives

_No persistent user directives recorded yet._
