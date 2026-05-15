import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Append a structured event to a JSONL log file.
 * Creates the directory and file if they don't exist.
 */
export async function appendEvent(logPath, event, data = {}) {
  await mkdir(path.dirname(logPath), { recursive: true });
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...data,
  });
  await appendFile(logPath, entry + '\n', 'utf8');
}

/**
 * Read all events from a JSONL log file.
 * Returns empty array if file doesn't exist.
 */
export async function readEvents(logPath) {
  try {
    const content = await readFile(logPath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}
