---
name: fix-merge-conflicts
description: Resolve git merge conflicts when a PR has conflicts with its target branch, or when merging branches locally. Provides guided resolution with conflict categorization and cleanup.
---

# Fix Merge Conflicts

**Announce at start:** "I'm using the fix-merge-conflicts skill to resolve merge
conflicts."

Automatically detect and resolve merge conflicts whether they exist on a GitHub
PR or in your local repository.

## Overview

This skill handles two conflict scenarios without requiring the user to specify
which:

1. **PR Conflicts** — PR cannot be merged due to conflicts with the target
   branch
2. **Local Conflicts** — Active merge or rebase operation has unmerged files
   locally

**Core principle:** Auto-detect scenario → Categorize conflicts → Resolve with
validation → Complete operation.

## When to Use

- PR shows "This branch has conflicts that must be resolved"
- Local `git merge` or `git rebase` failed with conflicts
- `gh pr update-branch` failed due to conflicts
- An automated pipeline detects PR merge conflicts
- `finishing-a-development-branch` local merge encounters conflicts

## Inputs

| Variable      | Description                          | Detection Priority          |
| ------------- | ------------------------------------ | --------------------------- |
| `PR_URL`      | GitHub PR URL or number              | 1st — Query GitHub API      |
| `TICKET_KEY`  | Jira ticket key (e.g., PAY-1234)     | 2nd — Lookup PR from branch |
| `BRANCH`      | Feature branch to merge              | 3rd — Use with BASE_BRANCH  |
| `BASE_BRANCH` | Target branch (default: origin/main) | 3rd — With BRANCH           |
| None          | Current directory context            | 4th — Check local git state |

## Auto-Detection Logic

The skill determines the scenario automatically:

```bash
# Priority 1: Check PR context
if [ -n "$PR_URL" ] || [ -n "$TICKET_KEY" ]; then
  detect_pr_conflicts
fi

# Priority 2: Check local git state
if has_local_conflicts; then
  handle_local_conflicts
fi

# Priority 3: BRANCH+BASE_BRANCH provided
if [ -n "$BRANCH" ] && [ -n "$BASE_BRANCH" ]; then
  attempt_local_merge_or_detect_pr
fi

# Priority 4: Prompt user
prompt_for_context
```

## Scenario Detection Functions

### Detect PR Conflicts (GitHub API)

```bash
detect_pr_conflicts() {
  if [ -n "$PR_URL" ]; then
    PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
  elif [ -n "$TICKET_KEY" ]; then
    # Lookup PR from branch name
    BRANCH_NAME="feature/${TICKET_KEY}"
    PR_NUMBER=$(gh pr list --head "$BRANCH_NAME" --json number --jq '.[0].number' 2>/dev/null)
  fi

  if [ -z "$PR_NUMBER" ]; then
    echo "❌ Could not determine PR number from provided context"
    return 1
  fi

  PR_DATA=$(gh pr view "$PR_NUMBER" --json mergeable,mergeStateStatus,headRefName,baseRefName,url 2>/dev/null)

  if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch PR data. Check gh authentication."
    return 1
  fi

  MERGEABLE=$(echo "$PR_DATA" | jq -r '.mergeable // "null"')
  STATE=$(echo "$PR_DATA" | jq -r '.mergeStateStatus // "null"')
  HEAD_BRANCH=$(echo "$PR_DATA" | jq -r '.headRefName // "null"')
  BASE_BRANCH_DETECTED=$(echo "$PR_DATA" | jq -r '.baseRefName // "null"')
  PR_URL_DETECTED=$(echo "$PR_DATA" | jq -r '.url // "null"')

  if [ "$MERGEABLE" = "false" ] || [ "$STATE" = "DIRTY" ]; then
    echo "✅ Detected: PR #$PR_NUMBER has merge conflicts (Scenario 1)"
    SCENARIO=1
    BRANCH="$HEAD_BRANCH"
    BASE_BRANCH="origin/${BASE_BRANCH_DETECTED}"
    return 0
  elif [ "$MERGEABLE" = "true" ]; then
    echo "ℹ️ PR #$PR_NUMBER is mergeable — no conflicts to resolve"
    exit 0
  else
    echo "⚠️ PR merge status unclear (mergeable: $MERGEABLE, state: $STATE)"
    return 1
  fi
}
```

PowerShell 7:

```powershell
function Detect-PrConflicts {
  if ($env:PR_URL) {
    $PR_NUMBER = [regex]::Match($env:PR_URL, '(\d+)$').Groups[1].Value
  } elseif ($env:TICKET_KEY) {
    $BRANCH_NAME = "feature/$env:TICKET_KEY"
    $PR_NUMBER = gh pr list --head $BRANCH_NAME --json number --jq '.[0].number' 2>$null
  }

  if (-not $PR_NUMBER) {
    Write-Host "❌ Could not determine PR number from provided context"
    return $false
  }

  $PR_DATA = gh pr view $PR_NUMBER --json mergeable,mergeStateStatus,headRefName,baseRefName,url 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to fetch PR data. Check gh authentication."
    return $false
  }

  $PR_JSON = $PR_DATA | ConvertFrom-Json

  if ($PR_JSON.mergeable -eq $false -or $PR_JSON.mergeStateStatus -eq "DIRTY") {
    Write-Host "✅ Detected: PR #$PR_NUMBER has merge conflicts (Scenario 1)"
    $env:SCENARIO = 1
    $env:BRANCH = $PR_JSON.headRefName
    $env:BASE_BRANCH = "origin/$($PR_JSON.baseRefName)"
    return $true
  } elseif ($PR_JSON.mergeable -eq $true) {
    Write-Host "ℹ️ PR #$PR_NUMBER is mergeable — no conflicts to resolve"
    exit 0
  } else {
    Write-Host "⚠️ PR merge status unclear (mergeable: $($PR_JSON.mergeable), state: $($PR_JSON.mergeStateStatus))"
    return $false
  }
}
```

### Detect Local Conflicts

```bash
has_local_conflicts() {
  # Check for unmerged files
  CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null)

  # Check for merge/rebase in progress
  GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
  if [ $? -ne 0 ]; then
    return 1  # Not in a git repo
  fi

  MERGE_IN_PROGRESS=false
  [ -f "$GIT_DIR/MERGE_HEAD" ] && MERGE_IN_PROGRESS=true
  [ -d "$GIT_DIR/rebase-apply" ] && MERGE_IN_PROGRESS=true
  [ -d "$GIT_DIR/rebase-merge" ] && MERGE_IN_PROGRESS=true

  if [ -n "$CONFLICTED_FILES" ] || [ "$MERGE_IN_PROGRESS" = true ]; then
    echo "✅ Detected: Local merge/rebase conflicts (Scenario 2)"
    SCENARIO=2
    return 0
  fi

  return 1
}
```

PowerShell 7:

```powershell
function Test-LocalConflicts {
  $CONFLICTED_FILES = git diff --name-only --diff-filter=U 2>$null

  $GIT_DIR = git rev-parse --git-dir 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $false  # Not in a git repo
  }

  $MERGE_IN_PROGRESS = $false
  if (Test-Path "$GIT_DIR\MERGE_HEAD") { $MERGE_IN_PROGRESS = $true }
  if (Test-Path "$GIT_DIR\rebase-apply" -PathType Container) { $MERGE_IN_PROGRESS = $true }
  if (Test-Path "$GIT_DIR\rebase-merge" -PathType Container) { $MERGE_IN_PROGRESS = $true }

  if ($CONFLICTED_FILES -or $MERGE_IN_PROGRESS) {
    Write-Host "✅ Detected: Local merge/rebase conflicts (Scenario 2)"
    $env:SCENARIO = 2
    return $true
  }

  return $false
}
```

---

## Scenario 1: PR Has Conflicts with Target Branch

### Step 1 — Setup Worktree

Create or reuse a worktree for the PR branch:

```bash
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel)")
WORKTREE_INFO=$(node utilities/scripts/harness/paths.mjs worktree-root --project "$PROJECT_NAME" --branch "$BRANCH" --json)
WORKTREE_PATH=$(echo "$WORKTREE_INFO" | jq -r '.worktreePath')

if [ -d "$WORKTREE_PATH" ]; then
  echo "Using existing worktree at $WORKTREE_PATH"
  cd "$WORKTREE_PATH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
else
  echo "Creating worktree for $BRANCH"
  git worktree add "$WORKTREE_PATH" "$BRANCH"
  cd "$WORKTREE_PATH"
fi
```

### Step 2 — Attempt Merge

```bash
# Fetch base branch
BASE_BRANCH_NAME=$(echo "$BASE_BRANCH" | sed 's/origin\///')
git fetch origin "$BASE_BRANCH_NAME"

# Attempt merge
echo "▶ Attempting merge: $BASE_BRANCH → $BRANCH"
if git merge "$BASE_BRANCH" --no-commit --no-ff; then
  echo "✅ No conflicts detected — merge would succeed"
  git merge --abort
  exit 0
fi

# Check if we have conflicts
CONFLICTED_FILES=$(git diff --name-only --diff-filter=U)
if [ -z "$CONFLICTED_FILES" ]; then
  echo "❌ Merge failed but no conflict markers found"
  git merge --abort
  exit 1
fi

echo "⚠️ Conflicts detected in:"
echo "$CONFLICTED_FILES"
```

### Step 3 — Categorize Conflicts

```bash
categorize_conflicts() {
  SIMPLE_CONFLICTS=""
  CODE_CONFLICTS=""

  for file in $CONFLICTED_FILES; do
    # Check if file exists
    if [ ! -f "$file" ]; then
      echo "⚠️ $file does not exist (deleted in one branch)"
      continue
    fi

    # Extract conflict blocks
    CONFLICT_COUNT=$(grep -c '^<<<<<<< ' "$file" 2>/dev/null || echo "0")

    # Check for simple patterns
    if grep -q '^<<<<<<< ' "$file"; then
      # Check if it's just imports or whitespace
      if file_has_only_simple_conflicts "$file"; then
        SIMPLE_CONFLICTS="${SIMPLE_CONFLICTS}${file}\n"
      else
        CODE_CONFLICTS="${CODE_CONFLICTS}${file}\n"
      fi
    fi
  done
}

file_has_only_simple_conflicts() {
  local file="$1"

  # Read the conflict markers and content between them
  local in_conflict=false
  local ours_content=""
  local theirs_content=""

  while IFS= read -r line; do
    if [[ "$line" =~ ^"<<<<<<< " ]]; then
      in_conflict=true
      ours_content=""
      theirs_content=""
    elif [[ "$line" =~ ^"======="$ ]]; then
      in_conflict=false
    elif [[ "$line" =~ ^">>>>>>> " ]]; then
      # Compare ours vs theirs
      # If only whitespace/import order differs, it's simple
      in_conflict=false
    elif [ "$in_conflict" = true ]; then
      ours_content="${ours_content}${line}"
    else
      theirs_content="${theirs_content}${line}"
    fi
  done < "$file"

  # Heuristic: if both sides are imports or both are whitespace changes
  return 1  # Default to complex for safety
}
```

### Step 4 — Resolve Strategy

For **simple conflicts** (auto-resolve):

- Import statement ordering → accept both, sort uniquely
- Whitespace → accept newer timestamp version
- File mode changes → accept target branch version

For **code conflicts** (manual resolution):

```bash
show_conflict_context() {
  local file="$1"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📄 $file"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Show conflict blocks with line numbers
  grep -n -A 5 -B 2 '^<<<<<<< \|^=======$\|^>>>>>>> ' "$file" | head -50

  # Show last commits affecting this file on each branch
  echo ""
  echo "Recent changes:"
  echo "  Ours ($BRANCH):"
  git log --oneline -3 -- "$file" 2>/dev/null | sed 's/^/    /'
  echo "  Theirs ($BASE_BRANCH):"
  git log --oneline -3 "$BASE_BRANCH" -- "$file" 2>/dev/null | sed 's/^/    /'
}

resolve_conflict_interactive() {
  local file="$1"

  show_conflict_context "$file"

  echo ""
  echo "Resolution options:"
  echo "  1) Accept ours ($BRANCH)"
  echo "  2) Accept theirs ($BASE_BRANCH)"
  echo "  3) Edit manually"
  echo "  4) Skip for now"
  echo "  5) Abort entire merge"

  read -p "Choose (1-5): " choice

  case "$choice" in
    1)
      git checkout --ours "$file"
      git add "$file"
      echo "✅ Accepted ours for $file"
      ;;
    2)
      git checkout --theirs "$file"
      git add "$file"
      echo "✅ Accepted theirs for $file"
      ;;
    3)
      echo "Open $file in your editor. Remove conflict markers when done."
      echo "Press Enter when ready to continue..."
      read
      if git diff --check "$file" 2>/dev/null; then
        git add "$file"
        echo "✅ $file staged"
      else
        echo "⚠️ Conflict markers still present in $file"
      fi
      ;;
    4)
      echo "⏭ Skipping $file for now"
      return 1
      ;;
    5)
      git merge --abort
      echo "❌ Merge aborted"
      exit 1
      ;;
  esac
}
```

### Step 5 — Complete Merge

```bash
complete_merge() {
  # Check all conflicts resolved
  REMAINING=$(git diff --name-only --diff-filter=U)
  if [ -n "$REMAINING" ]; then
    echo "❌ Unresolved conflicts remain:"
    echo "$REMAINING"
    return 1
  fi

  # Commit merge
  git commit -m "Merge $BASE_BRANCH into $BRANCH (conflicts resolved)

Resolved conflicts in:
$(echo "$CONFLICTED_FILES" | sed 's/^/- /')

Auto-resolved by fix-merge-conflicts skill"

  echo "✅ Merge committed"
}
```

### Step 6 — Validate and Push

```bash
validate_and_push() {
  echo "▶ Running pre-push validation..."

  # Run relevant tests based on changed files
  REPO_ROOT=$(git rev-parse --show-toplevel)

  if [ -f "$REPO_ROOT/.github/hooks/scripts/trim-build-output.mjs" ]; then
    # Project-specific validation
    cd "$REPO_ROOT"

    # Build check — adapt this to your project's build command
    # e.g. for .NET: dotnet build <solution>.sln --no-restore
    # e.g. for Node: npm run build
    echo "▶ Running project build check..."
    # (no-op placeholder — replace with your build command)
  fi

  # Push to origin
  echo "▶ Pushing resolved branch..."
  if git push origin "$BRANCH"; then
    echo "✅ Branch pushed successfully"

    # Verify PR is now mergeable
    PR_STATUS=$(gh pr view "$PR_NUMBER" --json mergeable --jq '.mergeable')
    if [ "$PR_STATUS" = "true" ]; then
      echo "✅ PR #$PR_NUMBER is now mergeable!"
    else
      echo "⚠️ PR #$PR_NUMBER still shows as unmergeable — may need a moment to update"
    fi
  else
    echo "❌ Push failed"
    return 1
  fi
}
```

---

## Scenario 2: Local Merge/Rebase Conflicts

### Step 1 — Detect Operation Type

```bash
detect_operation() {
  GIT_DIR=$(git rev-parse --git-dir)

  if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
    OPERATION="merge"
    echo "📍 Mid-merge detected"
  elif [ -d "$GIT_DIR/rebase-apply" ] || [ -d "$GIT_DIR/rebase-merge" ]; then
    OPERATION="rebase"
    echo "📍 Mid-rebase detected"
  else
    echo "❌ No merge or rebase in progress"
    exit 1
  fi

  # Get conflicted files
  CONFLICTED_FILES=$(git diff --name-only --diff-filter=U)
  echo "Conflicts in:"
  echo "$CONFLICTED_FILES"
}
```

### Step 2 — Show Status

```bash
show_merge_status() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 $OPERATION Status"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ "$OPERATION" = "merge" ]; then
    echo "Merging: $(cat "$GIT_DIR/MERGE_HEAD" | head -c 8)..."
  else
    echo "Rebasing onto: $(git rev-parse --abbrev-ref HEAD)"
  fi

  echo ""
  echo "Conflicted files ($OPERATION):"
  git diff --name-only --diff-filter=U | while read file; do
    CONFLICT_COUNT=$(grep -c '^<<<<<<< ' "$file" 2>/dev/null || echo "0")
    echo "  • $file ($CONFLICT_COUNT conflict blocks)"
  done
}
```

### Step 3 — Interactive Resolution

Same resolution strategies as Scenario 1, adapted for local context.

### Step 4 — Complete Operation

```bash
complete_operation() {
  # Verify no remaining conflicts
  REMAINING=$(git diff --name-only --diff-filter=U)
  if [ -n "$REMAINING" ]; then
    echo "❌ Unresolved conflicts:"
    echo "$REMAINING"
    return 1
  fi

  if [ "$OPERATION" = "merge" ]; then
    # Complete merge commit
    git commit --no-edit || git commit -m "Merge (conflicts resolved)"
  else
    # Continue rebase
    git rebase --continue
  fi

  echo "✅ $OPERATION completed"
}
```

### Step 5 — Post-Completion Validation

Run the same validation as Scenario 1.

---

## Cross-Platform Support

All Bash examples have PowerShell 7 equivalents for Windows compatibility. The
skill uses `node` helper scripts where available for consistent behavior across
platforms.

## Integration Points

| Skill                            | Integration                                              |
| -------------------------------- | -------------------------------------------------------- |
| `finishing-a-development-branch` | Call if Option 1 (local merge) encounters conflicts      |
| `fix-pr-comments`                | Call if PR has conflicts after addressing feedback       |
| `ci-monitor`                     | If PR shows "merge conflict" in status, route here first |

## Error Handling

### Abort Procedure

```bash
abort_merge() {
  if [ "$OPERATION" = "merge" ]; then
    git merge --abort
  elif [ "$OPERATION" = "rebase" ]; then
    git rebase --abort
  fi
  echo "❌ Operation aborted — repository restored to previous state"
}
```

### Stuck Loop Detection

If the same conflicts reappear 3 times:

```bash
invoke_stuck_loop_detection() {
  skill stuck-loop-detection \
    STUCK_TYPE="merge-conflict" \
    DETAILS="Repeated conflicts in: $CONFLICTED_FILES"
}
```

## Output Summary

### Success

```
✅ Merge conflicts resolved

Scenario:      PR conflicts (Scenario 1)
PR:            #1234
Branch:        feature/PAY-5678
Base:          origin/main
Files resolved: 5
Strategy:
  - Auto:      2 (imports/whitespace)
  - Manual:    3 (code logic)
Validation:    ✅ Build passed, tests passed
Push status:   ✅ Branch pushed, PR now mergeable
```

### Failure

```
❌ Could not resolve merge conflicts

Scenario:      Local rebase (Scenario 2)
Branch:        feature/PAY-5678
Operation:     rebase onto origin/main
Files with conflicts: 3
  - src/api/Core/Services/PaymentService.cs (complex logic conflict)
  - src/api/Contracts/Requests.cs (auto-resolved)
  - tests/Integration/Tests.cs (unresolved)

Abort:         git rebase --abort performed
Reason:        Manual resolution required for complex conflicts
```

## Red Flags

**Never:**

- Force-push without explicit confirmation
- Resolve conflicts without showing context
- Skip validation after merge
- Delete branches without confirmation

**Always:**

- Show conflict context before asking for resolution
- Validate merged code compiles and passes tests
- Provide abort option at every step
- Preserve worktree when resolution fails

## Quick Reference

| Situation                | Action                                |
| ------------------------ | ------------------------------------- |
| PR shows conflicts       | Provide PR_URL → Scenario 1 flow      |
| Mid-merge with conflicts | Run from repo → Scenario 2 flow       |
| Only import conflicts    | Auto-resolve with sorting             |
| Code logic conflicts     | Show context → Interactive resolution |
| Build fails after merge  | Fix → Revalidate → Push               |
| Push rejected            | Pull → Re-merge → Push                |
| Want to abort            | Available at every step               |

---

**This skill pairs with:** `using-git-worktrees`,
`finishing-a-development-branch`, `stuck-loop-detection`

**This skill is called by:** Any skill that performs merges or detects PR
conflicts
