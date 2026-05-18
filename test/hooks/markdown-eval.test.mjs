import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('markdown-eval', () => {
  let tmpDir;
  let runCli;

  before(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'gearbox-markdown-eval-'));
    const mod = await import('../../src/hooks/markdown-eval.mjs');
    runCli = mod.runCli;
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('evaluates records and writes latest-eval.md', async () => {
    const recordsDir = path.join(tmpDir, '.gearbox', 'hooks', '.runtime', 'records');
    await mkdir(recordsDir, { recursive: true });

    await writeFile(
      path.join(recordsDir, '100.json'),
      `${JSON.stringify(
        {
          name: 'Hook repair session',
          description: 'Restored the markdown eval flywheel and updated install assets.',
          recorded_at: '2026-01-12T10:00:00.000Z',
          files: ['src/hooks/self-learning.mjs', 'src/wizard/steps/install-hooks.mjs'],
          metadata: {
            promptCount: 2,
            semanticTypes: ['problem'],
            knowledgeTypes: ['workflow'],
          },
          outcomes: [
            {
              status: 'success',
              notes: 'Relevant hook tests passed',
            },
          ],
        },
        null,
        2
      )}\n`
    );

    await writeFile(
      path.join(recordsDir, '101.json'),
      `${JSON.stringify(
        {
          name: 'Workflow prompt cleanup',
          description: 'Updated consolidate-memory workflow prompt path.',
          recorded_at: '2026-01-12T11:00:00.000Z',
          files: ['src/workflows/consolidate-memory.md'],
          metadata: {
            promptCount: 1,
            semanticTypes: ['problem'],
            knowledgeTypes: ['workflow'],
          },
          outcomes: [
            {
              status: 'partial',
              notes: 'Docs still needed review',
            },
          ],
        },
        null,
        2
      )}\n`
    );

    const exitCode = await runCli({
      cwd: tmpDir,
      args: ['--record-outcomes', '--synthesise', '--limit', '10'],
      stdout: { write() {} },
      stderr: { write() {} },
    });

    assert.equal(exitCode, 0);

    const latestEvalPath = path.join(
      tmpDir,
      '.gearbox',
      'hooks',
      '.runtime',
      'latest-eval.md'
    );
    const latestEval = await readFile(latestEvalPath, 'utf8');
    assert.match(latestEval, /# Gearbox Latest Eval/);
    assert.match(latestEval, /Records analysed: 2/);
    assert.match(latestEval, /success: 1/);
    assert.match(latestEval, /partial: 1/);
    assert.match(latestEval, /src\/hooks\/self-learning\.mjs/);

    const updatedRecord = JSON.parse(await readFile(path.join(recordsDir, '101.json'), 'utf8'));
    assert.equal(updatedRecord.evaluation.status, 'partial');
    assert.match(updatedRecord.evaluation.summary, /Docs still needed review/);
  });

  it('prints help output for --help', async () => {
    let stdout = '';
    let stderr = '';

    const exitCode = await runCli({
      cwd: tmpDir,
      args: ['--help'],
      stdout: {
        write(chunk) {
          stdout += chunk;
        },
      },
      stderr: {
        write(chunk) {
          stderr += chunk;
        },
      },
    });

    assert.equal(exitCode, 0);
    assert.match(stdout, /Usage: markdown-eval\.mjs \[options\]/);
    assert.equal(stderr, '');
  });
});
