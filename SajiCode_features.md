# SajiCode — Complete Feature Reference

> Every feature, every tool, every protocol. Updated for v1.2.3.

---

## Table of Contents

1. [The Agent Team](#1-the-agent-team)
2. [PM Agent System](#2-pm-agent-system)
3. [Task Planning & Parallel Execution](#3-task-planning--parallel-execution)
4. [Contract-First Protocol](#4-contract-first-protocol)
5. [Project DNA — Persistent Memory](#5-project-dna--persistent-memory)
6. [Session Start Protocol](#6-session-start-protocol)
7. [Daily Standup Mode](#7-daily-standup-mode)
8. [Git-Native Safety](#8-git-native-safety)
9. [Multi-File Batch Writing](#9-multi-file-batch-writing)
10. [Pattern Library](#10-pattern-library)
11. [Whole-Repo Context Loader](#11-whole-repo-context-loader)
12. [Security Layer](#12-security-layer)
13. [File Validation](#13-file-validation)
14. [Memory System (3 Layers)](#14-memory-system-3-layers)
15. [Context Guard Middleware](#15-context-guard-middleware)
16. [Error Recovery & Predictive Analysis](#16-error-recovery--predictive-analysis)
17. [Expert Skills System](#17-expert-skills-system)
18. [Team Context Bus](#18-team-context-bus)
19. [Codebase Intelligence](#19-codebase-intelligence)
20. [Terminal UI (React + Ink)](#20-terminal-ui-react--ink)
21. [Headless / CI Mode](#21-headless--ci-mode)
22. [CLI Commands](#22-cli-commands)
23. [WhatsApp Channel](#23-whatsapp-channel)
24. [MCP Integration](#24-mcp-integration)
25. [Model Provider Support](#25-model-provider-support)
26. [Human-in-the-Loop Approval](#26-human-in-the-loop-approval)
27. [Shell Safety](#27-shell-safety)
28. [File Snapshots & Undo](#28-file-snapshots--undo)
29. [Process State Cache](#29-process-state-cache)
30. [Experience Replay](#30-experience-replay)
31. [Web Search](#31-web-search)
32. [Dependency Graph Ordering](#32-dependency-graph-ordering)
33. [Multi-Agent Code Search](#33-multi-agent-code-search)
34. [Hooks System](#34-hooks-system)
35. [Configuration Reference](#35-configuration-reference)

---

## 1. The Agent Team

SajiCode runs **10 specialist lead agents** coordinated by a PM Agent. Each agent owns a defined territory of directories and is hard-blocked from writing outside it without PM authorization.

### PM Agent
- Plans all work — never writes implementation files
- Creates `Plan.md`, `Architecture.md`, `active_context.md`, `PROJECT.dna`
- Manages the task graph, contracts, and context briefings
- Coordinates up to 5 agents running in parallel
- Blocked from writing `.ts`, `.js`, `.html`, `.css`, `.json`, `.yml`, `Dockerfile`, or any config/test/source file

### Backend Lead
- **Territory**: `src/api/`, `src/routes/`, `src/middleware/`, `src/db/`, `src/models/`, `src/services/`, `src/server.ts`, `src/lib/`
- **Expertise**: REST APIs, GraphQL, WebSockets, auth (JWT/OAuth), databases, caching, LLM integrations, microservices
- **Skills loaded**: `ai-engineer`, `nodejs`, `database`, `api-architect`, `python-engineer`, `mcp-server`

### Frontend Lead
- **Territory**: `src/components/`, `src/pages/`, `src/hooks/`, `src/styles/`, `src/app/`, `public/`, `*.html`
- **Expertise**: React, Next.js, Vue, Svelte, TypeScript, CSS architecture, animations, design systems, accessibility
- **Skills loaded**: `frontend-design`, `nextjs`, `shadcn-ui`, `styling`, `3d-web-experience`, `mobile-app`
- **Standard**: Premium UI (Linear/Vercel/Stripe quality). Dark mode by default. Smooth micro-animations.

### Full-Stack Lead
- **Territory**: `src/features/`, `src/app/`, `src/api/`, `src/components/`
- **Expertise**: End-to-end feature slices — backend API + frontend UI together
- **Skills loaded**: `nextjs`, `frontend-design`, `nodejs`, `api-architect`, `fullstack-app-generator`

### Mobile Lead
- **Territory**: `app/`, `src/screens/`, `src/navigation/`, `assets/`
- **Expertise**: React Native, Expo, iOS/Android native modules, Expo Router, offline-first
- **Skills loaded**: `mobile-app`

### Data & AI Lead
- **Territory**: `src/ai/`, `src/ml/`, `src/pipelines/`, `src/embeddings/`, `notebooks/`, `*.py`
- **Expertise**: LLM integrations, RAG pipelines, LangGraph agents, vector databases, Python ML, data engineering
- **Skills loaded**: `ai-engineer`, `python-engineer`, `database`
- **Standard**: Cheapest model that meets quality bar. Always stream. Semantic caching. Set `max_tokens` and timeouts.

### Platform Lead
- **Territory**: `src/sdk/`, `src/cli/`, `src/tools/`, `src/mcp/`, `packages/`
- **Expertise**: MCP servers, npm packages, CLI tooling (Commander.js), SDK design, developer experience
- **Skills loaded**: `mcp-server`, `nodejs`, `api-architect`

### QA Lead
- **Territory**: `tests/`, `__tests__/`, `*.test.ts`, `*.spec.ts`, `cypress/`, `playwright/`
- **Expertise**: Unit, integration, E2E testing; coverage analysis; mocking patterns
- **Skills loaded**: `testing`, `debugger`
- **Standard**: Reads source code before writing tests. Covers happy path AND edge cases. Target 80%+ coverage on business logic. Never hardcodes values to pass tests.

### Security Lead
- **Territory**: `src/security/`, `.env.example` (read-only audit across whole codebase)
- **Expertise**: OWASP Top 10, pen testing, secrets detection, auth review, dependency audits
- **Skills loaded**: `security`
- **Audit procedure**: `npm audit` → grep for hardcoded secrets, SQL injection, XSS, IDOR, missing rate limits → review auth + CORS → check `.gitignore` → validate all API inputs

### Deploy Lead
- **Territory**: `Dockerfile`, `docker-compose.yml`, `.github/`, `scripts/`, `.env.example`, `terraform/`, `k8s/`
- **Expertise**: Docker, GitHub Actions, Kubernetes, Terraform, SRE practices
- **Skills loaded**: `devops`
- **Standard**: Multi-stage Dockerfile. `.env.example` with all required variables. GitHub Actions with cache → test → build → deploy stages. Health check endpoint wired everywhere.

### Review Agent
- **Territory**: Whole codebase (read-only, final gate)
- **Expertise**: Architecture review, code quality, completeness verification
- **Skills loaded**: `superpowers`, `architect`, `performance-optimizer`
- **Checklist**: COMPLETENESS (no TODOs/stubs) → TYPES (no untyped `any`) → IMPORTS (no circular deps) → ARCHITECTURE (layer separation) → ERRORS (no swallowed catches) → DEAD CODE (no unused imports)
- **Verdict**: PASS or FAIL with file path, line number, severity, and required fix for each issue

---

## 2. PM Agent System

### What the PM Does
- Reads `read_session_state` and `read_memory_index` at every session start
- Classifies task size (SMALL / MEDIUM / LARGE) by counting files and lines
- Creates structured planning documents before any code is written
- Dispatches agents using `task()` with full context briefings
- Checks artifacts after each agent completes
- Updates session state, project log, and transcripts at the end

### Task Size Classification

| Size | Files | Lines | Leads | Approach |
|:--|:--|:--|:--|:--|
| SMALL | 1–5 | < 300 total | 1–2 | Brief `active_context.md`, then delegate |
| MEDIUM | 6–15 | any | 2–4 | Context briefing + parallel dispatch |
| LARGE | 16+ | any | up to 5 | Full planning docs + parallel dispatch |

### Planning Documents
Every task produces (at minimum):
- `write_todos` — structured task list, all statuses `pending`
- `.sajicode/Plan.md` — goals, task breakdown, success criteria
- `.sajicode/Architecture.md` — ASCII diagram, component relationships, API contracts
- `.sajicode/active_context.md` — project path, current phase, files in progress
- `.sajicode/Whats_done.md` — progress tracker

### PM Absolute Rules (non-negotiable)
1. Session start protocol runs first, always
2. `collect_repo_map` before planning anything
3. Classify task size before delegating
4. PM writes Markdown only — all code goes to leads
5. Leads write their files directly — no sub-agent nesting
6. Max 5 leads in parallel
7. Always call `prepare_team_context` + `generate_context_briefing` + `build_dependency_order` before any delegation
8. Every `task()` call starts with `read_team_context(agentName="...")` + CONTEXT_BRIEFING + CHECK YOUR SKILLS
9. Never make agents re-read files already summarized in team context
10. CONTRACT-FIRST PROTOCOL for MEDIUM/LARGE tasks with 3+ agents
11. Update PROJECT.dna (UnfinishedWork + Decisions + Patterns) at every session end

---

## 3. Task Planning & Parallel Execution

### Dependency-Aware Task Graph
Before dispatching any agent, the PM builds a DAG (directed acyclic graph) of all tasks:

```
Backend API ──┐
              ├──► QA Tests ──► Review ──► Deploy
Frontend UI ──┘
```

- Tasks with no dependencies start immediately
- Tasks with dependencies wait for their inputs to complete
- The PM checks `get_executable_tasks` to dispatch only unblocked work
- `build_dependency_order` determines the correct dispatch sequence
- Cuts wall-clock time by running independent work in parallel

### Task Graph Operations
| Tool | What it does |
|:--|:--|
| `create_task_graph` | Initialize a new dependency graph for the task |
| `add_task_node` | Add a task with estimated time and agent assignment |
| `add_task_dependency` | Declare that task B requires task A to complete first |
| `get_executable_tasks` | Get all tasks whose dependencies are satisfied |
| `mark_task_running` | Mark a task as dispatched |
| `mark_task_complete` | Mark a task done, unblocking dependents |
| `mark_task_failed` | Mark failed, allowing retry or decomposition |
| `get_task_graph_progress` | Get progress bar across all tasks |
| `build_dependency_order` | Get the optimal dispatch sequence |

### Workload Balancing
- PM tracks which agents are currently running
- Limits concurrent dispatches to 5 agents maximum
- Dispatches second-phase agents as first-phase ones complete
- Can chain multiple rounds of parallel work for large builds

---

## 4. Contract-First Protocol

Applies to MEDIUM/LARGE tasks with 3+ agents. Prevents the most common multi-agent failure: two agents overwriting the same file.

### Phase 0 — Draft Contracts (Parallel)

Each agent submits a contract before writing any code:

```
draft_contract(
  agentName: "backend-lead",
  apisExposed: ["POST /api/todos", "GET /api/todos/:id"],
  typesExposed: ["Todo", "CreateTodoRequest"],
  filesWillWrite: ["src/routes/todos.ts", "src/models/todo.ts"],
  envVarsNeeded: ["DATABASE_URL"],
  needsFrom: ["frontend-lead provides TodoFormData type"]
)
```

### Conflict Detection
When `finalize_contracts` is called, the system:
1. Checks every `filesWillWrite` list across all agents
2. If any two agents claim the same file → **rejects finalization** and lists all conflicts
3. Agents update their contracts to resolve conflicts
4. Re-finalize until all conflicts are cleared

### Phase 1 — Implement Against Frozen Contracts
- `finalize_contracts` locks the registry — no new contracts allowed
- Each agent calls `read_contracts(agentName="...")` to see their dependency resolution
- The system shows which peer agents provide what each agent needs
- Agents implement in parallel with zero coordination needed

### Contract Tools
| Tool | Phase | What it does |
|:--|:--|:--|
| `draft_contract` | 0 | Submit or update an agent's boundary declaration |
| `finalize_contracts` | 0→1 | Check for conflicts, lock registry if clean |
| `read_contracts` | 1 | Read registry index or a specific contract with dependency resolution |

---

## 5. Project DNA — Persistent Memory

`PROJECT.dna` lives at the project root. It is the team's shared brain — read at every session start, updated at every session end.

### 9 Sections

| Section | What goes here |
|:--|:--|
| `Overview` | What this project does, who it's for |
| `Tech Stack` | Languages, frameworks, libraries, tools |
| `Architecture` | Layers, modules, data flow, key boundaries |
| `Conventions` | Naming rules, file structure, style decisions, patterns to follow |
| `Key Decisions` | Architecture and product decisions with rationale |
| `Patterns Learned` | Pitfalls discovered, workarounds found, lessons from failures |
| `Known Issues` | Active bugs, blockers, tech debt to address |
| `Unfinished Work` | Exactly what wasn't completed last session — auto-resumed next session |
| `User Preferences` | How the user likes things done (comments style, framework choices, formatting) |
| `Session History` | One-liner per session (date + what was accomplished) |

### DNA Tools
| Tool | What it does |
|:--|:--|
| `read_project_dna` | Read the full DNA file |
| `update_project_dna` | Update a named section with a timestamp and optional reason |
| `generate_project_dna` | Create a fresh DNA from scratch with all sections |

### Auto-Resume
If `Unfinished Work` contains content, the PM resumes from the last phase automatically. Users never need to re-explain what was in progress.

---

## 6. Session Start Protocol

Runs at the start of every session, in this exact order:

```
Step 1: read_session_state      → check for resumable in-progress work
Step 2: read_memory_index       → load compact knowledge pointers
Step 3: read_project_dna        → load full project brain
Step 4: generate_standup        → daily briefing
Step 5: get_patterns(techStack) → inject stack-specific pitfall awareness
```

If `read_session_state` finds an in-progress phase → resume from that exact phase, skip re-planning.

If `PROJECT.dna` shows unfinished work → jump straight to the unfinished task, skip discovery.

If neither → proceed to UNDERSTAND → CLASSIFY → PLAN.

---

## 7. Daily Standup Mode

Generates a briefing before any session work begins. Covers everything a dev needs to pick up quickly.

### What the standup reports
| Section | Source |
|:--|:--|
| Recent commits (7 days) | `git log --since="7 days ago"` |
| Working tree status | `git status --short` |
| Stash count | `git stash list` |
| Last session phase | `.sajicode/session-state.json` |
| Unfinished work | `PROJECT.dna → UnfinishedWork section` |
| Recently completed | `.sajicode/whats_done.md` (last 3 entries) |
| Outdated packages | `npm outdated --json` (flags MAJOR version gaps) |
| TODO/FIXME count | grep across `src/**/*.ts` |
| Suggested next steps | Generated from all of the above (top 3) |

### Suggestion Engine
The standup generates up to 3 next-step suggestions based on state:
- Stashed work → "Review N stashes, pop or drop"
- Dirty working tree → "Commit or discard before new work"
- Unfinished work in DNA → "Resume from last phase"
- Major version gaps → "Update N packages"
- High TODO count → "Resolve N TODO/FIXME comments"
- No recent commits → "Start a new feature branch"

### Run it manually
```bash
sajicode standup
sajicode standup -p /path/to/project
```

### Standup tool
```
generate_standup()   → returns the full formatted briefing string
```

---

## 8. Git-Native Safety

Every `sajicode` session creates a git isolation layer automatically.

### What happens when a session starts
1. Checks if the directory is a git repo (initializes one if not)
2. Creates an initial commit if the repo has no commits
3. Creates a session branch: `sajicode/session-YYYYMMDD-HHmmss`
4. Creates a "before" tag: `sajicode-before-YYYYMMDD-HHmmss`
5. Writes the session ID to `.sajicode/current-session.txt`

### Per-Agent Commits
Each agent can commit its own work mid-task:

```bash
# Commit message format:
feat(backend-lead): scaffold Express server with auth middleware
feat(frontend-lead): create login and signup forms
feat(qa-lead): add auth integration tests
```

This creates a full audit trail — you can see exactly what each agent built.

### Revert Operations

```bash
# Revert everything in the current session
sajicode revert

# Revert only what one specific agent did
sajicode revert --agent backend-lead

# Revert a specific past session by ID
sajicode revert --session 20260610-091500
```

`revert` (no agent) → hard reset to `sajicode-before-{sessionId}` tag + `git clean -fd`

`revert --agent <name>` → finds all commits matching `feat(<name>):` pattern → runs `git revert --no-edit` on each

### Git Session Tools
| Tool | What it does |
|:--|:--|
| `session_commit` | Stage all + commit as `feat(agentName): summary` |
| `revert_session` | Hard reset to before-session tag (wipes all agent changes) |
| `revert_agent_work` | Find and revert commits by a specific agent |

---

## 9. Multi-File Batch Writing

The default write strategy for all lead agents. Never write files one-by-one for a multi-file task.

### `apply_file_batch` — How It Works
1. Validates each operation before executing (no partial writes if validation fails)
2. Snapshots existing files to `.sajicode/snapshots/`
3. Runs security scan on each file's content
4. Validates TypeScript/Python/JSON syntax
5. Writes all files atomically
6. Emits progress events to the UI (`multi_file_batch_start`, `multi_file_batch_progress`, `multi_file_batch_complete`)
7. On any failure: rolls back the entire batch to pre-operation state

### `preview_file_batch`
Shows what a batch will do before executing. Used before auth, server, and migration batches of 4+ files.

### Write Strategy Rules
```
1 file        → write_file (only if truly isolated: config tweak, hotfix)
2+ files      → apply_file_batch ALWAYS
Large batches → split by layer: types → implementation → tests (still batch each layer)
```

A 10-file feature = 2–3 `apply_file_batch` calls, not 10 `write_file` calls.

---

## 10. Pattern Library

Before any agent writes code, it loads patterns filtered to the project's tech stack.

### 20 Built-In Static Patterns

| ID | Stack | Category | Pattern |
|:--|:--|:--|:--|
| `prisma-nullish-coalescing` | Prisma | pitfall | Use `??` for optional fields in where clauses |
| `prisma-transaction` | Prisma | convention | `$transaction` required for multi-table writes |
| `react-query-v5-callbacks` | React Query | pitfall | `onSuccess`/`onError` removed — use `useEffect` or `mutation.isSuccess` |
| `fastapi-annotations-import` | FastAPI, Pydantic | pitfall | `from __future__ import annotations` must be first line |
| `nextjs-server-components-hooks` | Next.js | pitfall | Server Components cannot use hooks — add `'use client'` |
| `nextjs-metadata-export` | Next.js | convention | Metadata export must be in `page.tsx`, not `layout.tsx` |
| `stripe-idempotency-keys` | Stripe | pitfall | Check `event.id` before processing webhooks |
| `stripe-webhook-signature` | Stripe | security | Always verify with `stripe.webhooks.constructEvent` |
| `express-body-validation` | Express | security | Never trust `req.body` — validate with Zod/Joi |
| `typescript-avoid-any` | TypeScript | convention | Use `unknown` + type guards instead of `as any` |
| `typescript-index-signatures` | TypeScript | pitfall | Index signatures make all properties accept `undefined` — use `Record<K,T>` |
| `postgresql-parameterized-queries` | PostgreSQL | security | Never concatenate user input into SQL strings |
| `docker-multi-stage-builds` | Docker | performance | Install deps in build stage, copy only `dist` to production |
| `env-never-commit` | dotenv | security | Never commit `.env` — provide `.env.example` with all required keys |
| `react-useeffect-async` | React | pitfall | Create inner async fn — never make `useEffect` itself async |
| `langchain-max-tokens-timeout` | LangChain | performance | Always set `max_tokens` and timeout on LLM calls |
| `security-jwt-secret-length` | JWT | security | Secrets must be ≥ 256 bits |
| `cors-no-wildcard-production` | CORS | security | Never use `*` in production — list explicit origins |
| `bcrypt-cost-factor` | bcrypt | security | Cost factor ≥ 12 in production |
| `ratelimit-before-auth` | Express/FastAPI | security | Apply rate limiting before auth middleware |

### Dynamic Pattern Learning
Agents can record new patterns during any session:

```
record_pattern(
  tech: ["prisma", "postgresql"],
  category: "pitfall",
  title: "Prisma upsert requires unique field in where",
  description: "upsert.where must use a @unique field — composite keys require compound where",
  learnedFrom: "session 2026-06-11 auth migration"
)
```

Learned patterns persist in `.sajicode/patterns.json` and are injected into future sessions. Duplicate detection prevents re-recording similar patterns (70% title word overlap threshold).

### Pattern Tools
| Tool | What it does |
|:--|:--|
| `get_patterns` | Load all patterns matching a tech stack array |
| `record_pattern` | Record a new learned pattern (deduplication applied) |

---

## 11. Whole-Repo Context Loader

Loads the entire repository into context in a single operation — up to 150,000 characters.

### Priority Order
1. Key config files: `package.json`, `tsconfig.json`, `pyproject.toml`, `requirements.txt`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, `PROJECT.dna`, `SAJICODE.md`
2. Files matching the optional `focus` path substring
3. Source files: `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.rb`
4. Everything else

### Ignored
`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `__pycache__`, `.cache`, `.turbo`, `.sajicode`, `.svelte-kit`, `.vercel`, `.expo`

Binary files: `.png`, `.jpg`, `.gif`, `.ico`, `.woff`, `.woff2`, `.ttf`, `.pdf`, `.zip`, `.gz`, `.map`, `.lock`

### Limits
- Max 8,000 chars per individual file (truncated with a line count note)
- Max 150,000 chars total
- Files exceeding the total are skipped (count reported in header)

### Tool
```
load_full_repo(focus?: string)
```
Optional `focus` is a path substring — e.g., `"src/api"` or `"auth"` — that causes matching files to load first.

---

## 12. Security Layer

### Pre-Write Security Scan

Every `write_file` and `edit_file` call is intercepted by Context Guard Middleware before execution.

**Blocking patterns** (write is rejected, error returned to agent):

| Pattern | Detected by |
|:--|:--|
| Anthropic / OpenAI API key | `sk-[a-zA-Z0-9]{48}` |
| AWS access key | `AKIA[0-9A-Z]{16}` |
| GitHub personal access token | `ghp_[a-zA-Z0-9]{36}` |
| RSA private key | `-----BEGIN RSA PRIVATE KEY-----` |
| Generic private key | `-----BEGIN PRIVATE KEY-----` |
| Hardcoded password literal | `password = "value8chars+"` (excluding env vars) |

**Warning patterns** (write proceeds, warning logged to UI):

| Pattern | Language | Risk |
|:--|:--|:--|
| `eval()` | JS/TS | Code injection |
| `exec()` (non-subprocess) | Python | Code injection |
| `"SELECT" + var` or `` f"SELECT {var}" `` | Any | SQL injection |
| `fetch("http://...")` to non-localhost | Any | MITM |

### PM Guardrail Middleware
Hard enforcement that PM cannot write source files. Checked at middleware level — not dependent on prompts. If PM attempts to write a non-markdown file, the tool call is blocked with an error message.

### Lead Agent Guardrails
Each lead has a territory check: if an agent tries to write outside its declared territory, the action is flagged and the agent is instructed to ask the PM.

### Shell Safety
See [Section 27 — Shell Safety](#27-shell-safety).

---

## 13. File Validation

Runs on every file written by an agent, before and after writes.

### TypeScript / TSX Validation
Runs `npx tsc --noEmit --pretty false` in the file's directory. Filters output to show only errors referencing the specific file.

### Python Validation
Runs `python -m py_compile <filePath>`. Captures stderr for syntax errors.

### JSON Validation
Parses with `JSON.parse()`. Returns the parse error message if invalid.

### Build Check
Tries `npm run build` first. If the build script is missing, falls back to `npx tsc --noEmit`. Returns:
- `OK Build passed (command)` — success
- `FAIL Build failed: N error(s) (command)` + first 20 error lines — failure

### Validation Tools
| Tool | What it does |
|:--|:--|
| `validate_file` | Syntax check + optional security scan for a single file |
| `run_build_check` | Full project build/typecheck |

---

## 14. Memory System (3 Layers)

### Layer 1 — Pointer Index
- Loaded at every session start
- Each entry ≤ 150 characters — compact topic summaries
- Contains pointers to topic files for detailed knowledge
- Updated after major tasks or new patterns learned
- Tool: `read_memory_index`, `write_memory_topic`

### Layer 2 — Topic Files
- Detailed knowledge stored per topic
- Loaded on-demand when the topic is relevant
- Examples: architecture decisions, API designs, database schemas, security configurations
- Tools: `read_topic`, `write_memory_topic`

### Layer 3 — Transcript Search
- Raw session history across all turns
- Never fully loaded — queried only by keyword/agent/date
- Each entry: agent name + action + context summary + timestamp
- Max 280 chars per entry (compact summaries)
- Tools: `search_transcripts`, `append_transcript`

### Agent Memory
Each agent maintains its own memory file in `.sajicode/memories/<agentName>.md`:
- What the agent has built in this project
- Key decisions it made
- Patterns it learned
- Loaded at agent startup, updated after each task
- Tools: `update_agent_memory`, `read_memory_index`

### Project Log
A shared team log updated by every agent after each task:
- What was built
- What decisions were made
- What remains
- Tool: `update_project_log`

---

## 15. Context Guard Middleware

Wraps every tool call at the middleware level. Runs before and after handler execution.

### File Read Cache
- Caches file content in memory with a 3-minute TTL
- Uses `path.resolve()` for canonical keys (Windows-safe)
- Stores `mtimeMs` at cache time — if file mtime has changed, cache is invalidated
- If the content contains `[CACHED — already read this session]` (deepagents internal cache prefix), reads the real file from disk instead of storing the truncated preview
- Returns full content (no truncation) from cache

### Write Invalidation
When `write_file`, `edit_file`, or `apply_file_batch` executes:
- Immediately marks the path in `writtenPaths` set
- Deletes the cache entry for that path
- Next `read_file` on that path hits disk

### Path Blocking
Blocks `read_file`, `list_dir`, `ls`, and `glob` on protected paths:
- `node_modules`, `.git`, `.next`, `.nuxt`, `dist`, `build`, `.cache`, `.turbo`, `__pycache__`, `coverage`, `.svelte-kit`
- Files matching `.d.ts`, `.map`, `.lock`
- Returns a clear error message telling the agent to use `package.json` instead

### Tool Message Normalization
Converts all tool result content to strings — handles `Uint8Array`, `ArrayBuffer`, binary views, arrays of content blocks, and circular references in JSON serialization.

---

## 16. Error Recovery & Predictive Analysis

### Error Recovery Tool: `analyze_error_recovery`
Classifies failed commands, tool calls, and build errors, then recommends an action:

| Classification | When | What to do |
|:--|:--|:--|
| `retry` | Known fixable error (missing import, wrong path, ESM/CJS) | Apply specific fix and retry |
| `delegate` | Error requires different expertise | Hand off to specific agent |
| `decompose` | Task too large, partial failure | Break into smaller subtasks |
| `escalate` | Unknown error, requires human judgment | Ask user for guidance |

Error patterns recognized:
- `require is not defined in ES module scope`
- Missing type imports
- TypeScript `TS2XXX` errors
- Permission denied
- Command timeout
- Invalid tool arguments
- Module not found

### Predictive Analysis Tool: `predict_code_issues`
Scans code snippets before they are run or written. Detects:
- CommonJS `require` in ESM context
- Hardcoded secrets in source
- Unsafe `innerHTML` usage
- Plaintext password storage
- Empty catch blocks
- Placeholder / stub throws
- Risky dynamic execution (`eval`, `new Function`)
- Missing `await` on async calls

Severity levels: `high`, `medium`, `low`. Agents fix `high` and `medium` issues before proceeding.

---

## 17. Expert Skills System

Skills are markdown documents containing patterns, anti-patterns, and best practices for a technology area. Agents load only the skills relevant to their current task.

### Available Skills

| Skill | Domain | Used by |
|:--|:--|:--|
| `ai-engineer` | LLMs, RAG, agents, cost optimization, streaming | Backend Lead, Data & AI Lead |
| `nodejs` | Express, Fastify, Hono, npm packages, CLIs | Backend Lead, Platform Lead |
| `database` | Prisma, Drizzle, MongoDB, SQL, vector stores | Backend Lead, Data & AI Lead |
| `api-architect` | REST, GraphQL, SDK design | Backend Lead, Full-Stack Lead |
| `frontend-design` | React component architecture, state management | Frontend Lead |
| `nextjs` | App Router, SSR, routing, metadata | Frontend Lead, Full-Stack Lead |
| `shadcn-ui` | shadcn/ui patterns | Frontend Lead |
| `styling` | Tailwind, CSS animations, dark mode | Frontend Lead |
| `3d-web-experience` | Three.js, WebGL | Frontend Lead |
| `testing` | Unit, integration, E2E, mocking | QA Lead |
| `debugger` | Debugging patterns, source maps | QA Lead |
| `security` | OWASP Top 10, secrets, auth hardening | Security Lead |
| `devops` | Docker, GitHub Actions, Kubernetes, Terraform | Deploy Lead |
| `mobile-app` | React Native, Expo Router, offline-first | Mobile Lead |
| `mcp-server` | MCP tool server patterns | Platform Lead |
| `python-engineer` | Python services, data processing, FastAPI | Backend Lead, Data & AI Lead |
| `superpowers` | Advanced architecture and completeness review | Review Agent |
| `architect` | System design, trade-off analysis | Review Agent |
| `performance-optimizer` | Bundle size, rendering, DB query optimization | Review Agent |
| `fullstack-app-generator` | Full-stack patterns, T3 stack, monorepos | Full-Stack Lead |

---

## 18. Team Context Bus

Ensures agents never re-read files the PM already inspected. The PM writes context once; agents read it.

### How It Works
1. PM reads source files, docs, and configurations
2. PM calls `prepare_team_context` with all assignments and summaries of already-read files
3. System writes `.sajicode/active_context.md` and per-agent briefing files
4. Each agent starts by calling `read_team_context(agentName="...")` to receive its briefing
5. Briefing includes: what PM found, what the agent must do, what peers are doing, files in-scope

### Team Context Tools
| Tool | Who uses it | What it does |
|:--|:--|:--|
| `prepare_team_context` | PM | Write shared context + per-agent briefings |
| `read_team_context` | Every agent (FIRST call) | Read agent-specific briefing |
| `generate_context_briefing` | PM | Generate a compact briefing from collected context |
| `append_team_decision` | PM | Record architecture/implementation decision |
| `append_team_contract` | PM | Record shared API/type/env/file contract |
| `append_agent_handoff` | PM | Record agent-to-agent continuation note |

### Session State Tools
| Tool | What it does |
|:--|:--|
| `read_session_state` | Load current session phase, progress, and active tasks |
| `update_session_state` | Persist current phase for session resumption |

---

## 19. Codebase Intelligence

### Repo Map Tool: `collect_repo_map`
Builds a compact, symbol-level map of the project without reading every file:
- Important source files
- Exported functions and classes
- TypeScript interfaces
- Project structure
- Detected tech stack

Used by the PM before planning any task. Avoids reading every file one-by-one.

### Project Context Tool: `collect_project_context`
Scans the project and builds a full context description:
- Package.json dependencies
- Directory structure
- Key configuration files
- Detected frameworks and tools

Used by `/init` to generate `SAJICODE.md` and `PROJECT.dna`.

### Dependency Graph Tool: `build_dependency_order`
Given a list of planned files, returns the correct implementation order based on import relationships. Ensures types and interfaces are written before the files that import them.

---

## 20. Terminal UI (React + Ink)

The interactive TUI is built with [React](https://reactjs.org/) and [Ink](https://github.com/vadimdemedes/ink).

### Architecture
```
[Header — rendered once via Static]
[Log lines — Static, grows as output arrives]
[Thinking box — live, shows spinner during processing]
[Input bar — always at bottom, always interactive]
```

### Key Properties
- **No flicker**: Past output is rendered via `<Static>` — Ink writes it once and never re-renders it. New output appends below without touching past lines.
- **Always-on input**: The chat input is always visible at the bottom. You can type the next task while agents are still running.
- **Console capture**: `console.log` is overridden to route to UIBus → Ink's `<Static>`. All of StreamRenderer's chalk-formatted output flows through automatically with ANSI codes intact.
- **Headless renderer**: When Ink is active, `StreamRenderer` is initialized in headless mode (no ora spinners). All output goes through `console.log` → UIBus instead.

### Input Bar States

| State | Border color | Prompt | Hint |
|:--|:--|:--|:--|
| Idle | gray | `>_` (green) | `type a task or /help` |
| Running | yellow | `●` (yellow) | `[agents running...]` |

### UIBus Events
| Event | When emitted |
|:--|:--|
| `line` | Any `console.log` output |
| `stream-start` | Agent stream begins |
| `stream-end` | Agent stream finishes |

---

## 21. Headless / CI Mode

Run SajiCode without any interactive UI — useful for CI pipelines, automated reviews, and scheduled tasks.

```bash
sajicode build "Review the codebase and fix all TypeScript errors" --headless --task "your task"
node dist/index.js --headless --task "Generate missing tests for src/api/"
```

Flags:
- `--headless` / `-H` — disable interactive UI, output only to stdout
- `--task` / `-t` — provide the task directly (required in headless mode)
- `--model` / `-m` — override model
- `--provider` / `-p` — override provider

In headless mode:
- No ora spinners — all output via `console.log`
- No readline prompt
- Exits with code 0 on success, 1 on failure
- Hooks (`preTask`, `postTask`, `onExit`) still fire

---

## 22. CLI Commands

### Interactive mode (default)
```bash
sajicode                             # launch TUI, current directory
sajicode -p anthropic -m claude-sonnet-4-6   # with specific model
sajicode --channels whatsapp         # with WhatsApp channel
```

### Standup
```bash
sajicode standup                     # daily briefing for current directory
sajicode standup -p /path/to/project # for a specific project
```

### Revert
```bash
sajicode revert                      # revert entire current session
sajicode revert --agent backend-lead # revert one agent's commits
sajicode revert --session 20260611-143022     # revert a past session
sajicode revert -p /path/to/project  # revert in another directory
```

### File safety
```bash
sajicode undo src/api/auth.ts        # restore file from latest snapshot
sajicode snapshots                   # list recent file snapshots
```

### Project setup
```bash
sajicode init                        # initialize in current directory
sajicode audit                       # run security agent on codebase
```

### Configuration
```bash
sajicode config -m claude-sonnet-4-6         # set default model
sajicode config --base-url http://localhost:11434  # set Ollama URL
sajicode config --risk low           # set risk tolerance
```

### Headless
```bash
sajicode build "your task" --headless
sajicode build "your task" -H -p anthropic -m claude-opus-4
```

### In-session commands (TUI)
| Command | What it does |
|:--|:--|
| `/init` | Scan project → generate `SAJICODE.md` and `PROJECT.dna` |
| `/status` | Show model, thread, context, and approval status |
| `/help` | Show command list |
| `/clear` | Clear the terminal |
| `/exit` | Quit SajiCode |

---

## 23. WhatsApp Channel

Send coding tasks from your phone. Useful for delegating work while away from your desk.

```bash
sajicode --channels whatsapp
```

### How It Works
```
Phone → WhatsApp → @whiskeysockets/baileys WebSocket → Channel Router → Agent Team → WhatsApp reply
```

- No browser automation
- No Selenium
- No extra WhatsApp Business API or paid key
- QR code shown in terminal on first run — scan from WhatsApp → Settings → Linked Devices
- Reconnects automatically on disconnect
- Long replies (>4000 chars) split into WhatsApp-safe chunks

### Modes
| Mode | Config | Behavior |
|:--|:--|:--|
| `admin` | `"mode": "admin"` | Treats your messages as project coding tasks |
| `personal` | `"mode": "personal"` | Replies to contacts in your writing style (AI assistant on your number) |

### Config
```json
{
  "whatsapp": {
    "enabled": true,
    "mode": "admin"
  }
}
```

Personal bot mode with custom prompt:
```json
{
  "whatsapp": {
    "enabled": true,
    "mode": "personal",
    "personalBotPrompt": "Reply in a direct, friendly style. Keep responses under 3 sentences."
  }
}
```

---

## 24. MCP Integration

Agents can use any Model Context Protocol-compatible tool or data source.

### Setup
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
    },
    "docs": {
      "command": "npx",
      "args": ["-y", "mcp-server-fetch"],
      "transport": "stdio"
    }
  }
}
```

`{{projectPath}}` is replaced with the resolved absolute project path automatically.

### What MCP tools are available to
All MCP tools are injected into every lead agent's tool list at startup. The PM and all specialists can call any connected MCP tool.

### Common uses
- Database access (read schema, query data)
- Repo intelligence (semantic code search)
- Design tools (Figma component import)
- Documentation search (search your internal docs)
- Internal APIs (your business data)
- Custom tools (anything you build as an MCP server)

---

## 25. Model Provider Support

SajiCode supports all major LLM providers through a unified adapter layer.

| Provider | Flag | Models |
|:--|:--|:--|
| Anthropic | `-p anthropic` | `claude-sonnet-4-6`, `claude-opus-4`, `claude-haiku-4-5` |
| OpenAI | `-p openai` | `gpt-4.1`, `gpt-4o`, `o3`, `o4-mini` |
| Google | `-p google` | `gemini-2.5-flash`, `gemini-2.5-pro` |
| OpenRouter | `-p openrouter` | Any model on OpenRouter |
| Ollama | `-p ollama` | Any locally running Ollama model |
| MiniMax | `-p minimax` | `minimax-m2.5:cloud` (default) |

### API Keys
```bash
ANTHROPIC_API_KEY="..."
OPENAI_API_KEY="..."
GOOGLE_API_KEY="..."
GEMINI_API_KEY="..."
OPENROUTER_API_KEY="..."
TAVILY_API_KEY="..."    # optional — enables web search
```

---

## 26. Human-in-the-Loop Approval

Enable manual approval before any tool runs.

### Config
```json
{
  "humanInTheLoop": {
    "enabled": true,
    "tools": {
      "execute": {
        "allowedDecisions": ["approve", "edit", "reject"]
      }
    },
    "allowedCommands": ["npm run", "node ", "mkdir", "npx tsc", "git status"]
  }
}
```

### Decision Options
| Decision | What happens |
|:--|:--|
| `approve` | Run the action as-is |
| `reject` | Block the action, agent receives rejection |
| `edit` | Modify the arguments (JSON editor), then approve |

### Auto-Approval
Commands matching any prefix in `allowedCommands` are approved automatically without showing a prompt. Use for safe, read-only, or low-risk commands.

### What Gets Interrupted
Any tool listed in `tools` triggers a HITL pause. When paused:
- The exact command or arguments are shown in the terminal
- User selects a decision via arrow keys
- Agent resumes with the result

---

## 27. Shell Safety

All shell commands pass through `SafeShellBackend` before execution.

### Risk Patterns Detected

| Pattern | Risk | Action |
|:--|:--|:--|
| `rm -rf /`, `rmdir /s /q C:\` | Destructive deletion of system paths | Block |
| `chmod 777`, `chown root` on system dirs | Dangerous permission changes | Warn/Block |
| `curl ... \| sh`, `wget ... \| bash` | Remote code execution via pipe | Block |
| `> /etc/passwd`, `> /etc/shadow` | Writing to sensitive system files | Block |
| `;` chaining with risky commands | Bypass-via-chaining | Warn |
| `env` + secret key patterns | Secrets in command args | Warn |
| Repeated identical risky commands | Escalating risk scoring | Block after threshold |

### Risk Scoring
Commands accumulate a risk score based on detected patterns. The score is compared against the configured `riskTolerance`:

- `low` — blocks on most risky patterns
- `medium` — blocks on critical patterns, warns on high
- `high` — warns on most, blocks only on critical

### Process State (Command Cache)
Short-lived commands (≤ 5-minute TTL) are cached to avoid re-running idempotent operations. File-reading commands (`cat`, `type`, `ls`, `dir`, `grep`, `git status`, `git diff`, `git log`) are **never cached** — always re-executed fresh.

---

## 28. File Snapshots & Undo

Every file is snapshotted before it is modified by any agent.

### Snapshot Storage
```
.sajicode/snapshots/<hash>_<basename>_<timestamp>.bak
```

### Undo
```bash
sajicode undo src/api/auth.ts
```
Restores the file from its most recent snapshot in `.sajicode/snapshots/`.

### List Snapshots
```bash
sajicode snapshots
```
Shows the 20 most recent snapshots with timestamps and file paths.

### Tools
| Tool | What it does |
|:--|:--|
| `snapshot_file` | Snapshot a file before modifying it |
| `undo_file_change` | Restore a file from its latest snapshot |
| `list_snapshots` | List recent snapshots |

---

## 29. Process State Cache

Caches short-lived commands to avoid re-running idempotent operations within a session.

### How It Works
- Commands are hashed and stored in `.sajicode/process-state.json`
- TTL: 5 minutes for completed commands
- Long-running processes (dev servers, watchers): cached as "running" with PID; alive-checked before serving from cache
- On startup: entries matching `NEVER_CACHE_PATTERNS` are filtered out

### Never-Cache Commands (always re-executed)
`cat`, `type`, `head`, `tail`, `less`, `more`, `dir`, `ls`, `grep`, `rg`, `find`, `git status`, `git diff`, `git log`, `git show`, `npm test`, `npm audit`

---

## 30. Experience Replay

Agents record lessons from every significant success and failure.

### What Gets Recorded
- `failure` category: package quirks, build errors, module-system mistakes, security findings, incorrect assumptions
- `success` category: patterns that worked, correct configurations, fast implementation approaches, tech decisions that paid off

### How It's Used
Before starting work similar to past tasks, agents query experiences by:
- tech stack tags (`["prisma", "postgresql"]`)
- category (`failure` / `success`)
- keyword search
- date range

### Journal Capacity
- 500 entries maximum (rolling, oldest removed when full)
- Each entry: category, tags, summary, timestamp, agentName

### Tools
| Tool | What it does |
|:--|:--|
| `record_experience` | Record a new experience entry |
| `query_experiences` | Search experiences by tech/category/keyword/date |

---

## 31. Web Search

Agents can search the web for documentation, API references, package info, and error solutions.

- Powered by [Tavily](https://tavily.com/) search API
- Requires `TAVILY_API_KEY` environment variable
- Available to all lead agents and the PM
- Returns relevant excerpts with source URLs
- Used for: unknown error messages, package usage examples, framework version differences, security advisories

---

## 32. Dependency Graph Ordering

Before writing any files, agents can ask for the correct implementation order.

### How It Works
The `build_dependency_order` tool analyzes planned files and returns them sorted so:
- Type definition files come before files that import them
- Utility/helper files come before feature files
- Schema files come before database access files
- Core modules come before integrations

This prevents "import not found" errors from writing files in the wrong order.

---

## 33. Multi-Agent Code Search

Agents can search the codebase without reading every file.

### Code Search Tools
| Tool | What it does |
|:--|:--|
| `code_search` | Full-text search across all source files |
| `find_symbol` | Find where a function, class, or type is defined or used |

`find_symbol` is used for projects with 100+ files where reading every file would waste context.

---

## 34. Hooks System

Run custom shell commands at key lifecycle events.

### Available Hooks

| Hook | When it fires |
|:--|:--|
| `preTask` | Before each agent turn starts |
| `postTask` | After each agent turn completes |
| `onExit` | When SajiCode exits |

### Config
```json
{
  "hooks": {
    "preTask": "echo 'Starting task' >> .sajicode/task-log.txt",
    "postTask": "git add -A && git status",
    "onExit": "notify-send 'SajiCode done'"
  }
}
```

---

## 35. Configuration Reference

### Full config schema (`.sajicode/config.json`)

```json
{
  "modelConfig": {
    "provider": "anthropic",
    "modelName": "claude-sonnet-4-6",
    "baseUrl": "http://localhost:11434"
  },
  "riskTolerance": "medium",
  "humanInTheLoop": {
    "enabled": false,
    "tools": {
      "execute": {
        "allowedDecisions": ["approve", "edit", "reject"]
      }
    },
    "allowedCommands": ["npm run", "node ", "mkdir", "npx tsc"]
  },
  "whatsapp": {
    "enabled": false,
    "mode": "admin",
    "personalBotPrompt": ""
  },
  "hooks": {
    "preTask": "",
    "postTask": "",
    "onExit": ""
  }
}
```

### Memory layout (`.sajicode/`)

```
.sajicode/
├── config.json               ← project configuration
├── PROJECT.dna               ← persistent project brain (9 sections)
├── SAJICODE.md               ← project context for agents
├── active_context.md         ← current session context
├── Plan.md                   ← current task plan
├── Architecture.md           ← current architecture diagram
├── Whats_done.md             ← session progress tracker
├── contracts.json            ← Phase 0 contracts registry
├── patterns.json             ← dynamic learned patterns
├── session-state.json        ← resumable session state
├── process-state.json        ← command cache (TTL-based)
├── current-session.txt       ← current git session ID
├── experiences.json          ← experience journal (500 entries)
├── memories/
│   ├── backend-lead.md
│   ├── frontend-lead.md
│   └── ...                   ← per-agent memory files
├── transcripts/              ← searchable session history
└── snapshots/                ← file backups before edits
```

---

*SajiCode v1.2.3 — Built by [Rahees Ahmed](https://github.com/RaheesAhmed)*
