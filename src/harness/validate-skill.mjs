#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { hasHelpFlag, hasJsonFlag, isDirectRun, parseCliArgs } from './common.mjs';

export const SKILL_SIZE_LIMIT = 15000;
export const DESCRIPTION_LENGTH_LIMIT = 200;
export const NAME_LENGTH_LIMIT = 50;

const BLOCKING = 'error';
const ADVISORY = 'warning';
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const HELP_TEXT = `Usage:
  node .gearbox/scripts/validate-skill.mjs <skill-path-or-dir> [--json]

Validates a bundled skill entrypoint for frontmatter, structure, and a small
set of portability guardrails.
`;

function resolveSkillEntryPath(skillPath) {
  const resolvedPath = resolve(skillPath);
  const stats = statSync(resolvedPath);

  if (stats.isDirectory()) {
    return join(resolvedPath, 'SKILL.md');
  }

  return resolvedPath;
}

function collectIndentedLines(lines, startIndex) {
  const collected = [];
  let index = startIndex;

  while (index + 1 < lines.length) {
    const next = lines[index + 1];

    if (/^\s+/.test(next)) {
      collected.push(next);
      index += 1;
      continue;
    }

    if (next === '' && index + 2 < lines.length && /^\s+/.test(lines[index + 2])) {
      collected.push(next);
      index += 1;
      continue;
    }

    break;
  }

  return {
    lines: collected,
    nextIndex: index,
  };
}

function dedentLines(lines) {
  const nonEmpty = lines.filter((line) => line.trim() !== '');
  if (nonEmpty.length === 0) {
    return [...lines];
  }

  const indent = Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0].length ?? 0));
  return lines.map((line) => line.slice(indent));
}

function stripMatchingQuotes(value) {
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeScalarValue(lines) {
  if (lines.length === 0) {
    return '';
  }

  const raw = dedentLines(lines)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ')
    .trim();

  if (!raw) {
    return '';
  }

  return stripMatchingQuotes(raw).replace(/\s+/g, ' ').trim();
}

function stripCodeFences(content) {
  return content.replace(/```[\s\S]*?```/g, '');
}

function hasDangerousShellSnippet(content) {
  return /```(?:bash|sh|shell)\r?\n[\s\S]*?(?:rm\s+-rf|sudo\s+rm|curl.*\|\s*bash)[\s\S]*?```/i.test(content);
}

export function parseFrontmatter(content) {
  const frontmatterMatch = content.match(FRONTMATTER_PATTERN);
  if (!frontmatterMatch) {
    return { hasFrontmatter: false, frontmatter: {}, frontmatterText: '', body: content };
  }

  const frontmatterText = frontmatterMatch[1];
  const lines = frontmatterText.split(/\r?\n/);
  const frontmatter = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const entryMatch = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!entryMatch) {
      continue;
    }

    const [, key, remainder] = entryMatch;
    const trimmedRemainder = remainder.trim();
    const continuation = collectIndentedLines(lines, index);

    if (trimmedRemainder === '|' || trimmedRemainder === '>') {
      frontmatter[key] = normalizeScalarValue(continuation.lines);
      index = continuation.nextIndex;
      continue;
    }

    const valueLines = trimmedRemainder === '' ? continuation.lines : [trimmedRemainder, ...continuation.lines];
    frontmatter[key] = normalizeScalarValue(valueLines);
    index = continuation.nextIndex;
  }

  const body = content.slice(frontmatterMatch[0].length);
  return {
    hasFrontmatter: true,
    frontmatter,
    frontmatterText,
    body,
  };
}

function createConstraint(name, passed, message, { level = BLOCKING, details = null } = {}) {
  return {
    name,
    passed,
    level,
    blocking: level === BLOCKING,
    message,
    details,
  };
}

function formatConstraint(constraint) {
  const isWarning = constraint.level === ADVISORY;
  const icon = constraint.passed ? '✓' : isWarning ? '!' : '✗';
  const color = constraint.passed ? '\x1b[32m' : isWarning ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';

  const lines = [`  ${color}${icon}${reset} ${constraint.name}: ${constraint.message}`];
  if (constraint.details) {
    lines.push(`    ${constraint.details}`);
  }

  return lines.join('\n');
}

export function formatValidationResult(result) {
  const lines = [`\nValidating: ${result.skillPath}\n`];

  for (const constraint of result.constraints) {
    lines.push(formatConstraint(constraint));
  }

  lines.push('');

  if (result.success) {
    lines.push(
      result.warnings > 0
        ? `\x1b[32m✓ All blocking constraints passed\x1b[0m (${result.warnings} warning(s))`
        : '\x1b[32m✓ All constraints passed\x1b[0m',
    );
  } else {
    const warningSuffix = result.warnings > 0 ? ` and ${result.warnings} warning(s)` : '';
    lines.push(`\x1b[31m✗ ${result.failed} blocking constraint(s) failed${warningSuffix}\x1b[0m`);
  }

  lines.push(
    `  ${result.passed} passed, ${result.failed} failed${
      result.warnings > 0 ? `, ${result.warnings} warning(s)` : ''
    }\n`,
  );

  return lines.join('\n');
}

export function validateSkill(skillPath) {
  const resolvedPath = resolveSkillEntryPath(skillPath);
  const content = readFileSync(resolvedPath, 'utf8');
  const { hasFrontmatter, frontmatter, body } = parseFrontmatter(content);
  const constraints = [];

  constraints.push(
    createConstraint(
      'frontmatter_present',
      hasFrontmatter,
      hasFrontmatter ? 'YAML frontmatter found' : 'Missing YAML frontmatter (---)',
      {
        details: hasFrontmatter
          ? null
          : "Add a YAML frontmatter block at the top of the file:\n    ---\n    name: your-skill-name\n    description: 'What this skill does'\n    ---",
      },
    ),
  );

  constraints.push(
    createConstraint(
      'name_present',
      !!frontmatter.name,
      frontmatter.name
        ? `name: "${frontmatter.name.slice(0, 30)}${frontmatter.name.length > 30 ? '...' : ''}"`
        : 'Missing name field in frontmatter',
      {
        details: frontmatter.name ? null : 'Add `name: your-skill-name` to the frontmatter block',
      },
    ),
  );

  constraints.push(
    createConstraint(
      'description_present',
      !!frontmatter.description,
      frontmatter.description
        ? `description: "${frontmatter.description.slice(0, 50)}${frontmatter.description.length > 50 ? '...' : ''}"`
        : 'Missing description field in frontmatter',
      {
        details: frontmatter.description ? null : "Add `description: 'What this skill does'` to the frontmatter block",
      },
    ),
  );

  if (frontmatter.name) {
    const nameLength = frontmatter.name.length;
    constraints.push(
      createConstraint(
        'name_length',
        nameLength <= NAME_LENGTH_LIMIT,
        nameLength <= NAME_LENGTH_LIMIT
          ? `Name length: ${nameLength} chars (limit: ${NAME_LENGTH_LIMIT})`
          : `Name too long: ${nameLength} > ${NAME_LENGTH_LIMIT} chars`,
        { level: ADVISORY },
      ),
    );
  }

  if (frontmatter.description) {
    const descriptionLength = frontmatter.description.length;
    constraints.push(
      createConstraint(
        'description_length',
        descriptionLength <= DESCRIPTION_LENGTH_LIMIT,
        descriptionLength <= DESCRIPTION_LENGTH_LIMIT
          ? `Description length: ${descriptionLength} chars (recommended: ≤${DESCRIPTION_LENGTH_LIMIT})`
          : `Description exceeds recommended length: ${descriptionLength} > ${DESCRIPTION_LENGTH_LIMIT} chars`,
        {
          level: ADVISORY,
          details:
            descriptionLength > DESCRIPTION_LENGTH_LIMIT
              ? 'Advisory only. Shorter descriptions usually improve trigger precision.'
              : null,
        },
      ),
    );
  }

  const sizeBytes = Buffer.byteLength(content, 'utf8');
  const sizeKB = (sizeBytes / 1024).toFixed(2);
  constraints.push(
    createConstraint(
      'size_limit',
      sizeBytes <= SKILL_SIZE_LIMIT,
      sizeBytes <= SKILL_SIZE_LIMIT
        ? `Size: ${sizeKB}KB (recommended max: ${(SKILL_SIZE_LIMIT / 1024).toFixed(2)}KB)`
        : `Size exceeds recommended limit: ${sizeKB}KB > ${(SKILL_SIZE_LIMIT / 1024).toFixed(2)}KB`,
      {
        level: ADVISORY,
        details:
          sizeBytes > SKILL_SIZE_LIMIT
            ? `Advisory only. Reduce by ${((sizeBytes - SKILL_SIZE_LIMIT) / 1024).toFixed(2)}KB when practical.`
            : null,
      },
    ),
  );

  const trimmedBody = body.trim();
  const hasBody = trimmedBody.length > 100;
  constraints.push(
    createConstraint(
      'body_present',
      hasBody,
      hasBody ? `Body content: ${trimmedBody.split(/\r?\n/).length} lines` : 'Missing or short body content (< 100 chars)',
      {
        details: hasBody
          ? null
          : 'Add at least 100 characters of body content describing the skill purpose, usage, and examples',
      },
    ),
  );

  const hasHeadings = /^#{1,3}\s+/m.test(trimmedBody);
  constraints.push(
    createConstraint(
      'structure_headings',
      hasHeadings,
      hasHeadings ? 'Markdown headings found' : 'No markdown headings detected - skill may lack structure',
      {
        details: hasHeadings ? null : 'Add at least one `## Section Name` heading to give the skill readable structure',
      },
    ),
  );

  const prosePatterns = [
    {
      pattern: /^\s*(?:[-*]\s+|>\s*)?(?:you\s+)?must\s+always\b/im,
      message: 'Avoid MUST ALWAYS - use clear explanations instead',
    },
    {
      pattern: /^\s*(?:[-*]\s+|>\s*)?(?:you\s+)?never\s+ever\b/im,
      message: 'Avoid NEVER EVER - explain why instead',
    },
  ];

  const contentForPatternChecks = stripCodeFences(content);
  const forbiddenMatches = prosePatterns
    .filter(({ pattern }) => pattern.test(contentForPatternChecks))
    .map(({ message }) => message);

  if (hasDangerousShellSnippet(content)) {
    forbiddenMatches.push('Potentially dangerous bash pattern detected');
  }

  constraints.push(
    createConstraint(
      'forbidden_pattern',
      forbiddenMatches.length === 0,
      forbiddenMatches.length === 0 ? 'No forbidden patterns detected' : 'Forbidden patterns detected',
      {
        details: forbiddenMatches.length > 0 ? forbiddenMatches.join('; ') : null,
      },
    ),
  );

  const failed = constraints.filter((constraint) => constraint.blocking && !constraint.passed).length;
  const warnings = constraints.filter(
    (constraint) => constraint.level === ADVISORY && !constraint.passed,
  ).length;

  return {
    skillPath: resolvedPath,
    success: failed === 0,
    total: constraints.length,
    passed: constraints.filter((constraint) => constraint.passed).length,
    failed,
    warnings,
    constraints,
    metadata: {
      sizeBytes,
      sizeKB: Number.parseFloat(sizeKB),
      bodyLines: trimmedBody === '' ? 0 : trimmedBody.split(/\r?\n/).length,
      frontmatter,
    },
  };
}

function printUsage(stream = process.stderr) {
  stream.write(HELP_TEXT);
}

export function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const cli = parseCliArgs(argv);
  const jsonFlagPath =
    typeof cli.flags.json === 'string'
      ? cli.flags.json
      : typeof cli.flags.j === 'string'
        ? cli.flags.j
        : null;
  const positionals = jsonFlagPath ? [jsonFlagPath, ...cli.positionals] : cli.positionals;
  const json =
    cli.flags.json !== undefined || cli.flags.j !== undefined || hasJsonFlag(cli.flags) || env.VALIDATE_SKILL_JSON === '1';

  try {
    if (hasHelpFlag(cli.flags)) {
      printUsage(stdout);
      return 0;
    }

    if (positionals.length !== 1) {
      throw new Error('Usage: node .gearbox/scripts/validate-skill.mjs <skill-path-or-dir> [--json]');
    }

    const result = validateSkill(positionals[0]);
    const output = json ? JSON.stringify(result, null, 2) : formatValidationResult(result);
    stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    return result.success ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (json) {
      stdout.write(`${JSON.stringify({ success: false, error: message }, null, 2)}\n`);
    } else {
      stderr.write(`Error: ${message}\n`);
      printUsage(stderr);
    }

    return 1;
  }
}

if (isDirectRun(import.meta.url)) {
  process.exit(runCli());
}
