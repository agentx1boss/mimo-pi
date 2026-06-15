<h1 align="center">mimo-pi</h1>

<p align="center"><strong>Rebuilding MiMoCode's core capabilities on the Pi kernel — an AI coding agent with cross-session memory and self-evolution.</strong></p>

<p align="center">
  English | <a href="README.zh.md">中文</a>
</p>

---

## What is this

`mimo-pi` is an experimental project that aims to reimplement the core differentiating capabilities of [MiMoCode](https://github.com/XiaomiMiMo/MiMo-Code) on top of the minimal kernel of [Pi](https://github.com/earendil-works/pi).

Rather than starting from scratch, it answers a single question:

> **What would it look like if every piece of MiMoCode's "cross-session memory + intelligent context management + self-evolution" were expressed as a set of Pi Extensions?**

Pi contributes the hard infrastructure — the agent loop, tree-based session persistence, context compaction, and extension hooks. MiMoCode contributes the design philosophy — the memory system, checkpointing, and Dream/Distill — the ideas that make an agent "understand your project better the more you use it." `mimo-pi` brings the two together.

### Status

> ⚠️ **Early in development.** This repository is currently a fork of Pi with a full development plan ([`MIMOCODE_PLAN.zh.md`](./MIMOCODE_PLAN.zh.md), in Chinese) attached, but no feature implementation has started yet. The capabilities described below are **target goals**, not shipped features.

## Relationship to upstreams

| Upstream | Role | Link |
|----------|------|------|
| **[earendil-works/pi](https://github.com/earendil-works/pi)** | The underlying kernel. This repo forks from it and reuses its agent runtime, TUI, multi-provider LLM API, session management, and extension system. | [pi.dev](https://pi.dev) |
| **[XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code)** | The design blueprint. The core capabilities reimplemented here — memory, checkpointing, Compose, Dream/Distill — are modeled on MiMoCode. | [mimo.xiaomi.com](https://mimo.xiaomi.com/en/mimocode) |

Sincere thanks to both upstream projects. Without Pi's engineering foundation and MiMoCode's product insight, this experiment would not be possible.

## Design philosophy

**Pi is a "minimal kernel + extensible harness,"** and every piece of MiMoCode's differentiation can be expressed as a set of Pi Extensions. So `mimo-pi`'s strategy is:

- **Do not modify the Pi kernel** — all MiMo capabilities are built as Extensions, preserving the ability to merge from upstream.
- **Borrow, don't copy** — Pi's bundled example extensions (`custom-compaction.ts` / `todo.ts` / `subagent/` / `handoff.ts`) already cover a lot of the functional scaffolding. What we add is MiMoCode's engineering quality: SQLite FTS5, token-budgeted injection, an independent judge model, and subagent orchestration.
- **One feature = one Extension** — each capability is independently loadable, and can also be enabled together via an aggregate entry point.

```
packages/coding-agent/src/extensions/mimo/   ← planned MiMo extension layer
├── memory/        # Persistent memory (SQLite FTS5 + budgeted injection)
├── checkpoint/    # Checkpointing + context reconstruction
├── tasks/         # Tree-shaped task tracking
├── goal/          # Goal + judge-model stop conditions
├── subagent/      # Subagent orchestration
├── compose/       # Specs-driven orchestration mode
├── dream/         # Dream & Distill self-evolution
└── shared/        # Shared utilities (store / token counting / prompt templates)
```

## Target capabilities (planned)

The capabilities below all originate from MiMoCode's design, to be reimplemented as Pi Extensions:

### ⭐ Persistent memory
Cross-session memory based on SQLite FTS5 full-text search, with relevant memories injected into context by token budget on session resume. Includes project memory (`MEMORY.md`), session checkpoints, notes scratchpad, and per-task progress — so the agent never has to relearn the project background.

### Checkpointing + context reconstruction
Before context compaction, a sub-model generates a structured checkpoint snapshot. When context nears its limit, the context is reconstructed from the latest checkpoint, project memory, and task progress — letting the agent continue the current task seamlessly.

### Task tracking
A tree-shaped task system (T1, T1.1, T1.2…) whose state is persisted in session entries, with native support for branching (`/fork`). Automatically linked to the checkpoint system, so progress survives session resume.

### Goal / judge stop conditions
`/goal` sets a stop condition for the session. When the agent wants to stop, an **independent judge model** evaluates the conversation to determine whether the condition is truly satisfied — preventing "optimistic stopping" during autonomous work.

### Subagent orchestration
The primary agent spawns subagents on demand, supporting single, parallel, and chained modes, sharing session context, with lifecycle tracking and background execution.

### Compose orchestration mode
A structured, specs-driven development flow: planning → execution → code review → TDD → debugging → validation → merge, orchestrating the full lifecycle from spec to delivery.

### ⭐ Dream & Distill (self-evolution)
- **`/dream`** — scans recent session trajectories, extracts persistent knowledge into project memory, and prunes stale entries.
- **`/distill`** — discovers repetitive manual workflows from recent work and packages high-confidence candidates into reusable skills / subagents / commands.

This is MiMoCode's biggest differentiator relative to the Pi ecosystem — making the agent genuinely "stronger with use."

## Roadmap

See [`MIMOCODE_PLAN.zh.md`](./MIMOCODE_PLAN.zh.md) for the full plan (with task checklists and acceptance criteria per phase, in Chinese). A brief overview:

| Phase | Content | Milestone |
|-------|---------|-----------|
| P0 | Engineering baseline (skeleton / build / test loop) | |
| P1 | ⭐ Persistent memory (SQLite FTS5 + budgeted injection) | **M1** Usable prototype |
| P2 | Checkpointing + context reconstruction | |
| P3 | Task tracking + Goal judge stop | **M2** Memory loop |
| P4 | Subagent orchestration + Compose | **M3** Orchestration |
| P5 | ⭐ Dream & Distill self-evolution | **M4** Self-evolution |
| P6 | Multi-mode switching / polish / docs | **M5** Release-ready |

## Development

This repository is a fork of the Pi monorepo and follows the same development workflow:

```bash
npm install --ignore-scripts   # Install dependencies
npm run build                  # Build all packages
npm run check                  # Lint, format, and type check
./test.sh                      # Run tests
./pi-test.sh                   # Run pi from sources
```

Package documentation lives in [`packages/coding-agent/docs/`](./packages/coding-agent/docs/).

## License

MIT, inherited from the upstream Pi project.

Use of this repository is additionally subject to Pi's usage restrictions and trademark policy.
