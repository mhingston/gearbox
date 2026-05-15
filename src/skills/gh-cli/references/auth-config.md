# gh CLI — Setup, Auth & Global Configuration

> **Reference file for [gh-cli skill](../SKILL.md)**

## Contents

- [Configuration (environment & files)](#configuration)
- [Authentication (gh auth)](#authentication-gh-auth)
- [Global Flags](#global-flags)
- [Output Formatting](#output-formatting)
- [Environment Setup](#environment-setup)
- [Best Practices](#best-practices)

---

## Configuration

### Global Configuration

```bash
# List all configuration
gh config list

# Get specific configuration value
gh config list git_protocol
gh config get editor

# Set configuration value
gh config set editor vim
gh config set git_protocol ssh
gh config set prompt disabled
gh config set pager "less -R"

# Clear configuration cache
gh config clear-cache
```

### Environment Variables

```bash
# GitHub token (for automation)
export GH_TOKEN=ghp_xxxxxxxxxxxx

# GitHub hostname
export GH_HOST=github.com

# Disable prompts
export GH_PROMPT_DISABLED=true

# Custom editor
export GH_EDITOR=vim

# Custom pager
export GH_PAGER=less

# HTTP timeout
export GH_TIMEOUT=30

# Custom repository (override default)
export GH_REPO=owner/repo

# Custom git protocol
export GH_ENTERPRISE_HOSTNAME=hostname
```

```powershell
# GitHub token (for automation)
$env:GH_TOKEN = 'ghp_xxxxxxxxxxxx'

# GitHub hostname
$env:GH_HOST = 'github.com'

# Disable prompts
$env:GH_PROMPT_DISABLED = 'true'

# Custom editor
$env:GH_EDITOR = 'code --wait'

# Custom pager
$env:GH_PAGER = 'less'

# HTTP timeout
$env:GH_TIMEOUT = '30'

# Custom repository (override default)
$env:GH_REPO = 'owner/repo'

# Custom git protocol
$env:GH_ENTERPRISE_HOSTNAME = 'hostname'
```

## Authentication (gh auth)

### Login

```bash
# Interactive login
gh auth login

# Web-based authentication
gh auth login --web

# With clipboard for OAuth code
gh auth login --web --clipboard

# With specific git protocol
gh auth login --git-protocol ssh

# With custom hostname (GitHub Enterprise)
gh auth login --hostname enterprise.internal

# Login with token from stdin
gh auth login --with-token < token.txt

# Insecure storage (plain text)
gh auth login --insecure-storage
```

```powershell
# Interactive login
gh auth login

# Web-based authentication
gh auth login --web

# With clipboard for OAuth code
gh auth login --web --clipboard

# With specific git protocol
gh auth login --git-protocol ssh

# With custom hostname (GitHub Enterprise)
gh auth login --hostname enterprise.internal

# Login with token from stdin
Get-Content .\token.txt | gh auth login --with-token

# Insecure storage (plain text)
gh auth login --insecure-storage
```

### Status

```bash
# Show all authentication status
gh auth status

# Show active account only
gh auth status --active

# Show specific hostname
gh auth status --hostname github.com

# Show token in output
gh auth status --show-token

# JSON output
gh auth status --json hosts

# Filter with jq
gh auth status --json hosts --jq '.hosts | add'
```

### Switch Accounts

```bash
# Interactive switch
gh auth switch

# Switch to specific user/host
gh auth switch --hostname github.com --user monalisa
```

### Token

```bash
# Print authentication token
gh auth token

# Token for specific host/user
gh auth token --hostname github.com --user monalisa
```

### Refresh

```bash
# Refresh credentials
gh auth refresh

# Add scopes
gh auth refresh --scopes write:org,read:public_key

# Remove scopes
gh auth refresh --remove-scopes delete_repo

# Reset to default scopes
gh auth refresh --reset-scopes

# With clipboard
gh auth refresh --clipboard
```

### Setup Git

```bash
# Setup git credential helper
gh auth setup-git

# Setup for specific host
gh auth setup-git --hostname enterprise.internal

# Force setup even if host not known
gh auth setup-git --hostname enterprise.internal --force
```


## Global Flags

| Flag                       | Description                            |
| -------------------------- | -------------------------------------- |
| `--help` / `-h`            | Show help for command                  |
| `--version`                | Show gh version                        |
| `--repo [HOST/]OWNER/REPO` | Select another repository              |
| `--hostname HOST`          | GitHub hostname                        |
| `--jq EXPRESSION`          | Filter JSON output                     |
| `--json FIELDS`            | Output JSON with specified fields      |
| `--template STRING`        | Format JSON using Go template          |
| `--web`                    | Open in browser                        |
| `--paginate`               | Make additional API calls              |
| `--verbose`                | Show verbose output                    |
| `--debug`                  | Show debug output                      |
| `--timeout SECONDS`        | Maximum API request duration           |
| `--cache CACHE`            | Cache control (default, force, bypass) |

## Output Formatting

### JSON Output

```bash
# Basic JSON
gh repo view --json name,description

# Nested fields
gh repo view --json owner,name --jq '.owner.login + "/" + .name'

# Array operations
gh pr list --json number,title --jq '.[] | select(.number > 100)'

# Complex queries
gh issue list --json number,title,labels \
  --jq '.[] | {number, title: .title, tags: [.labels[].name]}'
```

### Template Output

```bash
# Custom template
gh repo view \
  --template '{{.name}}: {{.description}}'

# Multiline template
gh pr view 123 \
  --template 'Title: {{.title}}
Author: {{.author.login}}
State: {{.state}}
'
```


## Environment Setup

### Shell Integration

```bash
# Add to ~/.bashrc or ~/.zshrc
eval "$(gh completion -s bash)"  # or zsh/fish

# Create useful aliases
alias gs='gh status'
alias gpr='gh pr view --web'
alias gir='gh issue view --web'
alias gco='gh pr checkout'
```

### Git Configuration

```bash
# Use gh as credential helper
gh auth setup-git

# Set gh as default for repo operations
git config --global credential.helper 'gh !gh auth setup-git'

# Or manually
git config --global credential.helper github
```

## Best Practices

1. **Authentication**: Use environment variables for automation

   ```bash
   export GH_TOKEN=$(gh auth token)
   ```

2. **Default Repository**: Set default to avoid repetition

   ```bash
   gh repo set-default owner/repo
   ```

3. **JSON Parsing**: Use jq for complex data extraction

   ```bash
   gh pr list --json number,title --jq '.[] | select(.title | contains("fix"))'
   ```

4. **Pagination**: Use --paginate for large result sets

   ```bash
   gh issue list --state all --paginate
   ```

5. **Caching**: Use cache control for frequently accessed data
   ```bash
   gh api /user --cache force
   ```

