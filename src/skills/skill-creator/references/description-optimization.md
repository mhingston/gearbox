# Description Optimization

Use this reference after the skill behavior is stable and you want sharper triggering.

## 1. Build the Trigger Eval Set

Draft a realistic mix of should-trigger and should-not-trigger prompts.

- Aim for about 20 prompts total.
- Include casual phrasing, messy real-world detail, and near-miss cases.
- Favor substantive tasks over toy prompts; simple one-step requests often will not trigger any skill, no matter how good the description is.

Minimal format:

```json
[
  { "query": "user prompt", "should_trigger": true },
  { "query": "near miss prompt", "should_trigger": false }
]
```

Good negative cases are adjacent workflows that share vocabulary but belong to another skill.

## 2. Review the Eval Set with the User

Populate `assets/eval_review.html` before running the automation loop.

Replace these placeholders:

- `__EVAL_DATA_PLACEHOLDER__`
- `__SKILL_NAME_PLACEHOLDER__`
- `__SKILL_DESCRIPTION_PLACEHOLDER__`

Write the populated HTML to a safe writable workspace, open it, and let the user adjust the prompts before exporting `eval_set.json`.

## 3. Run the Optimization Loop

```bash
node utilities/scripts/skills/run-python.mjs --cwd .agents/skills/skill-creator   --module scripts.run_loop   --eval-set <path-to-trigger-eval.json>   --skill-path <path-to-skill>   --model <current-session-model-id>   --max-iterations 5   --verbose
```

Use the same model family that powers the current session so the trigger test reflects the user's real environment.

While the loop runs, keep the user updated on:

- the current iteration,
- train and held-out test scores,
- notable false positives, and
- notable false negatives.

## 4. Apply the Result

Update the skill's frontmatter with `best_description`, then:

1. show the before/after descriptions,
2. report the score change, and
3. re-run `validate-skill.mjs`.

## How Triggering Actually Works

Skills are selected from their `name` and `description`, but they are not guaranteed to fire on trivial tasks. If the base model can solve a prompt directly, it may skip the skill entirely.

That is why strong trigger evals look like real user requests with enough complexity to justify consulting a skill.
