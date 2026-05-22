# Memory And Terminal Visibility Design

## Problem

SajiCode currently creates the three-layer memory directories, but a real run can
finish or stop with an empty pointer index, no topic files, and no transcript
history. The run captured under `.sajicode/` shows planning and process-state
artifacts without any three-layer memory entries.

The terminal renderer also hides useful activity during concurrent agent work.
It tracks only one pending tool display at a time, so one agent running a shell
command can suppress or obscure activity from another agent.

## Goals

- Preserve the existing pointer index, topic file, and transcript architecture.
- Make transcript history dependable for meaningful runtime activity.
- Keep topic files concise and intentional rather than writing one for every
  event.
- Show shell command activity with agent attribution while other agents keep
  rendering.
- Keep command output compact enough for terminal use while exposing status and
  failure information.

## Non-Goals

- Replace the three-layer memory system with a new memory backend.
- Redesign every terminal renderer surface.
- Persist full shell stdout streams as transcript memory.
- Add async subagent infrastructure in this pass.

## Evidence From Current Code And Artifacts

- `src/memory/three-layer-memory.ts` creates the memory directories and supports
  pointer, topic, and transcript writes.
- `src/prompts/pm.ts` asks the PM to write a topic and transcript near task
  completion, so partial or failed runs can leave the three-layer history empty.
- `.sajicode/memories/index/pointer-index.md` from the observed run contains
  only its initialization template, and the topic and transcript directories
  have no run records.
- `src/cli/renderer.ts` keeps one `pendingTool` and one tool spinner for all
  agent activity.
- Deep Agents event streaming docs recommend user-facing subagent streams and
  concurrent consumption of subagent tool calls/messages for live UI updates.

## Recommended Architecture

### Memory Recording

Keep the current memory layers:

1. Pointer index for durable topic summaries.
2. Topic files for synthesized knowledge and decisions.
3. Transcript files for searchable runtime history.

Add a runtime-backed transcript writer path for meaningful milestones that the
host can observe directly. The host should derive a stable transcript filename
from the active session or thread and append compact records for events such as:

- User turn accepted.
- Agent delegation detected.
- Shell command start.
- Shell command completion or failure.
- Durable memory topic creation.
- Task completion or failure when the renderer or host sees that boundary.

Transcript writes should not depend solely on the model remembering to call
`append_transcript`. The dedicated memory tools remain available so agents can
record higher-level milestones when needed.

Topic writes remain explicit. A topic should represent reusable project memory,
not raw operational noise. When a topic is written, the existing write-verify-
then-index update workflow remains the durability rule.

### Memory Guidance

Update memory guidance so the agent instructions match the available tools:

- Use `read_memory_index` for Layer 1.
- Use `read_topic` for Layer 2.
- Use `search_transcripts` for Layer 3.
- Treat topic content and transcript matches as hints that must be verified
  against current project files when correctness matters.

This removes guidance that suggests generic file reads or raw grep where the
project already provides purpose-built memory tools.

### Terminal Command Visibility

Render command progress as per-agent events instead of a single blocking command
spinner. The CLI should show:

- Which agent started the command.
- A compact command preview.
- Completion, failure, or cached-skip status.
- A compact result preview when output exists.

Other agent messages and tool activity must continue to render while a command
is running. The renderer should avoid treating an active command from one agent
as a global reason to suppress another agent's token stream.

### Streaming Integration

Keep support for the current multi-mode stream handling while aligning command
rendering with the stream shape actually used by SajiCode:

- Built-in Deep Agents tool-call messages for `execute` activity.
- Custom command events where the project intentionally emits them.
- Namespace and agent attribution from subagent streams.

The renderer should keep agent state keyed by stream source or tool-call
identity where concurrent visibility needs isolation.

## Components

- `src/memory/three-layer-memory.ts`
  - Owns transcript filename validation, append behavior, and index/topic
    invariants.
- `src/tools/memory-tools.ts`
  - Exposes explicit memory tools and durable topic recording messages.
- Agent host and runtime integration under `src/agents/` and `src/index.ts`
  - Supplies session/thread context and records host-observable transcript
    milestones.
- `src/cli/renderer.ts`
  - Tracks concurrent tool display state and renders command lifecycle events
    with agent attribution.
- Shell execution tooling under `src/tools/`
  - Supplies command lifecycle metadata that the renderer can display and the
    memory recorder can summarize.

## Data Flow

1. A user turn enters the agent host with a thread id.
2. The host resolves a transcript file for that thread.
3. Host and tool boundaries append compact transcript entries for meaningful
   run events.
4. Agents read Layer 1 automatically and use Layer 2 or Layer 3 tools on
   demand.
5. Shell tool-call and custom events reach the renderer with source metadata.
6. The renderer prints per-agent command lifecycle lines without globally
   blocking other streams.

## Error Handling

- Transcript append failures must not crash the main agent turn. They should be
  surfaced through a controlled diagnostic path and remain testable.
- Topic write failures must continue to stop pointer index updates.
- Missing transcript files remain valid search/stat cases.
- Command failures should render a failed status and preserve the tool result
  path used by the model.

## Testing

Add focused regression coverage for:

- Transcript recording from a host-observable lifecycle event.
- Topic write verification and pointer index behavior remaining consistent.
- Memory guidance output naming the dedicated memory tools.
- Renderer command activity for one agent not suppressing another agent stream.
- Agent attribution and status rendering for command start and command result.

Run targeted tests first for red-green coverage, then run the project build and
test commands before completion claims.

## Expected Result

After this change, a run should leave searchable transcript history even when it
does not reach the PM completion prompt, and terminal command activity should
remain visible with agent attribution during concurrent work.
