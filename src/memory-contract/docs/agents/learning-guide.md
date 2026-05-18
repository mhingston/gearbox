# Durable learning guide

Use this guide when deciding where a new learning should live.

## Memory map

- `AGENTS.md` — top-level repo instructions, guardrails, and shortcuts
- `.github/agents/decisions.md` — accepted long-lived decisions and invariants
- `.github/agents/user-directives.md` — explicit user preferences to honour
- `docs/` — deeper reference material, runbooks, and troubleshooting notes

## Promotion checklist

Persist a learning only when it is:

- durable across multiple future sessions
- grounded in evidence from the repo, user, or recent work
- concise enough to stay readable
- not already captured somewhere better

## Routing rules

### Put it in `AGENTS.md`

- cross-cutting repo conventions
- working agreements that most tasks should follow
- quick links to the memory files agents should read first

### Put it in `.github/agents/decisions.md`

- a durable decision with rationale
- an invariant that code and reviews should keep intact
- a change that would otherwise create repeated confusion

### Put it in `.github/agents/user-directives.md`

- an explicit user preference
- a standing instruction about tone, workflow, or scope
- guidance you should only keep because the user asked for it

### Put it elsewhere in `docs/`

- longer explanations, examples, or troubleshooting steps
- material that is useful but too detailed for durable memory files

## Keep memory healthy

- prefer editing an existing note over creating a duplicate
- retire stale guidance when the repo changes
- link to concrete files or commands when that improves clarity
