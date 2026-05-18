# Gearbox memory consolidation

Use this prompt during the weekly consolidation workflow to keep durable memory
files lean and useful.

## Goal

Reduce duplication and stale guidance across the repo's durable memory files
without inventing new advice.

## Inputs to inspect

- `AGENTS.md`
- `docs/`
- `.github/agents/decisions.md` (if present)
- `.gearbox/hooks/.runtime/latest-eval.md` (if present)

## What good consolidation looks like

1. Remove duplicate guidance when the same idea appears in multiple places.
2. Delete stale or contradicted advice.
3. Merge overlapping bullets into one clearer statement when they say the same
   thing.
4. Preserve only repo-specific lessons that remain useful in future sessions.
5. Keep edits small and deterministic — prefer tightening existing text over
   adding new sections.

## Guardrails

- Do not invent new process, architecture, or workflow rules.
- Do not add ticketing, payment, Jira, or other product-specific logic.
- Do not touch files outside the approved durable-memory set.
- If a lesson is not clearly evidenced by existing text or the latest eval,
  remove it instead of rewording it.

## Output expectations

- Keep the final diff easy to review.
- Summarize what was deduplicated, removed, or clarified.
- If no worthwhile cleanup is found, make no changes.
