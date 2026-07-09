<p align="center">
  <img src="./logo.svg" width="280" alt="SajiCode" />
</p>

<p align="center">
  <strong>The autonomous engineering organism.</strong><br/>
  A contract-first multi-agent team that plans, builds, tests, ships — and keeps running when you walk away.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sajicode"><img src="https://img.shields.io/npm/v/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="npm"></a>
  <a href="https://github.com/RaheesAhmed/SajiCode"><img src="https://img.shields.io/github/stars/RaheesAhmed/SajiCode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="stars"></a>
  <a href="https://github.com/RaheesAhmed/SajiCode/blob/main/LICENSE"><img src="https://img.shields.io/github/license/RaheesAhmed/SajiCode?style=flat&color=666666&labelColor=1a1a1a" alt="MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-43853d?style=flat&labelColor=1a1a1a" alt="Node"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-sajicode-is">What it is</a> ·
  <a href="#capabilities">Capabilities</a> ·
  <a href="#the-team">The team</a> ·
  <a href="#cli">CLI</a> ·
  <a href="#configuration">Config</a> ·
  <a href="#why-sajicode">Why SajiCode</a>
</p>

---

## Install

```bash
npm install -g sajicode
```

```bash
cd your-project
sajicode
```

Or without a global install:

```bash
npx sajicode
```

Describe a task. The team plans, contracts, builds in parallel, verifies, and updates project memory.

```text
Build a REST API for a task manager — Express, TypeScript, SQLite.
Add Zod validation, tests, security audit, Dockerfile, and CI.
```

Headless / CI:

```bash
sajicode build "Fix the failing auth tests and open a PR" --headless
sajicode fix-ci
```

Always-on:

```bash
sajicode daemon start
sajicode task add "Run standup and fix any red CI"
```

---

## What SajiCode is

SajiCode is **not** a chat wrapper around one model.

It is an **autonomous engineering system**: a PM orchestrator, specialist leads with enforced territories, durable memory, git-native safety, a 24/7 daemon, and a defensive Guardian swarm — running on **your** machine, models, and infrastructure.

```text
You  →  PM (research → plan → debate → decide)
           ↓  Phase 0 contracts (locked)
     Backend · Frontend · QA · Security · Deploy · …
           ↓  verify → ship → learn
     PROJECT.dna · skills · code graph · incident graph
```

| Layer | What it does |
|:--|:--|
| **Team** | PM + 17 specialists — parallel, contract-first, territory-guarded |
| **Memory** | `PROJECT.dna`, semantic memory, experience replay, skill promotion |
| **Context** | Tree-sitter code graph + PageRank retrieval (query structure, don't stuff tokens) |
| **Autonomy** | Daemon, heartbeat, durable task queue, sleep-time consolidation |
| **Safety** | Git revert per agent, pre-write scans, HITL, policy, audit log |
| **Defense** | Guardian Swarm — tiered SOC response + incident knowledge graph |
| **Interop** | MCP tools, A2A agent card, plugins, personas, WhatsApp |

Runs **local / air-gapped** (Ollama), cloud providers, CI, or serverless backends (Docker / Modal / Daytona).

---

## Capabilities

### Build like a real team

- Dependency-aware **task graph** — independent leads run in parallel
- **Phase 0 contracts** — APIs, types, and file ownership locked before code
- **Multi-file batch writes** with snapshot rollback
- **Verification ladder** — typecheck → tests → smoke → optional E2E
- **Research → debate → ADR** for architecture judgment calls
- **`fix-ci`** — pull the failed CI log and attempt a headless fix

### Remember and improve

- **`PROJECT.dna`** — architecture, decisions, unfinished work across sessions
- Three-layer memory + **semantic search**
- **Experience replay** — failures and wins injected into similar future work
- **Skill promotion** — lessons distilled into portable `SKILL.md` files
- Nightly **memory consolidation** via heartbeat

### Understand large codebases

- **Tree-sitter AST code graph** (TypeScript, JavaScript, Python, Go)
- PageRank-ranked retrieval into `.sajicode/codegraph.json`
- Optional prompt compression (config-gated)

### Stay safe

- Pre-write **secret / injection scans**
- Shell risk scoring + human-in-the-loop approvals
- PM blocked from writing implementation files
- Session branches + **`sajicode revert`** / **`undo`** / **`snapshots`**
- Usage & cost tracking from LangChain `usage_metadata`

### Run 24/7

```bash
sajicode daemon start              # serve + heartbeat + task queue
sajicode daemon status
sajicode daemon deploy --backend docker   # or modal | daytona
sajicode serve                     # HTTP + channels + A2A card
```

Heartbeat evaluates `.sajicode/HEARTBEAT.md` (CI, deps, unfinished work) without you prompting.

### Defend infrastructure

```bash
sajicode guardian scan
sajicode guardian incidents
```

Tiered response with consensus-gated containment. Security-officer persona available.

### Connect to the ecosystem

- **MCP** — attach databases, APIs, business tools (`.sajicode/mcp.json`)
- **A2A** — publish `/.well-known/agent.json`; other agents can call build / audit / guardian
- **Plugins & skills** — extend without forking
- **Personas** — SOUL.md-style identity; business MCP templates (Shopify / Stripe / Gmail)
- **WhatsApp** — send tasks from your phone

---

## The team

A **PM** coordinates specialists. Each lead owns a **territory** and is blocked from writing outside it.

| Agent | Owns | Focus |
|:--|:--|:--|
| **PM** | Plans only | Task graph, contracts, context, memory |
| **Backend Lead** | `src/api/`, `src/services/`, `src/db/` | REST, GraphQL, auth, databases |
| **Frontend Lead** | `src/components/`, `src/pages/`, `src/app/` | React, Next.js, design systems |
| **Full-Stack Lead** | `src/features/` | End-to-end feature slices |
| **Mobile Lead** | `app/`, `src/screens/` | React Native, Expo |
| **Data & AI Lead** | `src/ai/`, `src/ml/`, `*.py` | RAG, LangGraph, vector DBs |
| **Platform Lead** | `src/cli/`, `src/mcp/`, `packages/` | CLIs, MCP servers, SDKs |
| **Research Lead** | Read-only | Cited research, comparisons, ADRs |
| **QA Lead** | `tests/`, `*.test.ts` | Unit, integration, E2E |
| **Security Lead** | Whole codebase (audit) | OWASP, secrets, auth hardening |
| **Deploy Lead** | `Dockerfile`, `.github/`, `k8s/` | Docker, CI/CD, infra |
| **Review Agent** | Whole codebase (gate) | Completeness, types, architecture |

Plus domain specialists: Next.js, Python API, AI/RAG, MCP, 3D web, performance.

**Contract-first (medium/large tasks):**

1. Agents declare APIs, types, and files they will touch  
2. PM rejects file-write conflicts and **locks** the registry  
3. Leads implement in parallel against frozen contracts  

---

## CLI

No arguments → interactive REPL. Subcommands → CLI mode.

```bash
sajicode --help
sajicode --version
```

### Core

| Command | Description |
|:--|:--|
| `sajicode` | Interactive REPL |
| `sajicode build [prompt]` | One-shot team run |
| `sajicode init` | Initialize project context |
| `sajicode status` | Team status |
| `sajicode standup` | Daily briefing |
| `sajicode resume` | Resume from LangGraph checkpoint |
| `sajicode config` / `config-doctor` | Configure & validate |

### Safety

| Command | Description |
|:--|:--|
| `sajicode revert` | Revert session (or `--agent <name>`) |
| `sajicode undo [file]` | Restore from snapshot |
| `sajicode snapshots` | List snapshots |
| `sajicode audit` | Security agent pass |

### Autonomy & ops

| Command | Description |
|:--|:--|
| `sajicode daemon start\|stop\|status\|deploy\|install` | Always-on organism |
| `sajicode task add\|list\|cancel` | Durable task queue |
| `sajicode serve` | HTTP server + channels + A2A |
| `sajicode guardian scan\|incidents` | Defensive SOC |
| `sajicode fix-ci` | CI failure → headless fix |
| `sajicode eval` | Eval harness |
| `sajicode sbom` / `costs` | SBOM & usage costs |

### Extensibility

| Command | Description |
|:--|:--|
| `sajicode skill …` | List / new / add / lint skills |
| `sajicode mcp …` | Manage MCP servers |
| `sajicode plugin …` | Plugins |
| `sajicode persona …` | Personas & business MCP templates |

### REPL slash commands

`/init` · `/status` · `/help` · `/clear` · `/exit`

---

## Session flow

Every session starts the same way:

```text
session state → memory index → PROJECT.dna → standup → stack patterns
→ classify → plan → (Phase 0 contracts) → parallel dispatch → verify → update DNA
```

Git isolation is automatic: session branch, before-tag, per-agent commits. One command reverts everything — or one agent.

---

## Configuration

Project settings live in `.sajicode/config.json`.

### Providers

```bash
sajicode -p anthropic -m claude-sonnet-4-6
sajicode -p openai -m gpt-4.1
sajicode -p google -m gemini-2.5-flash
sajicode -p ollama -m llama3.1:70b        # local / air-gapped
sajicode -p openrouter -m anthropic/claude-sonnet-4
```

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
TAVILY_API_KEY=...          # optional web search
```

### Human-in-the-loop

```json
{
  "humanInTheLoop": {
    "enabled": true,
    "tools": {
      "execute": { "allowedDecisions": ["approve", "edit", "reject"] }
    },
    "allowedCommands": ["npm run", "node ", "npx tsc"]
  }
}
```

### Useful keys

| Key | Purpose |
|:--|:--|
| `modelConfig` | Provider, model, routing tiers |
| `riskTolerance` | `low` / `medium` / `high` shell strictness |
| `budget` | Per-session cost cap |
| `compression` | Prompt compression |
| `a2a` / `guardian` | Interop & SOC settings |
| `asyncSubagents` | Background lead dispatch |

Validate anytime:

```bash
sajicode config-doctor
```

---

## Project layout

After init / first session:

```text
your-project/
├── SAJICODE.md                 # generated project context
├── PROJECT.dna                 # persistent team brain
├── HEARTBEAT.md                # daemon checklist (optional)
└── .sajicode/
    ├── config.json
    ├── mcp.json
    ├── persona.md
    ├── codegraph.json          # tree-sitter knowledge graph
    ├── contracts.json
    ├── patterns.json
    ├── experiences.json
    ├── checkpoints.db          # durable LangGraph state
    ├── snapshots/
    └── transcripts/
```

---

## Skills & plugins

23+ bundled skills (Agent Skills standard) — loaded on demand:

`nodejs` · `nextjs` · `frontend-design` · `database` · `api-architect` · `testing` · `security` · `devops` · `ai-engineer` · `mobile-app` · `mcp-server` · …

```bash
sajicode skill list
sajicode skill new my-domain
sajicode plugin search
```

---

## Why SajiCode

| | Typical coding agent | SajiCode |
|:--|:--|:--|
| Shape | One agent loop | **Contract-first parallel team** |
| Memory | Resets each chat | **DNA + skills + semantic + consolidation** |
| Mistakes | Hard to undo | **Git revert per agent / session** |
| Big repos | Stuff more context | **Code graph + ranked retrieval** |
| Always-on | Only when you type | **Daemon + heartbeat + task queue** |
| Defense | — | **Guardian Swarm** |
| Interop | Closed or MCP-only | **MCP + A2A + plugins** |
| Where it runs | Vendor cloud | **Your machine, CI, serverless, air-gapped** |

MIT-licensed. npm-published. Built to be the **harness** — not another chatbot.

Full feature & tool reference: [`SajiCode_features.md`](./SajiCode_features.md).

---

## Develop

```bash
git clone https://github.com/RaheesAhmed/SajiCode.git
cd SajiCode
npm install
npm run build
npm test
node dist/index.js
```

```text
src/
├── agents/      # PM, leads, task graph, guardrails, debate
├── a2a/         # Agent-to-Agent server + client
├── guardian/    # SOC swarm & incidents
├── daemon/      # heartbeat, deploy backends, service install
├── context/     # tree-sitter code graph, compression
├── persona/     # identity packs
├── tasks/       # durable queue
├── memory/      # DNA, semantic memory, consolidation
├── tools/       # contracts, git session, verification, browser
├── channels/    # terminal, WhatsApp
├── cli/         # Commander CLI + renderer
└── server/      # HTTP serve + A2A mount
```

| Script | Action |
|:--|:--|
| `npm run build` | Compile → `dist/` |
| `npm run dev` | Run from source |
| `npm test` | Vitest |
| `npm run eval` | Eval harness |

---

## License

[LICENSE](/LICENSE) MIT ©  [Rahees Ahmed](https://github.com/RaheesAhmed)

<p align="center">
  <a href="https://www.npmjs.com/package/sajicode">npm</a> ·
  <a href="https://github.com/RaheesAhmed/SajiCode/issues">Issues</a> ·
  <a href="https://github.com/RaheesAhmed/SajiCode/discussions">Discussions</a>
</p>
