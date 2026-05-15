# gearbox ⚙

> `npx`-bootstrappable AI agent harness packager. Installs a self-improving AI agent harness into any repo.

```sh
npx gearbox
```

The core value is a **session eval flywheel** — hook scripts capture what happens during every AI coding session, feed learnings back into the agent's instructions (`AGENTS.md`), and the agent gradually gets better at your specific repo over time. No cloud service, no subscription — just files checked into your repo.

## What you get

- 🪝 **8 hook scripts** — capture session events, run policy guards, trigger self-learning
- 🛠 **5 harness utilities** — health scoring, docs drift detection, convention drift gate, event log
- 🎓 **33 portable skills** — domain-agnostic agent skills that work with any codebase
- ⚡ **7 agentic workflows** — GitHub Actions for ongoing repo health automation
- 🔌 **Platform adapters** — correct config files for 6 AI coding platforms
- 📝 **`AGENTS.md` stub** — the living memory file your agent reads at the start of every session

## Requirements

- Node.js ≥ 20.12.1
- Git repository

## Installation

```sh
npx gearbox                                    # Interactive wizard (recommended)
npx gearbox --yes                              # Non-interactive — accept all defaults
npx gearbox --dry-run                          # Preview files that would be written, no changes
npx gearbox --platforms copilot,claude         # Select specific platforms
npx gearbox --skills-dir .agents/skills        # Set custom skills directory (default: .agents/skills)
npx gearbox --help                             # Show all options
```

The wizard asks which platforms you use and where to put skills, then writes everything in one shot.

## After installation

1. **Check harness health:**
   ```sh
   npm run gearbox:health
   ```

2. **Commit the generated files** — everything under `.gearbox/`, `.agents/skills/`, `AGENTS.md`, and platform config files belongs in version control:
   ```sh
   git add .gearbox/ AGENTS.md .github/copilot/ .claude/ .agents/
   git commit -m "chore: install gearbox agent harness"
   ```

3. **Configure gitleaks** (optional but recommended) — gearbox's `pre-tool-use` hook uses [gitleaks](https://github.com/gitleaks/gitleaks) for secret scanning before every file write. Install it and add a `.gitleaks.toml` to your repo root. Without it the hook degrades gracefully (fail-open).

4. **Compile the agentic workflows** — if you have the [`gh` CLI](https://cli.github.com/) with the [gh-aw extension](https://github.com/github/gh-aw):
   ```sh
   gh aw compile .github/workflows/gearbox-*.md
   ```
   This turns the Markdown workflow definitions into runnable GitHub Actions.

## What gets installed

### `.gearbox/hooks/` — 8 hook scripts

These run at key moments during AI coding sessions. Each platform maps its native hook events to this standard set.

| Hook | When it runs | What it does |
|------|-------------|--------------|
| `pre-tool-use.mjs` | Before every tool call | Secret scanning via gitleaks, policy guard |
| `post-tool-use.mjs` | After every tool call | Logs tool usage to the event log |
| `session-start.mjs` | At session start | Loads context, runs self-learning from previous sessions |
| `session-end.mjs` | At session end | Flushes the event log, triggers session checkpoint |
| `error-occurred.mjs` | On unhandled errors | Logs error context for post-session analysis |
| `stop.mjs` | When the agent is stopped | Graceful shutdown, finalise event log |
| `pre-push.mjs` | Before `git push` | Runs pre-push validation (gitleaks, branch checks) |
| `notification.mjs` | On agent notifications | Routes notifications to the event log |

### `.gearbox/scripts/` — harness utilities

| Script | What it does |
|--------|-------------|
| `harness-audit.mjs` | Health scoring (0–100) across 5 dimensions; also runs preflight checks before harness operations |
| `docs-drift-check.mjs` | Detects documentation that has gone stale relative to code changes |
| `convention-drift-gate.mjs` | Enforces coding conventions; runs as a post-merge CI gate |
| `event-log.mjs` | Append-only structured event log used by hooks for session tracing |
| `harness-config.mjs` | Reads `harness-config.json`; single source of truth for retry limits, budget settings, and hook tuning |

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

### `AGENTS.md`

The top-level durable memory file. The agent reads this at the start of every session to understand your repo's conventions, architecture, and accumulated learnings. Starts as a stub — grows richer over time as the eval flywheel runs.

### `package.json` scripts

Three utility scripts are added to your `package.json`:

```sh
npm run gearbox:health      # Run harness health check (0-100 score)
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
session-end hook triggers self-learning synthesis
    ↓
Learnings proposed as updates to AGENTS.md
    ↓
Agent reads improved AGENTS.md at start of next session
    ↓
Better outcomes → more learnings → cycle continues
```

The `pr-retrospective` agentic workflow runs an additional flywheel turn after every PR merge, mining the git history and review comments for durable patterns.

`AGENTS.md` is the living memory file. Keep it in version control — it accumulates your repo's conventions, architectural decisions, and hard-won lessons in a format the agent reads directly.

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
