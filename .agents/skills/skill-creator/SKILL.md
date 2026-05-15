---
name: skill-creator
description: Create new skills or improve existing ones. Use when turning a workflow into a SKILL.md, refactoring for lower prompt weight, or tightening a description for reliable triggering.
---

# Skill Creator

Create new skills, restructure existing skills, and verify that they are accurate, lean, and easy to trigger.

## When to use

- When turning a recurring workflow into a SKILL.md file
- When refactoring an existing skill for lower prompt weight
- When the user wants to create, update, or validate a skill

## Trigger and Scope

- Use this skill for new skill authoring, prompt-weight reductions, evaluation design, benchmark-driven iteration, and frontmatter description tuning.
- Match the user's jargon level. Explain terms like JSON or assertions when the user may not know them.
- Keep the entrypoint lean. Move heavy detail into `references/`, repeatable logic into `scripts/`, and reusable artifacts into `assets/`.

## Prerequisites

- Validate every edited skill with:

```bash
node utilities/scripts/harness/validate-skill.mjs <path-to-SKILL.md>
```

- Run bundled Python helpers with the cross-platform launcher:

```bash
node utilities/scripts/skills/run-python.mjs --cwd .agents/skills/skill-creator <script-or-module> [args...]
```

- Description optimization relies on the `claude -p` flow available in Claude Code or Cowork. If that environment is unavailable, skip that workflow and explain why.

## Quick Reference

| Topic | Use it for | Reference |
| --- | --- | --- |
| Skill structure and writing guidance | frontmatter, progressive disclosure, safety, testing hooks | [references/authoring.md](references/authoring.md) |
| Eval schemas | `evals.json`, `grading.json`, `benchmark.json`, timing files | [references/schemas.md](references/schemas.md) |
| Running evals and iteration loops | parallel runs, viewer, grading, blind comparison | [references/evaluation.md](references/evaluation.md) |
| Trigger optimization | should-trigger / should-not-trigger evals, optimization loop | [references/description-optimization.md](references/description-optimization.md) |
| Environment-specific adaptations | packaging, Claude.ai, Cowork, updating installed skills | [references/platform-notes.md](references/platform-notes.md) |
| Specialist subagents | grading, analysis, blind comparison | `agents/grader.md`, `agents/analyzer.md`, `agents/comparator.md` |

## Creating a skill

### Capture Intent

Start with the workflow the user actually wants to capture. Extract as much as you can from the conversation before asking follow-up questions.

1. What should this skill enable the model to do?
2. When should it trigger?
3. What output should it produce?
4. Does it need objective test cases, qualitative review, or both?

### Interview and Research

- Clarify edge cases, inputs, outputs, dependencies, and success criteria before drafting tests.
- If the skill wraps an external API, verify every endpoint against the canonical OpenAPI spec before documenting it.
- Reuse nearby skills and project conventions when they fit; do not duplicate large reference payloads inside `SKILL.md`.

### Write the SKILL.md

- Keep the frontmatter description specific and concise; it is the main trigger surface.
- Use `SKILL.md` for trigger rules, prerequisites, quick reference, common workflows, and outward links.
- Push detailed schemas, long command catalogs, and implementation notes into `references/`.
- Add or update `tests/skills/tasks.jsonl` only when stable markers change or a new skill needs coverage.
- Re-run validation immediately after editing.

## Common Workflows

### Draft a new skill

1. Capture intent and decide whether the workflow needs scripts, references, or assets.
2. Draft a lean `SKILL.md`, then add supporting files only where they reduce prompt weight or repeated effort.
3. Add realistic eval prompts if the skill has verifiable behavior.
4. Validate the skill before presenting it.

### Improve an existing skill

1. Preserve stable markers that tests depend on unless you also update the manifest.
2. Remove detail from `SKILL.md` first; move it to `references/` before rewriting instructions.
3. Compare the revised skill against a baseline when the user wants evidence, not just a rewrite.
4. Apply feedback, revalidate, and repeat until the user is satisfied or progress stalls.

### Optimize triggering accuracy

1. Draft should-trigger and should-not-trigger prompts that look like real user requests.
2. Review the eval set with the user before running automation.
3. Run the description optimization loop, then apply the best description to the frontmatter.
4. Report the score change and any remaining ambiguity.

## Validation and Packaging

- Treat blocking validator failures as stop-the-line issues.
- Review advisory warnings, especially description length and file size, and trim when practical.
- If the environment supports packaging or presentation, follow the environment notes before exporting the finished skill.

## References

- [references/authoring.md](references/authoring.md)
- [references/evaluation.md](references/evaluation.md)
- [references/description-optimization.md](references/description-optimization.md)
- [references/platform-notes.md](references/platform-notes.md)
- [references/schemas.md](references/schemas.md)
