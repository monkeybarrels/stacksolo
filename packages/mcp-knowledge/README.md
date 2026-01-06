# @stacksolo/mcp-knowledge

MCP (Model Context Protocol) server that provides StackSolo knowledge to AI assistants like Claude and Cursor. This helps AI understand StackSolo and assist users with infrastructure configuration without requiring them to know all the details.

## What It Does

When you add this MCP to your AI assistant, it gains access to these tools:

| Tool | Description |
|------|-------------|
| `stacksolo_overview` | Explains what StackSolo is and its key concepts |
| `stacksolo_config_schema` | Complete config schema documentation |
| `stacksolo_config_examples` | Example configs for common use cases |
| `stacksolo_resources` | Info about available resource types |
| `stacksolo_cli` | CLI command reference and workflows |
| `stacksolo_suggest` | Suggests config based on app description |

## Installation

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "stacksolo": {
      "command": "npx",
      "args": ["-y", "@stacksolo/mcp-knowledge"]
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "stacksolo": {
      "command": "npx",
      "args": ["-y", "@stacksolo/mcp-knowledge"]
    }
  }
}
```

### Local Development

For local testing, point directly to the built file:

```json
{
  "mcpServers": {
    "stacksolo": {
      "command": "node",
      "args": ["/path/to/stacksolo/packages/mcp-knowledge/dist/index.js"]
    }
  }
}
```

## Usage Examples

Once configured, you can ask your AI assistant things like:

- "Help me deploy a Next.js app with PostgreSQL using StackSolo"
- "What resources does StackSolo support?"
- "How do I share a VPC between multiple StackSolo projects?"
- "Generate a config for an API with Redis caching"

The AI will use the MCP tools to provide accurate, up-to-date guidance.

## Available Tools

### `stacksolo_overview`

Returns a comprehensive overview of StackSolo, including:
- What it is and what it does
- Key concepts (config files, networks, resources)
- Workflow overview
- Target audience

### `stacksolo_config_schema`

Returns the complete config schema documentation:
- Root structure
- Network configuration
- Function, container, and UI configurations
- Resource configurations
- Reference syntax

### `stacksolo_config_examples`

Returns example configurations for:
- Minimal API
- API with database
- Full stack app (frontend + backend + database + cache)
- Shared VPC setup

### `stacksolo_resources`

Returns information about available resource types:
- Cloud Functions (Gen2)
- Cloud Run
- Cloud SQL
- Memorystore Redis
- Cloud Storage
- Load Balancer
- Pub/Sub
- Cloud Scheduler
- Secret Manager

Can optionally filter to a specific resource type.

### `stacksolo_cli`

Returns CLI command reference:
- All available commands
- Command options and flags
- Common workflows

Can optionally return help for a specific command.

### `stacksolo_suggest`

Takes a description of what the user wants to build and returns a suggested configuration. For example:

Input: "Next.js app with PostgreSQL database and Redis cache"

Output: Complete config JSON with Cloud Run, Cloud SQL, and Redis configured with proper references.

## Development

### Setup

```bash
# Install dependencies
pnpm install

# Build
pnpm --filter @stacksolo/mcp-knowledge build

# Test locally
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

### Project Structure

```
src/
├── index.ts              # Server entry point
├── knowledge/            # Static knowledge content (markdown strings)
│   ├── overview.ts       # StackSolo overview
│   ├── config.ts         # Config schema & examples
│   ├── resources.ts      # Resource definitions
│   ├── cli.ts            # CLI reference
│   ├── firebase.ts       # Firebase auth docs
│   └── templates.ts      # Template guides
└── tools/                # MCP tool implementations
    ├── index.ts          # Tool registry (barrel export)
    ├── types.ts          # Shared types
    ├── github.ts         # GitHub fetch utilities
    └── *.ts              # Individual tool files
```

### Adding a New Tool

1. **Create the tool file** at `src/tools/my-tool.ts`:

```typescript
import type { Tool } from './types';

export const myTool: Tool = {
  definition: {
    name: 'stacksolo_my_tool',
    description: 'What this tool does',
    inputSchema: {
      type: 'object',
      properties: {
        param: { type: 'string', description: 'Optional parameter' },
      },
    },
  },
  handler: async (args) => {
    const { param } = args as { param?: string };
    return {
      content: [{ type: 'text', text: '# Output\n\nContent here...' }],
    };
  },
};
```

2. **Register in the barrel export** at `src/tools/index.ts`:

```typescript
import { myTool } from './my-tool';

export { myTool };

export const allTools: Tool[] = [
  // ... existing tools
  myTool,
];
```

3. **Build and test**:

```bash
pnpm --filter @stacksolo/mcp-knowledge build

# Test the tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"stacksolo_my_tool"}}' | node dist/index.js
```

### Tool Conventions

| Convention | Example |
|------------|---------|
| Tool naming | `stacksolo_<feature>` |
| Output format | Markdown text |
| Parameters | Optional with defaults when possible |

### Adding Knowledge Content

Static knowledge lives in `src/knowledge/`. To add new content:

1. Add to existing file or create new file
2. Export from `src/knowledge/index.ts`
3. Import in relevant tool handler

### Testing

```bash
# List all tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js

# Call a specific tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"stacksolo_overview"}}' | node dist/index.js

# Call with parameters
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"stacksolo_resources","arguments":{"resourceType":"cloud-sql"}}}' | node dist/index.js
```

## License

MIT
