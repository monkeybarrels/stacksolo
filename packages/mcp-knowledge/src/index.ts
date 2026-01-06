/**
 * StackSolo Knowledge MCP Server
 *
 * Model Context Protocol server providing StackSolo documentation and tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { registry } from '@stacksolo/core';
import gcpCdktfPlugin from '@stacksolo/plugin-gcp-cdktf';

import { getToolDefinitions, getToolHandler } from './tools/index';

// Register the GCP CDKTF plugin to populate the registry
registry.registerPlugin(gcpCdktfPlugin);

// Create the MCP server
const server = new Server(
  {
    name: 'stacksolo-knowledge',
    version: '0.1.0',
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
    tools: getToolDefinitions(),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const handler = getToolHandler(name);

    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    return await handler(args || {});
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, message);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('StackSolo Knowledge MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
