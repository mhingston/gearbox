# Platform Notes

Use this reference when the environment changes how the workflow can run.

## Packaging and Presenting

If the user wants an exportable skill bundle, package it after validation:

```bash
node utilities/scripts/skills/run-python.mjs --cwd .agents/skills/skill-creator   --module scripts.package_skill   <path/to/skill-folder>
```

If the environment has a presentation tool, offer the packaged artifact. Otherwise, return the output path.

## Claude.ai

Claude.ai changes the workflow in a few important ways:

- No subagents: run eval prompts yourself, one at a time.
- No reliable benchmark baseline: focus on qualitative review instead of parallel A/B comparisons.
- No browser review flow: present outputs inline if you cannot open the viewer.
- No `claude -p`: skip description optimization unless that CLI is available.
- Preserve the original skill name when updating an installed skill.

If the installed skill lives in a read-only path, copy it to a writable location before editing.

## Cowork

Cowork supports the main workflow, but review is usually headless.

- Run the normal subagent-driven eval flow.
- Generate the viewer as a static HTML file instead of opening a live server.
- Expect the user's review to come back as a downloaded `feedback.json` file.
- Description optimization works because the loop uses `claude -p` through subprocesses.

## Updating an Installed Skill

When the user asks for an update rather than a brand-new skill:

- keep the existing directory name,
- keep the existing frontmatter `name`,
- copy the installed skill to a writable workspace if needed, and
- package the updated copy under the same skill name.
