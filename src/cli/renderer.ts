import chalk from "chalk";
import ora, { type Ora } from "ora";
import path from "path";
import { AGENT_ICONS, AGENT_LABELS, AgentRole } from "../types/index.js";
import { MarkdownStream } from "streammark";
import { AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import type { ChalkInstance } from "chalk";

const O = chalk.hex("#FF8C00");
const DIM = chalk.hex("#996600");
const G = chalk.green;
const GY = chalk.gray;
const CY = chalk.cyan;
const WH = chalk.white;
const YL = chalk.yellow;
const RD = chalk.red;


// ── Public interrupt type consumed by index.ts ────────────────────────────────
export interface ActionRequest {
  name: string;
  args: Record<string, unknown>;
}
export interface ReviewConfig {
  actionName: string;
  allowedDecisions: string[];
}
export interface InterruptInfo {
  actionRequests: ActionRequest[];
  reviewConfigs: ReviewConfig[];
}

interface ActiveAgent {
  name: string;
  status: "spawned" | "working" | "done";
  toolCallId: string;
}

interface PendingTool {
  name: string;
  argsBuffer: string;
  agentName: string;
  shownContentLength?: number;  // Track how much content has been printed
  filePath?: string;            // Track file path for write_file/edit_file
}

export class StreamRenderer {
  
  private agents = new Map<string, ActiveAgent>();
  private namespaceToAgent = new Map<string, string>();
  private pendingTool: PendingTool | null = null;
  private tokenBuffer = "";
  private mdStream: MarkdownStream | null = null;
  private mainSpinner: Ora | null = null;
  private toolSpinner: Ora | null = null;
  private thinkingSpinner: Ora | null = null;
  private currentSource = "";  // Track which agent is currently streaming tokens
  private midLine = false;     // Track if we're in the middle of a line
  private printedToolResults = new Set<string>();


  constructor(private readonly isHeadless: boolean = false) {}

  printHeader(): void {
    const p = chalk.hex("#FF6A00"); // SajiOrange
    const w = chalk.hex("#FFFFFF"); // White
    const g = chalk.gray;           // Subdued UI elements

    console.log("");
    // The "Prompt" Icon + Wordmark
    console.log(`  ${p("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓")}`);
    console.log(`  ${p("┃")}  ${p.bold(">_")} ${p.bold("SAJI")}${w.bold("CODE")} ${g("│")} ${w("The AI Engineering Team")}         ${p("┃")}`);
    console.log(`  ${p("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛")}`);
    
  
}

  printSessionInfo(info: {
    model: string;
    project: string;
    thread: string;
    hasContext: boolean;
    hitlEnabled: boolean;
    mcpServerCount?: number;
  }): void {
    const label = chalk.hex("#666666");
    const value = chalk.hex("#AAAAAA");
    const dim = chalk.hex("#444444");

    console.log(dim("  ─── Session ───────────────────────────────────────"));
    console.log(`  ${label("model")}     ${value(info.model)}`);
    console.log(`  ${label("project")}   ${value(info.project)}`);
    console.log(`  ${label("thread")}    ${dim(info.thread)}`);
    if (info.hasContext) {
      console.log(`  ${label("context")}   ${G("● ")}${value("SAJICODE.md loaded")}`);
    } else {
      console.log(`  ${label("context")}   ${dim("○ ")}${dim("none — run /init")}`);
    }
    const hitlStatus = info.hitlEnabled
      ? `${YL("● ")}${value("human-in-the-loop ON")}`
      : `${dim("○ ")}${dim("human-in-the-loop off")}`;
    console.log(`  ${label("approval")}  ${hitlStatus}`);
    if (info.mcpServerCount && info.mcpServerCount > 0) {
      console.log(`  ${label("mcp")}       ${G("● ")}${value(`${info.mcpServerCount} server${info.mcpServerCount > 1 ? "s" : ""} connected`)}`);
    }
    console.log(dim("  ─────────────────────────────────────────────────── "));
    console.log("");
  }

  printTeamAssembled(): void {
    const roles = Object.values(AgentRole);
    const dim = chalk.hex("#555555");
    const o = chalk.hex("#FF6A00");
    console.log(`  ${o("┌─")} ${o.bold("Team Assembled")}`);
    for (const role of roles) {
      console.log(`  ${o("│")} ${AGENT_ICONS[role]}  ${dim(AGENT_LABELS[role] ?? role)}`);
    }
    console.log(`  ${o("└─")} ${dim(`${roles.length} agents ready`)}`);
    console.log("");
  }

  printReady(): void {
    const o = chalk.hex("#FF6A00");
    const g = chalk.hex("#666666");
    console.log(`  ${o.bold(">_")} ${chalk.hex("#CC5500")("SajiCode is ready!")}`);
    console.log(`  ${g("Type a task to build, or /help for commands")}`);
    console.log("");
  }

  startSpinner(text: string): void {
    if (this.isHeadless) {
      console.log(`  ${GY("▸")} ${GY(text)}`);
      return;
    }
    this.mainSpinner = ora({
      text: GY(text),
      color: "yellow",
      spinner: "dots",
      prefixText: "  ",
    }).start();
  }

  stopSpinner(text?: string): void {
    if (this.isHeadless) return;
    if (this.mainSpinner) {
      if (text) {
        this.mainSpinner.succeed(GY(text));
      } else {
        this.mainSpinner.stop();
      }
      this.mainSpinner = null;
    }
  }

  private startToolSpinner(text: string): void {
    if (this.isHeadless) return;
    this.stopToolSpinner();
    this.toolSpinner = ora({
      text: GY(text),
      color: "yellow",
      spinner: "dots",
      prefixText: "  ",
    }).start();
  }

  private stopToolSpinner(): void {
    if (this.toolSpinner) {
      this.toolSpinner.stop();
      this.toolSpinner = null;
    }
  }

  

 

  /**
   * Main streaming loop.
   * Handles multiple stream modes: updates, messages, custom.
   * Returns InterruptInfo if the agent paused for HITL approval, null if done normally.
   */
  async processMultiStream(
    stream: AsyncIterable<[string[], any, any?]>
  ): Promise<InterruptInfo | null> {
    
    this.startThinkingSpinner();
    let interrupt: InterruptInfo | null = null;

    for await (const event of stream) {
      // Handle both 2-tuple (single mode) and 3-tuple (multi-mode) formats
      const namespace = event[0];
      const modeOrData = event[1];
      const maybeData = event[2];

      // Determine if this is multi-mode (3-tuple) or single-mode (2-tuple)
      const isMultiMode = maybeData !== undefined;
      const mode = isMultiMode ? modeOrData : "updates";
      const data = isMultiMode ? maybeData : modeOrData;

      const sourceInfo = this.resolveSource(namespace, data);

      if (mode === "updates") {
        const result = this.onUpdate(sourceInfo.source, namespace, data, sourceInfo.isSubagent);
        if (result) interrupt = result;
      } else if (mode === "messages") {
        this.onMessage(sourceInfo.source, namespace, data, sourceInfo.isSubagent);
      } else if (mode === "custom") {
        // Handle custom events if needed
        this.onCustomEvent(sourceInfo.source, namespace, data, sourceInfo.isSubagent);
      }
    }

    this.finishPendingTool();
    this.flushBuffer();
    this.stopToolSpinner();
    this.stopThinkingSpinner();
    console.log("");

    return interrupt;
  }

  private resolveSource(namespace: string[], data: any): { source: string; isSubagent: boolean } {
    const toolNamespace = namespace.find((segment: string) => segment.startsWith("tools:"));
    if (!toolNamespace) {
      return { source: "pm-agent", isSubagent: false };
    }

    const mappedAgentId = this.namespaceToAgent.get(toolNamespace);
    if (mappedAgentId) {
      const agent = this.agents.get(mappedAgentId);
      return { source: agent?.name ?? "subagent", isSubagent: true };
    }

    const directToolId = toolNamespace.split(":").slice(1).join(":");
    const directAgent = this.agents.get(directToolId);
    if (directAgent) {
      this.namespaceToAgent.set(toolNamespace, directToolId);
      directAgent.status = directAgent.status === "spawned" ? "working" : directAgent.status;
      return { source: directAgent.name, isSubagent: true };
    }

    if (this.hasModelActivity(data)) {
      this.markWorking(toolNamespace);
      const agentId = this.namespaceToAgent.get(toolNamespace);
      const agent = agentId ? this.agents.get(agentId) : undefined;
      if (agent) {
        return { source: agent.name, isSubagent: true };
      }
    }

    return { source: "pm-agent", isSubagent: false };
  }

  private hasModelActivity(data: any): boolean {
    if (!data || typeof data !== "object") return false;
    return Object.prototype.hasOwnProperty.call(data, "model_request");
  }

  private startThinkingSpinner(): void {
    this.thinkingSpinner = ora({
      text: GY("Thinking..."),
      color: "yellow",
      spinner: "dots",
      prefixText: "  ",
    }).start();
  }

  private stopThinkingSpinner(): void {
    if (this.thinkingSpinner) {
      this.thinkingSpinner.stop();
      this.thinkingSpinner = null;
    }
  }

  /** Returns InterruptInfo when __interrupt__ is detected, else null */
  private onUpdate(
    source: string,
    namespace: string[],
    data: any,
    isSubagent: boolean
  ): InterruptInfo | null {
    // Detect HITL interrupt — it appears as { __interrupt__: [...] } in updates
    if (data?.__interrupt__) {
      this.flushBuffer();
      this.stopToolSpinner();
      this.stopThinkingSpinner();
      const raw = Array.isArray(data.__interrupt__)
        ? data.__interrupt__[0]?.value
        : data.__interrupt__;
      if (raw?.actionRequests) {
        return raw as InterruptInfo;
      }
      return null;
    }

    for (const [node, nodeData] of Object.entries(data)) {
      if (node === "__metadata__") continue;

      // Detect task() spawns at ANY level — not just main agent
      if (node === "model_request") {
        this.detectSpawns(nodeData);
        // Display AI response content from model_request
        this.renderModelResponse(nodeData, source, isSubagent);
      }

      // Track subagent working status
      if (isSubagent) {
        const nsKey = namespace.find((s: string) => s.startsWith("tools:")) ?? "";
        this.markWorking(nsKey);
      }

      // Detect completions at ANY level where 'tools' node has ToolMessage results
      if (node === "tools") {
        this.detectComplete(nodeData);
      }
    }

    return null;
  }

  /**
   * Render AI model responses from model_request node data.
   * Note: When using 'messages' stream mode, tokens are printed via onMessage,
   * so this only handles non-streaming cases and tool calls.
   */
  private renderModelResponse(data: any, _source: string, _isSubagent: boolean): void {
    const messages = (data as any)?.messages ?? [];
    for (const msg of messages) {
      // Skip printing content when using token streaming (currentSource indicates streaming is active)
      // Only handle tool calls here
      
      // Handle tool calls in the response
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          if (tc.name) {
            this.printAgentEvent(_source, _isSubagent, "call", `calling ${tc.name}`);
          }
        }
      }
    }
  }

  /**
   * Handle messages stream mode - displays LLM tokens and tool calls.
   */
  private onMessage(
    source: string,
    _namespace: string[],
    data: any,
    isSubagent: boolean
  ): void {
    const [message] = data;
    if (!message) return;

    // Stop thinking spinner when any message arrives
    this.stopThinkingSpinner();

    // Tool call chunks (streaming tool invocations)
    if (AIMessageChunk.isInstance(message) && message.tool_call_chunks?.length) {
      for (const tc of message.tool_call_chunks) {
        if (tc.name) {
          // New tool call started
          this.finishPendingTool();
          this.pendingTool = {
            name: tc.name,
            argsBuffer: "",
            agentName: source,
          };
          
          const agentLabel = this.displayLabel(source, isSubagent);
          const icon = this.agentIcon(source);
          
          if (!this.isHeadless) {
            // For file operations, use a simpler spinner message to avoid glitching
            if (tc.name === "write_file" || tc.name === "edit_file") {
              this.startToolSpinner(`${icon} ${agentLabel} ${tc.name}...`);
            } else {
              this.startToolSpinner(`${icon} ${agentLabel} calling ${tc.name}...`);
            }
          } else {
            console.log(`  ${chalk.cyan("→")} ${icon} ${chalk.hex("#AAAAAA")(agentLabel)} ${chalk.gray(`calling ${tc.name}...`)}`);
          }
        }
        // Args stream in chunks - accumulate them
        if (tc.args) {
          if (this.pendingTool) {
            this.pendingTool.argsBuffer += tc.args;
            // Don't show args streaming for file operations to avoid glitching
            // Only show for other tools if needed
          }
        }
      }
    }

    // Tool results
    if (ToolMessage.isInstance(message)) {
      this.finishPendingTool();
      if (message.name) {
        const resultKey = `${message.tool_call_id ?? ""}:${message.name}:${String(message.content ?? "").slice(0, 60)}`;
        if (this.printedToolResults.has(resultKey)) return;
        this.printedToolResults.add(resultKey);
        const content = String(message.content ?? "");
        this.renderToolResultLine(source, isSubagent, message.name, content);
      }
    }

    // Regular AI content (tokens) - skip tool call messages
    if (
      AIMessageChunk.isInstance(message) &&
      message.text &&
      !message.tool_call_chunks?.length
    ) {
      if (!this.isHeadless && !this.pendingTool) {
        // Determine display label
        const displaySource = isSubagent ? source : "pm-agent";
        
        // When source changes, finalize previous stream and start fresh
        if (displaySource !== this.currentSource) {
          if (this.mdStream) {
            this.mdStream.end();
            this.mdStream = null;
          }
          if (this.midLine) {
            process.stdout.write("\n");
            this.midLine = false;
          }
          const label = this.displayLabel(displaySource, isSubagent);
          const border = isSubagent ? this.agentColor(displaySource)("│") : chalk.hex("#FF6A00")("│");
          process.stdout.write(`\n  ${border} ${this.agentIcon(displaySource)} ${this.agentColor(displaySource).bold(label)} ${GY("says")}\n  ${border} `);
          this.currentSource = displaySource;
        }
        
        // Initialize MarkdownStream if needed
        if (!this.mdStream) {
          this.mdStream = new MarkdownStream({ theme: "dark" });
        }
        
        // Write token to markdown stream for beautiful rendering
        this.mdStream.write(message.text);
        this.midLine = true;
      } else if (this.isHeadless) {
        // In headless mode, just print tokens directly
        const prefix = isSubagent ? `[${source}] ` : "";
        process.stdout.write(`${prefix}${message.text}`);
      }
    }
  }

  /**
   * Handle custom stream mode - displays custom progress events.
   */
  private onCustomEvent(
    source: string,
    _namespace: string[],
    data: any,
    _isSubagent: boolean,
  ): void {
    void _isSubagent;
    // Handle file write progress events
    if (data && typeof data === "object") {
      const { type, file_path, file_name, progress, message, error } = data;
      
      // File write events
      if (type?.startsWith("file_write")) {
        const prefix = source !== "main" ? `[${source}] ` : "";
        const fileName = file_name || file_path?.split(/[\\/]/).pop() || "file";
        
        switch (type) {
          case "file_write_start":
            console.log(`  ${CY("→")} ${prefix}${GY(`Writing ${fileName}...`)}`);
            if (message) console.log(`    ${GY(message)}`);
            break;
            
          case "file_write_progress":
            if (progress !== undefined) {
              console.log(`    ${YL("●")} ${prefix}${GY(`${progress}% - ${message || 'Writing...'}`)}`);
            } else if (message) {
              console.log(`    ${YL("●")} ${prefix}${GY(message)}`);
            }
            break;
            
          case "file_write_complete":
            console.log(`    ${G("✓")} ${prefix}${GY(`Successfully wrote ${fileName}`)}`);
            if (message) console.log(`    ${GY(message)}`);
            break;
            
          case "file_write_error":
            console.log(`    ${RD("✗")} ${prefix}${RD(`Error writing ${fileName}: ${error || 'Unknown error'}`)}`);
            break;
        }
        return;
      }

      if (type?.startsWith("multi_file_batch")) {
        const count = typeof data.count === "number" ? data.count : undefined;
        const current = typeof data.current === "number" ? data.current : undefined;
        const total = typeof data.total === "number" ? data.total : undefined;
        const filePath = String(data.file_path ?? "");
        const operation = String(data.operation ?? "");

        switch (type) {
          case "multi_file_batch_start":
            console.log(`  ${CY("┌─")} ${CY.bold("Multi-file batch")} ${GY(count !== undefined ? `${count} operation(s)` : "starting")}`);
            if (message) console.log(`  ${CY("│")} ${GY(message)}`);
            break;

          case "multi_file_batch_progress": {
            const progress = current !== undefined && total !== undefined ? `${current}/${total}` : "working";
            console.log(`  ${CY("│")} ${YL("●")} ${GY(progress)} ${WH(operation)} ${GY(filePath)}`);
            break;
          }

          case "multi_file_batch_complete":
            console.log(`  ${CY("└─")} ${G("✓")} ${GY(message || `Applied ${count ?? 0} operation(s)`)}`);
            break;

          case "multi_file_batch_error":
            console.log(`  ${CY("└─")} ${RD("✗")} ${RD(error || message || "Batch failed and rolled back")}`);
            break;
        }
        return;
      }
      
      // File edit events
      if (type?.startsWith("file_edit")) {
        const prefix = source !== "main" ? `[${source}] ` : "";
        const fileName = file_name || file_path?.split(/[\\/]/).pop() || "file";
        
        switch (type) {
          case "file_edit_start":
            console.log(`  ${CY("→")} ${prefix}${GY(`Editing ${fileName}...`)}`);
            break;
            
          case "file_edit_progress":
            if (message) {
              console.log(`    ${YL("●")} ${prefix}${GY(message)}`);
            }
            break;
            
          case "file_edit_complete":
            console.log(`    ${G("✓")} ${prefix}${GY(`Successfully edited ${fileName}`)}`);
            if (message) console.log(`    ${GY(message)}`);
            break;
            
          case "file_edit_error":
            console.log(`    ${RD("✗")} ${prefix}${RD(`Error editing ${fileName}: ${error || 'Unknown error'}`)}`);
            break;
        }
        return;
      }
      
      // Handle other custom progress events
      const { status } = data;
      if (status || progress !== undefined) {
        const icon = status === "complete" ? chalk.green("✓") :
                     status === "error" ? chalk.red("✗") :
                     status === "in_progress" || status === "analyzing" ? chalk.yellow("●") :
                     chalk.gray("○");
        const progressStr = progress !== undefined ? ` ${progress}%` : "";
        console.log(`    ${icon} ${chalk.gray(`[${source}]`)} ${chalk.gray(status)}${chalk.gray(progressStr)}`);
      }
    }
  }

  private finishPendingTool(): void {
    if (!this.pendingTool) return;
    const { name, argsBuffer, agentName } = this.pendingTool;
    this.pendingTool = null;
    this.flushBuffer();

    let args: any = {};
    try { args = JSON.parse(argsBuffer); } catch { /* incomplete */ }

    switch (name) {
      case "write_todos":
        this.stopToolSpinner();
        this.renderTodoList(args, agentName);
        break;

      case "task":
        this.stopToolSpinner();
        this.renderTask(args);
        break;

      case "read_file": {
        const fp = String(args.file_path ?? args.path ?? "file");
        const bn = path.basename(fp);
        
        if (this.toolSpinner) {
          this.toolSpinner.succeed(chalk.green(`✔ Read ${bn}`));
          this.toolSpinner = null;
        }
        // Don't show content preview for read_file - it's too verbose
        // The agent will use the content internally
        break;
      }

      case "write_file": {
        const fp = String(args.file_path ?? args.path ?? "file");
        const bn = path.basename(fp);
        const content = String(args.content ?? "");
        const lines = content.split("\n");
        const sizeKB = Math.round(content.length / 1024);
        
        if (this.toolSpinner) {
          this.toolSpinner.succeed(chalk.green(`✔ Saved ${bn} (${lines.length} lines, ${sizeKB}KB)`));
          this.toolSpinner = null;
        }
        
        // Show enhanced file preview with syntax highlighting hints
        this.renderEnhancedFilePreview(fp, content, agentName);
        break;
      }

      case "edit_file": {
        const fp = String(args.file_path ?? args.path ?? "file");
        const bn = path.basename(fp);
        const oldStr = String(args.old_string ?? "");
        const newStr = String(args.new_string ?? "");
        const replaceAll = args.replace_all ?? false;
        
        if (this.toolSpinner) {
          this.toolSpinner.succeed(chalk.green(`✔ Edited ${bn}`));
          this.toolSpinner = null;
        }
        
        // Show diff preview
        this.renderEditDiff(fp, oldStr, newStr, replaceAll, agentName);
        break;
      }

      case "execute": {
        const cmd = String(args.command ?? "");
        if (cmd) {
          this.stopToolSpinner();
          console.log(`    ${CY("$")} ${WH(cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd)}`);
          this.startToolSpinner("Running...");
        }
        break;
      }

      case "tavily_search_results_json": {
        const query = String(args.query ?? "");
        const short = query.length > 50 ? query.slice(0, 47) + "..." : query;
        if (this.toolSpinner) {
          this.toolSpinner.text = GY(`Searching web for "${short}"`);
          // Wait for tool result
        }
        break;
      }

      default:
        this.stopToolSpinner();
        break;
    }
  }

  private renderToolResultLine(source: string, isSubagent: boolean, toolName: string, content: string): void {
    const label = this.displayLabel(source, isSubagent);
    const color = this.agentColor(source);
    const icon = this.agentIcon(source);

    if (toolName === "get_executable_tasks") {
      this.renderExecutableTasks(content, source);
      return;
    }

    if (toolName === "get_task_graph_progress" || toolName === "mark_task_complete" || toolName === "mark_task_failed") {
      this.renderTaskGraphProgress(content, source, toolName);
      return;
    }

    if (toolName === "create_task_graph") {
      console.log(`  ${color("┌─")} ${icon} ${color.bold("Task Graph")} ${GY("ready")}`);
      console.log(`  ${color("└─")} ${GY("parallel planning workspace created")}`);
      return;
    }

    if (toolName === "add_task_node" || toolName === "add_task_dependency" || toolName === "mark_task_running") {
      console.log(`  ${color("│")} ${G("✓")} ${GY(content.slice(0, 140))}`);
      return;
    }

    // read_file and write/edit are already displayed by finishPendingTool — skip the raw dump.
    if (toolName === "read_file" || toolName === "write_file" || toolName === "edit_file") return;

    // Context/memory tools: print one-line status instead of raw content.
    const QUIET_TOOLS = new Set([
      "read_session_state", "update_session_state",
      "read_team_context", "prepare_team_context",
      "generate_context_briefing",
      "read_memory_index", "search_transcripts",
      "append_transcript", "write_memory_topic",
      "record_experience",
      "update_agent_memory", "update_project_log",
      "collect_project_context",
      "snapshot_file", "undo_file_change", "list_snapshots",
    ]);
    if (QUIET_TOOLS.has(toolName)) {
      const statusText =
        content.includes("[CACHED") ? "cache hit" :
        /error|fail|blocked/i.test(content) ? content.slice(0, 80) :
        content.split(/[.\n]/)[0]?.slice(0, 80) ?? "done";
      console.log(`  ${color("│")} ${G("✓")} ${icon} ${GY(label)} ${chalk.gray(toolName)} ${GY(statusText)}`);
      return;
    }

    const shortResult = this.compact(content, toolName === "execute" ? 260 : 160);
    console.log(`  ${color("│")} ${G("✓")} ${icon} ${GY(label)} ${chalk.gray(toolName)} ${GY(shortResult)}`);
  }

  private renderExecutableTasks(content: string, source: string): void {
    const color = this.agentColor(source);
    const tasks = this.safeParseArray(content);
    console.log("");
    console.log(`  ${color("┌─")} ${color.bold("Executable Now")} ${GY(`${tasks.length} task${tasks.length === 1 ? "" : "s"}`)}`);
    if (tasks.length === 0) {
      console.log(`  ${color("│")} ${GY("No pending tasks are unblocked yet.")}`);
    }
    for (const task of tasks) {
      const id = String(task.id ?? task.taskId ?? "task");
      const agent = String(task.agent ?? "auto");
      const priority = task.priority !== undefined ? ` P${task.priority}` : "";
      const eta = task.estimatedTime !== undefined ? ` ${task.estimatedTime}s` : "";
      console.log(`  ${color("│")} ${this.agentIcon(agent)} ${WH(id.padEnd(16).slice(0, 16))} ${GY(agent.padEnd(15).slice(0, 15))} ${YL(`${priority}${eta}`.trim())}`);
      if (task.description) {
        console.log(`  ${color("│")}   ${GY(this.compact(String(task.description), 84))}`);
      }
    }
    console.log(`  ${color("└─")}`);
    console.log("");
  }

  private renderTaskGraphProgress(content: string, source: string, toolName: string): void {
    const color = this.agentColor(source);
    const tasks = this.safeParseArray(content);
    const completed = tasks.filter((task) => task.status === "completed").length;
    const running = tasks.filter((task) => task.status === "running").length;
    const blocked = tasks.filter((task) => task.status === "blocked" || task.status === "failed").length;
    const title = toolName === "mark_task_complete" ? "Task Graph Updated" : "Task Graph Progress";
    const total = tasks.length || 1;
    const width = 18;
    const filled = Math.round((completed / total) * width);
    const bar = G("█".repeat(filled)) + GY("░".repeat(width - filled));

    console.log("");
    console.log(`  ${color("┌─")} ${color.bold(title)} ${bar} ${GY(`${completed}/${tasks.length} done`)}`);
    if (running > 0 || blocked > 0) {
      console.log(`  ${color("│")} ${YL(`${running} running`)} ${blocked > 0 ? RD(`${blocked} blocked/failed`) : ""}`);
    }
    for (const task of tasks) {
      const status = String(task.status ?? "pending");
      const marker = status === "completed" ? G("✓") : status === "running" ? YL("●") : status === "blocked" || status === "failed" ? RD("×") : GY("○");
      const id = String(task.taskId ?? task.id ?? "task");
      const msg = String(task.message ?? "");
      console.log(`  ${color("│")} ${marker} ${WH(id.padEnd(16).slice(0, 16))} ${GY(status.padEnd(9).slice(0, 9))} ${GY(this.compact(msg, 58))}`);
    }
    console.log(`  ${color("└─")}`);
    console.log("");
  }

  private safeParseArray(content: string): any[] {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private compact(value: string, maxLength: number): string {
    const oneLine = value.replace(/\s+/g, " ").trim();
    return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 3)}...` : oneLine;
  }

  private printAgentEvent(source: string, isSubagent: boolean, kind: "call" | "info", message: string): void {
    const color = this.agentColor(source);
    const label = this.displayLabel(source, isSubagent);
    const marker = kind === "call" ? CY("→") : GY("•");
    console.log(`  ${color("│")} ${marker} ${this.agentIcon(source)} ${color.bold(label)} ${GY(message)}`);
  }

  /** Enhanced file preview with better formatting and agent attribution */
  private renderEnhancedFilePreview(filePath: string, content: string, agentName: string): void {
    if (!content || content.trim().length === 0) return;
    
    const lines = content.split("\n");
    const preview = lines.slice(0, 8);
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName).toLowerCase();
    
    // Agent attribution
    const label = this.subAgentLabel(agentName);
    
    console.log(`    ${chalk.hex("#FF6A00")("┌─")} ${chalk.cyan(fileName)} ${chalk.gray(`by ${label}`)}`);
    
    // Show preview with line numbers
    for (let i = 0; i < preview.length; i++) {
      const lineNum = chalk.hex("#666666")(`${String(i + 1).padStart(3)} │`);
      let line = preview[i] ?? "";
      
      // Truncate long lines
      if (line.length > 85) {
        line = line.slice(0, 82) + "...";
      }
      
      // Basic syntax highlighting hints
      line = this.highlightLine(line, ext);
      
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${lineNum} ${line}`);
    }
    
    if (lines.length > 8) {
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${chalk.gray(`… ${lines.length - 8} more lines`)}`);
    }
    console.log(`    ${chalk.hex("#FF6A00")("└─")}`);
  }

  /** Show diff for file edits */
  private renderEditDiff(
    filePath: string,
    oldStr: string,
    newStr: string,
    replaceAll: boolean,
    agentName: string
  ): void {
    const fileName = path.basename(filePath);
    const label = this.subAgentLabel(agentName);
    
    console.log(`    ${chalk.hex("#FF6A00")("┌─")} ${chalk.cyan(fileName)} ${chalk.gray(`edited by ${label}`)}`);
    
    // Show old content (removed)
    const oldLines = oldStr.split("\n").slice(0, 3);
    for (const line of oldLines) {
      const truncated = line.length > 80 ? line.slice(0, 77) + "..." : line;
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${chalk.red("- " + truncated)}`);
    }
    
    if (oldStr.split("\n").length > 3) {
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${chalk.gray(`  … ${oldStr.split("\n").length - 3} more lines removed`)}`);
    }
    
    // Show new content (added)
    const newLines = newStr.split("\n").slice(0, 3);
    for (const line of newLines) {
      const truncated = line.length > 80 ? line.slice(0, 77) + "..." : line;
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${chalk.green("+ " + truncated)}`);
    }
    
    if (newStr.split("\n").length > 3) {
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${chalk.gray(`  … ${newStr.split("\n").length - 3} more lines added`)}`);
    }
    
    if (replaceAll) {
      console.log(`    ${chalk.hex("#FF6A00")("│")} ${chalk.yellow("⚠ Replaced all occurrences")}`);
    }
    
    console.log(`    ${chalk.hex("#FF6A00")("└─")}`);
  }

  /** Basic syntax highlighting for common file types */
  private highlightLine(line: string, ext: string): string {
    // Keywords for different languages
    const jsKeywords = /\b(const|let|var|function|class|import|export|from|return|if|else|for|while|async|await)\b/g;
    const pyKeywords = /\b(def|class|import|from|return|if|else|elif|for|while|async|await|with|as)\b/g;
    const htmlTags = /<\/?[a-zA-Z][^>]*>/g;
    const strings = /(["'`])(?:(?=(\\?))\2.)*?\1/g;
    const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm;
    
    // Apply highlighting based on file extension
    if ([".js", ".ts", ".jsx", ".tsx", ".mjs"].includes(ext)) {
      line = line.replace(jsKeywords, (match) => chalk.magenta(match));
      line = line.replace(strings, (match) => chalk.green(match));
      line = line.replace(comments, (match) => chalk.gray(match));
    } else if ([".py"].includes(ext)) {
      line = line.replace(pyKeywords, (match) => chalk.magenta(match));
      line = line.replace(strings, (match) => chalk.green(match));
      line = line.replace(comments, (match) => chalk.gray(match));
    } else if ([".html", ".htm", ".xml"].includes(ext)) {
      line = line.replace(htmlTags, (match) => chalk.cyan(match));
      line = line.replace(strings, (match) => chalk.green(match));
    } else if ([".json"].includes(ext)) {
      line = line.replace(strings, (match) => chalk.green(match));
      line = line.replace(/\b(true|false|null)\b/g, (match) => chalk.yellow(match));
    }
    
    return line;
  }

  private renderTodoList(args: any, agentName: string): void {
    const icon = this.agentIcon(agentName);
    console.log("");
    console.log(`  ${icon} ${DIM(agentName)} ${GY("▸")} ${YL("📋 Plan")}`);
    const todos = args.todos ?? [];
    for (const todo of todos) {
      const status = todo.status ?? "pending";
      let marker: string;
      let textFn: (s: string) => string;
      switch (status) {
        case "completed":  marker = G("✓");  textFn = (s) => chalk.strikethrough(GY(s)); break;
        case "in_progress": marker = YL("●"); textFn = WH; break;
        default:           marker = GY("○"); textFn = GY; break;
      }
      console.log(`    ${marker} ${textFn(todo.content ?? "")}`);
    }
    console.log("");
  }

  private renderTask(args: any): void {
    const subName = String(args.subagent_type ?? args.name ?? "subagent");
    const desc = String(args.description ?? "");
    const shortDesc = desc.split("\n")[0]?.slice(0, 80) ?? "";
    const icon = this.agentIcon(subName);
    const label = this.subAgentLabel(subName);
    console.log("");
    console.log(`  ${O("┌─")} ${icon} ${O.bold(`Agent Lane Started: ${label}`)}`);
    if (shortDesc) console.log(`  ${O("│")} ${GY(shortDesc)}`);
    console.log(`  ${O("└─")} ${GY("streaming separately below")}`);
    console.log("");
    this.startToolSpinner(`${label} is working...`);
  }

  

  

  /** Print the HITL interrupt prompt to the terminal */
  printInterrupt(interrupt: InterruptInfo): void {
    this.flushBuffer();
    this.stopToolSpinner();
    this.stopThinkingSpinner();
    console.log("");
    console.log(`  ${YL("⚠")}  ${YL.bold("Agent wants to run a command — your approval is needed")}`);
    console.log("");

    for (const action of interrupt.actionRequests) {
      const cfg = interrupt.reviewConfigs.find((r) => r.actionName === action.name);
      const decisions = cfg?.allowedDecisions ?? ["approve", "reject"];

      console.log(`  ${GY("┌─")} ${CY(action.name)}`);
      if (action.name === "execute" && action.args["command"]) {
        const cmd = String(action.args["command"]);
        for (const line of cmd.split("\n")) {
          console.log(`  ${GY("│")} ${WH(`$ ${line}`)}`);
        }
      } else {
        const argsStr = JSON.stringify(action.args, null, 2);
        for (const line of argsStr.split("\n").slice(0, 6)) {
          console.log(`  ${GY("│")} ${GY(line)}`);
        }
      }
      console.log(`  ${GY("│")}`);
      const opts = decisions.map((d) => {
        if (d === "approve") return G("[a] approve");
        if (d === "reject")  return RD("[r] reject");
        if (d === "edit")    return YL("[e] edit");
        return GY(d);
      }).join("  ");
      console.log(`  ${GY("│")} ${GY("Options:")} ${opts}`);
      console.log(`  ${GY("└─")}`);
      console.log("");
    }
  }

  /** Print auto-approval notice (for allowedCommands) */
  printAutoApproved(command: string): void {
    const short = command.length > 80 ? command.slice(0, 77) + "..." : command;
    console.log(`  ${G("✓")} ${GY("Auto-approved:")} ${GY(short)}`);
  }

 

  private detectSpawns(data: any): void {
    const messages = (data as any)?.messages ?? [];
    for (const msg of messages) {
      for (const tc of msg.tool_calls ?? []) {
        if (tc.name === "task") {
          const name = String(tc.args?.subagent_type ?? tc.args?.name ?? "subagent");
          this.agents.set(tc.id, { name, status: "spawned", toolCallId: tc.id });
        }
      }
    }
  }

  private markWorking(nsKey: string): void {
    if (this.namespaceToAgent.has(nsKey)) return;

    for (const [id, agent] of this.agents) {
      if (agent.status === "spawned") {
        agent.status = "working";
        this.namespaceToAgent.set(nsKey, id);
        break;
      }
    }
  }

  private detectComplete(data: any): void {
    const messages = (data as any)?.messages ?? [];
    for (const msg of messages) {
      if (msg.type === "tool" && msg.tool_call_id) {
        const agent = this.agents.get(msg.tool_call_id);
        if (agent && agent.status !== "done") {
          agent.status = "done";
          this.stopToolSpinner();
          this.flushBuffer();
          const icon = this.agentIcon(agent.name);
          const label = this.subAgentLabel(agent.name);
          const color = this.agentColor(agent.name);
          console.log(`  ${color("┌─")} ${icon} ${G.bold(`${label} complete`)}`);

          const total = this.agents.size;
          const done = [...this.agents.values()].filter((a) => a.status === "done").length;
          const working = [...this.agents.values()].filter((a) => a.status === "working").length;
          if (total > 1) {
            const bar = G("█".repeat(done)) + YL("░".repeat(total - done));
            console.log(`  ${color("└─")} ${bar} ${GY(`${done}/${total} agents`)} ${working > 0 ? YL(`${working} active`) : GY("all settled")}`);
          } else {
            console.log(`  ${color("└─")} ${GY("agent lane closed")}`);
          }
          console.log("");
        }
      }
    }
  }

  


  private subAgentLabel(name: string): string {
    // First check if it's a known top-level role
    for (const role of Object.values(AgentRole)) {
      if (name === role) return AGENT_LABELS[role] ?? name;
    }
    // Convert kebab-case sub-agent names to Title Case
    // e.g. 'api-architect' → 'API Architect', 'ml-engineer' → 'ML Engineer'
    const ACRONYMS = new Set(["api", "ml", "ai", "ui", "ux", "db", "sdk", "cli", "cicd", "css"]);
    return name
      .split("-")
      .map((w) => ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  private displayLabel(name: string, isSubagent: boolean): string {
    if (!isSubagent && (name === "main" || name === "pm-agent")) return "PM";
    return this.subAgentLabel(name);
  }

  private agentColor(name: string): ChalkInstance {
    const lower = name.toLowerCase();
    if (lower.includes("backend") || lower.includes("server") || lower.includes("api")) return chalk.cyan;
    if (lower.includes("frontend") || lower.includes("ui") || lower.includes("component")) return chalk.magenta;
    if (lower.includes("qa") || lower.includes("test")) return chalk.yellow;
    if (lower.includes("security")) return chalk.red;
    if (lower.includes("deploy") || lower.includes("devops")) return chalk.green;
    if (lower.includes("data") || lower.includes("ai")) return chalk.hex("#B464FF");
    if (lower.includes("platform") || lower.includes("tool")) return chalk.hex("#FFB400");
    if (lower.includes("mobile")) return chalk.hex("#64B4FF");
    if (lower.includes("review")) return chalk.blue;
    return chalk.hex("#FF6A00");
  }

  private agentIcon(name: string): string {
    const lower = name.toLowerCase();
    const fallback = chalk.hex("#FF6A00").bold(">_");

    // Match known top-level roles first
    for (const role of Object.values(AgentRole)) {
      if (lower === role || lower.includes(role.replace("-agent", "").replace("-lead", ""))) {
        return AGENT_ICONS[role] ?? fallback;
      }
    }

    // Sub-agent name pattern matching → color by domain
    if (lower.includes("api") || lower.includes("architect") || lower.includes("database") || lower.includes("backend") || lower.includes("server"))
      return "\x1b[36m●\x1b[0m";  // cyan = backend family
    if (lower.includes("component") || lower.includes("design") || lower.includes("style") || lower.includes("frontend") || lower.includes("ui"))
      return "\x1b[35m●\x1b[0m";  // magenta = frontend family
    if (lower.includes("ml") || lower.includes("ai") || lower.includes("integration") || lower.includes("pipeline"))
      return "\x1b[38;2;180;100;255m●\x1b[0m";  // purple = AI/data family
    if (lower.includes("test") || lower.includes("qa") || lower.includes("quality"))
      return "\x1b[33m●\x1b[0m";  // yellow = test family
    if (lower.includes("security") || lower.includes("vuln") || lower.includes("audit"))
      return "\x1b[31m●\x1b[0m";  // red = security family
    if (lower.includes("docker") || lower.includes("ci") || lower.includes("deploy") || lower.includes("container"))
      return "\x1b[32m●\x1b[0m";  // green = devops family
    if (lower.includes("sdk") || lower.includes("platform") || lower.includes("tool") || lower.includes("cli"))
      return "\x1b[38;2;255;180;0m●\x1b[0m";  // gold = platform family
    if (lower.includes("mobile") || lower.includes("screen") || lower.includes("native"))
      return "\x1b[38;2;100;180;255m●\x1b[0m";  // blue = mobile family
    if (lower.includes("review") || lower.includes("architecture"))
      return "\x1b[34m●\x1b[0m";  // blue = review family

    return fallback;
  }

  private flushBuffer(): void {
    if (this.mdStream) {
      this.mdStream.end();
      this.mdStream = null;
      console.log("");
    } else if (this.tokenBuffer.length > 0) {
      this.tokenBuffer = "";
      process.stdout.write("\n");
    }
  }

  printComplete(): void {
    const o = chalk.hex("#FF6A00");
    console.log("");
    console.log(`  ${o.bold(">_")} ${G.bold("Done")}`);
    console.log("");
  }

  printError(error: Error): void {
    console.log("");
    console.log(`  ${RD("✗")} ${RD.bold(error.message)}`);
    if (error.stack) {
      for (const line of error.stack.split("\n").slice(1, 4)) {
        console.log(`    ${GY(line.trim())}`);
      }
    }
    console.log("");
  }
}
