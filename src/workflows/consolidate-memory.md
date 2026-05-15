---
on:
  schedule:
    - cron: '0 3 * * 0' # Every Sunday at 3 AM UTC
permissions:
  contents: read
safe-outputs:
  create-pull-request:
    title-prefix: '[agent-maintenance] '
    labels: [agent-maintenance]
    base-branch: main
  noop:
    report-as-issue: false
  report-failure-as-issue: false
---

## Automated Memory Consolidation

Weekly cleanup of accumulated staleness, duplication, and drift in durable
memory files.

### Runtime contract

- Use the current gh-aw workflow agent for the cleanup pass. Do not shell out
  to nested agent invocations.
- GitHub access is already provided by the compiled workflow wrapper and safe
  outputs. Do not treat manual GitHub MCP server setup as a prerequisite.

### Steps

1. Read the consolidation prompt from
   `.github/hooks/prompts/consolidate-memory.md`
2. Apply the prompt's instructions directly in this workflow run. Treat the
   prompt file as the operating instructions for the pass rather than spawning
   a second agent process.
3. Check `git diff` to see what changed.
4. If no changes were made, exit quietly.
5. If changes were made, open a PR with the automated cleanup results. Keep
   the summary in the PR body because this workflow only exposes
   `create-pull-request`.

### Guardrails

- Only modify files under `AGENTS.md`, `docs/`, and
  `.github/agents/decisions.md`
- Never add new content — only remove, reorganize, and fix
- Route any durable markdown edits through `documentation-writer` for the
  final prose

---

### Completing the workflow

The safe-output tools (`noop`, `create_issue`, `create_pull_request`) are
registered as MCP tools in the `safeoutputs` server — they appear in your tool
list alongside `get_file_contents` and other MCP tools. Call them as direct
tool calls. Do **not** invoke them via the skill system (`skill(noop)` will
fail). Do **not** output raw JSON — make an actual MCP tool call.
