import { resolveHooks } from './base.mjs';

const DEFAULT_HOOKS_DIR = '.gearbox/hooks';

/**
 * Build a hook entry object matching the Copilot CLI format.
 * Mirrors the structure in src/hooks.template.json.
 */
function buildEntry(hooksDir, hookName) {
  switch (hookName) {
    case 'sessionStart':
      return {
        type: 'command',
        bash: `node ${hooksDir}/self-learning.mjs sessionStart`,
        powershell: `node ${hooksDir}/self-learning.mjs sessionStart`,
        cwd: '.',
        timeoutSec: 10,
      };
    case 'userPromptSubmitted':
      return {
        type: 'command',
        bash: `node ${hooksDir}/self-learning.mjs userPromptSubmitted`,
        powershell: `node ${hooksDir}/self-learning.mjs userPromptSubmitted`,
        cwd: '.',
        timeoutSec: 5,
      };
    case 'preToolUse':
      return [
        {
          type: 'command',
          bash: `${hooksDir}/gitleaks-check.sh`,
          powershell: `${hooksDir}/gitleaks-check.ps1`,
          comment: 'Scan content for secrets before writing to disk',
          timeoutSec: 30,
        },
        {
          type: 'command',
          bash: `node ${hooksDir}/policy-guard.mjs`,
          powershell: `node ${hooksDir}/policy-guard.mjs`,
          comment: 'Warn when policy gates appear to be skipped',
          timeoutSec: 5,
        },
      ];
    case 'postToolUse':
      return {
        type: 'command',
        bash: `PAYLOAD=$(cat); echo "$PAYLOAD" | node ${hooksDir}/self-learning.mjs postToolUse & disown $!`,
        powershell: `$payload = [Console]::In.ReadToEnd(); $cwd = (Get-Location).Path; $temp = [System.IO.Path]::GetTempFileName(); Set-Content -Path $temp -Value $payload -NoNewline -Encoding utf8; if ($IsWindows) { Start-Process -FilePath node -WorkingDirectory $cwd -ArgumentList '${hooksDir}/self-learning.mjs', 'postToolUse', '--payload-file', $temp -WindowStyle Hidden } else { Start-Process -FilePath node -WorkingDirectory $cwd -ArgumentList '${hooksDir}/self-learning.mjs', 'postToolUse', '--payload-file', $temp }`,
        cwd: '.',
        timeoutSec: 2,
      };
    case 'errorOccurred':
      return {
        type: 'command',
        bash: `PAYLOAD=$(cat); echo "$PAYLOAD" | node ${hooksDir}/self-learning.mjs errorOccurred & disown $!`,
        powershell: `$payload = [Console]::In.ReadToEnd(); $cwd = (Get-Location).Path; $temp = [System.IO.Path]::GetTempFileName(); Set-Content -Path $temp -Value $payload -NoNewline -Encoding utf8; if ($IsWindows) { Start-Process -FilePath node -WorkingDirectory $cwd -ArgumentList '${hooksDir}/self-learning.mjs', 'errorOccurred', '--payload-file', $temp -WindowStyle Hidden } else { Start-Process -FilePath node -WorkingDirectory $cwd -ArgumentList '${hooksDir}/self-learning.mjs', 'errorOccurred', '--payload-file', $temp }`,
        cwd: '.',
        timeoutSec: 2,
      };
    case 'preCompact':
      return {
        type: 'command',
        bash: `node ${hooksDir}/context-compact.mjs`,
        powershell: `node ${hooksDir}/context-compact.mjs`,
        cwd: '.',
        timeoutSec: 5,
        comment: 'Write structured context block before compaction',
      };
    case 'sessionEnd':
      return {
        type: 'command',
        bash: `node ${hooksDir}/self-learning.mjs sessionEnd`,
        powershell: `node ${hooksDir}/self-learning.mjs sessionEnd`,
        cwd: '.',
        timeoutSec: 15,
      };
    default:
      return null;
  }
}

/**
 * @param {Object} options
 * @param {string[]} [options.selectedHooks]
 * @param {string} [options.hooksDir]
 * @param {boolean} [options.dryRun]
 * @returns {{ files: Array<{path: string, content: string}>, warnings: string[] }}
 */
export function generateConfig(options = {}) {
  const hooksDir = options.hooksDir ?? DEFAULT_HOOKS_DIR;
  const activeHooks = resolveHooks(options.selectedHooks);

  const hooksObj = {};
  for (const hookName of activeHooks) {
    const entry = buildEntry(hooksDir, hookName);
    if (entry !== null) {
      hooksObj[hookName] = Array.isArray(entry) ? entry : [entry];
    }
  }

  const config = { version: 1, hooks: hooksObj };

  return {
    files: [{ path: '.github/copilot/hooks.json', content: JSON.stringify(config, null, 2) }],
    warnings: [],
  };
}
