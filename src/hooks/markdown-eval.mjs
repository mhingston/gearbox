#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HELP_TEXT = `Usage: markdown-eval.mjs [options]

Options:
  --record-outcomes   Persist per-record evaluation summaries
  --synthesise        Write .gearbox/hooks/.runtime/latest-eval.md
  --limit <count>     Limit the number of recent records to analyse (default: 10)
  --root <path>       Repository root to inspect (default: cwd)
  --help, -h          Show this help
`;

function runtimeDirFor(root) {
  return path.join(root, '.gearbox', 'hooks', '.runtime');
}

export function recordsDirFor(root) {
  return path.join(runtimeDirFor(root), 'records');
}

export function latestEvalPathFor(root) {
  return path.join(runtimeDirFor(root), 'latest-eval.md');
}

function normalizeStatus(status) {
  const value = String(status ?? '').trim().toLowerCase();
  if (['success', 'passed', 'pass', 'complete', 'completed'].includes(value)) {
    return 'success';
  }

  if (['failure', 'failed', 'error', 'denied', 'rejected', 'blocked'].includes(value)) {
    return 'failure';
  }

  if (value === 'partial') {
    return 'partial';
  }

  return 'partial';
}

function deriveOverallStatus(outcomes) {
  const statuses = outcomes.map((outcome) => normalizeStatus(outcome?.status));
  if (statuses.includes('failure')) {
    return 'failure';
  }

  if (statuses.includes('partial')) {
    return 'partial';
  }

  if (statuses.includes('success')) {
    return 'success';
  }

  return 'partial';
}

function excerpt(value, max = 180) {
  if (typeof value !== 'string') {
    return null;
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return null;
  }

  if (compact.length <= max) {
    return compact;
  }

  return `${compact.slice(0, max - 3)}...`;
}

export function evaluateRecord(record) {
  const outcomes = Array.isArray(record?.outcomes) ? record.outcomes : [];
  const summary =
    excerpt(outcomes.find((outcome) => typeof outcome?.notes === 'string')?.notes) ??
    excerpt(record?.description) ??
    'No summary captured.';
  const files = Array.isArray(record?.files) ? record.files.filter(Boolean) : [];
  const semanticTypes = Array.isArray(record?.metadata?.semanticTypes)
    ? [...new Set(record.metadata.semanticTypes.filter(Boolean))]
    : [];
  const knowledgeTypes = Array.isArray(record?.metadata?.knowledgeTypes)
    ? [...new Set(record.metadata.knowledgeTypes.filter(Boolean))]
    : [];

  return {
    status: deriveOverallStatus(outcomes),
    summary,
    files_considered: files.length,
    outcome_count: outcomes.length,
    semantic_types: semanticTypes,
    knowledge_types: knowledgeTypes,
  };
}

function compareRecordEntries(a, b) {
  const aRecordedAt = String(a.record?.recorded_at ?? '');
  const bRecordedAt = String(b.record?.recorded_at ?? '');
  if (aRecordedAt !== bRecordedAt) {
    return bRecordedAt.localeCompare(aRecordedAt);
  }

  return path.basename(b.filePath).localeCompare(path.basename(a.filePath));
}

export async function loadRecordEntries(root, limit = 10) {
  const dir = recordsDirFor(root);
  if (!existsSync(dir)) {
    return [];
  }

  const names = (await readdir(dir))
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  const entries = [];
  for (const name of names) {
    const filePath = path.join(dir, name);
    try {
      const raw = await readFile(filePath, 'utf8');
      const record = JSON.parse(raw);
      entries.push({
        filePath,
        raw,
        record,
        evaluation: evaluateRecord(record),
      });
    } catch {
      // Ignore malformed runtime records and keep the eval deterministic.
    }
  }

  return entries.sort(compareRecordEntries).slice(0, limit);
}

export async function writeRecordEvaluations(entries) {
  for (const entry of entries) {
    const nextRecord = {
      ...entry.record,
      evaluation: entry.evaluation,
    };
    const serialized = `${JSON.stringify(nextRecord, null, 2)}\n`;
    if (serialized === entry.raw) {
      continue;
    }

    await writeFile(entry.filePath, serialized, 'utf8');
  }
}

function summarizeStatuses(entries) {
  const counts = {
    success: 0,
    partial: 0,
    failure: 0,
  };

  for (const entry of entries) {
    counts[entry.evaluation.status] += 1;
  }

  return counts;
}

function topTouchedFiles(entries, limit = 5) {
  const counts = new Map();
  for (const entry of entries) {
    const files = Array.isArray(entry.record?.files) ? entry.record.files : [];
    for (const file of files) {
      if (typeof file !== 'string' || !file.trim()) {
        continue;
      }

      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit);
}

function followUps(entries, limit = 5) {
  return entries
    .filter((entry) => entry.evaluation.status !== 'success')
    .map((entry) => entry.evaluation.summary)
    .filter(Boolean)
    .slice(0, limit);
}

export function buildLatestEvalMarkdown(entries, { limit = 10 } = {}) {
  const lines = ['# Gearbox Latest Eval', ''];
  const statusCounts = summarizeStatuses(entries);
  lines.push(`Records analysed: ${entries.length}`);
  lines.push(`Window size: ${limit}`);
  lines.push('');
  lines.push('## Outcome Summary');
  lines.push(`- success: ${statusCounts.success}`);
  lines.push(`- partial: ${statusCounts.partial}`);
  lines.push(`- failure: ${statusCounts.failure}`);
  lines.push('');
  lines.push('## Records');

  if (entries.length === 0) {
    lines.push('- No session records found in .gearbox/hooks/.runtime/records');
  } else {
    for (const entry of entries) {
      const recordedAt = entry.record?.recorded_at ?? 'unknown date';
      const name = entry.record?.name ?? path.basename(entry.filePath);
      lines.push(
        `- ${recordedAt} — ${name} [${entry.evaluation.status}]`
      );
      lines.push(`  - Summary: ${entry.evaluation.summary}`);

      const files = Array.isArray(entry.record?.files) ? entry.record.files.slice(0, 3) : [];
      if (files.length > 0) {
        lines.push(`  - Files: ${files.join(', ')}`);
      }
    }
  }

  lines.push('');
  lines.push('## Frequently Touched Files');
  const files = topTouchedFiles(entries);
  if (files.length === 0) {
    lines.push('- None yet');
  } else {
    for (const [file, count] of files) {
      lines.push(`- ${file} (${count})`);
    }
  }

  lines.push('');
  lines.push('## Recommended Follow-ups');
  const recommendations = followUps(entries);
  if (recommendations.length === 0) {
    lines.push('- No outstanding follow-ups.');
  } else {
    for (const recommendation of recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {
    limit: 10,
    help: false,
    recordOutcomes: false,
    synthesise: false,
    root: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--record-outcomes':
        options.recordOutcomes = true;
        break;
      case '--synthesise':
        options.synthesise = true;
        break;
      case '--limit': {
        const next = argv[index + 1];
        if (!next) {
          throw new Error('Missing value for --limit');
        }

        const parsed = Number.parseInt(next, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`Invalid --limit value: ${next}`);
        }

        options.limit = parsed;
        index += 1;
        break;
      }
      case '--root': {
        const next = argv[index + 1];
        if (!next) {
          throw new Error('Missing value for --root');
        }

        options.root = path.resolve(next);
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.recordOutcomes && !options.synthesise) {
    options.recordOutcomes = true;
    options.synthesise = true;
  }

  return options;
}

export async function runCli({
  cwd = process.cwd(),
  args = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      stdout.write(HELP_TEXT);
      return 0;
    }

    const root = options.root ?? path.resolve(cwd);
    const entries = await loadRecordEntries(root, options.limit);

    if (options.recordOutcomes) {
      await writeRecordEvaluations(entries);
    }

    if (options.synthesise) {
      const content = buildLatestEvalMarkdown(entries, { limit: options.limit });
      await mkdir(runtimeDirFor(root), { recursive: true });
      await writeFile(latestEvalPathFor(root), content, 'utf8');
      stdout.write(content);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 1;
  }
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(await runCli());
}
