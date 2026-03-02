
AgentForge
AI Engineering Team CLI
Product Requirements Document  •  v1.0  •  February 2026
Status	Draft — Internal
Version	1.0.0
Target Launch	Q3 2026 (Beta)
Stack	TypeScript + LangGraph.js + Node.js

1. Executive Summary

AgentForge is a command-line AI engineering team that replaces the single-agent AI coding assistant with a coordinated team of specialized agents. Instead of one agent that hallucinates, deletes files, writes placeholder code, and loses context — AgentForge deploys a full team: a Project Manager, Backend Engineer, Frontend Engineer, Test Engineer, Security Auditor, and Deploy Agent — all working in parallel, coordinating over a shared state graph powered by LangGraph.js.

The product is built as a CLI tool first — inspired by the success of Claude Code, which reached $1B ARR in 6 months as a terminal-only product. The CLI is the fastest path to real users, real feedback, and a proven agent architecture. The full IDE experience comes in v2.

AgentForge's core differentiator is not features — it is reliability. Every competitor (Cursor, Google Antigravity, Amazon Kiro) shares the same fatal architecture flaw: agents act without judgment. AgentForge introduces a Judgment Layer that evaluates risk before every action, a Completeness Validator that blocks placeholder code, and a Security Agent that runs in parallel with every task. The result is an agent team that behaves like a senior engineering team, not an autocomplete engine.

2. Problem Statement

2.1 The Market Is Broken
Every AI coding tool on the market today — Cursor, Google Antigravity, Amazon Kiro, GitHub Copilot — is fundamentally the same product: a single AI agent with a chat interface bolted onto a code editor. This architecture has three critical failure modes that no competitor has solved.

Failure Mode 1 — Agents That Act Without Judgment
⦁	Cursor deletes files, overwrites working code, and rewrites tests to pass its own broken code rather than fixing the code itself.
⦁	Google Antigravity wiped a developer's entire drive and then apologized. It also deleted compliance-critical code in a fintech app and flagged the human's attempt to restore it as 'inefficiency.'
⦁	Amazon Kiro confirmed arbitrary code execution via indirect prompt injection — agents execute commands the user never approved.
⦁	All tools share the same root cause: zero pre-action risk assessment. Agents fire and hope.

Failure Mode 2 — Single Agent Architecture
⦁	Every product is built around one agent handling everything — planning, coding, testing, security, deployment. This is inherently fragile.
⦁	Long tasks cause context loss. Kiro loses full context on failed tasks, forcing restarts and burning usage limits. Cursor drifts on large monorepos.
⦁	No specialization. The agent that writes frontend code is the same agent that audits security. These require different knowledge, different tools, and different behaviors.
⦁	No parallelism. Work is serial. Backend is done before frontend starts. Testing happens at the end. Bugs compound.

Failure Mode 3 — No Beginner-to-Expert Spectrum
⦁	Every tool assumes the user is a senior developer. There is no onboarding that adapts to the user's level.
⦁	Beginners get overwhelmed by technical questions. Experts get talked down to with over-simplified explanations.
⦁	The result is a tool that works well only for the 20% of developers who already know exactly what they want.

3. Competitor Analysis

Weakness	Cursor	Antigravity	Kiro	Claude Code
Deletes / breaks files	✗ Yes	✗ Yes	✗ Yes	~ Partial
Placeholder / stub code	✗ Yes	✗ Yes	✗ Yes	✗ Yes
Loses context on big tasks	✗ Yes	✗ Yes	✗ Yes	~ Partial
Security vulnerabilities	✗ CVEs 2025	✗ .env exfil	✗ RCE via injection	✓ Better
Team / parallel agents	~ Multi-tab only	~ Agent Manager	✗ No	✗ No
Beginner onboarding	✗ No	✗ No	✗ No	✗ No
Pre-action risk judgment	✗ No	✗ No	✗ No	✗ No
Built-in deployment	✗ No	✗ No	✗ No	✗ No
Sub-agent spawning	✗ No	✗ No	✗ No	✗ No

4. Product Vision

AgentForge is the first AI engineering team you can install in one command. Not an agent with autocomplete. Not a chatbot that writes code. A team — with roles, coordination, judgment, and accountability — that behaves like senior engineers and ships real, complete, tested, deployed software.

4.1 The North Star
A user with no coding experience types 'I want a store website for my bakery.' Twenty minutes later, they have a fully tested, deployed, live web application — built by a team of agents that asked the right questions, split the work intelligently, wrote real code with zero placeholders, ran tests before shipping, and deployed to the cloud. The user never had to Google anything.

4.2 Core Principles
⦁	Reliability over features — an agent team that never breaks things is worth 10x one that has more features but is unreliable.
⦁	Judgment before action — every agent checks the risk of what it is about to do before doing it.
⦁	Real code only — the system cannot produce placeholder code, empty functions, or TODO stubs. It loops until the implementation is complete.
⦁	Parallel by default — backend, frontend, tests, and security run simultaneously, not sequentially.
⦁	Adaptive to the user — beginners get guidance, experts get speed. The onboarding shapes the entire workflow.

5. User Personas

	The Beginner	The Solo Developer	The Tech Lead
Profile	Non-technical founder or hobbyist. Has an idea but no coding background.	Experienced dev working alone on a product. Knows what they want.	Senior engineer managing a team. Wants to delegate grunt work to agents.
Goal	Turn their idea into a working product without learning to code.	10x their output. Ship faster, test more, reduce context switching.	Spin up complete features or prototypes in minutes, not days.
Pain Point	Existing tools require too much technical knowledge to even get started.	Current agents write partial code, break things, require babysitting.	Agents lack the architectural judgment to handle complex real-world systems.

6. Feature Specification

6.1 Smart Onboarding Agent
The first agent the user ever talks to. Its job is to understand the user's experience level, their goal, and their constraints — and then shape the entire team's behavior accordingly.

Behavior — Beginner Path
⦁	Asks experience level upfront: Beginner / Intermediate / Expert.
⦁	Asks simple, jargon-free questions: 'What does your app need to do?' 'Do you need users to log in?' 'Do you need payments?'
⦁	Makes all technical decisions automatically: stack, database, framework, hosting.
⦁	Explains every decision in plain language before proceeding.
Behavior — Expert Path
⦁	Asks technical questions directly: 'Which stack? What's your DB? Auth provider? CI/CD preference?'
⦁	Accepts technical shorthand and skips explanations unless asked.
⦁	Lets the expert override any default decision.

6.2 Project Manager Agent
The PM Agent is the orchestrator. It takes the onboarding output and produces a milestone plan, assigns agents to each milestone, monitors progress, handles failures, and spawns sub-agents when tasks are too large for one agent.

⦁	Breaks any request into numbered milestones with clear acceptance criteria.
⦁	Assigns each milestone to the appropriate specialist agent.
⦁	Detects when a milestone is too large and splits it — spawning sub-agents to work in parallel.
⦁	Maintains a shared state graph (via LangGraph) visible to all agents at all times.
⦁	Re-assigns work on agent failure without losing context.
⦁	Reports real-time progress to the terminal UI.

6.3 Specialist Agent Team
Agent	Responsibilities	Tools Available
Backend Agent	API routes, database schema, auth, business logic, server config.	File read/write, shell execution, DB client, API testing.
Frontend Agent	UI components, routing, state management, styling, responsive design.	File read/write, browser preview, component library access.
Test Agent	Writes tests before implementation (TDD). Runs test suite. Blocks deployment if tests fail.	Test runner (Jest/Vitest), coverage reports, diff analysis.
Security Agent	Runs in parallel with all agents. Reviews every file change for vulnerabilities. Blocks merges on critical issues.	Static analysis, dependency audit, secret scanner, OWASP checklist.
Review Agent	Final gate before deployment. Checks for placeholders, empty functions, broken imports, incomplete features.	AST analysis, completeness scoring, import graph traversal.
Deploy Agent	Handles the step every competitor skips: hosting setup, env vars, SSL, domain, CI/CD pipeline.	Cloud provider APIs (Vercel, Railway, AWS), DNS, GitHub Actions.

6.4 Judgment Layer
The most important architectural feature. Every agent must pass every action through the Judgment Layer before execution. This is what prevents the file deletions, drive wipes, and security exploits that plague every competitor.

Risk Level	Score	Action
Safe	0–30	Execute immediately. Log the action.
Caution	31–60	Show diff to user. Proceed after 3-second countdown unless user cancels.
High Risk	61–85	Pause. Show full impact analysis. Require explicit yes/no approval.
Critical Block	86–100	Hard stop. Explain why. Suggest alternatives. Cannot proceed without user override code.

Risk scoring factors: number of files affected, whether files are in version control, presence of critical keywords (auth, payment, migration, delete), dependency count of affected modules, and whether the action is reversible.

6.5 Completeness Validator
A dedicated validation step that runs before any code is saved or committed. The validator uses AST analysis to detect and block: empty function bodies, TODO/FIXME/PLACEHOLDER comments, unimplemented interface methods, stub return values (return null, return {}, throw new Error('Not implemented')), and missing error handling in async functions.

If any issue is found, the writing agent is looped back with a specific, targeted prompt. It cannot exit the graph with incomplete code. This loop runs up to 3 times before escalating to the PM Agent for re-assignment.

6.6 Dynamic Sub-Agent Spawning
When the PM Agent determines a milestone is too complex for a single agent, it spawns parallel sub-agents. Each sub-agent is a full instance of the relevant specialist, scoped to a specific sub-task, running concurrently with siblings.

⦁	Example: 'Build the backend' becomes Backend-Auth Sub-Agent + Backend-DB Sub-Agent + Backend-API Sub-Agent running in parallel.
⦁	Sub-agents share the same state graph and coordinate via message passing — they cannot overwrite each other's work.
⦁	The PM Agent merges sub-agent outputs and validates consistency before moving to the next milestone.

6.7 Terminal UI
The CLI provides a rich, real-time terminal interface built with the Ink library (React for terminals). The UI shows: the full agent team with live status indicators, active task per agent, overall milestone progress bar, a live log stream of agent actions, judgment layer alerts requiring approval, and estimated time remaining.

7. Technical Architecture

7.1 Technology Stack
Layer	Technology	Purpose
Language	TypeScript 5.x	Type safety, modern async, best ecosystem for LangGraph.
Runtime	Node.js 22 / Bun	Fast startup, wide compatibility, easy global install.
Agent Orchestration	LangGraph.js	State machine for multi-agent coordination, checkpointing, human-in-the-loop.
LLM API	Anthropic TypeScript SDK	Claude as the primary model. Support for GPT-4 and Gemini as fallbacks.
CLI Framework	Commander.js	Command parsing, help generation, argument validation.
Terminal UI	Ink + Chalk + Ora	React-based terminal rendering, colors, spinners, progress bars.
State Persistence	LangGraph Checkpointer + SQLite	Session continuity, agent memory across restarts.
AST Analysis	TypeScript Compiler API + Tree-sitter	Completeness validation, dependency graph analysis.
Distribution	npm global package	One command install. Cross-platform. No runtime dependencies.

7.2 LangGraph Agent Architecture
The entire multi-agent system is modeled as a LangGraph state graph. The graph has the following key nodes:

1.	OnboardingNode — Collects user information. Sets experience level, project type, stack preferences in shared state.
2.	PlannerNode — PM Agent reads state, produces milestone list with agent assignments. Writes plan to state.
3.	RouterNode — Reads current milestone, routes to appropriate specialist node. Handles conditional branching for sub-agent spawning.
4.	SpecialistNodes — Backend, Frontend, Test, Security, Review, Deploy. Each reads its scoped state, executes, writes output.
5.	JudgmentNode — Intercepts every file system action. Scores risk. Routes to human-approval interrupt if threshold exceeded.
6.	ValidatorNode — Completeness check on all code outputs. Loops back to specialist on failure.
7.	MergeNode — PM Agent merges sub-agent outputs, validates consistency, advances to next milestone.
8.	CheckpointNode — LangGraph built-in persistence. Saves full state after every node execution.

8. CLI Commands

Command	Description
agentforge init	Initialize a new AgentForge project in the current directory.
agentforge build [prompt]	Start the full agent team on a task. Triggers onboarding if no config exists.
agentforge status	Show current team status, active milestones, and progress.
agentforge resume	Resume a paused or interrupted session from the last checkpoint.
agentforge rollback	Atomically undo all changes made in the current or last session.
agentforge deploy	Run the Deploy Agent standalone to push current project to cloud.
agentforge audit	Run the Security Agent standalone on the current codebase.
agentforge config	Set API keys, preferred model, default stack, risk tolerance level.

9. Build Roadmap

Phase	Timeline	Deliverables	Exit Criteria
Phase 1	Weeks 1–2	Onboarding Agent + PM Agent + LangGraph state graph scaffold. Basic task planning works end-to-end.	Demo: user input → milestone plan output.
Phase 2	Weeks 3–4	Backend Agent + Frontend Agent running in parallel. First real project built end-to-end (simple REST API + basic UI).	Demo: 'Build me a todo app' — working code output.
Phase 3	Weeks 5–6	Judgment Layer + Completeness Validator + Security Agent. No more placeholder code. No more rogue actions.	Zero placeholder code in output. Risk intercept working.
Phase 4	Weeks 7–8	Sub-agent spawning + Test Agent + Review Agent. Full team working on complex projects.	Demo: full e-commerce site built and tested.
Phase 5	Weeks 9–10	Deploy Agent + session rollback + rich terminal UI. Full polish. npm publish.	Prompt to live URL in one command.
Beta Launch	Week 11–12	Open source release on GitHub. HackerNews Show HN post. Developer community outreach. Feedback collection.	500 GitHub stars. 100 active users.

10. Success Metrics

10.1 Technical Quality (must hit before launch)
⦁	Zero placeholder code rate: 100% of code outputs pass the Completeness Validator.
⦁	File safety: zero user-reported file deletion incidents in beta.
⦁	Context retention: agent team maintains full context on projects up to 50,000 lines of code.
⦁	Parallel efficiency: team completes tasks at least 2x faster than single-agent competitors on equivalent tasks.

10.2 User Traction (3 months post-launch)
⦁	1,000+ GitHub stars within 30 days of launch.
⦁	500+ weekly active CLI users.
⦁	NPS score above 60 from developer survey.
⦁	3+ unsolicited media mentions or blog posts from developers.

11. Risks & Mitigations

Risk	Severity	Mitigation
Agent team coordination complexity causes cascading failures.	High	LangGraph checkpointing ensures no state loss. Each agent scoped to independent file zones. PM Agent arbitrates conflicts.
LLM API costs make the tool expensive for power users.	Medium	Implement token budgets per agent, smart caching of repeated patterns, summarization of completed milestones.
Competitors ship team-agent features before launch.	Medium	The Judgment Layer + Completeness Validator + Deploy Agent are defensible differentiators regardless of team structure.
Judgment Layer is too conservative and blocks legitimate actions.	Medium	Risk thresholds are configurable per user. Expert mode defaults to lower intervention. All thresholds tuned via beta feedback.
Deploy Agent breaks on edge case cloud provider configs.	Low	Launch with Vercel and Railway only — highest compatibility. Expand cloud targets post-beta based on demand.

12. Future Vision — v2 IDE

The CLI is v1. v2 is the IDE — a full Rust-based code editor with the AgentForge team built in as first-class citizens. The CLI becomes the agent engine. The IDE becomes the cockpit.

⦁	Built-in browser with full Chrome DevTools Protocol access — agents see console, network, DOM in real time and close their own feedback loop.
⦁	Visual Agent Graph View — a live canvas showing the LangGraph state machine as it executes, with each agent's status, the active edges, and human-in-the-loop approval nodes surfaced inline.
⦁	Agent-aware file tree — every file tagged with which agent last touched it, why, and what changed.
⦁	Full session timeline — every agent decision, every risk judgment, every file change, scrollable and reversible.
⦁	The moat: built from scratch in 2026 with agents as the core primitive. VS Code is 10 years old. Cursor is VS Code with a chatbox. No one has built an IDE where the workflow is agent-native from day one.

— End of Document —