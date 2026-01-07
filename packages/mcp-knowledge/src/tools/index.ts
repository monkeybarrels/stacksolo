/**
 * Tools Barrel Export
 *
 * Exports all MCP tools and provides the tool registry.
 */

export * from './types';

// Import all tools
import { overviewTool } from './overview';
import { configSchemaTool, configExamplesTool, validateTool } from './config';
import { resourcesTool } from './resources';
import { cliTool } from './cli';
import { suggestTool } from './suggest';
import { pluginsTool } from './plugins';
import { architecturesTool, architectureDetailTool } from './architectures';
import { setupTool } from './setup';
import { firebaseAuthTool } from './firebase-auth';
import { templatesTool, templateGuideTool } from './templates';
import { stacksTool, stackDetailTool } from './stacks';

import type { Tool } from './types';

// Export individual tools for direct access
export {
  overviewTool,
  configSchemaTool,
  configExamplesTool,
  validateTool,
  resourcesTool,
  cliTool,
  suggestTool,
  pluginsTool,
  architecturesTool,
  architectureDetailTool,
  setupTool,
  firebaseAuthTool,
  templatesTool,
  templateGuideTool,
  stacksTool,
  stackDetailTool,
};

// All tools registry for easy iteration
export const allTools: Tool[] = [
  overviewTool,
  configSchemaTool,
  configExamplesTool,
  resourcesTool,
  cliTool,
  suggestTool,
  pluginsTool,
  validateTool,
  architecturesTool,
  architectureDetailTool,
  setupTool,
  firebaseAuthTool,
  templatesTool,
  templateGuideTool,
  stacksTool,
  stackDetailTool,
];

// Tool lookup map for handler dispatch
export const toolMap = new Map<string, Tool>(
  allTools.map((tool) => [tool.definition.name, tool])
);

// Get tool definitions for ListTools response
export function getToolDefinitions() {
  return allTools.map((tool) => tool.definition);
}

// Get tool handler by name
export function getToolHandler(name: string) {
  const tool = toolMap.get(name);
  return tool?.handler;
}
