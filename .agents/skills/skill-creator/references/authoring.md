# Skill Authoring Guide

Use this reference when drafting a new skill or trimming an existing one.

## Anatomy of a Skill

```text
skill-name/
├── SKILL.md        # required: trigger surface and entrypoint
├── references/     # optional: long-form reference material
├── scripts/        # optional: deterministic helpers and wrappers
└── assets/         # optional: templates, sample files, static payloads
```

Choose the lightest structure that fits the workflow. Do not add folders just to mirror a pattern.

## Frontmatter

- `name` is the stable identifier. Preserve it when revising an existing skill.
- `description` is the primary trigger surface. It should explain both what the skill does and when it should win over nearby skills.
- Keep descriptions concise and specific. The validator allows more, but shorter descriptions are easier to trigger accurately.

A good description usually covers:

1. the problem domain,
2. the user phrases or situations that should trigger the skill, and
3. the output or workflow the skill owns.

## Progressive Disclosure

Keep `SKILL.md` as the lean entrypoint. It should answer five questions quickly:

1. When should this skill trigger?
2. What is in scope, and what is not?
3. What prerequisites matter?
4. What are the common workflows?
5. Where should the model read next for detail?

Move heavier detail into bundled resources:

- `references/` for long command catalogs, schemas, or domain notes
- `scripts/` for repeatable, deterministic logic
- `assets/` for templates or example payloads that do not belong in the prompt

If a reference file grows large, add a small table of contents near the top.

## Writing Patterns

- Prefer imperative instructions.
- Explain why a rule exists when that will help the model generalize.
- Reuse existing project conventions instead of inventing bespoke structures.
- Match the user's vocabulary level. Define technical terms when needed.
- Keep examples short and reusable.

For output contracts, give the model a clear skeleton instead of a paragraph of prose. Example:

```markdown
## Report structure

# [Title]

## Executive summary

## Key findings

## Recommendations
```

## Testing Hooks

- Add a `tests/skills/tasks.jsonl` entry when a new skill needs task-manifest coverage.
- Keep `expected_output_markers` stable once tests rely on them.
- If the skill ships JavaScript helpers, add focused runtime tests near the shipped code.
- Re-run `node .gearbox/scripts/validate-skill.mjs <path-to-SKILL.md>` after every material edit.

## Safety and Verification

- Do not create misleading, malicious, or privilege-escalation skills.
- If a skill wraps an external API, verify the documented endpoints against the canonical OpenAPI spec before writing instructions.
- Avoid baking secrets, private datasets, or one-off local paths into the skill.
- Favor predictable, reviewable workflows over clever prompt tricks.
