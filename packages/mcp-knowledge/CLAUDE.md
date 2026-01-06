# MCP Knowledge - AI Maintenance Guide

This guide is for AI assistants maintaining the MCP Knowledge package.

## Package Overview

MCP server providing StackSolo documentation to AI assistants via the Model Context Protocol.

## File Structure

```
packages/mcp-knowledge/
├── src/
│   ├── index.ts              # Server entry point (minimal - just setup)
│   ├── knowledge/            # Static knowledge content
│   │   ├── index.ts          # Barrel export for knowledge
│   │   ├── overview.ts       # StackSolo overview text
│   │   ├── config.ts         # Config schema and examples
│   │   ├── resources.ts      # Resource type definitions
│   │   ├── cli.ts            # CLI reference
│   │   ├── firebase.ts       # Firebase auth documentation
│   │   └── templates.ts      # Template guides
│   └── tools/                # MCP tool implementations
│       ├── index.ts          # Barrel export + tool registry
│       ├── types.ts          # Shared types (Tool, ToolResult)
│       ├── github.ts         # GitHub fetch utilities
│       ├── overview.ts       # Overview tool
│       ├── config.ts         # Config tools (schema, examples, validate)
│       ├── resources.ts      # Resources tool
│       ├── cli.ts            # CLI tool
│       ├── suggest.ts        # Config suggestion tool
│       ├── plugins.ts        # Plugins info tool
│       ├── architectures.ts  # Architectures tools
│       ├── setup.ts          # Setup guide tool
│       ├── firebase-auth.ts  # Firebase auth tool
│       └── templates.ts      # Templates tools
└── dist/                     # Built output
```

## Adding a New Tool

### Step 1: Create the Tool File

Create `src/tools/my-tool.ts`:

```typescript
import type { Tool } from './types';

export const myTool: Tool = {
  definition: {
    name: 'stacksolo_my_tool',
    description: 'What this tool does - shown to AI when listing tools',
    inputSchema: {
      type: 'object',
      properties: {
        optionalParam: {
          type: 'string',
          description: 'Description of this parameter',
        },
      },
      // Add required: ['paramName'] if any params are required
    },
  },
  handler: async (args) => {
    const { optionalParam } = args as { optionalParam?: string };

    // Build output
    let output = '# My Tool Output\n\n';
    output += 'Tool content here...';

    return {
      content: [{ type: 'text', text: output }],
    };
  },
};
```

### Step 2: Register in Barrel Export

Update `src/tools/index.ts`:

```typescript
// Add import
import { myTool } from './my-tool';

// Add to exports
export { myTool };

// Add to allTools array
export const allTools: Tool[] = [
  // ... existing tools
  myTool,
];
```

That's it - the tool is automatically available via MCP.

## Tool Conventions

| Convention | Description |
|------------|-------------|
| Naming | `stacksolo_<feature>` for tool names |
| Output | Return markdown formatted text |
| Errors | Throw errors with descriptive messages |
| Params | Use optional params with sensible defaults |

## Modifying Knowledge Content

Static knowledge lives in `src/knowledge/`. Each file exports string constants or functions that return content.

To add new knowledge:
1. Add to existing file if it fits, or create new file
2. Export from `src/knowledge/index.ts`
3. Import in relevant tool handler

## GitHub Fetching

Tools that fetch from GitHub use `src/tools/github.ts`:

```typescript
import { fetchFromGitHub, TemplateManifest } from './github';

// Fetches from stacksolo-architectures repo
const data = await fetchFromGitHub('templates.json');
```

- Has 15-minute in-memory cache
- Auto-detects JSON vs text content
- Throws on fetch errors

## Building

```bash
pnpm --filter @stacksolo/mcp-knowledge build
```

## Testing Locally

```bash
# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js

# Call a tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"stacksolo_overview"}}' | node dist/index.js
```

## Common Tasks

### Adding a new template guide

1. Add guide content to `src/knowledge/templates.ts`
2. Update `getTemplateGuide()` function to handle new template ID
3. Rebuild

### Updating CLI reference

1. Edit `src/knowledge/cli.ts`
2. Rebuild

### Adding resource type documentation

1. Add to `resources` array in `src/knowledge/resources.ts`
2. Rebuild
