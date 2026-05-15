---
name: gh-cli
description: GitHub CLI (gh) comprehensive reference for repositories, issues, pull requests, Actions, projects, releases, gists, codespaces, organizations, extensions, and all GitHub operations.
---

# GitHub CLI (gh)

Comprehensive reference for the GitHub CLI — work seamlessly with GitHub from the command line.

**Version:** 2.85.0 (current as of January 2026)

## When to use

- When performing any GitHub operation from the command line
- For repositories, issues, PRs, Actions, releases, gists, codespaces, and organizations
- When the user asks how to use `gh` or needs help with a GitHub CLI command

## Prerequisites

### Installation

```bash
brew install gh          # macOS
winget install --id GitHub.cli  # Windows
sudo apt install gh      # Linux (see auth-config.md for full Linux steps)
gh --version             # verify
```

### Authentication

```bash
gh auth login            # interactive (prompts for browser or token)
gh auth login --with-token < mytoken.txt   # non-interactive
gh auth status           # check current auth
gh auth setup-git        # configure git credential helper
```

> For the full authentication command reference (refresh, switch, token, logout,
> enterprise auth) see [references/auth-config.md](references/auth-config.md).

## Quick Reference

| Topic | Key commands | Reference |
|---|---|---|
| **Auth, config & output** | `gh auth`, `gh config`, global flags, JSON output | [auth-config.md](references/auth-config.md) |
| **Command tree** | Full command/flag index, subcommand structure | [command-tree.md](references/command-tree.md) |
| **Repositories** | `gh repo create/clone/list/view/edit/fork/sync` | [repos.md](references/repos.md) |
| **Issues** | `gh issue create/list/view/edit/close/comment` | [issues.md](references/issues.md) |
| **Pull requests** | `gh pr create/list/view/merge/review/checks` | [pull-requests.md](references/pull-requests.md) |
| **GitHub Actions** | `gh run/workflow/cache/secret/variable` | [actions.md](references/actions.md) |
| **Projects, Releases & Gists** | `gh project/release/gist` | [projects-releases.md](references/projects-releases.md) |
| **Everything else** | `gh api`, codespaces, orgs, search, labels, extensions, aliases | [other-commands.md](references/other-commands.md) |

## Common Workflows

### Create PR from Issue

```bash
# Create branch from issue
gh issue develop 123 --branch feature/issue-123

# Make changes, commit, push
git add .
git commit -m "Fix issue #123"
git push

# Create PR linking to issue
gh pr create --title "Fix #123" --body "Closes #123"
```

### Bulk Operations

```bash
# Close multiple issues
gh issue list --search "label:stale" \
  --json number \
  --jq '.[].number' | \
  while IFS= read -r number; do
    gh issue close "$number" --comment "Closing as stale"
  done

# Add label to multiple PRs
gh pr list --search "review:required" \
  --json number \
  --jq '.[].number' | \
  while IFS= read -r number; do
    gh pr edit "$number" --add-label needs-review
  done
```

```powershell
# Close multiple issues
gh issue list --search "label:stale" `
  --json number `
  --jq '.[].number' |
  ForEach-Object {
    gh issue close $_ --comment "Closing as stale"
  }

# Add label to multiple PRs
gh pr list --search "review:required" `
  --json number `
  --jq '.[].number' |
  ForEach-Object {
    gh pr edit $_ --add-label needs-review
  }
```

### Repository Setup Workflow

```bash
# Create repository with initial setup
gh repo create my-project --public \
  --description "My awesome project" \
  --clone \
  --gitignore python \
  --license mit

cd my-project

# Set up branches
git checkout -b develop
git push -u origin develop

# Create labels
gh label create bug --color "d73a4a" --description "Bug report"
gh label create enhancement --color "a2eeef" --description "Feature request"
gh label create documentation --color "0075ca" --description "Documentation"
```

### CI/CD Workflow

```bash
# Run workflow and wait
RUN_ID=$(gh workflow run ci.yml --ref main --jq '.databaseId')

# Watch the run
gh run watch "$RUN_ID"

# Download artifacts on completion
gh run download "$RUN_ID" --dir ./artifacts
```

### Fork Sync Workflow

```bash
# Fork repository
gh repo fork original/repo --clone

cd repo

# Add upstream remote
git remote add upstream https://github.com/original/repo.git

# Sync fork
gh repo sync

# Or manual sync
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Getting Help

```bash
# General help
gh --help

# Command help
gh pr --help
gh issue create --help

# Help topics
gh help formatting
gh help environment
gh help exit-codes
gh help accessibility
```

## References

- Official Manual: https://cli.github.com/manual/
- GitHub Docs: https://docs.github.com/en/github-cli
- REST API: https://docs.github.com/en/rest
- GraphQL API: https://docs.github.com/en/graphql
