import { createMiddleware } from "langchain";

/**
 * Weaker models (like Minimax, basic Llama, etc.) often struggle with complex JSON schemas 
 * for tool arguments. Instead of passing an array or object, they'll pass a stringified 
 * JSON representation of the array/object.
 * 
 * This middleware intercepts tool calls before they hit the handler and attempts to
 * auto-parse any string arguments that look like JSON arrays or objects.
 */
export const autoParseMiddleware = createMiddleware({
  name: "AutoParseMiddleware",
  // @ts-expect-error - DeepAgents middleware typing
  wrapToolCall: async (
    request: { toolCall: { name: string; args: Record<string, unknown> } },
    handler: (req: unknown) => Promise<unknown>
  ) => {
    const { name: toolName, args } = request.toolCall;
    
    // Do not attempt to parse file contents or shell commands, 
    // as they correctly contain literal stringified JSON (e.g package.json)
    const EXCLUDED_TOOLS = new Set(["write_file", "edit_file", "execute"]);
    if (EXCLUDED_TOOLS.has(toolName)) {
      return await handler(request);
    }
    
    // Create a new args object to safely mutate
    const parsedArgs: Record<string, unknown> = { ...args };
    let wasModified = false;

    // Iterate through all arguments
    for (const [key, value] of Object.entries(parsedArgs)) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        // Check if it looks like a JSON array or object
        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || 
            (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
          try {
            parsedArgs[key] = JSON.parse(trimmed);
            wasModified = true;
            console.log(`[AutoParse] Automatically parsed stringified JSON for argument '${key}' in tool '${toolName}'`);
          } catch (e) {
            // If it fails to parse, just leave it as a string
          }
        }
      }
    }

    let finalRequest = request;

    if (wasModified) {
      // Reconstruct the request with the parsed arguments
      finalRequest = {
        ...request,
        toolCall: {
          ...request.toolCall,
          args: parsedArgs
        }
      };
    } else {
      // Deep clone args so we can safely mutate native JSON objects if needed later
      finalRequest = {
        ...request,
        toolCall: {
          ...request.toolCall,
          args: { ...args }
        }
      };
    }
      
    // Auto-fix write_todos completely (handles 'title' -> 'content', invalid 'status', etc.)
    if (toolName === "write_todos" && Array.isArray(finalRequest.toolCall.args["todos"])) {
      const validStatuses = new Set(["pending", "in_progress", "completed"]);
      const fixTodos = (items: any[]): any[] => items.map((item: any) => {
        const fixed = { ...item };
        
        // DeepAgents expects 'content', but LLMs often generate 'title' or 'description'
        if (!fixed.content) {
          fixed.content = fixed.title || fixed.description || "Untitled Task";
        }
        
        if (!validStatuses.has(fixed.status)) {
          fixed.status = "pending"; // Default to pending if invalid
        }
        if (Array.isArray(fixed.todos)) {
          fixed.todos = fixTodos(fixed.todos);
        }
        return fixed;
      });
      
      finalRequest.toolCall.args["todos"] = fixTodos(finalRequest.toolCall.args["todos"]);
    }
    
    return await handler(finalRequest);
  },
});
