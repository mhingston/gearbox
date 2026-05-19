# Changelog

## 0.3.0 — Session continuity and advisory audit rubric

### Added
- Session continuity templates for `docs/agents/progress.md`, `docs/agents/session-handoff.md`, and `docs/agents/clean-state-checklist.md`
- An advisory 5-subsystem harness rubric in `harness-audit.mjs` covering instructions, state, verification, scope, and lifecycle

### Changed
- `AGENTS.md` generation now links the session continuity docs and upgrades older Gearbox sections in place when those links are missing
- `harness-audit` now reports install health separately from the advisory subsystem rubric without changing the existing top-level score contract
- README now documents the minimal multi-session pack and the richer `gearbox:health` output

### Fixed
- Prevented duplicate session continuity links when upgrading existing `AGENTS.md` files that already contained bare links
- Kept the checked-in `.gearbox/scripts/harness-audit.mjs` sample asset in sync with the source implementation

## 0.2.0 — Reusable bootstrap hardening

### Added
- `markdown-eval.mjs` and the shipped prompt pack needed to complete the session eval flywheel
- Durable memory bootstrap templates for `docs/agents/learning-guide.md` and `.github/agents/{decisions,user-directives}.md`
- Portable helper CLIs for skill validation, path resolution, error normalization, and scoped temp directories
- Source/sample parity and portability contract coverage to catch future drift

### Changed
- Hook installation now copies nested runtime assets and generated `AGENTS.md` links to the durable memory contract
- Bundled `ci-monitor`, `stuck-loop-detection`, `fix-merge-conflicts`, and `skill-creator` skills now target repo-agnostic helpers and workflows
- README now reflects the actual shipped hook runtime, helper CLI surface, and durable memory contract

### Fixed
- Restored the missing shipped pieces of the self-learning flywheel so installed repos can actually emit markdown evals
- Preserved the current goal through context compaction to improve session continuity
- Removed the tracker-key helper so the bootstrap stays repo-agnostic

## 0.1.1 — Cross-platform config sync

### Added
- `sync-agent-config.mjs` — manages instruction file and skills directory symlinks across platforms
- Wizard now calls sync script after installing platform adapters
- `--yes` flag on sync script for non-interactive wizard mode

### Fixed
- Removed `.cursorrules` symlink (Cursor not a supported platform)
- Removed stale Cross-platform agent config section from AGENTS.md

## 0.1.0 — Initial release

### Added
- Interactive CLI wizard (`npx gearbox`) with `--yes`, `--dry-run`, `--platforms`, `--skills-dir` flags
- 8 hook scripts for 6 AI coding platforms (GitHub Copilot CLI, Claude Code, OpenAI Codex, Gemini CLI, opencode, pi.dev)
- 33 portable agent skills (14 from obra/superpowers upstream, 19 genericised from real-world harness usage)
- 7 GitHub Agentic Workflows for repo health automation
- Harness utilities: health scoring, docs drift detection, convention drift gate, event log
- Platform adapters generating correct config files for each supported AI platform
- Full test suite (311 tests, Node built-in runner)
