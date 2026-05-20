<p align="center">
  <img src="./logo.svg" width="280" alt="SajiCode" />
</p>

<h3 align="center">Your AI engineering team in the terminal.</h3>

<p align="center">
  Plan work, delegate to specialist agents, edit multiple files safely, recover from errors, and ship faster.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/sajicode">
    <img src="https://img.shields.io/npm/v/sajicode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="npm version">
  </a>
  <a href="https://github.com/RaheesAhmed/SajiCode">
    <img src="https://img.shields.io/github/stars/RaheesAhmed/SajiCode?style=flat&color=FF6A00&labelColor=1a1a1a" alt="GitHub stars">
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
  <a href="#how-to-use-it">How to Use</a> ·
  <a href="#whats-new-in-v110">v1.1.0</a> ·
  <a href="#features">Features</a> ·
  <a href="#whatsapp-channel">WhatsApp</a> ·
  <a href="#mcp-integration">MCP</a> ·
  <a href="#safety">Safety</a> ·
  <a href="#memory">Memory</a> ·
  <a href="#configuration">Config</a> ·
  <a href="#for-developers">Developers</a>
</p>

---

## What Is SajiCode?

SajiCode is an AI coding tool that works like a small engineering team.

Instead of one assistant trying to do everything, SajiCode uses a **PM agent** and specialist lead agents:

- **PM Agent** plans the work and creates context.
- **Backend Lead** builds APIs, server logic, auth, and data handling.
- **Frontend Lead** builds HTML, CSS, React, Next.js, and UI work.
- **Full-Stack Lead** builds tightly connected frontend + backend features.
- **QA Lead** writes and runs tests.
- **Security Lead** reviews risky code, secrets, auth, and vulnerabilities.
- **Deploy Lead** handles Docker, CI/CD, and deployment files.
- **Review Agent** checks the final result.

The goal is simple:

> Tell SajiCode what you want. It plans, delegates, builds, checks, and explains what happened.

You can use it if you are:

- a developer who wants a faster coding workflow
- a founder building an MVP
- a student learning software projects
- a non-developer who wants to describe an app in plain English
- a team that wants AI help with code, tests, review, and security

---

## Quick Start

### 1. Install

```bash
npm install -g sajicode
```

Or run without installing:

```bash
npx sajicode
```

### 2. Open Your Project

```bash
cd my-project
sajicode
```

### 3. Ask It To Build Something

```text
Build a login and signup page with a Node backend.
Use plain HTML, CSS, and JavaScript.
Do not install any packages.
```

SajiCode will:

1. inspect your project
2. create or update project context
3. plan the task
4. delegate work to the right specialist agents
5. write files safely
6. run checks when possible
7. summarize what changed

---

## How To Use It

Start SajiCode:

```bash
sajicode
```

Then type what you want:

```text
Create a simple expense tracker app in this folder.
Use Node.js for the backend and plain HTML for the frontend.
No external packages.
```

Other useful prompts:

```text
Fix the login bug and explain what caused it.
```

```text
Add tests for the user service.
```

```text
Review this project for security issues.
```

```text
Create a Dockerfile and GitHub Actions workflow for this app.
```

### Built-In Commands

Inside the SajiCode terminal:

| Command | What it does |
|:--|:--|
| `/init` | Scan the project and create `SAJICODE.md` |
| `/status` | Show current model, project, thread, and approval status |
| `/undo <file>` | Restore a file from its latest SajiCode snapshot |
| `/snapshots` | Show recent file snapshots |
| `/help` | Show available commands |
| `/clear` | Clear the terminal |
| `/exit` | Quit SajiCode |

---

## What Makes It Different?

### PM Plans, Specialists Build

SajiCode's PM agent does **not** write app code directly.

The PM creates context and delegates implementation to the right lead agent. This makes the workflow easier to follow and safer for larger projects.

### Parallel Task Graph

SajiCode can plan work as a dependency graph.

Example:

```text
Backend API and Frontend UI can start together.
QA tests wait until both are complete.
```

This helps agents work faster without stepping on each other.

### Multi-File Writing And Editing

Specialist agents can write or edit many files in one structured batch.

Batch edits include:

- path validation
- snapshots before changes
- rollback if something fails
- predictive code checks
- progress events in the UI

This is faster than writing one file at a time and safer than loose bulk edits.

### Error Recovery

When something fails, SajiCode can classify the error and suggest the next move.

Examples:

- `require is not defined in ES module scope`
- missing imports
- TypeScript errors
- permission errors
- timeouts
- invalid tool arguments

It can recommend:

- retry with a fix
- delegate to another agent
- break the task into smaller pieces
- ask for human guidance

### Predictive Code Analysis

Before risky code is written or run, SajiCode can scan it for common problems:

- CommonJS vs ES module mistakes
- hardcoded secrets
- unsafe `innerHTML`
- plaintext password storage
- empty catch blocks
- placeholder code
- risky dynamic execution

---

## Features

SajiCode is built around practical coding work, not chat-only assistance.

| Feature | What it means |
|:--|:--|
| Specialist agents | PM, backend, frontend, full-stack, QA, security, deploy, and review roles |
| Task graph planning | Work can be split into dependency-aware parallel tasks |
| Multi-file batch edits | Leads can write or edit many files safely in one structured operation |
| Predictive analysis | Code can be checked for likely runtime/security issues before it runs |
| Error recovery | Failures are classified with recommended next actions |
| Intelligent cache | Expensive repo/context scans are cached and invalidated when files change |
| Project memory | SajiCode remembers project decisions, progress, and lessons |
| Security checks | Risk scoring and command/path safety checks protect the workspace |
| WhatsApp channel | Send tasks from your phone |
| MCP integration | Connect external tools and data sources |

### Codebase Intelligence

SajiCode uses `collect_repo_map` to build a compact symbol-level map of your project.

It helps agents understand:

- important files
- exported functions
- classes and interfaces
- project structure
- likely tech stack

This avoids reading every file one-by-one and keeps context smaller.

### Headless And CI Mode

You can run SajiCode without the interactive UI:

```bash
sajicode build "Review this project and write missing tests" --headless
```

Useful for:

- CI checks
- automated reviews
- test generation
- security audits
- batch maintenance tasks

### Expert Skills

SajiCode agents can use skill files for specialized work.

Examples of skill areas:

- Node.js APIs
- frontend design
- Next.js
- database design
- testing
- security
- DevOps
- AI/RAG systems
- MCP servers
- mobile apps
- performance optimization

Agents load only the skills they need for the current task.

---

## What's New In v1.1.0

SajiCode v1.1.0 is a major foundation release.

New in this version:

- dependency-aware task graph
- smarter PM delegation workflow
- cleaner multi-agent terminal UI
- intelligent cache for repo and context scans
- error recovery system
- predictive code analysis
- multi-file batch writing/editing
- rollback-safe file changes
- stronger PM guardrails

This release makes SajiCode faster, clearer, and safer.

---

## WhatsApp Channel

SajiCode can receive tasks from WhatsApp, so you can ask it to work while away from your keyboard.

Start with:

```bash
sajicode --channels whatsapp
```

On first run, SajiCode shows a QR code in your terminal.

Scan it from WhatsApp:

```text
WhatsApp -> Settings -> Linked Devices -> Link a Device
```

How it works:

```text
Phone -> WhatsApp WebSocket -> SajiCode channel router -> Agent team -> WhatsApp reply
```

Details:

- uses `@whiskeysockets/baileys`
- no browser automation
- no Selenium
- no extra WhatsApp API key
- reconnects automatically
- long replies are split into WhatsApp-safe chunks
- terminal and WhatsApp can run side-by-side

### WhatsApp Modes

| Mode | Use case | Behavior |
|:--|:--|:--|
| `admin` | You send coding tasks from your phone | SajiCode treats your messages as project tasks |
| `personal` | AI replies to contacts in your style | SajiCode acts as a personal WhatsApp bot |

Example `.sajicode/config.json`:

```json
{
  "whatsapp": {
    "enabled": true,
    "mode": "admin"
  }
}
```

Personal bot mode:

```json
{
  "whatsapp": {
    "enabled": true,
    "mode": "personal",
    "personalBotPrompt": "Reply in a friendly, direct style."
  }
}
```

---

## MCP Integration

SajiCode supports the Model Context Protocol, so agents can use external tools and data sources.

Full guide:

```text
MCP_INTEGRATION.md
```

Create:

```text
.sajicode/mcp.json
```

Example:

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

`{{projectPath}}` is replaced automatically with the current project path.

MCP can be used for:

- database access
- repo intelligence
- design tools
- documentation search
- internal APIs
- custom business tools

When MCP servers are configured, their tools are loaded into the agent system automatically.

---

## Safety

SajiCode is designed to be careful by default.

### PM Guardrails

The PM agent can create planning and context files, but it cannot write implementation files directly.

That means the PM should not create:

- `.js`
- `.ts`
- `.html`
- `.css`
- config files
- backend files
- frontend files
- test files

Specialist agents do that work.

### File Safety

Multi-file edits:

- stay inside your project folder
- block protected paths like `.git`, `node_modules`, `dist`, and real `.env` files
- snapshot existing files
- roll back if the batch fails

### Shell Safety

SajiCode checks shell commands before running them.

High-risk commands can be warned, blocked, or sent for approval depending on your config.

The security layer checks for patterns such as:

- destructive deletion
- dangerous chmod/chown
- suspicious network exfiltration
- shell chaining
- secret paths
- system-level commands
- repeated risky commands

See:

```text
SECURITY_CHECKS.md
```

### Human Approval

You can enable human-in-the-loop approval for commands and risky actions.

Example `.sajicode/config.json`:

```json
{
  "humanInTheLoop": {
    "enabled": true,
    "tools": {
      "execute": {
        "allowedDecisions": ["approve", "edit", "reject"]
      }
    },
    "allowedCommands": ["npm run", "node ", "mkdir"]
  }
}
```

---

## Memory

SajiCode uses project memory so agents do not start from zero every time.

Memory lives under:

```text
.sajicode/
```

Important files and folders:

```text
.sajicode/
├── config.json
├── active_context.md
├── Plan.md
├── Architecture.md
├── Whats_done.md
├── experiences.json
├── memories/
├── transcripts/
└── snapshots/
```

### Three-Layer Memory

| Layer | Purpose |
|:--|:--|
| Pointer index | Small summaries that are always loaded |
| Topic files | Detailed project knowledge loaded only when needed |
| Transcripts | Searchable history for past work and decisions |

### Experience Replay

Agents can record lessons from successes and failures.

Examples:

- package quirks
- build errors
- module-system mistakes
- security findings
- useful implementation patterns

Later agents can search those lessons before starting similar work.

---

## Configuration

SajiCode stores project settings in:

```text
.sajicode/config.json
```

### Choose A Model

Run with a model provider:

```bash
sajicode -p openai -m gpt-4.1
```

```bash
sajicode -p google -m gemini-2.5-flash
```

```bash
sajicode -p anthropic -m claude-sonnet-4-20250514
```

```bash
sajicode -p ollama -m llama3.1:70b
```

### API Keys

Set only the keys for the provider you use:

```bash
OPENAI_API_KEY="..."
GOOGLE_API_KEY="..."
GEMINI_API_KEY="..."
ANTHROPIC_API_KEY="..."
TAVILY_API_KEY="..."
```

`TAVILY_API_KEY` is optional and enables web search.

---

## For Non-Developers

You do not need to know exact file names.

Good prompts:

```text
Build a simple website for my dental clinic.
It should have home, services, booking, and contact sections.
Make it mobile friendly.
```

```text
Create a small app where I can add customers and mark payments as paid.
Use simple local storage. Make it easy to run.
```

```text
Explain this project to me in simple language and tell me how to start it.
```

Tips:

- Tell SajiCode the folder where you want the app.
- Say if you do not want packages installed.
- Say if the app is for demo, learning, or production.
- Ask it to explain the result at the end.

---

## For Developers

Clone and build locally:

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

Run checks:

```bash
npm run build
npm test
```

### Useful Scripts

| Script | What it does |
|:--|:--|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Run from `src/index.ts` |
| `npm start` | Run compiled `dist/index.js` |
| `npm test` | Run Jest |
| `npm run version:patch` | Bump patch version, push commit and tag |
| `npm run version:minor` | Bump minor version, push commit and tag |

---

## Project Structure

```text
src/
├── agents/       # PM, specialist agents, task graph, recovery, prediction
├── cache/        # intelligent cache for expensive scans
├── channels/     # terminal, WhatsApp, future channels
├── cli/          # terminal renderer and CLI
├── config/       # project config loading
├── llms/         # model provider support
├── mcp/          # MCP integration
├── memory/       # project memory and experience replay
├── prompts/      # PM and specialist prompts
├── tools/        # repo map, context, multi-file editor, git, search
├── types/        # shared TypeScript types
└── utils/        # platform and skill helpers
```

---

## Roadmap

Planned improvements:

- direct agent-to-agent message bus
- richer visual progress dashboard
- semantic memory search
- code intelligence and test generation
- visual architecture diagrams
- VS Code extension
- more channel integrations

---

## License

MIT

---

<p align="center">
  Built by <a href="https://github.com/RaheesAhmed">Rahees Ahmed</a>
</p>
