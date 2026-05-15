# Wrap-Up Skill: Detailed Workflow Reference

## Introspection Checklist

Use these prompts to guide the introspection step:

**Novel Findings**

- Did we discover something about the codebase, a tool, or a workflow that isn't
  documented?
- Did we encounter an edge case with no prior art in the docs?
- Did we find a better or faster way to do something that already exists?

**Friction Points**

- Did any step take significantly longer than expected? Why?
- Did the model or user have to repeat a task or re-explain context?
- Was there confusion about which skill or tool to use?
- Did any skill instruction prove incomplete or misleading?

**Skill Gaps**

- Did a skill fail to trigger when it should have?
- Did a skill trigger but with insufficient guidance for the situation?
- Is there a reusable workflow with no skill wrapper?

**Doc Gaps**

- Would an AGENTS.md bullet have prevented confusion?
- Is there a gap in `docs/`, `references/`, or inline code comments?
- Is a decision or finding worth preserving in `decisions.md`?

**What Went Well**

- Did a specific tool combination or skill sequence work particularly well?
- Did a naming convention, code pattern, or workflow choice reduce friction?
- Was the division of labour between model and user effective?

## Priority Scoring Rubric

### High Priority

- Directly impacts next-session productivity if not persisted
- Prevents repeated failure or confusion
- Fills a critical skill or doc gap
- Captures a project convention or cross-cutting pattern

### Medium Priority

- Improves efficiency or reduces friction but not critical
- Useful for `session-lessons` aggregation later
- Worth a note but not worth blocking on

### Low Priority

- One-off or highly situational
- Better left to `session-lessons` pattern mining across sessions
- Would only benefit a future session if many similar sessions accumulate
  evidence

## Destination Routing Rules

### AGENTS.md

- Cross-cutting guidance that applies to all or most sessions
- Project conventions discovered during this session
- Newly relevant patterns or guardrails
- Update existing bullets rather than adding new ones when possible

### repo docs (e.g. docs/development/, docs/projects/)

- Technical specifics: troubleshooting steps, architecture notes, API quirks
- Brand-specific behaviour discovered during investigation
- Configuration or environment findings

### existing skill

- Trigger refinement: the skill description didn't capture the situation
- Instruction gap: the skill had no guidance for an edge case
- Missing coverage: an edge case exists but no should-trigger/should-not-trigger
  marker
- **Do not** rewrite the skill in SKILL.md — open a sub-section in `references/`
  or flag in `decisions.md`

### new skill

- A reusable workflow with clear trigger conditions
- Evidence from this session alone is sufficient if confidence is HIGH
- For MEDIUM confidence, prefer "flag for session-lessons" over authoring
  immediately
- Use `skill-creator` to draft the new skill after wrap-up if confirmed

### user-directives.md

- Behavioural preferences explicitly stated by the user during the session
- Specific conventions or preferences unique to this user
- Do not infer preferences — only capture what was explicitly said

### Jira ticket

- A larger improvement that deserves tracking and scheduling
- Not something the model should do now but the user would want tracked
- Keep the description focused: what changed, why it matters, what the ideal
  outcome is

### no-op

- Purely situational: one-off debugging artifact, a test that happened to fail
- Items where the evidence from a single session is insufficient to justify
  codification
- Items the user explicitly declines to persist

## Edge Cases

**User says "skip" before or during wrap-up** : Record all items as `no-op` with
reason `user-declined`. Do not write any files.

**User says "remind me later"** : Note the items in a short list and suggest the
user invoke `wrap-up` again when ready. No files written.

**Session was entirely routine (no learnings)** : Report a brief "nothing worth
persisting" and close cleanly without file writes.

**User asks to persist something but it's already covered** : Verify against
existing coverage (AGENTS.md, docs, skills) before writing. If already covered,
note "already documented" in the report.

**Model is uncertain whether something is worth persisting** : Default to MEDIUM
rather than LOW — let `session-lessons` or the user filter further.

**Wrap-up is invoked mid-session (not at close)** : Treat as a checkpoint, not a
close. Apply HIGH items immediately, note MEDIUM/LOW for end-of-session wrap-up.

## Relationship to Other Skills

| Skill              | Scope                  | Session boundary    | Action               |
| ------------------ | ---------------------- | ------------------- | -------------------- |
| `wrap-up`          | Current session        | End (or checkpoint) | Immediate persist    |
| `session-lessons`  | Multiple past sessions | Any time (analysis) | No writes            |
| `pr-retrospective` | Single merged PR       | Post-merge          | Yes (eval ingestion) |
| `memory-merger`    | Approved lessons       | Any time            | Yes (file promotion) |
