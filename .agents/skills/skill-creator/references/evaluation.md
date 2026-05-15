# Skill Evaluation Workflow

Use this reference when the user wants evidence that a skill works, improved behavior across iterations, or a baseline comparison.

## Workspace Layout

Create a sibling workspace beside the skill directory and organize results by iteration and eval:

```text
<skill-name>-workspace/
└── iteration-1/
    └── eval-name/
        ├── eval_metadata.json
        ├── with_skill/
        │   ├── outputs/
        │   ├── grading.json
        │   └── timing.json
        └── without_skill/ or old_skill/
            ├── outputs/
            ├── grading.json
            └── timing.json
```

If you are improving an existing skill, snapshot the original version first and use that snapshot as the baseline.

Minimal `eval_metadata.json`:

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

## Run Evaluations

### 1. Spawn with-skill and baseline runs together

Launch both variants in the same turn.

- **New skill:** baseline is `without_skill`.
- **Existing skill:** baseline is usually `old_skill` from a snapshot.

Use the same prompt and input files for both.

### 2. Draft assertions while runs execute

Do not wait idly for runs to finish.

- Draft assertions for objective outcomes.
- Keep qualitative tasks qualitative; do not force weak assertions onto writing or design quality.
- Update `eval_metadata.json` and `evals/evals.json` once the assertions are ready.

### 3. Capture timing data from task notifications

When each run completes, save the notification's timing and token data immediately:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

This data is easiest to lose, so capture it before moving on.

## Grade and Review

### Grading

Use `agents/grader.md` for assertion grading. The `grading.json` expectations array must use the exact fields `text`, `passed`, and `evidence`.

For checks that can be scripted, script them instead of eyeballing them.

### Aggregate benchmark

```bash
node utilities/scripts/skills/run-python.mjs --cwd .agents/skills/skill-creator   --module scripts.aggregate_benchmark   <workspace>/iteration-N   --skill-name <name>
```

This produces `benchmark.json` and `benchmark.md` using the schemas documented in [schemas.md](schemas.md).

### Launch the review viewer

```bash
node utilities/scripts/skills/run-python.mjs   .agents/skills/skill-creator/eval-viewer/generate_review.py   <workspace>/iteration-N   --skill-name "my-skill"   --benchmark <workspace>/iteration-N/benchmark.json
```

Use `--previous-workspace` for iteration 2+ comparisons. In headless environments, write a static HTML file instead; see [platform-notes.md](platform-notes.md).

Tell the user what they will find:

- **Outputs** tab for qualitative review
- **Benchmark** tab for quantitative comparisons

### Read feedback

The viewer returns `feedback.json` when the user finishes review. Focus your next iteration on the runs with concrete complaints; empty feedback usually means the result was acceptable.

## Improve and Re-run

Use the review loop to make durable improvements, not narrow overfits.

- Generalize from user feedback instead of patching one example too literally.
- Remove instructions that create visible prompt drag without improving outcomes.
- If multiple evals reinvent the same helper script, bundle that helper in `scripts/`.
- Re-run the full eval set into a new `iteration-N+1/` directory.
- Pass the previous workspace into the reviewer so the user can compare iterations.

Stop when one of these is true:

- the user is satisfied,
- feedback is effectively empty, or
- the next change would not meaningfully improve the skill.

## Blind Comparison

For high-stakes comparisons, use the blind A/B flow:

- `agents/comparator.md` for hidden winner selection
- `agents/analyzer.md` for why the winner won

This is optional. Most skill work is well served by the standard reviewer plus benchmark loop.
