import chalk from "chalk";
import ora, { type Ora } from "ora";
import path from "path";
import { AGENT_ICONS, AGENT_LABELS, AgentRole } from "../types/index.js";
import { MarkdownStream } from "streammark";

const O = chalk.hex("#FF8C00");
const DIM = chalk.hex("#996600");
const G = chalk.green;
const GY = chalk.gray;
const CY = chalk.cyan;
const WH = chalk.white;
const YL = chalk.yellow;
const RD = chalk.red;
const BL = chalk.blue;

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
}

export class StreamRenderer {
  private currentAgent = "";
  private agents = new Map<string, ActiveAgent>();
  private namespaceToAgent = new Map<string, string>();
  private pendingTool: PendingTool | null = null;
  private tokenBuffer = "";
  private mdStream: MarkdownStream | null = null;
  private mainSpinner: Ora | null = null;
  private toolSpinner: Ora | null = null;
  private thinkingSpinner: Ora | null = null;
  private receivedFirstToken = false;

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
    this.mainSpinner = ora({
      text: GY(text),
      color: "yellow",
      spinner: "dots",
      prefixText: "  ",
    }).start();
  }

  stopSpinner(text?: string): void {
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

  private showToolStartSpinner(toolName: string, agentName: string): void {
    const icon = this.agentIcon(agentName);
    const toolLabels: Record<string, [string, string]> = {
      write_file: ["✏", "Writing..."],
      edit_file: ["✎", "Editing..."],
      execute: ["$", "Executing command..."],
      read_file: ["⊞", "Reading..."],
      ls: ["📂", "Listing..."],
      grep: ["🔍", "Searching..."],
      glob: ["🔍", "Globbing..."],
      task: ["🚀", "Delegating..."],
      write_todos: ["📋", "Planning..."],
      collect_project_context: ["⚡", "Scanning project..."],
      collect_repo_map: ["🗺️", "Mapping codebase..."],
      save_memory: ["💾", "Saving memory..."],
      update_project_context: ["📝", "Updating context..."],
      update_agent_memory: ["🧠", "Saving memory..."],
      update_project_log: ["📒", "Updating log..."],
      tavily_search_results_json: ["🌐", "Searching web..."],
      git_status: ["📊", "Checking git..."],
      git_commit: ["💾", "Committing..."],
      git_branch: ["🌿", "Creating branch..."],
      git_diff: ["📋", "Checking diff..."],
      git_checkpoint: ["📌", "Checkpointing..."],
      snapshot_file: ["📸", "Snapshotting..."],
      undo_file_change: ["⏪", "Undoing change..."],
      list_snapshots: ["📸", "Listing snapshots..."],
      generate_context_briefing: ["📑", "Generating briefing..."],
      record_experience: ["📚", "Recording experience..."],
      query_experiences: ["🔎", "Querying experiences..."],
    };

    const [emoji, label] = toolLabels[toolName] ?? ["⚡", `${toolName}...`];
    console.log(`  ${icon} ${DIM(agentName)} ${GY("▸")} ${CY(emoji)} ${GY(label)}`);

    if (["write_file", "edit_file", "execute", "read_file", "grep", "ls", "glob", "tavily_search_results_json"].includes(toolName)) {
      this.startToolSpinner(label);
    }
  }

  private updateToolSpinnerFromArgs(tool: PendingTool): void {
    if (!this.toolSpinner) return;

    const buf = tool.argsBuffer;

    // Regex-extract values from the partially-streamed JSON buffer.
    // JSON.parse would fail until the full object is received — regex works on partials.
    const extractStr = (key: string): string | undefined => {
      const m = buf.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
      return m ? m[1] : undefined;
    };

    if (tool.name === "execute" || tool.name === "bash") {
      const cmd = extractStr("command") ?? extractStr("bash");
      if (cmd) {
        const display = cmd.length > 100 ? cmd.slice(0, 97) + "..." : cmd;
        this.toolSpinner.text = GY(`$ ${display}`);
      }
      return;
    }

    if (tool.name === "write_file" || tool.name === "edit_file") {
      const filePath = extractStr("file_path") ?? extractStr("path");
      if (!filePath) return;

      const bn = path.basename(filePath);
      const dir = path.dirname(filePath);
      const shortDir = dir.length > 35 ? "..." + dir.slice(-32) : dir;

      // Count lines already streamed in the content value
      const contentMatch = buf.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/s);
      const linesStreamed = contentMatch?.[1]?.split("\\n").length ?? 0;

      const lineLabel = linesStreamed > 1 ? ` (${linesStreamed} lines)` : "";
      const verb = tool.name === "write_file" ? "Writing" : "Editing";
      this.toolSpinner.text = GY(`${verb} ${shortDir}/${bn}${lineLabel}`);
      return;
    }

    if (tool.name === "read_file") {
      const filePath = extractStr("file_path") ?? extractStr("path");
      if (!filePath) return;
      const dir = path.dirname(filePath);
      const shortDir = dir.length > 30 ? "..." + dir.slice(-27) : dir;
      this.toolSpinner.text = GY(`Reading ${shortDir}/${path.basename(filePath)}`);
      return;
    }

    if (tool.name === "ls") {
      const filePath = extractStr("path") ?? extractStr("directory");
      if (!filePath) return;
      const short = filePath.length > 55 ? "..." + filePath.slice(-52) : filePath;
      this.toolSpinner.text = GY(`Listing ${short}`);
      return;
    }

    if (tool.name === "grep") {
      const pattern = extractStr("pattern") ?? extractStr("query");
      const filePath = extractStr("file_path") ?? extractStr("path");
      if (!pattern) return;
      const shortPat = pattern.length > 35 ? pattern.slice(0, 32) + "..." : pattern;
      const inFile = filePath ? ` in ${path.basename(filePath)}` : "";
      this.toolSpinner.text = GY(`Searching "${shortPat}"${inFile}`);
      return;
    }

    if (tool.name === "glob") {
      const pattern = extractStr("pattern");
      if (pattern) this.toolSpinner.text = GY(`Globbing ${pattern}`);
      return;
    }

    if (tool.name === "tavily_search_results_json") {
      const query = extractStr("query");
      if (!query) return;
      const shortQ = query.length > 55 ? query.slice(0, 52) + "..." : query;
      this.toolSpinner.text = GY(`Searching web for "${shortQ}"`);
      return;
    }
  }

  /**
   * Main streaming loop.
   * Returns InterruptInfo if the agent paused for HITL approval, null if done normally.
   */
  async processMultiStream(
    stream: AsyncIterable<[string[], string, any]>
  ): Promise<InterruptInfo | null> {
    this.receivedFirstToken = false;
    this.startThinkingSpinner();
    let interrupt: InterruptInfo | null = null;

    for await (const [namespace, mode, data] of stream) {
      const isSubagent = namespace.some((s: string) => s.startsWith("tools:"));
      const source = isSubagent
        ? namespace.find((s: string) => s.startsWith("tools:")) ?? "subagent"
        : "main";

      if (mode === "messages") {
        this.onMessage(source, data, isSubagent);
      } else if (mode === "updates") {
        const result = this.onUpdate(source, namespace, data, isSubagent);
        if (result) interrupt = result;
      } else if (mode === "custom") {
        this.onCustom(data);
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

  private markFirstToken(): void {
    if (!this.receivedFirstToken) {
      this.receivedFirstToken = true;
      this.stopThinkingSpinner();
    }
  }

  private onMessage(source: string, data: any, isSubagent: boolean): void {
    const [msg] = Array.isArray(data) ? data : [data];
    if (!msg) return;

    const agentName = isSubagent ? this.resolveAgent(source) : "PM Agent";

    if (msg.type === "tool") {
      this.finishPendingTool();
      this.stopToolSpinner();
      this.renderToolResult(msg, agentName);
      return;
    }

    if (msg.tool_call_chunks?.length) {
      for (const tc of msg.tool_call_chunks) {
        if (tc.name) {
          this.markFirstToken();
          this.finishPendingTool();
          this.flushBuffer();
          this.stopToolSpinner();
          this.pendingTool = {
            name: tc.name,
            argsBuffer: tc.args ?? "",
            agentName,
          };
          this.showToolStartSpinner(tc.name, agentName);
        } else if (tc.args && this.pendingTool) {
          this.pendingTool.argsBuffer += tc.args;
          this.updateToolSpinnerFromArgs(this.pendingTool);
        }
      }
      return;
    }

    const text = msg.text ?? (typeof msg.content === "string" ? msg.content : null);
    if (text) {
      this.markFirstToken();
      this.finishPendingTool();
      this.stopToolSpinner();
      this.ensureAgentHeader(agentName);
      this.tokenBuffer += text;
      if (!this.mdStream) {
        this.mdStream = new MarkdownStream({ theme: "dark" });
      }
      this.mdStream.write(text);
    }
  }

  /** Returns InterruptInfo when __interrupt__ is detected, else null */
  private onUpdate(
    _source: string,
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
      }

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

  private onCustom(data: any): void {
    if (!data) return;

    if (data.type === "agent_progress") {
      const { agent, phase, detail } = data;
      const icon = agent ? this.agentIcon(agent) : GY("●");
      const label = agent ? this.subAgentLabel(agent) : "System";
      console.log(`  ${icon} ${DIM(label)} ${GY("▸")} ${CY(phase ?? "")} ${GY(detail ?? "")}`);
      return;
    }

    if (data.status) {
      this.flushBuffer();
      console.log(GY(`  ● ${data.status}`));
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

  private renderToolResult(msg: any, _agentName: string): void {
    this.stopToolSpinner();
    const toolName = String(msg.name ?? "tool");
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);

    if (toolName === "write_todos") return;

    if (toolName === "write_file") {
      const match = content.match(/Successfully wrote to ['"]?(.+?)['"]?(\s|$)/);
      if (match) console.log(`    ${G("✓")} ${GY("Saved")} ${GY(path.basename(match[1]))}`);
      return;
    }

    if (toolName === "read_file") {
      if (!content || content.startsWith("Error:")) {
        if (content) console.log(`    ${RD("✗")} ${RD(content.slice(0, 100))}`);
        return;
      }
      // Show actual content preview — this is what user asked for
      const lines = content.split("\n");
      const preview = Math.min(8, lines.length);
      console.log(`    ${BL("┌─")} ${GY(`${lines.length} lines`)}`);
      for (let i = 0; i < preview; i++) {
        const num = GY(String(i + 1).padStart(3));
        const text = lines[i].length > 80 ? lines[i].slice(0, 77) + "..." : lines[i];
        console.log(`    ${BL("│")} ${num} ${GY(text)}`);
      }
      if (lines.length > 8) {
        console.log(`    ${BL("│")} ${GY(`    … ${lines.length - 8} more lines`)}`);
      }
      console.log(`    ${BL("└─")}`);
      return;
    }

    if (toolName === "execute") {
      const trimmed = content.trim();
      if (trimmed.length > 0) {
        const allLines = trimmed.split("\n");
        const exitMatch = allLines.find((l: string) => l.includes("[Command"));
        const outputLines = allLines.filter((l: string) => !l.includes("[Command"));
        const show = outputLines.slice(0, 15);
        if (show.length > 0) {
          console.log(`    ${GY("┌─ output")}`);
          for (const line of show) {
            console.log(`    ${GY("│")} ${GY(line.slice(0, 120))}`);
          }
          if (outputLines.length > 15) {
            console.log(`    ${GY("│")} ${GY(`… ${outputLines.length - 15} more lines`)}`);
          }
          console.log(`    ${GY("└─")}`);
        }
        if (exitMatch) {
          const succeeded = exitMatch.includes("exit code 0");
          const icon = succeeded ? G("✓") : RD("✗");
          console.log(`    ${icon} ${GY(exitMatch.replace(/[\[\]]/g, "").trim())}`);
        }
      } else {
        console.log(`    ${G("✓")} ${GY("<no output>")}`);
      }
      return;
    }

    if (toolName === "ls") {
      const trimmed = content.trim();
      if (!trimmed || trimmed.includes("No files found")) {
        console.log(`    ${GY("(empty)")}`);
      } else {
        const entries = trimmed.split("\n").slice(0, 12);
        for (const e of entries) {
          const isDir = e.includes("(dir)") || e.endsWith("/");
          console.log(`    ${GY(isDir ? "📁" : "📄")} ${GY(e.replace("(dir)", "").trim())}`);
        }
        const total = trimmed.split("\n").length;
        if (total > 12) console.log(`    ${GY(`… ${total - 12} more`)}`);
      }
      return;
    }

    if (toolName === "grep" || toolName === "glob") {
      const lines = content.trim().split("\n").slice(0, 6);
      for (const line of lines) console.log(`    ${CY("▸")} ${GY(line.slice(0, 100))}`);
      return;
    }

    if (toolName === "tavily_search_results_json") {
      try {
        const parsed = JSON.parse(content);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || []);
        if (results.length > 0) {
          const show = results.slice(0, 3);
          for (const res of show) {
            console.log(`    ${CY("▸")} ${WH(res.title ?? "Result")}`);
            const snippet = (res.content ?? res.snippet ?? "").slice(0, 100).replace(/\n/g, ' ');
            console.log(`      ${GY(snippet + "...")}`);
          }
          if (results.length > 3) {
            console.log(`    ${GY(`    … ${results.length - 3} more results`)}`);
          }
        } else {
          console.log(`    ${GY("No results found.")}`);
        }
      } catch (err) {
        console.log(`    ${G("✓")} ${GY("Search completed")}`);
      }
      return;
    }

    if (content.startsWith("Error:") || content.startsWith("BLOCKED") || content.startsWith("[JUDGMENT")) {
      console.log(`    ${RD("✗")} ${RD(content.slice(0, 150))}`);
      return;
    }

    if (toolName === "collect_repo_map") {
      const lines = content.split("\n");
      const totalLine = lines.find((l: string) => l.startsWith("Total:"));
      if (totalLine) {
        console.log(`    ${G("✓")} ${CY("🗺️")} ${GY(totalLine)}`);
      }
      const fileHeaders = lines.filter((l: string) => l.startsWith("### ")).slice(0, 5);
      for (const h of fileHeaders) {
        console.log(`    ${GY("  ")}${GY(h.replace("### ", ""))}`);
      }
      if (fileHeaders.length > 0) {
        const totalFiles = lines.filter((l: string) => l.startsWith("### ")).length;
        if (totalFiles > 5) console.log(`    ${GY(`  … ${totalFiles - 5} more files`)}`);
      }
      return;
    }

    if (toolName === "update_agent_memory") {
      console.log(`    ${G("✓")} ${GY(content)}`);
      return;
    }

    if (toolName === "collect_project_context") {
      try {
        const parsed = JSON.parse(content);
        const stack = parsed.techStack?.join(", ") ?? "unknown";
        const fileCount = parsed.totalFiles ?? 0;
        console.log(`    ${G("✓")} ${GY(`${fileCount} files | Stack: ${stack}`)}`);
      } catch {
        console.log(`    ${G("✓")} ${GY("Project context loaded")}`);
      }
      return;
    }

    if (toolName.startsWith("git_") || toolName === "snapshot_file" || toolName === "undo_file_change" || toolName === "list_snapshots") {
      this.renderGitResult(toolName, content);
      return;
    }

    if (content.length > 0 && content.length <= 100) {
      console.log(`    ${G("✓")} ${GY(content)}`);
    }
  }

  private renderGitResult(toolName: string, content: string): void {
    const lines = content.split("\n").slice(0, 8);
    const icons: Record<string, string> = {
      git_commit: "💾",
      git_branch: "🌿",
      git_checkpoint: "📌",
      git_status: "📊",
      git_diff: "📋",
    };
    const icon = icons[toolName] ?? "📦";
    console.log(`    ${G("✓")} ${CY(icon)} ${GY(lines[0] ?? "done")}`);
    for (const line of lines.slice(1)) {
      if (line.trim()) console.log(`    ${GY("  ")}${GY(line)}`);
    }
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

  private ensureAgentHeader(agentName: string): void {
    if (agentName === this.currentAgent) return;
    this.flushBuffer();
    
    const bgOrange = chalk.bgHex("#FF6A00").black.bold;
    
    console.log("");
    console.log(`  ${bgOrange(` ${agentName} `)}`);
    console.log("");
    this.currentAgent = agentName;
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

  private resolveAgent(source: string): string {
    if (source === "main") return "PM Agent";

    const agentId = this.namespaceToAgent.get(source);
    if (agentId) {
      const agent = this.agents.get(agentId);
      if (agent) return this.subAgentLabel(agent.name);
    }

    // Find the deepest-level working agent
    for (const [_id, agent] of this.agents) {
      if (agent.status === "working") return this.subAgentLabel(agent.name);
    }
    return "Subagent";
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
