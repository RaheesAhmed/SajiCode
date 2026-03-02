<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./logo.svg">
    <img src="./logo-dark.svg" width="300" alt="SajiCode" />
  </picture>
</p>

<p align="center">
  <strong>AI engineering team in your terminal.</strong>
</p>

<p align="center">
  <a href="https://github.com/raheesahmed/sajicode/stargazers"><img src="https://img.shields.io/github/stars/raheesahmed/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="Stars"></a>
  <a href="https://github.com/raheesahmed/sajicode/network/members"><img src="https://img.shields.io/github/forks/raheesahmed/sajicode?style=flat&color=CC5500&labelColor=1a1a1a" alt="Forks"></a>
  <a href="https://github.com/raheesahmed/sajicode/blob/main/LICENSE"><img src="https://img.shields.io/github/license/raheesahmed/sajicode?style=flat&color=666666&labelColor=1a1a1a" alt="License"></a>
  <a href="https://www.npmjs.com/package/sajicode"><img src="https://img.shields.io/npm/v/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="npm"></a>
</p>


---

## Why sajicode?

Every AI coding tool today — Cursor, GitHub Copilot, Google Antigravity, Amazon Kiro — is built on the same broken architecture: **one agent that acts without judgment.**

The result is always the same:

- ❌ Deletes files it shouldn't touch
- ❌ Writes placeholder code (`// TODO: implement this`)
- ❌ Breaks imports and dependencies across the project
- ❌ Loses context on anything larger than a small feature
- ❌ Requires constant human babysitting
- ❌ Never deploys — you still have to figure that out yourself

sajicode fixes all of this at the **architecture level**, not with patches.

---

## How It Works

### A Real Team With Real Roles

```
User Input
    ↓
┌─────────────────────────────────────────────────────┐
│  Onboarding Agent                                   │
│  Understands your level, your goal, your stack      │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  Project Manager Agent                              │
│  Splits work into milestones, assigns the team,     │
│  spawns sub-agents when tasks are too large         │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   ↓          ↓          ↓          ↓
Backend   Frontend    Test      Security
Agent     Agent       Agent     Agent
   ↓          ↓          ↓          ↓
   └──────────┴──────────┴──────────┘
                  ↓
          Review Agent
          (no placeholders, no stubs)
                  ↓
          Deploy Agent
          (hosting, SSL, CI/CD — done)
                  ↓
          Live URL 🎉
```

### The Judgment Layer

Before any agent touches a single file, every action passes through the **Judgment Layer** — a risk scoring system that no competitor has.

| Risk Score | Action |
|---|---|
| 0–30 — Safe | Execute immediately |
| 31–60 — Caution | Show diff, 3-second countdown |
| 61–85 — High Risk | Pause, show impact, require approval |
| 86–100 — Critical | Hard block with explanation and alternatives |

No more deleted files. No more wiped drives. No more surprises.

### The Completeness Validator

Every piece of code written by any agent passes through AST analysis before it is saved. If the validator finds any of the following, the agent is **looped back** until the work is real:

- Empty function bodies
- `TODO` / `FIXME` / `PLACEHOLDER` comments
- Unimplemented interface methods
- Stub returns (`return null`, `return {}`)
- `throw new Error('Not implemented')`

sajicode **cannot ship incomplete code.** It is enforced at the graph level.

### Dynamic Sub-Agent Spawning

When a task is too large for one agent, the PM Agent spawns parallel sub-agents automatically:

```
"Build the backend"
        ↓
Backend-Auth Agent  +  Backend-DB Agent  +  Backend-API Agent
    (parallel)              (parallel)            (parallel)
        ↓                       ↓                     ↓
                    PM Agent merges output
```

The bigger the task, the more agents. Work is never bottlenecked.

---

## Features

| Feature | sajicode | Cursor | Antigravity | Kiro |
|---|---|---|---|---|
| Real agent team (not single agent) | ✅ | ❌ | Partial | ❌ |
| Pre-action risk judgment | ✅ | ❌ | ❌ | ❌ |
| No placeholder code (enforced) | ✅ | ❌ | ❌ | ❌ |
| Beginner-to-expert onboarding | ✅ | ❌ | ❌ | ❌ |
| Parallel specialist agents | ✅ | ❌ | ❌ | ❌ |
| Dynamic sub-agent spawning | ✅ | ❌ | ❌ | ❌ |
| Security agent runs in parallel | ✅ | ❌ | ❌ | ❌ |
| Built-in deployment | ✅ | ❌ | ❌ | ❌ |
| Session rollback (atomic undo) | ✅ | ❌ | ❌ | ❌ |
| Full context on large projects | ✅ | ❌ | ❌ | ❌ |
| 100% open source | ✅ | ❌ | ❌ | ❌ |

---

## Installation

```bash
# npm
npm install -g sajicode

# bun
bun install -g sajicode
```

**Requirements:**
- Node.js 22+ or Bun
- An Anthropic API key (Claude is the default model)

```bash
sajicode config --api-key YOUR_ANTHROPIC_API_KEY
```

---

## Usage

### Start a new project

```bash
sajicode build "I want a SaaS dashboard with user auth and Stripe billing"
```

### Initialize in an existing project

```bash
cd my-existing-project
sajicode init
sajicode build "Add a notification system with real-time updates"
```

### Resume an interrupted session

```bash
sajicode resume
```

### Roll back everything the team did

```bash
sajicode rollback
```

### Deploy your current project

```bash
sajicode deploy
```

### Run a security audit

```bash
sajicode audit
```

---

## All Commands

```
sajicode build [prompt]     Start the team on a task
sajicode init               Initialize a project in current directory
sajicode status             Show team status and active milestones
sajicode resume             Resume from last checkpoint
sajicode rollback           Atomically undo all session changes
sajicode deploy             Run Deploy Agent standalone
sajicode audit              Run Security Agent on current codebase
sajicode config             Set API keys, model, stack preferences
```

---

## Tech Stack

sajicode is built with TypeScript and LangGraph.js. The entire multi-agent team is modeled as a LangGraph state graph — every agent is a node, every decision is an edge, every action is checkpointed.

```
TypeScript 5.x          Core language
Node.js 22 / Bun        Runtime
LangGraph.js            Multi-agent state machine
Anthropic SDK           Claude as primary model
Commander.js            CLI framework
Ink + Chalk + Ora       Terminal UI
SQLite                  Session persistence & checkpointing
TypeScript Compiler API Completeness validation (AST analysis)
Tree-sitter             Dependency graph analysis
```

---

## Roadmap

- **v1.0** — CLI tool (current)
- **v1.1** — Support for GPT-4 and Gemini as model alternatives
- **v1.2** — GitHub Actions integration (agents run in CI)
- **v2.0** — Full Rust-based IDE with built-in browser, DevTools access, and visual Agent Graph view

---

## Contributing

sajicode is fully open source. We welcome contributions from the community — new agent types, tool integrations, bug fixes, and ideas.

```bash
git clone https://github.com/your-org/sajicode
cd sajicode
bun install
bun run dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT — see [LICENSE](./LICENSE)

---

<p align="center">
  Built with TypeScript + LangGraph.js<br/>
  <b>sajicode — Ship real software. Zero babysitting.</b>
</p>