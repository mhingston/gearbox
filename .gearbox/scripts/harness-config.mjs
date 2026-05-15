/**
 * harness-config.mjs
 *
 * Runtime config loader for the gearbox agent harness.
 * Reads harness-config.json with safe fallbacks, env-var overrides, and a
 * small CLI for bash-driven queries.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, isDirectRun, parseCliArgs } from './common.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'harness-config.json');

// ── Built-in defaults ────────────────────────────────────────────────────────
const BUILT_IN_DEFAULTS = {
  $schema_version: '1.0.0',
  node: {
    min_version: '20.12.1',
  },
  pipeline: {
    max_nodes: 9,
  },
  audit: {
    rubric_version: '2026-04-06',
    max_prime_bytes: 4096,
    health_min_runs: 3,
    weight_ceiling: {
      express: { skill_bytes: 50000, instruction_lines: 500, estimated_tokens: 12500 },
      standard: { skill_bytes: 100000, instruction_lines: 1000, estimated_tokens: 25000 },
      full: { skill_bytes: 200000, instruction_lines: 2000, estimated_tokens: 50000 },
    },
    required_hook_events: [
      'sessionStart',
      'userPromptSubmitted',
      'preToolUse',
      'postToolUse',
      'errorOccurred',
      'sessionEnd',
    ],
  },
  readiness: {
    autonomous_min_score: 7,
    gated_min_score: 5,
    blocked_below_score: 5,
  },
  model_routing: {
    tiers: { flagship: 'gpt-5.4', standard: 'claude-sonnet-4.6', fast: 'claude-haiku-4.5' },
    reasoning_effort: { flagship: 'xhigh', standard: 'high', fast: 'medium' },
    capabilities: {
      deep_reasoning: { model: 'gpt-5.4', reasoning_effort: 'xhigh', aliases: ['flagship'] },
      execution: { model: 'claude-sonnet-4.6', reasoning_effort: 'high', aliases: ['standard'] },
      fast_deterministic: { model: 'claude-haiku-4.5', reasoning_effort: 'medium', aliases: ['fast'] },
    },
  },
  budget: {
    default_ticket_usd: 5,
    warn_fraction: 0.7,
    critical_fraction: 0.95,
  },
  hooks: {
    packet_scope_guard: { mode: 'warn' },
  },
};

// ── Env-var overrides ────────────────────────────────────────────────────────
const ENV_VAR_MAP = {
  GEARBOX_NODE_MIN_VERSION: { path: ['node', 'min_version'], type: 'string' },
  GEARBOX_AUDIT_MAX_PRIME_BYTES: { path: ['audit', 'max_prime_bytes'], type: 'number' },
  GEARBOX_BUDGET_DEFAULT_TICKET_USD: { path: ['budget', 'default_ticket_usd'], type: 'number' },
  GEARBOX_BUDGET_WARN_FRACTION: { path: ['budget', 'warn_fraction'], type: 'number' },
  GEARBOX_BUDGET_CRITICAL_FRACTION: { path: ['budget', 'critical_fraction'], type: 'number' },
  GEARBOX_HOOKS_PACKET_SCOPE_GUARD_MODE: { path: ['hooks', 'packet_scope_guard', 'mode'], type: 'string' },
  GEARBOX_READINESS_AUTONOMOUS_MIN_SCORE: { path: ['readiness', 'autonomous_min_score'], type: 'number' },
  GEARBOX_READINESS_GATED_MIN_SCORE: { path: ['readiness', 'gated_min_score'], type: 'number' },
  GEARBOX_READINESS_BLOCKED_BELOW_SCORE: { path: ['readiness', 'blocked_below_score'], type: 'number' },
};

// ── Deep merge helper ────────────────────────────────────────────────────────
function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base?.[key];
    const overVal = override[key];
    if (overVal && typeof overVal === 'object' && !Array.isArray(overVal)
      && baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal)) {
      result[key] = deepMerge(baseVal, overVal);
    } else {
      result[key] = overVal;
    }
  }
  return result;
}

function setNestedPath(obj, keyPath, value) {
  let current = obj;
  for (let i = 0; i < keyPath.length - 1; i++) {
    if (current[keyPath[i]] === undefined || typeof current[keyPath[i]] !== 'object') {
      current[keyPath[i]] = {};
    }
    current = current[keyPath[i]];
  }
  current[keyPath[keyPath.length - 1]] = value;
}

// ── Config loading ───────────────────────────────────────────────────────────
let _cachedConfig = null;

export function loadHarnessConfig({ configPath, noCache = false } = {}) {
  if (!noCache && _cachedConfig) {
    return { config: _cachedConfig, warnings: [] };
  }

  const warnings = [];
  const resolvedPath = configPath ?? DEFAULT_CONFIG_PATH;

  let fileConfig = null;
  try {
    const raw = readFileSync(resolvedPath, 'utf8');
    fileConfig = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      warnings.push(`harness-config: config file not found at ${resolvedPath}, using built-in defaults`);
    } else if (err instanceof SyntaxError) {
      warnings.push(`harness-config: invalid JSON in ${resolvedPath}, using built-in defaults`);
    } else {
      warnings.push(`harness-config: could not read ${resolvedPath} (${err.message}), using built-in defaults`);
    }
  }

  let config = deepMerge(BUILT_IN_DEFAULTS, fileConfig ?? {});

  // Apply env-var overrides
  for (const [envKey, { path: keyPath, type }] of Object.entries(ENV_VAR_MAP)) {
    const raw = process.env[envKey];
    if (raw === undefined) continue;
    let value;
    if (type === 'number') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        value = parsed;
      } else {
        warnings.push(`harness-config: env var ${envKey}="${raw}" is not a valid number, ignoring`);
        continue;
      }
    } else {
      value = raw;
    }
    setNestedPath(config, keyPath, value);
  }

  if (!noCache) {
    _cachedConfig = config;
  }

  return { config, warnings };
}

export function getConfig() {
  if (_cachedConfig) return _cachedConfig;
  const { config } = loadHarnessConfig();
  return config;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (isDirectRun(import.meta.url)) {
  const { flags, positionals } = parseCliArgs();
  const json = hasJsonFlag(flags);
  const keyArg = flags.key ? String(flags.key) : positionals[0];

  const { config, warnings } = loadHarnessConfig({ noCache: true });

  if (warnings.length > 0) {
    for (const w of warnings) {
      process.stderr.write(`[warn] ${w}\n`);
    }
  }

  if (keyArg) {
    const keys = keyArg.split('.');
    let value = config;
    for (const k of keys) {
      value = value?.[k];
    }
    process.stdout.write((json ? JSON.stringify(value, null, 2) : String(value ?? '')) + '\n');
  } else {
    process.stdout.write((json ? JSON.stringify(config, null, 2) : JSON.stringify(config, null, 2)) + '\n');
  }
}
