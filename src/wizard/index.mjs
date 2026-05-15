import { intro, outro, multiselect, confirm, select, spinner, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import path from 'node:path';

import { DEFAULTS, PLATFORM_CHOICES, WORKFLOW_CHOICES, SKILLS_DIR_CHOICES } from './questions.mjs';
import { detectContext } from './steps/detect-context.mjs';
import { installHooks } from './steps/install-hooks.mjs';
import { installHarness } from './steps/install-harness.mjs';
import { installSkills } from './steps/install-skills.mjs';
import { installWorkflows } from './steps/install-workflows.mjs';
import { installAdapters } from './steps/install-adapters.mjs';
import { generateAgentsMd } from './steps/generate-agents-md.mjs';
import { updatePackageJson } from './steps/update-package-json.mjs';

function collectAll(results) {
  const written = [];
  const skipped = [];
  const warnings = [];
  for (const r of results) {
    if (r.written) written.push(...r.written);
    if (r.skipped) skipped.push(...r.skipped);
    if (r.warnings) warnings.push(...r.warnings);
  }
  return { written, skipped, warnings };
}

/**
 * Run the gearbox setup wizard.
 *
 * @param {{ cwd?: string, dryRun?: boolean, yes?: boolean, platforms?: string[]|null, workflows?: string[]|null, skillsDir?: string|null }} options
 * @returns {Promise<{ written: string[], skipped: string[], warnings: string[] }>}
 */
export async function runWizard({
  cwd = process.cwd(),
  dryRun = false,
  yes = false,
  platforms = null,
  workflows = null,
  skillsDir = null,
} = {}) {

  // --- Detect context ---
  const ctx = await detectContext(cwd);

  if (!yes) {
    intro(pc.bold(pc.cyan('⚙  gearbox')) + pc.dim(' — AI agent harness setup'));
  }

  // --- Gather answers ---
  let chosenPlatforms = platforms ?? DEFAULTS.platforms;
  let chosenWorkflows = workflows ?? DEFAULTS.workflows;
  let chosenSkillsDir = skillsDir ?? DEFAULTS.skillsDir;

  if (!yes) {
    const platformAnswer = await multiselect({
      message: 'Which AI platforms does your team use?',
      options: PLATFORM_CHOICES,
      initialValues: DEFAULTS.platforms,
    });
    if (isCancel(platformAnswer)) { cancel('Setup cancelled.'); process.exit(0); }
    chosenPlatforms = platformAnswer;

    const selfImprove = await confirm({
      message: 'Enable self-improvement loop?',
      initialValue: DEFAULTS.selfImprovement,
    });
    if (isCancel(selfImprove)) { cancel('Setup cancelled.'); process.exit(0); }

    const secretScan = await confirm({
      message: 'Enable secret scanning (gitleaks)?',
      initialValue: DEFAULTS.secretScanning,
    });
    if (isCancel(secretScan)) { cancel('Setup cancelled.'); process.exit(0); }

    const workflowAnswer = await multiselect({
      message: 'Which workflows to install?',
      options: WORKFLOW_CHOICES,
      initialValues: DEFAULTS.workflows,
      required: false,
    });
    if (isCancel(workflowAnswer)) { cancel('Setup cancelled.'); process.exit(0); }
    chosenWorkflows = workflowAnswer;

    const skillsDirAnswer = await select({
      message: 'Where should skills live?',
      options: SKILLS_DIR_CHOICES,
      initialValue: DEFAULTS.skillsDir,
    });
    if (isCancel(skillsDirAnswer)) { cancel('Setup cancelled.'); process.exit(0); }
    chosenSkillsDir = skillsDirAnswer;
  }

  // --- Run steps with progress spinner ---
  const steps = [
    {
      label: 'Installing hook scripts',
      fn: () => installHooks({ cwd, dryRun }),
    },
    {
      label: 'Installing harness scripts',
      fn: () => installHarness({ cwd, dryRun }),
    },
    {
      label: 'Installing skills',
      fn: () => installSkills({ cwd, skillsDir: chosenSkillsDir, selectedSkills: 'all', dryRun }),
    },
    {
      label: 'Installing workflows',
      fn: () => installWorkflows({ cwd, selectedWorkflows: chosenWorkflows, dryRun }),
    },
    {
      label: 'Configuring platform adapters',
      fn: () => installAdapters({ cwd, platforms: chosenPlatforms, dryRun }),
    },
    {
      label: 'Generating AGENTS.md',
      fn: () => generateAgentsMd({ cwd, projectName: ctx.projectName, dryRun }),
    },
    {
      label: 'Updating package.json',
      fn: () => updatePackageJson({ cwd, dryRun }),
    },
  ];

  const results = [];

  if (!yes) {
    const s = spinner();
    for (const step of steps) {
      s.start(step.label);
      const result = await step.fn();
      results.push(result);
      s.stop(step.label);
    }
  } else {
    for (const step of steps) {
      results.push(await step.fn());
    }
  }

  const { written, skipped, warnings } = collectAll(results);

  if (!yes) {
    const lines = [];
    if (dryRun) {
      lines.push(pc.yellow('Dry-run mode — no files were written.'));
      if (written.length > 0) {
        lines.push(pc.dim('Would write:'));
        for (const f of written) lines.push(pc.dim(`  ${f}`));
      }
    } else {
      if (written.length > 0) lines.push(`${pc.green('✔')} Wrote ${written.length} file(s)`);
      if (skipped.length > 0) lines.push(`${pc.dim('–')} Skipped ${skipped.length} existing file(s)`);
    }
    if (warnings.length > 0) {
      for (const w of warnings) lines.push(pc.yellow(`⚠ ${w}`));
    }
    lines.push('');
    lines.push(pc.bold('Next steps:'));
    lines.push(`  ${pc.cyan('npm run gearbox:health')}   — check harness health`);
    lines.push(`  ${pc.cyan('npm run gearbox:audit')}    — run preflight checks`);
    outro(lines.join('\n'));
  } else if (dryRun) {
    process.stdout.write(pc.yellow('Dry-run mode — no files written.\n'));
    for (const f of written) process.stdout.write(`  ${f}\n`);
  }

  return { written, skipped, warnings };
}
