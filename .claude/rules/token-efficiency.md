# Token Efficiency

*Why:* 80% of code tokens are ceremony, not logic. Every token costs context window capacity, API dollars, and latency. Writing token-efficient code isn't a compression trick — it's the same patterns that make code better for humans (Clean Architecture, DRY, separation of concerns), viewed through an economics lens.

## Code Structure

### Kernel Pattern — Separate Logic from Framework

*Why:* An LLM fixing a business rule shouldn't load 500 lines of decorators and ORM queries. Pure logic in its own file means agents load only what they need. **56% reduction for logic tasks.**

- Split when a file exceeds ~100 lines AND mixes business logic with framework ceremony
- Core file: **zero framework imports** — only builtins and shared types. Testable without mocking
- Adapter file: framework wiring, decorators, HTTP handlers, ORM calls
- Types file: shared types, constants, config
- Skip for: simple CRUD under 100 lines, pure utilities, test files

### Keep It DRY for Tokens

*Why:* Every repeated type expression or literal array is paid for on every mention. Standard DRY — but LLM-generated code inlines aggressively.

- **Type aliases:** Same type 2+ times AND >50 chars → extract. Name must be clearer than the inline form
- **Constants:** Same literal in 2+ places → extract to a named constant
- **Inheritance:** Intermediate classes that exist only for wiring → flatten them
- **Trivial bodies:** Empty or single-expression methods → inline to one line

### Respect Language Idioms

*Why:* Fighting a language's conventions makes code harder for both humans AND agents. Go is verbose by design. Java requires ceremony. Apply patterns where the language naturally supports them.

- Declarative style (comprehensions, `Object.fromEntries`, iterator chains): use in TypeScript, Python, Rust
- Imperative loops: idiomatic in Go and Java — don't force functional patterns

## Context Loading

*Why:* What you load into context matters as much as how you write code. An agent that loads everything wastes 56% of its context on noise.

### Load Order

1. **Core first** — maximum business context, minimum tokens
2. **Types on demand** — only when a referenced type needs clarification
3. **Adapter last** — only for framework wiring tasks
4. **Never load everything** unless the task requires it (full refactor)

### Cache-Aware Design

*Why:* Prefix caching gives 10x API cost savings — but dynamic content in system prompts destroys it.

- System prompts: **stable and static** — no timestamps, no session IDs, no dynamic tool injection at the start
- Dynamic context goes at the **end**, after the stable prefix
- Old tool outputs: **mask** with a one-line summary, don't LLM-summarize (summarization costs more AND breaks cache)

## Agent Orchestration

*Why:* Every agent spawn costs ~10k tokens minimum (system prompt + reasoning bootstrap). Spawning 5 agents for file writes burned 240k tokens; doing it inline cost 15k. A 16x waste ratio.

### The 10k Floor Rule

If a task costs less than 10k tokens inline — don't spawn an agent. Agents are for independent reasoning, not parallel I/O.

| Task type | Approach |
|-----------|----------|
| Write files with known content | Parallel tool calls (no agent) |
| Simple lookup / format | Inline or haiku |
| Research a question | Single agent (sonnet) |
| Complex reasoning / code gen | Agent (sonnet/opus) |
| Multi-model review | PAL tools |

### Model Tiering

- **haiku** — file I/O, templating, formatting, simple transforms
- **sonnet** — standard code gen, research, analysis
- **opus** — architecture decisions, complex debugging, novel problems

Orchestrator on capable model. Sub-agents on cheaper models.

### Fail-Fast

- First tool denial → try one alternative
- Second denial → return immediately with terse status
- Never retry the same failing call more than twice
- Structured returns: `{status, result, error}` — not 500-word narratives

### Pre-Flight

Before spawning write-agents: verify permissions, validate inputs, estimate cost. One cheap check prevents expensive failures.

## What NOT to Do

- **Don't create custom DSLs** (`@` for `this.`, `ret` for `return`) — produces broken code
- **Don't strip types** for compression — non-compilable output, no reliable restoration
- **Don't over-compress** — aggressive compression causes more iterations, increasing total cost
- **Don't summarize old context with LLMs** — masking is cheaper and doesn't break cache
- **Don't split simple files** — 30-line CRUD doesn't need 3 files

---
*v1.0 — 2026-02-21. Based on empirical testing + industry research (2025-2026).*
