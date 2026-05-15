# preToolUse hook: scan content about to be written for secrets using gitleaks
# Fires on: edit, create, bash
# Denies the tool call if a secret pattern is detected.

$ErrorActionPreference = "Stop"

$profile = ($env:HARNESS_PROFILE ?? 'standard').ToLowerInvariant()
if (-not $profile) {
    $profile = 'standard'
}
if ($profile -eq 'off') {
    exit 0
}
if ($profile -notin @('minimal', 'standard', 'strict')) {
    $profile = 'standard'
}

$disabledHooks = ($env:HARNESS_DISABLED_HOOKS ?? '').ToLowerInvariant().Split(',', [System.StringSplitOptions]::RemoveEmptyEntries) |
    ForEach-Object { $_.Trim() }
if ($disabledHooks -contains 'pretooluse' -or $disabledHooks -contains 'gitleaks' -or $disabledHooks -contains 'gitleaks-check') {
    exit 0
}

$input = [Console]::In.ReadToEnd() | ConvertFrom-Json
$toolName = $input.toolName

# Only check tools that write content
if ($toolName -notin @("edit", "create", "bash")) {
    exit 0
}

# Check gitleaks is installed — warn but do not block if missing
if (-not (Get-Command gitleaks -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine("WARNING: gitleaks is not installed - secret scanning is disabled for this tool call.")
    [Console]::Error.WriteLine("  Install it to enable pre-tool secret scanning: winget install gitleaks (Windows)")
    [Console]::Error.WriteLine("  Or download from: https://github.com/gitleaks/gitleaks/releases")
    exit 0
}

$toolArgs = $input.toolArgs | ConvertFrom-Json

# Extract the content to scan based on the tool being called
$content = switch ($toolName) {
    "edit"   { $toolArgs.new_str }
    "create" { $toolArgs.file_text }
    "bash"   { $toolArgs.command }
}

if ([string]::IsNullOrEmpty($content)) {
    exit 0
}

$cwd = $input.cwd
try {
    $repoRoot = git -C $cwd rev-parse --show-toplevel 2>$null
} catch {
    $repoRoot = $cwd
}

$configFile = Join-Path $repoRoot ".gitleaks.toml"

# Run gitleaks against the content via stdin
$gitleaksArgs = @("detect", "--pipe", "--no-banner", "--no-color", "--log-level", "error", "--redact", "--report-format", "json", "--report-path", "-")
if (Test-Path $configFile) {
    $gitleaksArgs += @("-c", $configFile)
}

$result = $content | & gitleaks @gitleaksArgs 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    @{
        permissionDecision = "deny"
        permissionDecisionReason = "gitleaks detected a potential secret in the content about to be written. Review and remove it before proceeding.`n`n$result"
    } | ConvertTo-Json -Compress
}
