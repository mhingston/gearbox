# gearbox ⚙

> `npx`-bootstrappable AI agent harness packager. Installs a self-improving AI agent harness into any repo.

```sh
npx @mhingston5/gearbox
```

The core value is a **session eval flywheel** — hook scripts capture what happens during every AI coding session, turn that into portable runtime records and eval summaries, and give the agent better repo-specific context over time. No cloud service, no subscription — just files checked into your repo.

## What you get

- 🪝 **Hook runtime assets** — capture session events, run policy guards, synthesise markdown evals, and ship portable prompts
- 🛠 **10 user-facing harness utilities and helper CLIs** — health scoring, docs drift detection, convention drift gate, event log, config sync, skill validation, and portable path helpers
- 🎓 **33 portable skills** — domain-agnostic agent skills that work with any codebase
- ⚡ **7 agentic workflows** — GitHub Actions for ongoing repo health automation
- 🔌 **Platform adapters** — correct config files for 6 AI coding platforms
- 📝 **Durable memory contract** — `AGENTS.md` plus a learning guide and durable memory reference docs

## Requirements

- Node.js ≥ 20.12.1
- Git repository

## Installation

```sh
npx @mhingston5/gearbox                                    # Interactive wizard (recommended)
npx @mhingston5/gearbox --yes                              # Non-interactive — accept all defaults
npx @mhingston5/gearbox --dry-run                          # Preview files that would be written, no changes
npx @mhingston5/gearbox --platforms copilot,claude         # Select specific platforms
npx @mhingston5/gearbox --skills-dir .agents/skills        # Set custom skills directory (default: .agents/skills)
npx @mhingston5/gearbox --help                             # Show all options
```

The wizard asks which platforms you use and where to put skills, then writes everything in one shot.

## After installation

1. **Check harness health:**
   ```sh
   npm run gearbox:health
   ```

2. **Commit the generated files** — everything under `.gearbox/`, `.agents/skills/`, `AGENTS.md`, `.github/agents/`, `docs/agents/`, platform config files, and any generated symlinks belongs in version control:
   ```sh
   git add .gearbox/ AGENTS.md .github/agents/ docs/agents/ .github/copilot/ .claude/ .agents/
   git add CLAUDE.md .github/copilot-instructions.md GEMINI.md  # if present
   git add .claude/skills/ .github/skills/  # if present
   git commit -m "chore: install gearbox agent harness"
   ```

3. **Configure gitleaks** (optional but recommended) — gearbox's `pre-tool-use` hook uses [gitleaks](https://github.com/gitleaks/gitleaks) for secret scanning before every file write. Install it and add a `.gitleaks.toml` to your repo root. Without it the hook degrades gracefully (fail-open).

4. **Compile the agentic workflows** — if you have the [`gh` CLI](https://cli.github.com/) with the [gh-aw extension](https://github.com/github/gh-aw):
   ```sh
   gh aw compile .github/workflows/gearbox-*.md
   ```
   This turns the Markdown workflow definitions into runnable GitHub Actions.

## What gets installed

### `.gearbox/hooks/` — shared hook runtime assets

These run at key moments during AI coding sessions. Each platform maps its
native hook system to this canonical event set, then invokes the backing
runtime asset shown below.

| Hook event | Backing asset | What it does |
|------------|---------------|--------------|
| `sessionStart` | `self-learning.mjs sessionStart` | Loads prior context and prepares runtime state |
| `userPromptSubmitted` | `self-learning.mjs userPromptSubmitted` | Captures the evolving task/goal for later compaction and evaluation |
| `preToolUse` | `gitleaks-check.sh` + `policy-guard.mjs` | Secret scanning via gitleaks, policy guard |
| `postToolUse` | `self-learning.mjs postToolUse` | Logs tool usage and updates runtime artefacts |
| `errorOccurred` | `self-learning.mjs errorOccurred` | Logs error context for post-session analysis |
| `preCompact` | `context-compact.mjs` | Writes compact context before a session compaction step |
| `sessionEnd` | `self-learning.mjs sessionEnd` | Flushes the event log, writes a session record, and triggers markdown eval |

The installed asset set also includes shared implementations such as
`self-learning.mjs`, `markdown-eval.mjs`, `context-compact.mjs`, helper shell
scripts, and portable prompt files under `.gearbox/hooks/prompts/`.

### `.gearbox/scripts/` — 10 user-facing harness utilities and helper CLIs

| Script | What it does |
|--------|-------------|
| `harness-audit.mjs` | Health scoring (0–100) across 5 install dimensions, plus an advisory 5-subsystem harness rubric; also runs preflight checks before harness operations |
| `docs-drift-check.mjs` | Detects documentation that has gone stale relative to code changes |
| `convention-drift-gate.mjs` | Enforces coding conventions; runs as a post-merge CI gate |
| `event-log.mjs` | Append-only structured event log used by hooks for session tracing |
| `harness-config.mjs` | Reads `harness-config.json`; single source of truth for retry limits, budget settings, and hook tuning |
| `sync-agent-config.mjs` | Manages cross-platform symlinks (CLAUDE.md, GEMINI.md, skills dirs) for instruction compatibility |
| `validate-skill.mjs` | Validates bundled `SKILL.md` files for frontmatter, structure, and basic safety issues |
| `paths.mjs` | Resolves portable config/worktree roots from repo guidance, local folders, or platform defaults |
| `normalize-error.mjs` | Normalizes unstable error text values (temp paths, GUIDs, dates, positions) for loop detection |
| `tmpdir.mjs` | Creates or previews scoped helper temp directories under the host temp root |

`common.mjs` is also installed in `.gearbox/scripts/` as a shared support module
for these CLIs, but it is not intended to be called directly.

### `{skillsDir}/` — 33 portable skills

Skills are Markdown files (`SKILL.md`) that the agent reads when triggered. They encode workflows, checklists, and domain knowledge that the agent applies consistently across sessions. See [Skills reference](#skills-reference) below.

### `.github/workflows/` — 7 agentic workflows

| Workflow | Cadence | What it does |
|----------|---------|-------------|
| `pr-retrospective` | Per PR merge | Mines merged PRs for learnings; updates `AGENTS.md` |
| `convention-drift` | Weekly | Audits the whole repo for convention drift; opens issues |
| `docs-freshness` | Weekly | Checks docs against recent code changes; flags stale content |
| `decisions-hygiene` | Weekly | Reviews architectural decision records for staleness |
| `ci-health` | Daily | Monitors CI pass rates and flags flaky tests |
| `consolidate-memory` | Weekly | Merges mature session lessons into permanent agent memory |
| `daily-workflow-updater` | Daily | Keeps agentic workflow definitions up to date |

### Platform config files

See [Supported platforms](#supported-platforms) for the exact file paths written per platform.

### Durable memory contract

- `AGENTS.md` — top-level durable memory for repo guardrails, architecture notes, and quick links
- `docs/agents/learning-guide.md` — concise routing guide for where new durable learnings should live
- `docs/agents/progress.md` — lightweight running log for work that spans multiple sessions
- `docs/agents/session-handoff.md` — restart context for the next session or reviewer
- `docs/agents/clean-state-checklist.md` — wrap-up checklist before you hand off or pause work
- `.github/agents/decisions.md` — long-lived technical or workflow decisions and invariants
- `.github/agents/user-directives.md` — explicit user preferences that should shape future sessions

`AGENTS.md` starts as a stub and links to the other files so the installed memory bootstrap is immediately navigable.

For the smallest useful multi-session pack, start with `AGENTS.md`, `docs/agents/learning-guide.md`, `docs/agents/progress.md`, `docs/agents/session-handoff.md`, and `docs/agents/clean-state-checklist.md`.

### `package.json` scripts

Three utility scripts are added to your `package.json`:

```sh
npm run gearbox:health      # Run harness health check (0-100 score + advisory subsystem rubric)
npm run gearbox:audit       # Run preflight checks
npm run gearbox:check-docs  # Check for documentation drift
```

## Supported platforms

| Platform | Config file(s) | Notes |
|----------|---------------|-------|
| **GitHub Copilot CLI** | `.github/copilot/hooks.json` | Full hook coverage |
| **Claude Code** | `.claude/settings.json` | Full hook coverage |
| **OpenAI Codex** | `~/.codex/config.json` + `~/.codex/instructions.md` | ⚠ No `errorOccurred` hook; ⚠ no `sessionEnd` hook |
| **Gemini CLI** | `.gemini/settings.json` | ⚠ No `errorOccurred` hook |
| **opencode** | `opencode.ts` plugin | ⚠ `sessionEnd` partially mapped |
| **pi.dev** | `pi-plugin.ts` | Full hook coverage |

You can install config for multiple platforms in one run. The `--platforms` flag accepts a comma-separated list: `copilot`, `claude`, `codex`, `gemini`, `opencode`, `pi`.

## The eval flywheel

The central idea in gearbox is a feedback loop that makes the AI agent better at your specific repo over time:

```
Session runs
    ↓
Hook scripts fire (pre-tool-use, post-tool-use, session-end, …)
    ↓
Event log accumulates structured session data (.gearbox/hooks/.runtime/)
    ↓
session-end hook writes a reusable session record
    ↓
markdown-eval synthesises `.gearbox/hooks/.runtime/latest-eval.md`
    ↓
Durable learnings are consolidated into `AGENTS.md`, `.github/agents/`, and docs
    ↓
Agent reads improved instructions at start of next session
    ↓
Better outcomes → more learnings → cycle continues
```

The `pr-retrospective` agentic workflow runs an additional flywheel turn after every PR merge, mining the git history and review comments for durable patterns.

`AGENTS.md` is the living memory entry point. Keep the full durable memory contract in version control so agents can follow repo conventions, durable decisions, and explicit user preferences from session one.

## Skills reference

33 portable, domain-agnostic skills. Drop them into any repo and they work without modification.

### Process & quality

| Skill | Description |
|-------|-------------|
| `brainstorming` | Explores user intent, requirements and design before any implementation work |
| `test-driven-development` | Enforces failing-test-first discipline before writing implementation code |
| `verification-before-completion` | Runs verification commands and confirms output before any completion claim |
| `systematic-debugging` | Structured debugging protocol for any bug, test failure, or unexpected behaviour |
| `receiving-code-review` | Handles code review feedback with technical rigour, not performative agreement |
| `requesting-code-review` | Verifies work meets requirements before submitting for review |
| `writing-plans` | Produces multi-step implementation plans from specs before touching code |
| `executing-plans` | Executes written implementation plans with review checkpoints in a separate session |

### Agent architecture & meta-skills

| Skill | Description |
|-------|-------------|
| `using-superpowers` | Establishes how to find and use skills — invoke before any response |
| `subagent-driven-development` | Runs independent tasks as parallel sub-agents within the current session |
| `dispatching-parallel-agents` | Dispatches 2+ independent tasks to parallel agents |
| `stuck-loop-detection` | Detects when the agent is burning tokens without progress; escalates with a structured summary |
| `agentic-eval` | Patterns for evaluating and improving agent outputs: self-critique, evaluator-optimizer pipelines, LLM-as-judge |

### Code & architecture

| Skill | Description |
|-------|-------------|
| `refactor` | Surgical refactoring without behaviour change: extract functions, rename, eliminate smells |
| `improve-codebase-architecture` | Finds architectural improvement opportunities, deepens shallow modules, reduces tight coupling |
| `tech-debt` | Identifies, categorises, and prioritises technical debt |
| `context-map` | Maps all files relevant to a task before making changes |
| `diff-triage` | Classifies staged/unstaged changes by intent and risk without touching the index |
| `adopt` | Compares the current codebase with a reference project to identify high-value adaptations |

### Git & GitHub

| Skill | Description |
|-------|-------------|
| `gh-cli` | Comprehensive GitHub CLI reference for repos, issues, PRs, Actions, releases, and more |
| `using-git-worktrees` | Isolates feature work in a git worktree before implementing plans |
| `finishing-a-development-branch` | Guides completion of development work: merge, PR, or cleanup options |
| `fix-merge-conflicts` | Resolves git merge conflicts with guided categorisation and cleanup |
| `ci-monitor` | Watches PR CI, runs a bounded fix loop, and updates PR status |

### Documentation & knowledge

| Skill | Description |
|-------|-------------|
| `documentation-writer` | Expert technical writer following the Diátaxis framework (tutorials, how-tos, reference, explanation) |
| `create-specification` | Creates a specification file optimised for AI consumption |
| `mermaid-diagrams` | Creates software diagrams in Mermaid: class, sequence, flowchart, ER, C4, state, git graphs |
| `memory-merger` | Merges mature lessons from a domain memory file into its instruction file |
| `session-lessons` | Mines recent session history for evidence-backed recommendations |
| `wrap-up` | End-of-session reflection to surface learnings and persist them |

### Skill management

| Skill | Description |
|-------|-------------|
| `skill-creator` | Creates new skills or improves existing ones; tightens descriptions for reliable triggering |
| `writing-skills` | Creates, edits, and verifies skills before deployment |
| `find-skills` | Helps discover skills when asking about capabilities |

## License

MIT

---

*gearbox is inspired by the agent harness patterns developed at [PureGym](https://github.com/PureGymGroup) and the [obra/superpowers](https://github.com/obra/superpowers) skill collection.*
