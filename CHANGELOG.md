# Changelog

## 0.1.0 — Initial release

### Added
- Interactive CLI wizard (`npx gearbox`) with `--yes`, `--dry-run`, `--platforms`, `--skills-dir` flags
- 8 hook scripts for 6 AI coding platforms (GitHub Copilot CLI, Claude Code, OpenAI Codex, Gemini CLI, opencode, pi.dev)
- 33 portable agent skills (14 from obra/superpowers upstream, 19 genericised from real-world harness usage)
- 7 GitHub Agentic Workflows for repo health automation
- Harness utilities: health scoring, docs drift detection, convention drift gate, event log
- Platform adapters generating correct config files for each supported AI platform
- Full test suite (311 tests, Node built-in runner)
