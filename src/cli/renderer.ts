import chalk from "chalk";
import ora, { type Ora } from "ora";
import path from "path";
import { AGENT_ICONS, AGENT_LABELS, AgentRole } from "../types/index.js";
import { MarkdownStream } from "streammark";
import { AIMessageChunk, ToolMessage } from "@langchain/core/messages";

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

      const isSubagent = namespace.some((s: string) => s.startsWith("tools:"));
      const source = isSubagent
        ? namespace.find((s: string) => s.startsWith("tools:")) ?? "subagent"
        : "main";

      if (mode === "updates") {
        const result = this.onUpdate(source, namespace, data, isSubagent);
        if (result) interrupt = result;
      } else if (mode === "messages") {
        this.onMessage(source, namespace, data, isSubagent);
      } else if (mode === "custom") {
        // Handle custom events if needed
        this.onCustomEvent(source, namespace, data, isSubagent);
      }
    }

    this.finishPendingTool();
    this.flushBuffer();
    this.stopToolSpinner();
    this.stopThinkingSpinner();
    console.log("");

    return interrupt;
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

      if (isSubagent) {
        const nsKey = namespace.find((s: string) => s.startsWith("tools:")) ?? "";
        this.markWorking(nsKey);
      }

      // Detect completions at ANY level where 'tools' node has ToolMessage results
      if (node === "tools") {
        this.detectComplete(nodeData);
        // Display tool results
        this.renderToolResults(nodeData);
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
            console.log(`  ${chalk.cyan("→")} ${chalk.gray(`Calling ${tc.name}...`)}`);
          }
        }
      }
    }
  }

  /**
   * Render tool execution results
   */
  private renderToolResults(data: any): void {
    const messages = (data as any)?.messages ?? [];
    for (const msg of messages) {
      if (msg.type === "tool" && msg.name) {
        const content = String(msg.content ?? "");
        const shortContent = content.slice(0, 150);
        console.log(`    ${chalk.green("✓")} ${chalk.gray(`${msg.name}: ${shortContent}${content.length > 150 ? "..." : ""}`)}`);
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
          this.startToolSpinner(`Calling ${tc.name}...`);
        }
        // Args stream in chunks - accumulate them
        if (tc.args) {
          if (this.pendingTool) {
            this.pendingTool.argsBuffer += tc.args;
          }
        }
      }
    }

    // Tool results
    if (ToolMessage.isInstance(message)) {
      this.finishPendingTool();
      if (message.name) {
        const shortResult = String(message.content ?? "").slice(0, 100);
        console.log(`    ${chalk.cyan("→")} ${chalk.gray(`${message.name}: ${shortResult}${String(message.content ?? "").length > 100 ? "..." : ""}`)}`);
      }
    }

    // Regular AI content (tokens) - skip tool call messages
    if (
      AIMessageChunk.isInstance(message) &&
      message.text &&
      !message.tool_call_chunks?.length
    ) {
      // Stop thinking spinner when tokens start arriving
      this.stopThinkingSpinner();
      
      if (!this.isHeadless && !this.pendingTool) {
        // Determine display label
        const displaySource = isSubagent ? source : "main";
        
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
          const label = isSubagent 
            ? `[${this.subAgentLabel(displaySource.replace("tools:", "").split(":")[0] ?? "subagent")}]`
            : ">_";
          const color = isSubagent ? chalk.gray : chalk.hex("#FF6A00");
          process.stdout.write(`\n  ${color(label)} \n`);
          this.currentSource = displaySource;
        }
        
        // Initialize MarkdownStream if needed
        if (!this.mdStream) {
          this.mdStream = new MarkdownStream({ theme: "dark" });
        }
        
        // Write token to markdown stream for beautiful rendering
        this.mdStream.write(message.text);
        this.midLine = true;
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
    _isSubagent: boolean
  ): void {
    // Handle custom progress events from tools
    if (data && typeof data === "object") {
      const { status, progress } = data;
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

      case "write_file": {
        const fp = String(args.file_path ?? args.path ?? "file");
        const bn = path.basename(fp);
        const content = String(args.content ?? "");
        const lines = content.split("\n");
        if (this.toolSpinner) {
          this.toolSpinner.succeed(GY(`Saved ${bn} (${lines.length} lines)`));
          this.toolSpinner = null;
        }
        this.renderFileWritePreview(fp, content);
        break;
      }

      case "edit_file": {
        const fp = String(args.file_path ?? args.path ?? "file");
        if (this.toolSpinner) {
          this.toolSpinner.succeed(GY(`Edited ${path.basename(fp)}`));
          this.toolSpinner = null;
        }
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

  /** Show first few lines of the file content being written */
  private renderFileWritePreview(filePath: string, content: string): void {
    if (!content || content.trim().length === 0) return;
    const lines = content.split("\n");
    const preview = lines.slice(0, 6);
    console.log(`    ${GY("┌─")} ${GY(path.basename(filePath))}`);
    for (const line of preview) {
      const t = line.length > 90 ? line.slice(0, 87) + "..." : line;
      console.log(`    ${GY("│")} ${GY(t)}`);
    }
    if (lines.length > 6) {
      console.log(`    ${GY("│")} ${GY(`… ${lines.length - 6} more lines`)}`);
    }
    console.log(`    ${GY("└─")}`);
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
    console.log(`  ${O("┌")} ${icon} ${O.bold(`Delegating → ${label}`)}`);
    if (shortDesc) console.log(`  ${O("│")} ${GY(shortDesc)}`);
    console.log(`  ${O("└─────────────────────────")}`);
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
          console.log(`  ${icon} ${G(`${label} ✓ Done`)}`);

          const total = this.agents.size;
          const done = [...this.agents.values()].filter((a) => a.status === "done").length;
          const working = [...this.agents.values()].filter((a) => a.status === "working").length;
          if (total > 1) {
            const bar = G("█".repeat(done)) + YL("░".repeat(total - done));
            console.log(`  ${GY("  Progress:")} ${bar} ${GY(`${done}/${total} agents`)} ${working > 0 ? YL(`(${working} active)`) : ""}`);
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
