/**
 * event-log.mjs (harness)
 *
 * Synchronous structured event log for the gearbox harness.
 * Events are stored as JSON lines in <root>/.gearbox/events.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';

import { isDirectRun, parseCliArgs } from './common.mjs';

const LOG_DIR = '.gearbox';
const LOG_FILE = 'events.jsonl';

function logPath(root) {
  return path.join(root ?? process.cwd(), LOG_DIR, LOG_FILE);
}

/**
 * Append an event synchronously.
 * @param {{ type: string, source: string, summary: string, payload?: object, root?: string }} opts
 */
export function appendEvent({ type, source, summary, payload, root } = {}) {
  const filePath = logPath(root);
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    type,
    source,
    summary,
    ...(payload !== undefined ? { payload } : {}),
  };

  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * Read all events synchronously.
 * @param {{ root?: string, limit?: number }} opts
 * @returns {object[]}
 */
export function readEvents({ root, limit } = {}) {
  const filePath = logPath(root);

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const events = content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (limit !== undefined && limit > 0) {
    return events.slice(-limit);
  }

  return events;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isDirectRun(import.meta.url)) {
  const { command, flags } = parseCliArgs();
  const root = flags.root ? String(flags.root) : process.cwd();
  const limit = flags.limit ? Number(flags.limit) : undefined;

  if (command === 'read' || !command) {
    const events = readEvents({ root, limit });
    if (events.length === 0) {
      process.stdout.write('(no events)\n');
    } else {
      for (const ev of events) {
        process.stdout.write(JSON.stringify(ev) + '\n');
      }
    }
  }
}
