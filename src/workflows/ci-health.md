---
name: CI Health

# strict: false required — workflow uses an mcp-script that calls the GitHub
# Actions REST API with a repo-scoped secret to retrieve attempt-specific job
# lists, which the standard GitHub Actions MCP toolset does not expose.
strict: false

on:
  schedule:
    - cron: '30 6 * * 1' # Weekly Monday 6:30 AM UTC
  workflow_dispatch:
permissions:
  actions: read
  contents: read
network: defaults
engine: copilot
tools:
  github:
    toolsets: [default, actions] # default: context, repos, issues, pull_requests; actions: workflow logs
mcp-scripts:
  get-attempt-jobs:
    description: >
      Fetch the jobs list for a specific attempt of a workflow run using the
      GitHub Actions REST endpoint
      /repos/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs.
      The standard list_workflow_jobs MCP tool does not expose per-attempt
      filtering, so this script is required to isolate attempt-1 failures when
      comparing them against the final successful attempt.
    inputs:
      run_id:
        type: string
        required: true
        description: 'Workflow run ID'
      attempt:
        type: number
        required: true
        description: 'Attempt number (1-based)'
    env:
      GH_AW_GITHUB_TOKEN: '${{ secrets.GH_AW_GITHUB_TOKEN }}'
    script: |
      const token = process.env.GH_AW_GITHUB_TOKEN;
      if (!token) throw new Error('GH_AW_GITHUB_TOKEN is not set');

      const repo = process.env.GITHUB_REPOSITORY;
      if (!repo) throw new Error('GITHUB_REPOSITORY is not set');

      const runId = String(run_id || '').trim();
      const attemptNumber = Number(attempt || 1);
      if (!runId) throw new Error('Missing run_id input');

      const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/attempts/${attemptNumber}/jobs?per_page=100`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.jobs.map(j => ({ name: j.name, conclusion: j.conclusion, run_attempt: j.run_attempt }));
safe-outputs:
  create-issue:
    title-prefix: "[ci-health] "
    labels: [ci-health, needs-review]
    close-older-issues: true
  noop:
    report-as-issue: false
  report-failure-as-issue: false
---

## CI Health Monitor

You are a CI quality monitoring agent for this repository. Your job is to
analyse the last 7 days of CI run history across all workflows, identify flaky
tests using cross-run comparison, and open a weekly GitHub issue with a ranked
report and targeted fix proposals.

Close any previously open `[ci-health]` issue when opening the new one (the
`close-older-issues` safe-output flag handles this automatically).

If no flakiness is detected, emit `noop` — produce no output and open no issue.

---

### Runtime constraints

- **Do not spawn sub-agents or background tasks.** All work must be done in the
  current agent context.
- **GitHub Actions API**: Use the GitHub Actions MCP tools (from the `actions`
  toolset) for all workflow data. Available tools: `list_workflows`,
  `list_workflow_runs`, `list_workflow_jobs`, and `get_job_logs`.
- **API call limits**: Fetch at most 30 workflow runs total (10 per workflow,
  up to 3 target workflows). Do not paginate beyond the first page for run
  listings.
- **If no data is available**: call `noop` with an explanation.

---

### Step 1: Discover workflows dynamically

Use the `list_workflows` GitHub Actions MCP tool to list **all** workflows in
the repository. Do **not** hardcode any workflow names or file names.

From the full list, select workflows that are test or CI workflows by
inspecting their names. Heuristics:

- Includes words like `test`, `ci`, `check`, `lint`, `build`, or `validate`
  in the workflow name (case-insensitive)
- Excludes maintenance workflows (names containing `maintenance`, `dependabot`,
  `deploy`, `release`, `docs`, `update`)

Select up to **3 candidate workflows** by choosing the ones with the most
recent run activity (use the run count as a proxy). Record each selected
workflow's numeric ID and name.

If fewer than 1 qualifying workflow is found, emit `noop` with a message
explaining that no CI workflows were found.

---

### Step 2: Collect run data for each target workflow

For each resolved workflow ID, use `list_workflow_runs` to retrieve runs.
Filter client-side to runs created in the last 7 days (up to 10 per workflow;
do not paginate beyond the first page).

For each run, record: run ID, workflow name, conclusion, run_attempt, branch,
timestamp, URL.

---

### Step 3: Identify flaky signals

Apply two detection methods to the collected runs:

**Signal A — High confidence (retry-success):**

A run is high-confidence flaky if its collected record shows `run_attempt > 1`
and `conclusion == "success"`. A successful record with `run_attempt: 2` means
attempt 1 failed and attempt 2 passed: definitive evidence of flakiness.

**Signal B — Medium confidence (cross-run job pattern on `main` only):**

Restrict this signal to runs on the **`main` branch** only to avoid mistaking
branch-specific code breakage for flakiness.

For each `main`-branch run, use `list_workflow_jobs` with the run ID to fetch
jobs and their conclusions.

Build a frequency table keyed by **`{workflow_name, job_name}`**:
`{(workflow_name, job_name) → {passed: N, failed: N, total: N}}`

A job combination is medium-confidence flaky if:
- `failed >= 2` — at least two failures
- `passed >= 1` — it has passed at least once (otherwise it is broken, not flaky)
- `total >= 5` — enough runs to be statistically meaningful

Exclude jobs that failed only in non-test steps (e.g. checkout, cache restore,
dependency install).

Limit API calls: fetch jobs for at most 60 runs total across all selected
workflows.

---

### Step 4: Drill into high-confidence flaky runs

For each high-confidence run (Signal A — `run_attempt > 1` and `conclusion == "success"`):

1. Fetch jobs for attempt 1 using the `get-attempt-jobs` mcp-script with
   `run_id` and `attempt: 1`.

2. Fetch jobs for the final successful attempt using `list_workflow_jobs`
   with the run ID.

3. Compare conclusions by job name: jobs that had `conclusion: failure` in
   attempt 1 but `conclusion: success` in the final attempt = flaky jobs.

---

### Step 5: Classify failure patterns

For each flaky job, classify the failure by inspecting error message content
from job logs (use `get_job_logs` if available):

| Pattern | Indicators |
|---|---|
| **Network / environment** | `net::ERR_`, `ECONNREFUSED`, `502`, `503`, `504`, `Request failed`, API timeout |
| **Timeout** | `TimeoutError`, `timed out`, `deadline exceeded` |
| **Selector / element** | `element not found`, `not visible`, `strict mode violation` |
| **Assertion race** | mismatched expected/actual values in assertions |
| **Test pollution** | missing session or cookie, unexpected state, auth failure mid-suite |
| **Unknown** | None of the above — record the raw error snippet |

---

### Step 6: Build the ranked flaky table

Rank all flaky entries by total failure count (descending), then by confidence
tier (High before Medium). For each entry record:

- Workflow name
- Job name
- Failure count and run count
- Failure rate percentage
- Confidence tier
- Pattern classification
- One representative run URL

---

### Step 7: Decide whether to report

If the ranked table is **empty** (no flaky signals found): emit `noop` — no
issue, no output.

If one or more flaky entries exist: proceed to Step 8.

---

### Step 8: Write the issue body

Format the report using this template:

````markdown
# CI Health Report — {YYYY-MM-DD}

> Automated weekly report. The previous `[ci-health]` issue was closed.
> Analysis covers the last 7 days.

## Summary

| Metric | Value |
|---|---|
| Workflows analysed | {N} |
| Runs analysed | {N} |
| Runs with retry signal (high confidence) | {N} |
| Unique flaky job patterns | {N} |

## Ranked Flaky Patterns

| Rank | Workflow | Job | Failures | Runs | Rate | Confidence | Pattern | Sample run |
|---|---|---|---|---|---|---|---|---|
| 1 | {workflow} | {job} | {fail} | {total} | {pct}% | High | Network / environment | [link]({url}) |

## Fix Proposals

{One section per unique pattern found.}

---

_Generated by [ci-health]({run_url}) · {date} UTC_
````

---

### Notes for the agent

- `run_attempt` on a workflow run record shows the current attempt number. A
  successful record with `run_attempt: 2` means attempt 1 failed and attempt 2
  passed.
- Only flag a job as flaky when a test step itself failed, not only
  infrastructure steps like checkout, cache restore, or dependency install.
- Skip runs where the triggering branch is a bot-managed branch (e.g.
  Dependabot).
- Do not modify any source files. This workflow is read-only except for
  creating the issue.

---

### Completing the workflow

The safe-output tools (`noop`, `create_issue`) are registered as MCP tools in
the `safeoutputs` server — they appear in your tool list alongside
`get_file_contents` and other MCP tools. Call them as direct tool calls. Do
**not** invoke them via the skill system (`skill(noop)` will fail). Do **not**
output raw JSON — make an actual MCP tool call.
