/**
 * MCP Tool Types
 *
 * Shared types for tool definitions and handlers.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  [key: string]: unknown;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface Tool {
  definition: ToolDefinition;
  handler: ToolHandler;
}
