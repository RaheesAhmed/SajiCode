# MCP Integration Guide

## Overview

SajiCode integrates with [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers to extend agent capabilities with external tools. MCP servers are loaded automatically and their tools become available to all agents.

## Quick Start

### 1. Create MCP Configuration

Create `.sajicode/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "{{projectPath}}"],
      "transport": "stdio"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "transport": "stdio",
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

### 2. Start SajiCode

MCP servers are automatically loaded at startup:

```bash
npm start
```

You'll see:
```
  mcp       ● filesystem, github
```

### 3. Use MCP Tools

Agents can now use MCP tools directly. **Note:** MCP tool names are automatically prefixed with the server name to avoid conflicts with built-in tools.

```
>_ list all files in the src directory using the filesystem MCP server

Agent will use: filesystem__list_directory
```

**Tool Naming Convention:**
- Original: `list_directory` → Prefixed: `filesystem__list_directory`
- Original: `read_file` → Prefixed: `filesystem__read_file`
- Original: `create_issue` → Prefixed: `github__create_issue`

This prevents conflicts with SajiCode's built-in `ls`, `read_file`, etc.

## Configuration Format

### Basic Structure

```json
{
  "mcpServers": {
    "server-name": {
      "command": "executable",
      "args": ["arg1", "arg2"],
      "transport": "stdio",
      "env": {
        "ENV_VAR": "value"
      },
      "enabled": true
    }
  }
}
```

### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | Executable command (e.g., `node`, `npx`, `python`) |
| `args` | string[] | No | Command arguments |
| `transport` | string | No | Transport type: `stdio` (default) or `sse` |
| `env` | object | No | Environment variables for the server process |
| `enabled` | boolean | No | Enable/disable server (default: `true`) |
| `disabled` | boolean | No | Alternative way to disable (if `true`, server is disabled) |

### Special Variables

- `{{projectPath}}` - Replaced with absolute path to current project

Example:
```json
{
  "command": "node",
  "args": ["server.js", "--root", "{{projectPath}}"]
}
```

## Transport Types

### stdio (Standard Input/Output)

Default transport. Server runs as subprocess, communicates via stdin/stdout.

**Best for:**
- Local tools
- Simple setups
- Development

**Example:**
```json
{
  "math": {
    "command": "node",
    "args": ["math-server.js"],
    "transport": "stdio"
  }
}
```

### sse (Server-Sent Events)

HTTP-based transport. Server runs separately, client connects via HTTP.

**Best for:**
- Remote servers
- Shared services
- Production deployments

**Example:**
```json
{
  "weather": {
    "transport": "sse",
    "url": "http://localhost:8000/mcp"
  }
}
```

## Official MCP Servers

### Filesystem Server

Access local filesystem with security controls.

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "{{projectPath}}"],
    "transport": "stdio"
  }
}
```

**Tools provided:**
- `read_file` - Read file contents
- `write_file` - Write to files
- `list_directory` - List directory contents
- `create_directory` - Create directories
- `move_file` - Move/rename files
- `search_files` - Search file contents

### GitHub Server

Interact with GitHub repositories.

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "transport": "stdio",
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
    }
  }
}
```

**Tools provided:**
- `create_or_update_file` - Create/update files in repo
- `search_repositories` - Search GitHub repos
- `create_repository` - Create new repo
- `get_file_contents` - Read file from repo
- `push_files` - Push multiple files
- `create_issue` - Create GitHub issue
- `create_pull_request` - Create PR
- `fork_repository` - Fork a repo
- `create_branch` - Create new branch

### Google Drive Server

Access Google Drive files and folders.

```json
{
  "gdrive": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-gdrive"],
    "transport": "stdio"
  }
}
```

**Tools provided:**
- `gdrive_search` - Search Drive
- `gdrive_read_file` - Read file contents
- `gdrive_create_file` - Create new file
- `gdrive_update_file` - Update existing file

### Slack Server

Send messages and interact with Slack.

```json
{
  "slack": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "transport": "stdio",
    "env": {
      "SLACK_BOT_TOKEN": "xoxb-your-token",
      "SLACK_TEAM_ID": "T1234567890"
    }
  }
}
```

**Tools provided:**
- `slack_list_channels` - List all channels
- `slack_post_message` - Post message to channel
- `slack_reply_to_thread` - Reply in thread
- `slack_add_reaction` - Add emoji reaction
- `slack_get_channel_history` - Get message history

### PostgreSQL Server

Query and manage PostgreSQL databases.

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost/db"],
    "transport": "stdio"
  }
}
```

**Tools provided:**
- `postgres_query` - Execute SQL query
- `postgres_list_tables` - List all tables
- `postgres_describe_table` - Get table schema
- `postgres_create_table` - Create new table
- `postgres_insert_data` - Insert rows

## Custom MCP Servers

### Creating a Custom Server

1. **Install MCP SDK:**
```bash
npm install @modelcontextprotocol/sdk
```

2. **Create server file (`custom-server.js`):**
```javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "custom-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "my_tool",
        description: "Does something useful",
        inputSchema: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "Input parameter",
            },
          },
          required: ["input"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "my_tool": {
      const { input } = request.params.arguments;
      return {
        content: [
          {
            type: "text",
            text: `Processed: ${input}`,
          },
        ],
      };
    }
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Custom MCP server running");
}

main();
```

3. **Add to configuration:**
```json
{
  "mcpServers": {
    "custom": {
      "command": "node",
      "args": ["custom-server.js"],
      "transport": "stdio"
    }
  }
}
```

## Troubleshooting

### MCP Servers Not Loading

**Problem:** No MCP servers shown at startup

**Solutions:**
1. Check configuration file exists: `.sajicode/mcp.json`
2. Verify JSON syntax is valid
3. Check server `enabled` is not `false`
4. Verify command is in PATH

### Tools Not Available to Agent

**Problem:** MCP servers load but agent uses built-in tools instead of MCP tools

**Cause:** Tool name collision - MCP tools are automatically prefixed with server name to avoid conflicts.

**Solution:** Use the prefixed tool name when asking the agent:

❌ **Wrong:** "list files using the filesystem MCP server"
- Agent will use built-in `ls` tool

✅ **Correct:** "use filesystem__list_directory to list files in src/"
- Agent will use the MCP filesystem server's tool

**Available MCP Tools:**
- `filesystem__list_directory` - List directory contents
- `filesystem__read_file` - Read file contents
- `filesystem__write_file` - Write file contents
- `github__create_issue` - Create GitHub issue
- `github__create_or_update_file` - Create/update GitHub file

**Additional Solutions:**
1. Restart SajiCode after config changes
2. Check server logs for errors (stderr is suppressed by default)
3. Test server independently: `node your-server.js`

### Server Crashes on Startup

**Problem:** Server starts but immediately crashes

**Solutions:**
1. Check environment variables are set correctly
2. Verify all dependencies are installed
3. Test command manually: `npx -y @modelcontextprotocol/server-name`
4. Check server requires authentication (tokens, API keys)

### Permission Errors

**Problem:** Server can't access files/resources

**Solutions:**
1. Check file permissions on project directory
2. Verify `{{projectPath}}` is being replaced correctly
3. Run with appropriate user permissions
4. Check security policies (antivirus, firewall)

## Best Practices

### Security

1. **Never commit tokens to git:**
```json
{
  "env": {
    "API_KEY": "use-environment-variable"
  }
}
```

Use environment variables instead:
```bash
export GITHUB_TOKEN="ghp_your_token"
```

2. **Limit filesystem access:**
```json
{
  "filesystem": {
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "{{projectPath}}/safe-dir"]
  }
}
```

3. **Use read-only servers when possible**

### Performance

1. **Disable unused servers:**
```json
{
  "unused-server": {
    "enabled": false
  }
}
```

2. **Use local servers for development:**
```json
{
  "local-db": {
    "command": "node",
    "args": ["local-server.js"]
  }
}
```

3. **Cache expensive operations in custom servers**

### Reliability

1. **Add error handling in custom servers:**
```javascript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Tool logic
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});
```

2. **Set timeouts for long-running operations**

3. **Log errors for debugging:**
```javascript
console.error(`[MCP Server] Error: ${error.message}`);
```

## Examples

### Example 1: Database + GitHub Integration

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "transport": "stdio"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "transport": "stdio",
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_token"
      }
    }
  }
}
```

**Use case:** Query database, generate report, create GitHub issue with findings.

### Example 2: Multi-Cloud Storage

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-gdrive"],
      "transport": "stdio"
    },
    "s3": {
      "command": "node",
      "args": ["s3-server.js"],
      "transport": "stdio",
      "env": {
        "AWS_ACCESS_KEY_ID": "key",
        "AWS_SECRET_ACCESS_KEY": "secret"
      }
    }
  }
}
```

**Use case:** Sync files between Google Drive and S3.

### Example 3: Communication Hub

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "transport": "stdio",
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-token",
        "SLACK_TEAM_ID": "T123"
      }
    },
    "email": {
      "command": "node",
      "args": ["email-server.js"],
      "transport": "stdio"
    }
  }
}
```

**Use case:** Monitor Slack, send email summaries, respond to mentions.

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers)
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [DeepAgents MCP Guide](https://docs.langchain.com/oss/javascript/deepagents/use-mcp)

## Support

For issues with:
- **SajiCode MCP integration:** Open issue in SajiCode repo
- **Specific MCP servers:** Check server's GitHub repository
- **MCP protocol:** Visit [MCP community](https://modelcontextprotocol.io/community)