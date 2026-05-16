# Changelog

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
