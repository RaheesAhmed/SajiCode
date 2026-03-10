# What's Done — SajiCode Development Log

> Comprehensive audit of the codebase as of **2026-03-03**. Every source file in `src/` has been read and cataloged.

---

## Project Overview

**SajiCode** (formerly OpenAgent) is a multi-agent AI engineering team CLI tool. It uses the DeepAgents framework with LangGraph to orchestrate a PM agent and 6 domain-head agents (each with their own sub-agents) to build entire projects via natural language. Features architecture-first planning, codebase intelligence via repo-map, structured JSON agent memory, MCP server integration, and expert-level specialist prompts.

- **Package name**: `openagent` (in `package.json`)
- **CLI brand**: `SajiCode` (all UI and prompts use this name)
- **Author**: Rahees Ahmed
- **License**: MIT
- **Node requirement**: `>=18.0.0`
- **Module system**: ESM (`"type": "module"`)

---

## Architecture Summary

```
User → REPL (src/index.ts) → PM Agent → Domain Heads (6) → Sub-Agents (10)
                                  ↕
                    Context / Memory / Tools / MCP / Repo-Map
```

| Layer          | Agent Count | Files                                    |
|----------------|-------------|------------------------------------------|
| PM Orchestrator | 1          | `src/agents/index.ts`, `src/prompts/pm.ts` |
| Agent Factory  | —          | `src/agents/agent-factory.ts` (6 presets) |
| Domain Heads   | 6          | `src/agents/domain-heads.ts` (thin wrapper → factory) |
| Sub-Agents     | 10         | Defined in `agent-factory.ts` presets    |
| Legacy SubAgent Defs | 6   | `src/subAgents/*.ts` (unused, pending deletion) |

### Agent Hierarchy

| Domain Head      | Sub-Agents                    | Territory                                                     |
|------------------|-------------------------------|---------------------------------------------------------------|
| `backend-lead`   | `api-builder`, `db-designer`  | `src/api/`, `src/routes/`, `src/middleware/`, `src/db/`, `src/models/`, `src/services/`, `src/server.ts` |
| `frontend-lead`  | `component-builder`, `style-designer` | `src/components/`, `src/pages/`, `src/hooks/`, `src/styles/`, `public/`, `*.html`, `src/app/` |
| `qa-lead`        | `unit-tester`, `integration-tester` | `tests/`, `__tests__/`, `*.test.ts`, `*.spec.ts`        |
| `security-lead`  | `vuln-scanner`, `dep-auditor` | `src/security/`, `.env.example`                               |
| `deploy-lead`    | `docker-specialist`, `ci-specialist` | `Dockerfile`, `docker-compose.yml`, `.github/`, `scripts/` |
| `review-agent`   | *(none — flat, read-only)*    | Read-only on all files                                        |

---

## Source Files — Complete Inventory

### `src/index.ts` (~370 lines) — Main Entry Point / REPL

- Shebang `#!/usr/bin/env node` for direct execution
- Interactive REPL loop using `readline` with orange prompt `>_`
- **Slash commands**: `/exit`, `/quit`, `/q`, `/help`, `/status`, `/clear`, `/init`
- **`/init`**: Scans project via `createCollectProjectContextTool`, then spawns an `init-agent` to generate `SAJICODE.md` at project root
- **`/status`**: Shows thread ID, model, project path, context status, HITL status
- **`/help`**: Formatted command list with `chalk.hex` colors
- **CLI arg parser**: `-p`/`--provider` and `-m`/`--model` flags
- **MCP server display**: After spinner completes, shows `mcp ● {server-names}` with separator line
- **Graceful shutdown**: SIGINT/SIGTERM handlers close MCP client connections before exit
- **HITL (Human-In-The-Loop) interrupt handling**:
  - `runAgentTurn()` streams agent output and handles any `__interrupt__` signals
  - `collectDecisions()` shows each action request, prompts user with `@inquirer/prompts` (`select`/`input`)
  - Supports `approve`, `reject`, `edit` (with JSON arg editing) decisions
  - Auto-approves commands matching `allowedCommands` prefixes (e.g. `npm install`, `npm run`, `mkdir`)
  - Resumes agent with `new Command({ resume: { decisions } })`
- `createSajiCode()` returns `{ agent, sessionConfig, mcpClient }`
- Error handling with `printError` on agent turn failures
- Stream modes: `["updates", "messages", "custom"]` with `subgraphs: true`

### `src/cli/index.ts` (211 lines) — Commander CLI (Alternative Entry)

- Uses `commander` package for subcommand-based CLI
- **Commands**: `build`, `init`, `status`, `config`, `audit`
- `build [prompt...]`: Runs onboarding → creates SajiCode → streams agent output
  - Options: `-m/--model`, `-p/--path`
- `init`: Creates `.sajicode/config.json` in current directory
- `status`: Shows "No active session" message
- `config`: Set model, base URL, risk tolerance
- `audit`: Runs a full security audit by invoking the agent team with a security-focused prompt
- `buildInitialMessage()`: Constructs structured message from `OnboardingResult`

### `src/cli/renderer.ts` (~790 lines) — StreamRenderer

- **Core class**: `StreamRenderer` — processes the multi-mode async stream from DeepAgents
- **Markdown rendering**: Uses `MarkdownStream` from `streammark` library with `theme: "dark"` for token-by-token streaming markdown output
- **Spinners**: Three separate `ora` spinners:
  - `mainSpinner` — general purpose (e.g. "Initializing agent team...")
  - `toolSpinner` — per-tool progress (e.g. "Writing src/server.ts (42 lines)")
  - `thinkingSpinner` — "Thinking..." before first token arrives
- **Tool call visualization**: Handles streaming tool call chunks:
  - `write_file`: Shows file path, line count, and 6-line content preview
  - `edit_file`: Shows basename of file being edited
  - `execute`: Shows full command in spinner, then output (up to 10 lines)
  - `read_file`: Shows line count and 8-line numbered preview
  - `ls`: Shows entries with 📁/📄 icons, capped at 12
  - `grep`/`glob`: Shows up to 6 result lines
  - `task`: Delegation box with agent icon + label + description
  - `write_todos`: Todo list with ✓/●/○ status markers
  - `tavily_search_results_json`: Shows top 3 search results with title + snippet
  - `collect_repo_map`: 🗺️ "Mapping codebase..." spinner, shows file count + sample entries on result
  - `collect_project_context`: Shows file count + tech stack on result
  - `update_agent_memory`: Confirms structured JSON memory update
  - `save_memory`, `update_project_log`: Labeled spinners
- **Agent header rendering**: Orange background badge with agent name, deduped via `currentAgent` tracking
- **HITL interrupt display**: `printInterrupt()` shows action details, command text, and allowed decisions with color-coded options
- **Auto-approval display**: `printAutoApproved()` for allowedCommands
- **Agent lifecycle tracking**: `detectSpawns()`, `markWorking()`, `detectComplete()` track spawned/working/done agents
- **Session info panel**: Model, project, thread, context status, HITL status, optional MCP count with styled labels
- **Branding**: SajiCode header with `>_` prompt icon, orange borders, "The AI Engineering Team"
- **Types exported**: `ActionRequest`, `ReviewConfig`, `InterruptInfo`

### `src/cli/progress.ts` (88 lines) — ProgressTracker

- `ProgressTracker` class: Tracks milestones with id, title, status
- `printProgress()`: Renders a progress bar (`█░`) with percentage, count, and elapsed time
- Status icons: ✅ completed, 🔄 in_progress, ❌ failed, ⏳ pending
- `formatDuration()`: Converts seconds to `Xm Ys` format

---

### `src/agents/index.ts` (~150 lines) — Agent Factory

- **`createSajiCode(options)`**: Main factory function:
  - Creates model via `createModel()` (multi-provider)
  - Creates `LocalShellBackend` rooted at project path
  - Loads project context (SAJICODE.md + memories + whats_done)
  - Builds full system prompt: PM prompt + project context + onboarding context
  - Creates `MemorySaver` checkpointer
  - Creates context tools (4 tools) + repo-map tool + web search tool (Tavily)
  - **Initializes MCPClientManager** → loads tools from `.sajicode/mcp-servers.json` → adds to PM agent
  - Creates all 6 domain heads via factory
  - Builds HITL `interruptOn` config from per-tool settings
  - Creates the PM `deepAgent` with all tools, subagents, middleware, skills
  - Returns `{ agent, sessionConfig, mcpClient }` with `recursionLimit: 150`
- **`createInitAgent(config, threadId)`**: Lightweight agent for `/init` command:
  - Uses `INIT_SYSTEM_PROMPT` to generate SAJICODE.md
  - Has context tools + repo-map + web search but no domain heads
  - `recursionLimit: 100`
- **`buildContextPrompt(result)`**: Formats onboarding result into system prompt sections
- **`buildInterruptOn(hitl)`**: Converts HITL config into DeepAgents `interruptOn` format
- Exports `runOnboarding` from `./onboarding.js`

### `src/agents/agent-factory.ts` (~240 lines) — Dynamic Agent Factory ✨ NEW

- **`AgentSpec` interface**: Defines agent blueprint: name, role, description, territory, forbiddenPaths, identity, systemPrompt, subagentSpecs
- **`createAgentFromSpec(spec, model, projectPath)`**: Creates a fully configured `CompiledSubAgent` from a spec:
  - Initializes agent memory file (JSON format)
  - Loads persistent memory into system prompt
  - Builds: territory prompt, delegation block, memory instructions
  - Adds tools: `update_agent_memory`, `update_project_log`, `collect_repo_map`, web search
  - Creates sub-agents from `subagentSpecs`
- **`AGENT_PRESETS`**: 6 built-in presets (backend-lead, frontend-lead, qa-lead, security-lead, review-agent, deploy-lead) with full specs
- **`createAllAgentsFromPresets(model, projectPath)`**: Creates all 6 agents from presets — called by `domain-heads.ts`
- Foundation for future dynamic spawning where PM creates agents on-the-fly

### `src/agents/context.ts` (113 lines) — Context Loading

- **Constants**: `.sajicode` dir, `memories/` subdir, `SAJICODE.md`, `whats_done.md`
- **`ensureSajiCodeDir(projectPath)`**: Creates `.sajicode/memories/` and `.sajicode/agents/`
- **`loadProjectContext(projectPath)`**: Loads and concatenates:
  - `SAJICODE.md` from project root (labeled "Project Context")
  - `.sajicode/whats_done.md` (labeled "Previous Work" with "⚠️ Do NOT redo" warning)
  - All `.md` files from `.sajicode/memories/` (labeled "⚠️ SAVED MEMORIES" with "ALWAYS reference them" instruction)
- **`hasSajiCodeMd(projectPath)`**: Checks if SAJICODE.md exists
- **`getSajiCodeMdPath(projectPath)`**: Returns full path
- **`INIT_SYSTEM_PROMPT`**: Instructions for the init agent to generate SAJICODE.md format (Overview, Tech Stack, Project Structure, Conventions, Build & Run, Notes)

### `src/agents/judgment.ts` (141 lines) — Judgment Middleware

- Created via `createMiddleware()` from `langchain`
- **Three protection layers**:
  1. **Risk Assessment** (`assessRisk()`):
     - HIGH_RISK patterns: `rm -rf`, `rm -r`, `drop table`, `truncate table`, `drop database`, `alter table`
     - SENSITIVE_PATHS: `.env`, `credentials`, `secrets`, `.ssh`, `private_key`
     - Shell execution (`execute`/`bash`) always flagged as Caution
     - Logs warnings to console with colored emoji markers
  2. **Placeholder Detection** (for `write_file`/`edit_file` only):
     - Checks content for: TODO, FIXME, HACK, placeholder, not implemented, coming soon, `// implement`, `// your code here`, `// add your`, `throw new Error("not implemented"`, ellipsis bodies `{ ... }`
     - **BLOCKS** the tool call entirely — returns `ToolMessage` with `status: "error"` and detailed instructions to write real code
  3. **Loop Detection**:
     - Tracks last 30 tool calls with name+args hash
     - If same exact call appears ≥3 times in last 10, injects warning into tool result
     - Warning tells agent to stop repeating, try different approach, or report as blocked

### `src/agents/onboarding.ts` (102 lines) — Interactive Onboarding

- Uses `@inquirer/prompts` (`select`, `input`) for interactive CLI prompts
- Asks experience level: beginner / intermediate / expert
- Collects project description (or uses provided `userPrompt`)
- Expert mode: additionally asks for framework and database preferences
- `extractFeatures()`: Auto-detects keywords (auth, payment, database, api, real-time, deploy, test) from description
- `inferProjectType()`: Classifies as ecommerce, dashboard, api, blog, saas, or web-app
- Returns `OnboardingResult` with all collected info

### `src/agents/domain-heads.ts` (~10 lines) — Thin Wrapper → Factory

- **`createAllDomainHeads(model, projectPath)`**: Delegates entirely to `createAllAgentsFromPresets()` from `agent-factory.ts`
- Maintains backward compatibility — same API as before
- Previously 464 lines with all agent definitions inline; now a thin wrapper after refactoring to the factory pattern

---

### `src/prompts/pm.ts` (~98 lines) — PM System Prompt ✨ REWRITTEN

- **Identity**: Staff-level engineering manager, thinks architecturally
- **Architecture-First 6-step workflow**:
  1. UNDERSTAND: Call `collect_repo_map` FIRST (condensed symbol-level map), then `collect_project_context`
  2. CLARIFY: Ask focused questions → STOP and wait (never self-answer)
  3. ARCHITECT: Create `.sajicode/architecture.md` with feature breakdown, agent assignments, file ownership, tech decisions. Ask user "Do you approve?" → wait
  4. BUILD: Delegate to specialists via `task()` — multiple in ONE response, with directory ownership and exact file paths
  5. VALIDATE: Use `ls`/`read_file`/`glob` to verify — NEVER delete or fix files directly
  6. UPDATE: Call `update_project_log` — "NOT optional"
- **Delegation groups** (ordered): Group 1: backend+frontend (parallel), Group 2: qa, Group 3: security+review, Group 4: deploy
- Concrete delegation examples with directory ownership and DO NOT TOUCH instructions
- Memory instruction: Use `save_memory` for user preferences

### `src/prompts/specialists.ts` (~135 lines) — Expert Specialist Prompts ✨ REWRITTEN

- 6 exported prompt constants rewritten to Google/Anthropic/Vercel caliber:
  - `BACKEND_SYSTEM_PROMPT`: Senior Backend Engineer (L6, Google/Meta caliber) — Zod validation, clean architecture, TypeScript strict
  - `FRONTEND_SYSTEM_PROMPT`: Senior Frontend Engineer & UI/UX Designer (Anthropic/Vercel caliber) — premium UI, glassmorphism, dark mode, responsive
  - `TEST_SYSTEM_PROMPT`: Senior QA Engineer (Google Testing caliber) — TDD, 80%+ coverage, never hardcode test values
  - `SECURITY_SYSTEM_PROMPT`: Senior Security Engineer (OWASP Expert, Pen-test caliber) — 5-step audit procedure, severity levels
  - `REVIEW_SYSTEM_PROMPT`: Principal Code Reviewer (Staff+ caliber) — 4-section review checklist, PASS/FAIL verdict
  - `DEPLOY_SYSTEM_PROMPT`: Senior DevOps Engineer (SRE caliber) — multi-stage Docker, GitHub Actions CI/CD
- Each has: action-first workflow (read context FIRST), specific coding standards, structured output format
- Used by `agent-factory.ts` presets

### `src/prompts/onboarding.ts` (22 lines) — Onboarding Prompt

- `ONBOARDING_PROMPT`: Instructions for a conversational onboarding agent
- Adapts language based on beginner vs expert level

### `src/prompts/index.ts` (11 lines) — Prompt Barrel Export

- Re-exports all prompts from `onboarding.ts`, `pm.ts`, `specialists.ts`

---

### `src/tools/context-tools.ts` (~360 lines) — 5 LangChain Tools

1. **`collect_project_context`** — One-call project scanner:
   - Reads `package.json` (name, version, scripts, deps)
   - Detects tech stack from 25+ dependency patterns (React, Vue, Express, Prisma, Jest, etc.)
   - Scans file tree (3 levels deep, ignores `node_modules`/`dist`/`.git`/etc.)
   - Reads README, SAJICODE.md, whats_done.md, all memories
   - Returns JSON with everything in one response

2. **`update_project_context`** — Section-based SAJICODE.md updater:
   - Takes `section` + `content`, upserts section in SAJICODE.md
   - Adds timestamp footer
   - Preserves other sections

3. **`save_memory`** — Long-term memory persistence:
   - Saves to `.sajicode/memories/{key}.md`
   - Append-only with timestamps
   - Intended for user preferences, decisions, instructions

4. **`update_agent_memory`** — Per-agent structured memory tool: ✨ UPDATED
   - Bound to specific agent name at creation time (factory pattern)
   - Records: what_was_done, files_created, files_modified, contracts, blockers
   - Now saves to **structured JSON** (`.sajicode/agents/{agent-name}.json`) via `appendAgentMemory()`
   - Each entry categorized as: progress, contract, or blocker with tags

5. **`update_project_log`** — Shared team log:
   - All agents write to `.sajicode/whats_done.md`
   - Records: agent_name, status (complete/in_progress/blocked/failed), summary, files, cross-agent contracts, remaining TODOs
   - Append-only — never overwrites previous entries
   - Status emoji: ✅/🔄/🚧/❌

- **`createContextTools(projectPath)`**: Returns array of tools 1-4 for injection into agents

### `src/tools/repo-map.ts` (~182 lines) — Codebase Symbol Scanner ✨ NEW

- **`createRepoMapTool(projectPath)`**: Creates `collect_repo_map` LangChain tool
- Scans project tree extracting function/class/interface/export signatures
- **7 languages supported**: TypeScript/JavaScript, Python, Go, Java, Ruby, Rust, PHP
- Returns condensed markdown map: ~50 tokens/file vs 500+ for `read_file`
- Ignores: `node_modules`, `dist`, `build`, `.git`, `.next`, `.nuxt`, `coverage`, `__pycache__`, `.venv`
- Max depth: 6 levels, max files: 300, max file size: 500KB
- Agents call this FIRST to understand the codebase structure

### `src/tools/web-search.ts` (8 lines) — Web Search

- Uses `@langchain/tavily` (`TavilySearch`) with configurable `maxResults` (default 3)
- Creates a `tavily_search_results_json` tool
- Requires `TAVILY_API_KEY` environment variable

---

### `src/config/index.ts` (118 lines) — Configuration

- **Default model config**: Ollama, `minimax-m2.5:cloud`, temperature 0, max retries 3, `localhost:11434`
- **Default HITL config**: Disabled by default
  - `execute` tool: approve/edit/reject decisions
  - `delete_file` tool: approve/reject decisions
  - Auto-approved command prefixes: `npm install`, `npm run`, `npx tsc`, `npx tsx`, `mkdir`, `node `, `dir `, `ls `
- Config stored in `.sajicode/config.json`
- **`loadConfig(projectPath)`**: Reads config file, merges with defaults, deep-merges HITL settings
- **`saveConfig(config)`**: Writes serialized config to `.sajicode/config.json`
- **`ensureProjectDir(projectPath)`**: Creates `.sajicode/` directory
- Auto-creates default config file on first run

---

### `src/llms/provider.ts` (63 lines) — Multi-Provider LLM Factory

- **`createModel(config)`**: Creates `BaseChatModel` for any supported provider
- **4 providers**:
  - `ollama`: `ChatOllama` — local, default url `localhost:11434`
  - `openai`: `ChatOpenAI` — dynamic import, reads `OPENAI_API_KEY` env var
  - `anthropic`: `ChatAnthropic` — dynamic import, reads `ANTHROPIC_API_KEY` env var
  - `google`: `ChatGoogleGenerativeAI` — dynamic import, checks 3 env vars (`GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`)
- CLI override: `-p openai -m gpt-4.1`

### `src/llms/ollama.ts` (12 lines) — Ollama Provider (Standalone)

- `createOllamaProvider(config)`: Direct `ChatOllama` factory
- Used as a standalone helper, not the main provider path

---

### `src/mcp/MCPClient.ts` (~120 lines) — MCP Client Manager ✨ REWRITTEN

- **`MCPClientManager`** class: Wraps `@langchain/mcp-adapters` `MultiServerMCPClient`
- **`initialize()`**: Loads MCP server configs from `.sajicode/mcp-servers.json`
  - **Stderr suppression**: Wraps commands with `cmd /c ... 2>nul` (Windows) or `sh -c ... 2>/dev/null` (Linux/Mac) to suppress MCP server stderr noise (e.g. Python logging `INFO ListToolsRequest`)
- **Config format**: Supports `mcpServers` or `servers` keys, each with `command`, `args`, `transport`, `env`, `enabled`/`disabled`
- Template variable: `{{projectPath}}` replaced in args
- Only creates client if servers are configured
- **`getTools()`**: Returns tools from all connected MCP servers
- **`close()`**: Cleanly disconnects all MCP server connections
- **`getServerNames()`**: Returns list of connected server names for session display
- **`getServerCount()`**: Returns number of connected servers
- **Fully wired** into `createSajiCode()` — MCP tools added to PM agent's tool array

---

### `src/memory/agent-memory.ts` (~150 lines) — Structured JSON Agent Memory ✨ REWRITTEN

- **Format**: `{ identity, territory, entries: [{ timestamp, category, content, tags }] }`
- **Categories**: `decision`, `contract`, `blocker`, `architecture`, `progress`, `user_preference`
- **`ensureAgentMemoryDir(projectPath)`**: Creates `.sajicode/agents/` directory
- **`loadAgentMemory(projectPath, agentName)`**: Loads JSON memory, formats last 20 entries grouped by category for prompt injection. Falls back to legacy `.md` format if `.json` not found.
- **`initAgentMemoryFile(projectPath, agentName, identity, owns)`**: Creates initial `.json` file. Won't overwrite existing.
- **`appendAgentMemory(projectPath, agentName, category, content, tags)`**: Appends structured entry. Max 100 entries per agent (older entries trimmed).
- **`searchAgentMemory(projectPath, agentName, query)`**: Keyword search across content and tags for selective retrieval.

### `src/memory/index.ts` (23 lines) — Thread & Checkpointer

- Singleton `MemorySaver` instance via `getCheckpointer()`
- `generateThreadId()`: `sajicode-{timestamp}-{random6}`
- `createSessionConfig(threadId)`: Returns `{ configurable: { thread_id } }`

---

### `src/types/config.ts` (105 lines) — TypeScript Types

- **`ModelConfig`**: provider, modelName, temperature, maxRetries, baseUrl, apiKey
- **`ProjectConfig`**: projectPath, modelConfig, riskTolerance, humanInTheLoop
- **`OnboardingResult`**: experienceLevel, projectDescription, projectType, features, stackPreferences
- **`StackPreferences`**: framework, database, auth, hosting, styling, testing
- **`HumanInTheLoopConfig`**: enabled, tools (per-tool config), allowedCommands
- **`HumanInTheLoopToolConfig`**: allowedDecisions array
- **`AgentRole` enum**: PM, Backend, Frontend, Test, Security, Review, Deploy
- **`Milestone`**: id, title, description, assignedAgent, status, acceptanceCriteria
- **`RiskLevel` enum**: Safe, Caution, HighRisk, Critical
- **`RiskAssessment`**: score, level, reason, filesAffected, isReversible
- **`AGENT_ICONS`**: Emoji map (📌⚙️🎨🧪🔒📋🚀)
- **`AGENT_LABELS`**: Human-friendly name map

### `src/types/index.ts` (18 lines) — Type Barrel Export

- Re-exports all types and constants from `config.ts`

### `src/types/streammark.d.ts` (18 lines) — StreamMark Ambient Types

- Declares `streammark` module with `MarkdownStream` class, `render()`, `print()`, `themes`
- Custom type declaration since `streammark` has no built-in types

---

### `src/utils/platform.ts` (43 lines) — Platform Detection

- **`getPlatformInfo()`**: Returns `{ isWindows, platform, pathSep }`
- **`getPlatformPrompt(projectPath)`**: Generates platform-specific rules:
  - **Windows**: PowerShell rules, backslash paths, forbidden commands (`ls`, `mkdir -p`, `rm -rf`, `cat`, `grep`, `touch`, `del`, `rm`), correct alternatives (`dir`, `mkdir`, `type`, `findstr`)
  - **Unix**: Forward slash paths, standard Unix commands
  - Both: "NEVER delete files" rule

### `src/utils/skills.ts` (31 lines) — Skills Loader

- Resolves project root from `import.meta.url`
- **`getSkillsDir()`**: Returns `{projectRoot}/skills/` with forward slashes
- **`getSkillPaths(skillNames)`**: Maps skill names to full paths
- **`getAllSkillPaths()`**: Scans `skills/` dir, returns paths for all dirs containing `SKILL.md`

---

### `src/subAgents/` (7 files) — Legacy Flat SubAgent Definitions

These are **SubAgent type definitions** (not CompiledSubAgents) used by the original flat architecture. They reference prompts from `src/prompts/specialists.ts` but have empty `tools: []`. The main agent creation flow now uses `domain-heads.ts` instead.

| File | Agent Name | Prompt Source |
|------|-----------|---------------|
| `backend.ts` | `backend-agent` | `BACKEND_SYSTEM_PROMPT` |
| `frontend.ts` | `frontend-agent` | `FRONTEND_SYSTEM_PROMPT` |
| `test.ts` | `test-agent` | `TEST_SYSTEM_PROMPT` |
| `security.ts` | `security-agent` | `SECURITY_SYSTEM_PROMPT` |
| `review.ts` | `review-agent` | `REVIEW_SYSTEM_PROMPT` |
| `deploy.ts` | `deploy-agent` | `DEPLOY_SYSTEM_PROMPT` |
| `index.ts` | Barrel export | Exports `ALL_SUBAGENTS` array |

---

## Skills (14 SKILL.md files)

Located in `skills/` directory at project root:

| Skill | Purpose |
|-------|---------|
| `3d-web-experience` | 3D web development |
| `ai-engineer` | AI engineering patterns |
| `database` | Database design & ORM |
| `devops` | DevOps & CI/CD |
| `frontend` | Frontend development |
| `mcp-server` | MCP server development |
| `nextjs` | Next.js patterns |
| `nodejs` | Node.js backend |
| `premium-ui` | Premium UI design |
| `security` | Security best practices |
| `shadcn-ui` | ShadCN UI components |
| `styling` | CSS/styling patterns |
| `superpowers` | Advanced agent capabilities |
| `testing` | Testing methodologies |

All skill paths are auto-discovered by `getAllSkillPaths()` and injected into every domain head and their sub-agents.

---

## Dependencies (from `package.json`)

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| `deepagents` | ^1.8.1 | Multi-agent orchestration framework |
| `@langchain/langgraph` | ^1.1.5 | Graph-based agent execution |
| `@langchain/core` | ^1.1.29 | LangChain core primitives |
| `@langchain/ollama` | ^1.2.3 | Ollama LLM adapter |
| `@langchain/openai` | ^1.2.8 | OpenAI LLM adapter |
| `@langchain/google-genai` | ^2.1.19 | Google Gemini adapter |
| `@langchain/tavily` | ^1.2.0 | Tavily web search tool |
| `@langchain/mcp-adapters` | ^1.1.3 | MCP server integration |
| `@langchain/community` | ^1.1.20 | Community integrations |
| `langchain` | ^1.2.28 | Middleware (judgment layer) |
| `chalk` | ^5.6.2 | Terminal coloring |
| `ora` | ^9.3.0 | Terminal spinners |
| `streammark` | ^1.0.3 | Terminal markdown streaming |
| `commander` | ^14.0.3 | CLI framework (subcommands) |
| `@inquirer/prompts` | ^8.2.1 | Interactive prompts (HITL + onboarding) |
| `@clack/prompts` | ^1.0.1 | CLI prompts |
| `zod` | ^4.3.6 | Schema validation (tool inputs) |
| `dotenv` | ^16.4.5 | Environment variables |
| `express` | ^5.2.1 | (Available for agent-built projects) |
| `chokidar` | ^5.0.0 | File watching |
| `glob` | ^13.0.6 | File glob patterns |
| `fs-extra` | ^11.3.3 | Extended file operations |
| `uuid` | ^13.0.0 | UUID generation |
| `marked` | ^15.0.12 | Markdown parsing (legacy) |
| `marked-terminal` | ^7.3.0 | Markdown terminal rendering (legacy) |

### Dev
| Package | Purpose |
|---------|---------|
| `typescript` | ^5.7.2 |
| `eslint` + `@typescript-eslint/*` | Linting |
| `ts-node` | ^10.9.2 |
| `rimraf` | ^6.0.1 |

---

## Key Features Implemented

### ✅ Dual Entry Points
- **REPL mode** (`src/index.ts`): Interactive chat with `/` commands — primary entry point
- **Commander CLI** (`src/cli/index.ts`): `build`, `init`, `status`, `config`, `audit` subcommands

### ✅ Multi-Agent Orchestration (DeepAgents)
- PM agent orchestrates 6 domain heads
- Each domain head has 2 sub-agents (except review which is flat)
- Total: 1 PM + 6 heads + 10 sub-agents = **17 agents**
- Parallel delegation enforced in PM prompt (Group 1: backend+frontend, Group 2: qa+security, Group 3: review, Group 4: deploy)

### ✅ Human-In-The-Loop (HITL) Approval System
- Configurable per-tool interrupt settings in `.sajicode/config.json`
- Interactive approve/reject/edit flow using `@inquirer/prompts`
- Auto-approval for safe commands via `allowedCommands` prefix list
- Visual interrupt block in terminal with command preview and decision options
- Resume mechanism via `Command({ resume: { decisions } })`

### ✅ Judgment Middleware (3 Layers)
- **Risk assessment**: Logs warnings for destructive/sensitive operations
- **Placeholder blocking**: BLOCKS `write_file`/`edit_file` if content contains TODO/FIXME/placeholder/stub patterns — returns error ToolMessage forcing real code
- **Loop detection**: Warns agent after 3+ identical tool calls in last 10, tells it to change approach

### ✅ Multi-Provider LLM Support
- Ollama (default, local), OpenAI, Anthropic, Google Gemini
- CLI flags: `-p openai -m gpt-4.1`
- Dynamic imports for non-Ollama providers (tree-shaking)
- API key resolution from config or environment variables

### ✅ StreamRenderer with Markdown Streaming
- `streammark` library for real-time token-by-token markdown rendering with dark theme
- Three concurrent spinner types (main, tool, thinking)
- Rich tool call visualization (file preview, command output, search results, delegation boxes, todo lists)
- Agent headers with colored badges
- HITL interrupt display

### ✅ Multi-Layer Memory System
1. **Project context** (`SAJICODE.md`): Project-level docs, generated by `/init`
2. **Team log** (`.sajicode/whats_done.md`): Shared append-only log for all agents
3. **Agent memory** (`.sajicode/agents/{name}.md`): Per-agent persistent memory across sessions
4. **User memories** (`.sajicode/memories/*.md`): Long-term user preferences and decisions
5. **Session checkpointing** (`MemorySaver`): Per-thread state persistence
- All loaded into system prompts on startup
- Each agent has explicit memory tools: `update_agent_memory` + `update_project_log`

### ✅ Platform-Aware Prompts
- Windows: PowerShell rules, backslash paths, forbidden Unix commands
- Unix/macOS: Standard commands, forward slash paths
- Both: "NEVER delete files" safety rule
- Injected into PM + all 6 domain heads + all sub-agents

### ✅ Skills System (14 Skills)
- Auto-discovered from `skills/` directory
- Each skill is a directory with `SKILL.md`
- All skill paths injected into every agent via `getAllSkillPaths()`
- Covers: nodejs, database, frontend, styling, testing, security, devops, mcp-server, nextjs, premium-ui, shadcn-ui, ai-engineer, 3d-web-experience, superpowers

### ✅ Territory / Ownership System
- Each domain head has explicit owned/forbidden directory lists
- PM prompt includes full ownership map
- Agents instructed to stay in their territory

### ✅ MCP Client Infrastructure — Fully Wired ✨
- `MCPClientManager` class built with `@langchain/mcp-adapters`
- Reads config from `.sajicode/mcp-servers.json`
- Template variable support (`{{projectPath}}`)
- Multi-server support with stdio transport
- **Fully integrated** into `createSajiCode()` — MCP tools added to PM agent
- **Stderr suppression**: Wraps commands with OS-level stderr redirect to prevent MCP server log noise
- **Session display**: Shows connected MCP server names in session info (`mcp ● code-context`)
- **Graceful shutdown**: SIGINT/SIGTERM handlers close MCP client connections

### ✅ Web Search
- Tavily search tool (`@langchain/tavily`) with 3-result default
- Available to PM + all domain heads
- StreamRenderer shows search results with title + snippet preview

### ✅ Configuration System
- `.sajicode/config.json`: Model, risk tolerance, HITL settings
- Auto-creates default on first run
- Deep-merges HITL tool configs
- CLI `config` command to set model, base URL, risk tolerance

### ✅ Interactive Onboarding
- 3-level experience detection (beginner/intermediate/expert)
- Auto-feature extraction from description (auth, payments, database, API, real-time, deploy, testing)
- Project type inference (ecommerce, dashboard, api, blog, saas, web-app)
- Expert mode asks framework + database preferences

---

## File Count Summary

| Directory | Files | Total Lines |
|-----------|-------|-------------|
| `src/` (root) | 1 | ~370 |
| `src/agents/` | 6 | ~530 |
| `src/cli/` | 3 | ~1,080 |
| `src/config/` | 1 | 118 |
| `src/llms/` | 2 | 75 |
| `src/mcp/` | 1 | ~120 |
| `src/memory/` | 2 | ~170 |
| `src/prompts/` | 4 | ~270 |
| `src/subAgents/` | 7 | 92 (legacy, unused) |
| `src/tools/` | 3 | ~560 |
| `src/types/` | 3 | 141 |
| `src/utils/` | 2 | 74 |
| **Total** | **35** | **~3,600** |

---

## Known Issues / Not Yet Wired

- ~~`MCPClientManager` is fully implemented but not yet integrated~~ → **DONE** ✅ Wired into `createSajiCode()`
- `src/subAgents/` directory contains legacy flat SubAgent definitions (not used — pending deletion)
- `marked` and `marked-terminal` are still in dependencies (legacy — replaced by `streammark`)
- `@clack/prompts` is in dependencies but not imported anywhere in current source
- `omelette`, `log-update`, `string-width`, `@openrouter/sdk` are in dependencies but not used in source
- `ProgressTracker` class in `src/cli/progress.ts` is defined but not used in the main flow

---

## Branding Status

| Location | Brand | Status |
|----------|-------|--------|
| CLI header / UI | SajiCode | ✅ Updated |
| System prompts | SajiCode | ✅ Updated |
| Context file | SAJICODE.md | ✅ Updated |
| Config dir | .sajicode/ | ✅ Updated |
| package.json name | SajiCode | ✅ Updated |
| package.json bin | SajiCode | ✅ Updated |
| Git repo URL | SajiCode | ✅ Updated |

---

*Last updated: 2026-03-03T03:21:00+05:00 — Updated with v2 changes: repo-map tool, agent factory, rewritten prompts, MCP wiring, structured memory, renderer enhancements.*
