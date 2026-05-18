import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const CONTRACTS = [
  {
    file: 'src/skills/ci-monitor/SKILL.md',
    forbidden: [
      /completion-verification/i,
      /pre-push-validation/i,
      /\.pipeline\b/,
      /archive-trace\.mjs/,
      /\bJira\b/i,
      /ticket-key\.mjs/,
      /\bticket-to-pr\b/i,
      /utilities\/scripts\/harness\//,
    ],
    required: [/bounded/i, /PR/i],
  },
  {
    file: 'src/skills/ci-monitor/references/monitoring-loop.md',
    forbidden: [
      /completion-verification/i,
      /pre-push-validation/i,
      /\.pipeline\b/,
      /archive-trace\.mjs/,
      /\bJira\b/i,
      /ticket-key\.mjs/,
      /\bticket-to-pr\b/i,
      /utilities\/scripts\/harness\//,
    ],
    required: [/\.gearbox\/scripts\/harness-config\.mjs/],
  },
  {
    file: 'src/skills/ci-monitor/references/outcomes.md',
    forbidden: [
      /completion-verification/i,
      /\.pipeline\b/,
      /archive-trace\.mjs/,
      /\bJira\b/i,
      /ticket-key\.mjs/,
      /\bticket-to-pr\b/i,
    ],
    required: [/Continue with your normal review\/merge flow/i],
  },
  {
    file: 'src/skills/fix-merge-conflicts/SKILL.md',
    forbidden: [/\bJira\b/i, /utilities\/scripts\/harness\//, /\bISSUE_KEY\b/, /\bTICKET_KEY\b/],
    required: [/\.gearbox\/scripts\/paths\.mjs/],
  },
  {
    file: 'src/skills/skill-creator/SKILL.md',
    forbidden: [/utilities\/scripts\/harness\/validate-skill\.mjs/],
    required: [/\.gearbox\/scripts\/validate-skill\.mjs/],
  },
  {
    file: 'src/skills/stuck-loop-detection/SKILL.md',
    forbidden: [
      /docs\/agent-harness\.md/,
      /\.pipeline\b/,
      /\bJira\b/i,
      /utilities\/scripts\/harness\//,
    ],
    required: [
      /\.gearbox\/escalations\//,
      /\.gearbox\/scripts\/normalize-error\.mjs/,
      /\.gearbox\/scripts\/tmpdir\.mjs/,
    ],
  },
];

for (const contract of CONTRACTS) {
  test(`${contract.file} stays portable`, async () => {
    const content = await fs.readFile(path.join(repoRoot, contract.file), 'utf8');

    for (const pattern of contract.forbidden) {
      assert.doesNotMatch(content, pattern, `Unexpected pattern ${pattern} in ${contract.file}`);
    }

    for (const pattern of contract.required) {
      assert.match(content, pattern, `Missing pattern ${pattern} in ${contract.file}`);
    }
  });
}
