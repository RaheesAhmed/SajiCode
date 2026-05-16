<p align="center">
  <img src="./logo.svg" width="280" alt="SajiCode" />
</p>

<h3 align="center">The AI engineering team in your terminal.</h3>

<p align="center">
  17 specialized agents · 21 expert skills · 3-layer memory · 23 security checks<br/>
  Builds production software, not prototypes.
</p>

<p align="center">
  <a href="https://github.com/raheesahmed/sajicode/stargazers">
    <img src="https://img.shields.io/github/stars/raheesahmed/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="Stars">
  </a>
  <a href="https://github.com/raheesahmed/sajicode/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/raheesahmed/sajicode?style=flat&color=666666&labelColor=1a1a1a" alt="License">
  </a>
  <a href="https://www.npmjs.com/package/sajicode">
    <img src="https://img.shields.io/npm/v/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="npm">
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node-%3E%3D18-1a1a1a?style=flat&color=43853d" alt="Node">
  </a>
</p>

<p align="center">
  <a href="#why-sajicode">Why</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#whatsapp-integration">WhatsApp</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#features">Features</a> ·
  <a href="#three-layer-memory">Memory</a> ·
  <a href="#security">Security</a> ·
  <a href="#model-support">Models</a> ·
  <a href="#mcp-integration">MCP</a> ·
  <a href="#contributing">Contributing</a>
</p>

<br/>

<p align="center">
  <a href="https://www.youtube.com/watch?v=nMtQVvzALiI">
    <img src="https://img.youtube.com/vi/nMtQVvzALiI/maxresdefault.jpg" width="640" alt="SajiCode Demo">
  </a>
</p>

---

## Why SajiCode?

Every AI coding assistant today uses a **single agent** for everything. This falls apart at scale:

| Problem | Result |
|:---|:---|
| No specialization | The same model writes code, tests, and security reviews — equally badly |
| Context loss | Large changes make the model forget what it just built |
| Placeholder code | `// TODO: implement later` ships to production |
| No autonomy | You become the project manager of your AI assistant |

**SajiCode** replaces the single agent with a **distributed team of 17 specialists** — exactly how real engineering teams are structured.

- **PM plans**, backend builds APIs, frontend builds UI — in parallel
- QA writes tests and security scans vulnerabilities — after every build
- A 3-layer judgment middleware **blocks placeholder code** before it reaches disk
- Each agent owns a **territory** — backend cannot touch frontend files and vice versa

---

## Quickstart

```bash
# Install globally
npm install -g sajicode

# Or run without installing
npx sajicode
```

```bash
# Local model — no API key needed
sajicode -p ollama -m llama3.1:70b

# Cloud providers
sajicode -p openai    -m gpt-4.1
sajicode -p google    -m gemini-2.5-flash
sajicode -p anthropic -m claude-sonnet-4-20250514

# Headless mode for CI/CD
sajicode build "Fix the login bug and write tests" --headless
```

### Environment Variables

```bash
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="..."           # or GEMINI_API_KEY
export ANTHROPIC_API_KEY="sk-ant-..."
export TAVILY_API_KEY="tvly-..."      # optional — enables web search
```

---

## WhatsApp Integration

Send coding tasks from your phone. SajiCode connects directly to WhatsApp via WebSocket — no third-party service, no extra API key.

```bash
sajicode --channels whatsapp
```

On first run, a QR code appears in your terminal. Scan it with WhatsApp → **Settings → Linked Devices → Link a Device**. Auth is saved to `~/.sajicode/whatsapp-auth/` and persists across all projects.

```
Phone (WhatsApp) → Baileys WebSocket → Channel Adapter → Agent Core → WhatsApp Reply
```

**Details:**
- Uses [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) — pure WebSocket, no browser, no Selenium
- Auto-reconnects on disconnect
- Responses are chunked to respect WhatsApp's 4096-character limit
- Terminal and WhatsApp run side-by-side

### Two Modes

| Mode | Who uses it | Behavior |
|:---|:---|:---|
| **Admin** (default) | You, the developer | Your messages trigger coding tasks |
| **Personal Bot** | Your contacts | AI replies to incoming messages in your style |

Configure in `.sajicode/config.json`:

```json
// Admin Mode — send tasks from your phone
{
  "whatsapp": { "enabled": true, "mode": "admin" }
}

// Personal Bot Mode — AI replies as you
{
  "whatsapp": {
    "enabled": true,
    "mode": "personal",
    "personalBotPrompt": "Reply like Rahees — direct, friendly, use emojis sometimes."
  }
}
```

> **Coming soon:** Discord and Telegram via the same adapter pattern.

---

## How It Works

**1 — Describe what to build**

```
>_ build a fullstack task manager with Express, SQLite, and a React dashboard
```

**2 — PM Agent architects the solution**

Scans your codebase with `collect_repo_map`, produces `architecture.md` with system diagrams, API tables, and file ownership — then presents the plan before any code is written.

**3 — Parallel delegation to specialists**

```
PM Agent
  ├─▶ Backend Lead   → "Build Express REST API in src/routes/, src/models/"
  ├─▶ Frontend Lead  → "Build React dashboard in src/components/, src/pages/"
  ├─▶ QA Lead        → "Write tests for all endpoints and components"
  ├─▶ Security Lead  → "Audit for XSS, injection, hardcoded secrets"
  └─▶ Review Agent   → "Final quality gate — no TODOs, no broken imports"
```

**4 — Leads delegate further**

Backend Lead spawns `api-builder` and `db-designer` concurrently. Frontend Lead spawns `component-builder` and `style-designer`. Every layer runs in parallel.

**5 — Production-ready output**

Every file passes through judgment middleware (placeholder code blocked), QA testing, security audit, and final review before the task closes.

---

## Architecture

```
                      ┌──────────────┐
                      │   PM Agent   │
                      └──────┬───────┘
                             │
          ┌────────┬─────────┼─────────┬────────┐
          │        │         │         │        │
     ┌────▼────┐┌──▼────┐┌───▼────┐┌───▼────┐┌──▼────┐
     │ Backend ││ Front ││   QA   ││  Sec.  ││Deploy │
     │  Lead   ││  Lead ││  Lead  ││  Lead  ││  Lead │
     └────┬────┘└───┬───┘└────┬───┘└───┬────┘└───┬───┘
          │         │         │        │         │
       api  db   comp style  unit integ vuln  dep  docker ci
       bldr dsgn  bldr dsgn  tstr tstr scan  aud   spec spec
```

**1 PM + 6 Leads + 10 Sub-agents = 17 agents total**

Each agent has owned directories it can write, forbidden paths it must never touch, persistent memory across sessions, and access to 21 expert skill files.

### The Team

| Agent | Sub-Agents | Territory | Role |
|:---|:---|:---|:---|
| **PM Agent** | All Leads | Orchestration | Architecture, delegation, output validation |
| **Backend Lead** | `api-builder`, `db-designer` | `src/routes/`, `src/models/`, `src/services/` | APIs, database, auth, server logic |
| **Frontend Lead** | `component-builder`, `style-designer` | `src/components/`, `src/pages/`, `public/` | UI, responsive design, animations |
| **QA Lead** | `unit-tester`, `integration-tester` | `tests/`, `__tests__/` | Coverage, TDD, edge cases |
| **Security Lead** | `vuln-scanner`, `dep-auditor` | Security policies | OWASP scanning, dependency audit |
| **Deploy Lead** | `docker-specialist`, `ci-specialist` | `Dockerfile`, `.github/` | Docker, CI/CD, hosting |
| **Review Agent** | — | Read-only | Final gate — no TODOs or stubs allowed |

---

## Features

### Judgment Middleware — Zero Placeholder Code

A 3-layer protection system wraps every tool call:

1. **Risk assessment** — warns on destructive operations (`rm -rf`, `DROP TABLE`) and sensitive paths (`.env`, `credentials`)
2. **Placeholder blocking** — blocks `write_file` if content contains `TODO`, `FIXME`, empty function bodies, or stub implementations. Agents must write real code or fail
3. **Loop detection** — breaks infinite loops when an agent calls the same tool identically 3+ times

### 23-Check Security System

Three gates on every shell command before execution:

**Gate 1 — Pattern Detection** (23 regex checks)
- Destructive: `rm -rf`, `mkfs`, `truncate`, `shred`, partition tools
- Exfiltration: `curl POST`, `wget POST`, `nc -l`, SSH tunnels
- Privilege: `sudo`, `chmod +s`, `chown root`
- System: `crontab`, `systemctl`, `iptables`, `/etc/hosts`
- Execution: `eval`, download-pipe patterns, base64 decode

**Gate 2 — Context Analysis**
- Command chaining (`&&`, `||`, `;`) and piping
- Working directory (sensitive path detection)
- Recent command history (repeated dangerous patterns)

**Gate 3 — Risk Scoring** (0–100)

| Score | Action |
|:---|:---|
| 0–40 | Auto-approved |
| 41–60 | Logged, allowed |
| 61–80 | Requires HITL approval |
| 81–100 | Blocked immediately |

```bash
npm install express          # ✅ Auto-approved (score: 12)
rm -rf node_modules          # ⚠️  Logged but allowed (score: 55)
rm -rf / --no-preserve-root  # 🛑 Blocked (score: 98)
```

See [`SECURITY_CHECKS.md`](./SECURITY_CHECKS.md) for all 23 checks.

### Human-in-the-Loop (HITL)

Optional approval system for shell commands and file deletions:

```json
{
  "humanInTheLoop": {
    "enabled": true,
    "tools": {
      "execute":     { "allowedDecisions": ["approve", "edit", "reject"] },
      "delete_file": { "allowedDecisions": ["approve", "reject"] }
    },
    "allowedCommands": ["npm install", "npm run", "mkdir", "node "]
  }
}
```

Safe commands are auto-approved. Everything else requires explicit confirmation.

### Three-Layer Memory System

Intelligent memory architecture with **70% token reduction** compared to naive full-context loading:

```
.sajicode/
├── config.json            # Model, HITL, and risk settings
├── architecture.md        # Current project architecture plan
├── whats_done.md          # Shared team log — append-only
├── memories/
│   ├── pointer-index.txt  # Layer 1: Always loaded (150-char summaries)
│   ├── topics/            # Layer 2: On-demand detailed knowledge
│   │   ├── api-design.md
│   │   ├── database-schema.md
│   │   └── frontend-patterns.md
│   └── transcripts/       # Layer 3: Search-only raw history
│       └── 2026-04-23.log
├── agents/                # Per-agent structured JSON memory
│   ├── backend-lead.json
│   └── frontend-lead.json
└── mcp.json       # MCP server configurations
```

| Layer | What | When Loaded |
|:---|:---|:---|
| **Layer 1** — Pointer Index | 150-char topic summaries | Always |
| **Layer 2** — Topic Files | Full knowledge per topic | On-demand via `read_topic()` |
| **Layer 3** — Transcripts | Raw conversation history | Search-only via `search_transcripts()` |

See [`MEMORY_SYSTEM.md`](./MEMORY_SYSTEM.md) for complete documentation.

### Multi-Provider LLM Support

| Provider | Flag | Models |
|:---|:---|:---|
| Ollama (local) | `-p ollama` | `llama3.1:70b`, `deepseek-v3.1:671b-cloud` |
| OpenAI | `-p openai` | `gpt-4.1`, `gpt-4o` |
| Google | `-p google` | `gemini-2.5-flash`, `gemini-2.5-pro` |
| Anthropic | `-p anthropic` | `claude-sonnet-4-20250514` |

### Codebase Intelligence

`collect_repo_map` scans your entire project and extracts function, class, and interface signatures across **7 languages** (TypeScript, JavaScript, Python, Go, Java, Rust, Ruby). Agents get a ~50-token condensed map per file instead of loading 500+ raw tokens.

### Headless & CI/CD Mode

SajiCode runs fully unattended in deployment pipelines. Use `--headless` to trigger agents for test generation, code review, or security audits inside GitHub Actions. Pre- and post-action hooks integrate with existing build systems.

---

## 21 Expert Skills

Skills are modular knowledge files loaded on-demand via progressive disclosure — agents read only what the current task requires.

| Category | Skill | Capability |
|:---|:---|:---|
| **Core** | `superpowers` | Engineering workflow, multi-file refactoring, code quality |
| | `debugger` | Error analysis, git bisect, memory profiling |
| | `web-research` | Package evaluation, technology comparison |
| **Full-Stack** | `fullstack-app-generator` | Framework selection, auth, schema, deployment |
| | `api-architect` | REST/GraphQL, OAuth/JWT, webhooks, rate limiting |
| | `nodejs` | Express/Fastify/Hono, Redis, WebSockets, BullMQ |
| | `nextjs` | App Router, server actions, ISR/SSG/SSR |
| | `python-engineer` | FastAPI, pytest, Typer CLI, pandas |
| **Frontend** | `frontend-design` | Design systems, animation, accessibility |
| | `shadcn-ui` | Forms, data tables, theming, composition |
| | `styling` | CSS architecture, design tokens, container queries |
| | `3d-web-experience` | Three.js, React Three Fiber, scroll-driven 3D |
| **Infrastructure** | `database` | Prisma, Drizzle, query optimization, N+1 prevention |
| | `devops` | Docker, GitHub Actions, Vercel/AWS, monitoring |
| | `security` | OWASP Top 10, auth, CSP headers, secrets management |
| | `testing` | Unit/integration/E2E (Playwright), mocking, CI config |
| | `performance-optimizer` | Core Web Vitals, bundle analysis, memory leak detection |
| **Specialized** | `ai-engineer` | LangGraph agents, RAG pipelines, prompt engineering |
| | `architect` | System design, CQRS, event-driven, ADR templates |
| | `mcp-server` | MCP tools, resources, prompts, transports |
| | `mobile-app` | React Native, Expo Router, offline-first, push notifications |

---

## MCP Integration

SajiCode connects to [Model Context Protocol](https://modelcontextprotocol.io) servers, giving agents access to external tools and data sources.

> 📖 **[Full MCP Integration Guide →](./MCP_INTEGRATION.md)**

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

`{{projectPath}}` is replaced automatically with your project's absolute path. MCP tools are injected into the PM agent and available immediately.

---

## CLI Reference

### Commands

| Command | Description |
|:---|:---|
| `/init` | Scan project and generate `SAJICODE.md` context file |
| `/status` | Show session info — thread, model, context, HITL status |
| `/undo <file>` | Restore the last agent-modified file from snapshot |
| `/snapshots` | List recent file snapshots |
| `/help` | List all available commands |
| `/clear` | Clear the terminal |
| `/exit` | Shut down all agents and MCP connections |

### Flags

```bash
sajicode [options]

  -p, --provider <name>   LLM provider: ollama | openai | google | anthropic
  -m, --model <name>      Model name
  -c, --channels <list>   Comma-separated channels to enable (e.g. whatsapp)
  -H, --headless          Headless mode — no UI, ideal for CI/CD
```

### Memory Tools (Available to Agents)

| Tool | Purpose |
|:---|:---|
| `read_memory_index` | View all available topics (Layer 1) |
| `read_topic(name)` | Load detailed topic knowledge (Layer 2) |
| `write_memory_topic(topic, content, summary)` | Save new knowledge with 150-char summary |
| `search_transcripts(pattern)` | Grep raw history (Layer 3) |
| `append_transcript(content)` | Log to daily transcript |
| `transcript_stats` | View transcript file sizes |

---

## Project Structure

```
src/
├── index.ts                  # REPL entrypoint, HITL handling, stream processing
├── agents/
│   ├── index.ts              # createSajiCode() — main agent factory
│   ├── agent-factory.ts      # Dynamic agent creation from AgentSpec presets
│   ├── domain-heads.ts       # Lead agent wrappers
│   ├── context.ts            # Project context and memory loading
│   ├── judgment.ts           # 3-layer protection middleware
│   └── onboarding.ts         # Interactive project setup
├── channels/
│   ├── channel.ts            # Unified ChannelAdapter interface
│   ├── whatsapp.ts           # WhatsApp adapter (Baileys)
│   └── router.ts             # Routes channel messages → agent core
├── cli/
│   ├── renderer.ts           # StreamRenderer — terminal UI with markdown
│   ├── index.ts              # Commander CLI (build, init, audit)
│   └── progress.ts           # Progress bar tracking
├── prompts/
│   ├── pm.ts                 # PM system prompt
│   └── specialists.ts        # Domain lead prompts
├── llms/
│   └── provider.ts           # Multi-provider LLM factory
├── mcp/
│   └── MCPClient.ts          # MCP server connection manager
├── memory/
│   └── agent-memory.ts       # Structured JSON agent memory
├── tools/
│   ├── context-tools.ts      # LangChain context, memory, and log tools
│   ├── repo-map.ts           # Codebase symbol scanner (7 languages)
│   └── web-search.ts         # Tavily web search
├── types/
│   └── config.ts             # TypeScript types, AgentRole, icons, labels
└── utils/
    ├── platform.ts           # OS detection and platform-specific prompts
    └── skills.ts             # Skill auto-discovery
```

---

## Contributing

```bash
git clone https://github.com/raheesahmed/sajicode.git
cd sajicode
npm install
npm run build
```

**Workflow:**
1. Edit TypeScript in `src/`
2. `npm run build` to compile
3. `node dist/index.js` to test
4. Add new skills in `skills/<name>/SKILL.md`

PRs for new skills, LLM providers, and agent improvements are welcome.

---

## License

MIT — see [LICENSE](./LICENSE)

<p align="center">
  Built by <a href="https://github.com/raheesahmed">Rahees Ahmed</a>
</p>