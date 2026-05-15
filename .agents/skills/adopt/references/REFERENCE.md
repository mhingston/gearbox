# Reference Guide

Use this file when a deeper codebase-first analysis is needed.

## Evaluation rubric

Score each candidate idea on a 1-5 scale.

### 1. User or developer impact
- 1 = barely noticeable
- 3 = meaningful improvement for a secondary workflow
- 5 = major improvement to a core workflow

### 2. Ease of implementation
- 1 = large refactor or new subsystem
- 3 = moderate feature work touching several areas
- 5 = small additive change using existing primitives

### 3. Fit with current architecture
- 1 = fights current stack or conventions
- 3 = possible but awkward
- 5 = natural extension of current patterns

### 4. Maintenance burden
- 1 = ongoing support headache
- 3 = manageable with some care
- 5 = almost free once built

### 5. Strategic alignment
- 1 = off-strategy
- 3 = adjacent
- 5 = directly reinforces roadmap or product direction

## Simple prioritisation formula

Priority score =
(impact * 0.35) +
(ease * 0.25) +
(fit * 0.20) +
(strategic alignment * 0.15) +
(maintenance burden * 0.05)

Use the formula as a guide, not a substitute for judgement.

## What to look for in a reference repository or folder

### Code and architecture signals
- clear module boundaries
- clean extension points
- simple abstractions
- sensible background processing
- careful caching
- resilient sync or state handling
- easy local development
- testable seams
- helpful scripts and tooling
- observability hooks

### Product and workflow signals
- faster time to first value
- fewer dead ends
- better defaults
- clearer progress visibility
- reduced repetitive work
- better onboarding
- stronger error recovery
- clearer status feedback

## Anti-patterns to avoid importing

- parity features with weak real value
- over-engineered plugin systems
- flashy interaction patterns with little utility
- fragile abstractions
- architecture copied without matching constraints
- collaboration features without collaboration demand
- AI features without a clear workflow gain
- “enterprise” controls before actual enterprise need

## Repository-anchoring prompts

When repo access is available, answer these:
1. Where in the codebase would this live?
2. Which existing modules or services can be reused?
3. What is the smallest safe implementation slice?
4. What migrations or data changes are needed?
5. What tests should be added?
6. What telemetry would tell us it worked?
7. What can be feature-flagged?
8. What can be postponed?
