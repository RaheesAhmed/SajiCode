<p align="center">
  <img src="./logo.svg" width="280" alt="SajiCode" />
</p>

<h2 align="center">The AI Engineering Team in Your Terminal</h2>

<p align="center">
  17 specialist agents. Persistent project memory. Git-native safety. Contract-first parallel builds.
  <br/>
  Not a coding assistant — a full engineering team that builds, reviews, tests, and deploys.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sajicode">
    <img src="https://img.shields.io/npm/v/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="npm version">
  </a>
  <a href="https://github.com/RaheesAhmed/SajiCode">
    <img src="https://img.shields.io/github/stars/RaheesAhmed/SajiCode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="GitHub stars">
  </a>
  <a href="https://github.com/RaheesAhmed/SajiCode/forks">
    <img src="https://img.shields.io/github/forks/RaheesAhmed/SajiCode?style=flat&color=666666&labelColor=1a1a1a" alt="GitHub forks">
  </a>
  <a href="https://github.com/RaheesAhmed/SajiCode/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/RaheesAhmed/SajiCode?style=flat&color=666666&labelColor=1a1a1a" alt="License">
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node-%3E%3D18-43853d?style=flat&labelColor=1a1a1a" alt="Node >= 18">
  </a>
</p>

<p align="center">
  <a href="#what-is-sajicode">What is it?</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#the-team">The Team</a> ·
  <a href="#core-features">Features</a> ·
  <a href="#project-dna">Project DNA</a> ·
  <a href="#git-native-safety">Git Safety</a> ·
  <a href="#contract-first-protocol">Contracts</a> ·
  <a href="#security">Security</a> ·
  <a href="#memory">Memory</a> ·
  <a href="#whatsapp-channel">WhatsApp</a> ·
  <a href="#mcp-integration">MCP</a> ·
  <a href="#configuration">Config</a>
</p>

---

## What Is SajiCode?

SajiCode is a **multi-agent coding system** that builds software the way a real engineering team does — with a PM that plans, specialists that build in parallel, a security engineer that reviews, and a QA lead that tests.

```
You describe what to build → SajiCode plans it → 17 specialists execute in parallel → you get working software
```

It is not a chatbot wrapper. It is not a single-agent loop. It is a **team**:

- A **PM Agent** that plans, creates architecture docs, manages contracts, and coordinates
- **10 specialist lead agents** that own their domains and build directly
- A **persistent memory system** that means the agents know your project next session too
- A **git-native safety layer** that lets you revert any agent's changes in one command
- A **contract-first protocol** that prevents conflicts when multiple agents build in parallel

> The agents remember where you left off. Even if you come back months later.

---

## Quick Start

### Install

```bash
npm install -g sajicode
```

Or run without installing:

```bash
npx sajicode
```

### Use It

```bash
cd your-project
sajicode
```

Then just describe what you want:

```
Build a REST API for a todo app with Express, TypeScript, and Prisma.
Add authentication with JWT. Write tests. Create a Dockerfile.
```

SajiCode will:
1. Read your project and generate a `SAJICODE.md` context file
2. Read `PROJECT.dna` to recall all previous decisions and unfinished work
3. Run a daily standup briefing (recent commits, outdated deps, TODOs)
4. Plan the work and assign agents via a dependency graph
5. Run Phase 0 — agents agree on contracts before touching any code
6. Build in parallel across the team, each agent committing their own work
7. Validate TypeScript, run security scans, review the output
8. Update `PROJECT.dna` with what was built and what's unfinished

---

## The Team

SajiCode runs **10 specialist lead agents** under a PM coordinator.

| Agent | Owns | Handles |
|:--|:--|:--|
| **PM Agent** | Planning only — no code | Plans, contracts, task graph, context, memory |
| **Backend Lead** | `src/api/`, `src/routes/`, `src/db/`, `src/services/` | REST, GraphQL, auth, databases, LLM integrations |
| **Frontend Lead** | `src/components/`, `src/pages/`, `src/styles/` | React, Next.js, Vue, CSS, animations, design systems |
| **Full-Stack Lead** | `src/features/`, `src/app/` | End-to-end feature slices (API + UI together) |
| **Mobile Lead** | `app/`, `src/screens/` | React Native, Expo, Expo Router |
| **Data & AI Lead** | `src/ai/`, `src/ml/`, `src/pipelines/` | LLM integrations, RAG, LangGraph, vector DBs |
| **Platform Lead** | `src/sdk/`, `src/cli/`, `src/mcp/` | MCP servers, CLIs, npm packages, developer tooling |
| **QA Lead** | `tests/`, `*.test.ts`, `cypress/` | Unit, integration, E2E tests |
| **Security Lead** | Whole codebase (read-only audit) | OWASP Top 10, secrets detection, auth hardening |
| **Deploy Lead** | `Dockerfile`, `.github/`, `k8s/` | Docker, GitHub Actions, Kubernetes, Terraform |
| **Review Agent** | Whole codebase (final gate) | Completeness, types, architecture, dead code |

Each lead agent owns a **territory** — a set of directories it is responsible for. Agents do not write outside their territory without PM approval.

---

## Core Features

### Parallel Task Graph

SajiCode builds a dependency-aware task graph before any agent writes a line.

```
Backend API ──┐
              ├──► QA Tests ──► Review ──► Deploy
Frontend UI ──┘
```

Agents that have no dependencies start immediately. Dependent agents wait for their inputs. This cuts wall-clock time dramatically on medium and large projects.

### Multi-File Batch Writing

Every lead agent defaults to `apply_file_batch` — writing all files for a layer in a single operation.

- snapshots every file before changing it
- rolls back the entire batch if any write fails
- validates each file (TypeScript, Python, JSON) before committing
- runs security scans on every file before it hits disk
- emits progress events to the UI

A 10-file feature takes **2–3 batch calls**, not 10 individual writes.

### Error Recovery

When something fails, SajiCode classifies the error and recommends the next move:

- `retry` — apply a specific fix and retry
- `delegate` — hand off to a different agent
- `decompose` — break the failing task into smaller parts
- `escalate` — ask the user for guidance

Error patterns recognized include missing imports, CommonJS/ESM mismatches, TypeScript errors, permission errors, timeouts, and invalid tool arguments.

### Pattern Library

Before any agent writes code, it loads a pattern library filtered to the project's tech stack.

**20+ static patterns are built in**, covering known pitfalls for:

| Stack | Patterns |
|:--|:--|
| Prisma | Nullish coalescing in where clauses, `$transaction` for multi-table writes |
| React Query v5 | `onSuccess`/`onError` removed — use `useEffect` or `mutation.isSuccess` |
| Next.js App Router | Server components can't use hooks; metadata export location |
| FastAPI / Pydantic v2 | `from __future__ import annotations` must be first line |
| Stripe | Always verify webhook signatures; idempotency keys |
| JWT | Secrets must be ≥ 256 bits |
| CORS | Never use wildcard `*` in production |
| bcrypt | Cost factor ≥ 12 in production |
| Express | Validate `req.body` before processing |
| PostgreSQL | Always use parameterized queries |
| Docker | Multi-stage builds for production images |

Agents can also **record new patterns** learned during a session. These dynamic patterns persist in `.sajicode/patterns.json` and are injected into future sessions.

### Whole-Repo Context Loader

For complex tasks, the PM can load the **entire repository** into context in one shot — up to 150,000 characters, priority-sorted:

1. Key config files (`package.json`, `tsconfig.json`, `Dockerfile`, etc.)
2. Files matching the task focus path
3. TypeScript/JavaScript/Python source files
4. Everything else

Individual files are truncated at 8,000 characters with a note. This eliminates the need for agents to read files one by one before planning.

---

## Project DNA

`PROJECT.dna` is a persistent intelligence file that lives at your project root. It is the team's shared brain — read at every session start, updated at every session end.

```
## Overview
What this project does.

## Tech Stack
Languages, frameworks, libraries.

## Architecture
Layers, modules, data flow.

## Conventions
Naming rules, file structure, style decisions.

## Key Decisions
Architecture decisions and their rationale.

## Patterns Learned
Pitfalls discovered during development.

## Known Issues
Active bugs and blockers.

## Unfinished Work
What wasn't finished last session — picked up next session automatically.

## User Preferences
How you like things done.

## Session History
One-liner per session.
```

The PM reads `PROJECT.dna` at the start of every session and resumes from the last unfinished phase if one exists. You never need to re-explain the project.

---

## Session Start Protocol

Every session begins with a fixed ritual:

```
1. read_session_state      → check for resumable in-progress work
2. read_memory_index       → load compact knowledge pointers
3. read_project_dna        → load the full project brain
4. generate_standup        → daily briefing (see below)
5. get_patterns(techStack) → inject stack-specific pitfall awareness
```

### Daily Standup

Before any work starts, SajiCode generates a standup briefing:

```
═══════════════════════════════════════
 SAJICODE DAILY BRIEFING
═══════════════════════════════════════

📅 Last 7 days: 12 commits
  a3f92b1 feat(auth): add JWT refresh token rotation
  b81cc24 fix(api): handle null user in session middleware
  ...

📂 Working tree: 3 files changed

🔧 Last session: building — implementing auth middleware

📋 Unfinished work:
  - Rate limiting middleware not yet wired to routes
  - Redis session store config missing from .env.example

⬆️  Outdated packages:
  next 14.2.3 → 15.1.0 [MAJOR]
  prisma 5.8.0 → 5.14.1

📝 TODOs in codebase: 7

💡 Suggested next steps:
  1. Resume from last session — wire rate limiting to routes
  2. Update 2 major-version packages before the next release
  3. Address 7 TODO/FIXME comments in the codebase
═══════════════════════════════════════
```

Run it manually:

```bash
sajicode standup
```

---

## Git-Native Safety

Every `sajicode` session creates a **git isolation layer** automatically.

When `sajicode` starts:

1. Creates a branch: `sajicode/session-20260611-143022`
2. Tags the current state: `sajicode-before-20260611-143022`
3. Each agent commits its own work: `feat(backend-lead): add auth middleware`
4. If anything goes wrong — revert everything in one command

### Revert Commands

```bash
# Revert the entire session — back to before sajicode touched anything
sajicode revert

# Revert only what one agent did
sajicode revert --agent backend-lead

# Revert a specific past session
sajicode revert --session 20260610-091500
```

Agents can also commit mid-task using the `session_commit` tool, creating a granular audit trail:

```
feat(backend-lead): scaffold Express server with TypeScript
feat(backend-lead): add Prisma schema and user model
feat(frontend-lead): create auth forms with React Hook Form
feat(qa-lead): add auth integration tests
```

---

## Contract-First Protocol

For medium and large tasks with 3+ agents, SajiCode runs a **Phase 0** before anyone writes code.

**Phase 0 — All agents declare boundaries:**

Each agent submits a contract:
- APIs it exposes
- Types it exports
- Files it will write (no two agents can own the same file)
- Environment variables it needs
- What it depends on from other agents

The PM checks for **file-write conflicts** and rejects the plan if two agents claim the same file.

Once all contracts pass, the PM calls `finalize_contracts`. The registry is **locked**. Phase 1 begins.

**Phase 1 — Implement against frozen contracts:**

Each agent reads its contract to see which peer APIs and types it can depend on. Agents build in parallel without coordination — the contract already resolved all conflicts.

This eliminates the most common failure mode in multi-agent coding: two agents overwriting the same file.

---

## Security

### Pre-Write Security Scan

**Every file write is scanned before it reaches disk.** If a file contains any of the following, the write is **blocked**:

| Pattern | Example |
|:--|:--|
| Anthropic / OpenAI API key | `sk-ant-...`, `sk-...` |
| AWS access key | `AKIA...` |
| GitHub personal access token | `ghp_...` |
| Private key header | `-----BEGIN PRIVATE KEY-----` |
| Hardcoded password literal | `password = "hunter2"` |

These patterns produce **warnings** (write proceeds but flags):

| Pattern | Risk |
|:--|:--|
| `eval()` in JS/TS | Code injection |
| `exec()` in Python (non-subprocess) | Code injection |
| SQL string concatenation | SQL injection |
| `fetch("http://...")` (non-localhost) | MITM risk |

### Shell Safety

All shell commands are checked before execution:

- destructive deletion (`rm -rf /`, `rmdir /s`)
- dangerous `chmod`/`chown` on system paths
- suspicious network exfiltration
- shell chaining with semicolons to bypass checks
- repeated risky commands within the same session

### PM Guardrails

The PM agent is hard-blocked from writing implementation files. It can only write:

- `Plan.md`, `Architecture.md`, `active_context.md`
- `PROJECT.dna` updates
- `.sajicode/` coordination files

Every `.ts`, `.js`, `.html`, `.css`, `.json`, `.yml`, `Dockerfile`, and config file must be written by a lead agent via `task()`.

### Human Approval Mode

Turn on human-in-the-loop for any tool:

```json
{
  "humanInTheLoop": {
    "enabled": true,
    "tools": {
      "execute": {
        "allowedDecisions": ["approve", "edit", "reject"]
      }
    },
    "allowedCommands": ["npm run", "node ", "mkdir", "npx tsc"]
  }
}
```

When enabled, SajiCode pauses before running commands and shows the exact command for your approval. You can approve, reject, or edit the arguments.

### File Snapshots and Undo

Every file is snapshotted before it is modified. Snapshots live in `.sajicode/snapshots/`.

```bash
sajicode undo src/api/auth.ts   # restore from latest snapshot
sajicode snapshots              # list recent snapshots
```

---

## Memory

SajiCode uses a **three-layer memory system** so agents do not start from zero.

### Layer 1 — Pointer Index

Compact topic summaries (≤ 150 chars each) loaded at every session start. Used to know what detailed knowledge exists without loading all of it.

### Layer 2 — Topic Files

Detailed knowledge per topic, loaded on demand. Examples: architecture decisions, API designs, database schemas, patterns learned.

### Layer 3 — Transcript Search

Raw session history. Searchable by keyword, agent, or date. Never fully loaded — queried only when relevant.

### Experience Replay

Agents record lessons from failures and successes:

- `failure` — package quirks, build errors, module-system mistakes
- `success` — patterns that worked, correct configurations, fast approaches

Before starting similar work in a new session, agents query past experiences.

### Memory Layout

```
.sajicode/
├── config.json
├── PROJECT.dna           ← persistent project brain
├── active_context.md     ← current session context
├── Plan.md               ← current task plan
├── Architecture.md       ← current architecture
├── Whats_done.md         ← progress tracker
├── contracts.json        ← Phase 0 contracts registry
├── patterns.json         ← learned patterns
├── session-state.json    ← resumable session state
├── process-state.json    ← command cache (TTL-based)
├── current-session.txt   ← current git session ID
├── experiences.json      ← experience journal (500 entries)
├── memories/             ← per-agent memory files
├── transcripts/          ← session transcripts
└── snapshots/            ← file snapshots before edits
```


### Built-In Commands

| Command | What it does |
|:--|:--|
| `/init` | Scan project → generate `SAJICODE.md` and `PROJECT.dna` |
| `/status` | Show model, thread, context, and approval status |
| `/help` | Show command list |
| `/clear` | Clear the terminal |
| `/exit` | Exit SajiCode |

### CLI Commands

```bash
sajicode                   # launch interactive TUI
sajicode standup           # print daily briefing and exit
sajicode revert            # revert current session
sajicode revert --agent backend-lead   # revert one agent
sajicode undo src/file.ts  # restore a file from snapshot
sajicode snapshots         # list recent snapshots
sajicode audit             # run security agent on codebase
sajicode init              # initialize in current directory
```

### Headless / CI Mode

```bash
sajicode build "Run a security audit and fix critical issues" --headless
```

Useful for CI pipelines, automated reviews, scheduled audits, and batch tasks.

---

## WhatsApp Channel

Send coding tasks from your phone while away from your desk.

```bash
sajicode --channels whatsapp
```

Scan the QR code that appears in your terminal from WhatsApp:

```
WhatsApp → Settings → Linked Devices → Link a Device
```

How it works:

```
Phone → WhatsApp → SajiCode channel router → Agent team → WhatsApp reply
```

- No browser automation, no Selenium, no extra API key
- Uses `@whiskeysockets/baileys` directly
- Reconnects automatically
- Long replies are split into WhatsApp-safe chunks
- Terminal and WhatsApp run side-by-side

| Mode | Use case |
|:--|:--|
| `admin` | You send project tasks from your phone |
| `personal` | SajiCode replies to your contacts in your writing style |

```json
{
  "whatsapp": {
    "enabled": true,
    "mode": "admin"
  }
}
```

---

## MCP Integration

SajiCode supports the Model Context Protocol. Agents can use any MCP-compatible tool or data source.

Create `.sajicode/mcp.json`:

```json
{
  "mcpServers": {
    "code-context": {
      "command": "npx",
      "args": ["-y", "@anthropic/code-context-server", "{{projectPath}}"],
      "transport": "stdio"
    },
    "database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "./data/app.db"],
      "transport": "stdio"
    }
  }
}
```

`{{projectPath}}` is replaced with the current project path automatically.

Common uses: database access, repo intelligence, design tools, documentation search, internal APIs, custom business tools.

---

## Configuration

Project settings live in `.sajicode/config.json`.

### Model Providers

```bash
# Anthropic
sajicode -p anthropic -m claude-sonnet-4-6

# OpenAI
sajicode -p openai -m gpt-4.1

# Google
sajicode -p google -m gemini-2.5-flash

# Ollama (local)
sajicode -p ollama -m llama3.1:70b

# OpenRouter
sajicode -p openrouter -m anthropic/claude-sonnet-4
```

### API Keys

```bash
ANTHROPIC_API_KEY="..."
OPENAI_API_KEY="..."
GOOGLE_API_KEY="..."
TAVILY_API_KEY="..."   # optional — enables web search
```

### Risk Tolerance

```json
{
  "riskTolerance": "low"
}
```

| Level | Behavior |
|:--|:--|
| `low` | Warns on most risky shell commands |
| `medium` | Allows common dev commands without prompting |
| `high` | Minimal restrictions |

---

## Expert Skills

Agents load specialized skill files for domain-specific work. Skills are markdown documents containing patterns, anti-patterns, and best practices for a technology area.

Built-in skills include:

| Skill | Used by |
|:--|:--|
| `ai-engineer` | LLMs, RAG, agents, cost optimization |
| `nodejs` | Express, Fastify, Hono APIs |
| `database` | Prisma, Drizzle, MongoDB, SQL |
| `api-architect` | REST, GraphQL design |
| `frontend-design` | React component architecture |
| `nextjs` | App Router, SSR, routing |
| `shadcn-ui` | shadcn/ui component patterns |
| `testing` | Unit, integration, E2E patterns |
| `security` | OWASP, secrets, auth hardening |
| `devops` | Docker, GitHub Actions, k8s |
| `mobile-app` | React Native, Expo Router |
| `mcp-server` | MCP tool server patterns |
| `python-engineer` | Python services and data |
| `performance-optimizer` | Bundle size, rendering, DB queries |

Agents load only the skills they need for the current task — no context bloat.

---

## For Developers

Clone and build:

```bash
git clone https://github.com/RaheesAhmed/SajiCode.git
cd SajiCode
npm install
npm run build
node dist/index.js
```

Run from source:

```bash
npm run dev
```

### Project Structure

```
src/
├── agents/          # PM, leads, task graph, recovery, context guard
│   ├── agent-factory.ts   # 10 agent presets + factory
│   ├── context-guard.ts   # file cache + pre-write security scan
│   ├── judgment.ts        # PM and lead guardrail middleware
│   └── task-graph.ts      # DAG task planning
├── cache/           # intelligent TTL cache with file-watch invalidation
├── channels/        # terminal, WhatsApp, channel router
├── cli/
│   ├── renderer.ts  # streaming output renderer (1100 lines)
│   ├── ink-app.tsx  # React/Ink TUI component
│   └── ui-bus.ts    # EventEmitter bridge for Ink
├── config/          # project config loading
├── llms/            # model provider adapters
├── mcp/             # MCP client manager
├── memory/
│   ├── project-dna.ts       # PROJECT.dna read/write/update
│   ├── pattern-library.ts   # 20+ static patterns + dynamic library
│   ├── experience-replay.ts # 500-entry experience journal
│   ├── session-state.ts     # resumable session state
│   └── three-layer-memory.ts
├── prompts/         # PM and specialist prompts
├── tools/
│   ├── git-session.ts      # session branch + revert tools
│   ├── contract-tools.ts   # Phase 0 contract protocol
│   ├── validation-tools.ts # per-file syntax + security scan
│   ├── standup.ts          # daily briefing generator
│   ├── repo-loader.ts      # whole-repo context loader (150k chars)
│   ├── multi-file-editor.ts
│   ├── git-tools.ts
│   ├── shell-wrapper.ts    # SafeShellBackend with risk scoring
│   └── intelligence-tools.ts
├── types/
└── utils/
```

### Scripts

| Script | What it does |
|:--|:--|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run dev` | Run from source via `tsx` |
| `npm start` | Run compiled `dist/index.js` |
| `npm test` | Build + run tests |
| `npm run version:patch` | Bump patch, push commit + tag |
| `npm run version:minor` | Bump minor, push commit + tag |

---

## Roadmap

- [ ] Direct agent-to-agent message bus (skip PM for simple handoffs)
- [ ] Semantic memory search across project history
- [ ] Web-based progress dashboard
- [ ] VS Code extension
- [ ] More channel integrations (Telegram, Slack, email)
- [ ] Architecture diagram generation
- [ ] Automated test generation from existing code

---

## License

MIT

---

<p align="center">
  Built by <a href="https://github.com/RaheesAhmed">Rahees Ahmed</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/RaheesAhmed/SajiCode/issues">Report an issue</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/RaheesAhmed/SajiCode/discussions">Discussions</a>
</p>
