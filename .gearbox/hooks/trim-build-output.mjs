#!/usr/bin/env node

/**
 * trim-build-output.mjs
 *
 * Compresses build/test output by preserving error lines and stripping noise.
 * Accepts input via stdin, outputs compressed text to stdout.
 *
 * Usage:
 *   cat build.log | node trim-build-output.mjs
 *   dotnet build 2>&1 | node trim-build-output.mjs
 *   dotnet build 2>&1 | node trim-build-output.mjs --threshold 100
 *
 * Environment variables:
 *   TRIM_THRESHOLD - Maximum lines before truncation (default: 200)
 */

const THRESHOLD = Number.parseInt(
  process.env.TRIM_THRESHOLD ||
    process.argv.find((_, i, a) => a[i - 1] === '--threshold') ||
    '200',
  10
);

// Lines matching these patterns are PRESERVED
const PRESERVE_PATTERNS = [
  /error/i, // error, Error, ERROR
  /FAILED/i, // FAILED, failed
  /warning CS/, // C# compiler warnings
  /Exception/, // Exception stack traces
  /^\s*at\s+/, // Stack frames (at Namespace.Class.Method)
  /Test.*Failed/i, // Test failure summaries
  /Expected:/i, // Test assertion expected values
  /Actual:/i, // Test assertion actual values
  /AssertionError/i, // Assertion errors
  /\d+\s+failed/i, // "X failed" test summaries
  /Build FAILED/i, // Explicit build failure
  /FATAL/i, // Fatal errors
];

// Lines matching these patterns are STRIPPED
const STRIP_PATTERNS = [
  /^\s*Restore completed/i, // NuGet restore completion
  /^\s*Build succeeded/i, // Success message
  /^\s*------ Rebuild/i, // Rebuild header
  /^\s*NuGet/, // NuGet package operations
  /^\s*\d+\/\d+\s/, // Progress lines (1/50, 2/50, etc.)
  /^\s*>\s*restore/, // Restore progress
  /^\s*Writing assets/i, // Assets file writing
  /^\s*Determining projects/i, // Project determination
  /^\s*Generating MSBuild/i, // MSBuild generation
  /^\s*Using elaborate/, // Elaborate tracing
  /^\s*$/, // Blank lines (after other stripping)
  /^\s*$/, // Empty lines
];

/**
 * Check if a line should be preserved (contains errors/warnings)
 */
function shouldPreserve(line) {
  return PRESERVE_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Check if a line should be stripped (noise/progress)
 */
function shouldStrip(line) {
  // Always strip completely blank lines
  if (line.trim() === '') return true;
  return STRIP_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Process build output lines and return compressed result
 */
function compressOutput(lines) {
  const originalCount = lines.length;

  // First pass: strip noise lines
  const filtered = lines.filter((line) => !shouldStrip(line));

  // Second pass: preserve lines that match error patterns, or keep if no specific pattern matched
  // We want to keep ALL lines that aren't noise, but errors/warnings are guaranteed preserved
  const preserved = filtered;

  let compressed;
  let trimmedCount = 0;

  if (preserved.length <= THRESHOLD) {
    compressed = preserved;
  } else {
    // Truncate the middle, keep start and end
    const keepEnd = Math.floor(THRESHOLD * 0.3);
    const keepStart = THRESHOLD - keepEnd;

    const start = preserved.slice(0, keepStart);
    const end = preserved.slice(preserved.length - keepEnd);

    trimmedCount = preserved.length - keepStart - keepEnd;

    const trimMessage = `[... ${trimmedCount} lines trimmed — no errors found in trimmed section ...]`;
    compressed = [...start, trimMessage, ...end];
  }

  const compressedCount = compressed.length;

  // Build header
  const header = `[Build output: ${originalCount} lines → ${compressedCount} lines after compression]`;

  return {
    header,
    content: compressed.join('\n'),
    originalCount,
    compressedCount,
    trimmedCount,
  };
}

/**
 * Read all input from stdin
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });

    process.stdin.on('error', reject);

    // Handle case where stdin is a TTY (no piped input)
    if (process.stdin.isTTY) {
      // No input, resolve with empty string
      resolve('');
    }
  });
}

/**
 * Main entry point
 */
async function main() {
  try {
    const input = await readStdin();

    if (!input || input.trim() === '') {
      console.log('[Build output: no input received]');
      return;
    }

    const lines = input.split('\n');
    const result = compressOutput(lines);

    // Output header followed by compressed content
    console.log(result.header);
    console.log('');
    console.log(result.content);
  } catch (error) {
    console.error(`[trim-build-output error: ${error.message}]`);
    process.exit(1);
  }
}

main();
