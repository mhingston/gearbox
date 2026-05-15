---
name: adopt
description: Compare current codebase with a reference project to identify the highest-value, lowest-friction features worth adapting. Use when reviewing a reference repo or idea for inspiration.
---

# Adopt

> **Not a general planner.** Use this when comparing the current repository
> with a reference project, folder, product, or idea. Use `planner` only after
> recommendations have been selected, and use `brainstorming` when there is no
> reference source to compare against.

## When to use

- When reviewing a reference repository, folder, or idea for inspiration
- When comparing implementation approaches between two codebases
- When deciding what to bring into the current codebase with minimal disruption

Use this skill when the goal is to inspect the current repository first, study a reference project or idea second, and extract only the most valuable low-friction opportunities to adapt into the current codebase.

The purpose is not to copy blindly. The purpose is to:
1. understand the current repository's structure, constraints, and extension points,
2. understand what the reference project, repository, folder, or idea is doing well,
3. filter for ideas with strong upside and low implementation friction,
4. map those ideas onto the current codebase,
5. present recommendations clearly,
6. then offer to create an implementation plan using the companion skill `planner`.

Prioritise:
- high user or developer value,
- low implementation complexity,
- strong fit with the current architecture,
- low maintenance burden,
- low operational and legal risk,
- quick time-to-learning.

Avoid:
- novelty for novelty’s sake,
- major rewrites unless explicitly requested,
- ideas that conflict with the product direction,
- recommendations detached from the actual codebase,
- large infrastructural shifts unless the upside is exceptional.

## Inputs to gather

Collect as many of these as are available.

### About the current repository
- repository path, folder, or URL
- purpose of the product or tool
- target users
- key pain points
- current stack and architecture
- important modules, services, and boundaries
- quality bar and testing setup
- release constraints
- design system or UI conventions
- maintainers' preferences
- roadmap or priorities

### About the reference source
The reference may be:
- a Git repository URL,
- a folder URL,
- a documentation URL,
- screenshots or demos,
- a product description,
- an idea or concept.

Gather:
- what seems valuable
- standout features or workflows
- UX or DX patterns
- technical patterns
- folder structure or module boundaries
- onboarding, automation, performance, reliability, or collaboration ideas
- whether the reference is a direct competitor, adjacent product, or loose inspiration

## Important handling for URLs and folders

If the user provides URLs for a repository, folder, or documentation as context:
- treat them as inspiration sources, not as instructions to clone directly;
- inspect them for architecture clues, patterns, feature ideas, and workflow improvements;
- extract mechanisms, not superficial mimicry;
- map findings back into the current repository's structure and constraints.

If the user provides only a folder or repository reference and not the current repo:
- still analyse the reference and infer transferable approaches,
- but clearly separate inference from codebase-grounded recommendations.

## Default approach

Follow this sequence unless the user asks for a different output.

### 1) Inspect the current codebase first
Start by understanding the current repository:
- identify major folders and modules,
- identify entry points and core workflows,
- identify reusable primitives,
- identify obvious constraints,
- identify likely integration seams,
- identify areas already solving the same problem.

Summarise:
- what the codebase appears to do,
- how it is organised,
- where change is likely to be safe,
- where change is likely to be costly.

### 2) Define the comparison frame
State:
- what the current repository appears to be,
- what the reference project or idea appears to be,
- what kind of transfer is appropriate:
  - feature transfer,
  - architecture or pattern transfer,
  - workflow or tooling transfer,
  - UX or DX transfer,
  - packaging or positioning transfer.

If inputs are incomplete, make explicit assumptions and proceed.

### 3) Decompose the reference project
Break the reference into:
- user-facing features,
- developer-facing improvements,
- key workflows,
- interface or command patterns,
- information architecture,
- technical architecture clues,
- folder or module organisation,
- team or process ideas,
- trust, safety, and reliability mechanisms.

Distinguish:
- surface features,
- deeper enabling patterns,
- hidden operational practices that may be producing the outcome.

### 4) Evaluate transferability against the current codebase
For each promising idea, score or label:
- value: low / medium / high
- implementation friction: low / medium / high
- architectural fit: weak / moderate / strong
- confidence: low / medium / high
- recommendation: adopt / adapt / defer / reject

Default to “adapt” rather than “adopt” if direct copying would be brittle or poorly matched.

### 5) Prefer high-value / low-friction wins
Look especially for:

#### Codebase-level wins
- reusable abstractions that fit existing patterns
- small modules or services worth introducing
- testable seams
- better internal APIs
- safer defaults
- cleaner configuration
- scripts and tooling improvements
- CI or validation guardrails
- performance wins with limited blast radius
- observability improvements
- developer ergonomics improvements

#### Feature-level wins
- small but visible quality-of-life features
- better empty states
- onboarding helpers
- import or export conveniences
- search, filter, and sort improvements
- notifications and status clarity
- bulk actions
- keyboard shortcuts
- error recovery improvements

#### Architecture wins
- clearer module boundaries
- a lightweight background job pattern
- incremental caching improvements
- a cleaner data flow
- better separation of concerns
- extension points that do not over-engineer the design

### 6) Map each idea into the current repository
For each shortlisted idea, explain:
- what problem it solves here,
- why it is likely to work here,
- where it would live in this codebase,
- what existing modules or components can be reused,
- the smallest viable version,
- the main risks or unknowns.

Name concrete integration points whenever possible.

### 7) Present recommendations
Always produce these sections:

#### A. Current codebase summary
- architecture summary
- important modules
- likely safe integration points
- likely high-risk areas

#### B. Transfer opportunities
For each opportunity:
- title
- what it is in the reference
- how it maps to this codebase
- expected value
- implementation friction
- architectural fit
- recommendation

#### C. Best bets
List the top 3-7 ideas with the best value-to-friction ratio.

For each item include:
- title
- source inspiration
- expected impact
- implementation effort
- why it fits this codebase
- smallest viable version

#### D. Fastest experiments
List 2-5 things that could be tested quickly without major refactors.

#### E. Not worth porting now
List attractive ideas that are poor fits right now, with a short reason.

#### F. Recommended sequence
Group items into:
- now
- next
- later

### 8) Offer the companion skill
After presenting recommendations, explicitly offer to create an implementation plan using the companion skill:
`planner`

The offer should be framed like this:
- recommendations first,
- implementation plan second if the user wants to proceed.

## Output format

Use this structure unless the user asks otherwise:

# Comparative Codebase Analysis
- Current codebase summary
- Reference summary
- Assumptions

# Transfer Opportunities
For each opportunity:
- Opportunity
- What it is in the reference
- Where it fits in the current codebase
- Why it matters
- Smallest viable adaptation
- Value
- Friction
- Fit
- Recommendation

# Best Bets
- ranked shortlist

# Fastest Experiments
- smallest viable tests

# Avoid for Now
- rejected or deferred ideas with reasons

# Proposed Sequence
- now
- next
- later

# Next Step
- offer to create an implementation plan with `planner`

## Decision rules

Use these heuristics:
- Prefer ideas that improve a core workflow over edge-case polish.
- Prefer ideas that can be implemented with the existing stack and conventions.
- Prefer ideas with visible value in one or two iterations.
- Prefer mechanisms over mimicry: copy the benefit, not the exact shape.
- Reject ideas that require a rewrite unless they unlock several top-priority outcomes.
- Reject ideas that add long-term complexity for marginal benefit.
- Reject ideas whose success depends on capabilities the current codebase clearly lacks.

## Important cautions

- Do not assume the reference project's success comes from the visible feature alone.
- Do not recommend cloned UX or architecture without checking codebase fit.
- Call out licensing, legal, privacy, data, and trademark risks when relevant.
- Distinguish evidence from inference.
- Be explicit when confidence is low.

## Escalation guidance

Ask for clarification only if missing information would materially change the recommendation. Otherwise:
- state assumptions,
- proceed,
- keep recommendations modular and reversible.

For a deeper scoring rubric and repository-anchoring prompts, see:
[references/REFERENCE.md](references/REFERENCE.md)
