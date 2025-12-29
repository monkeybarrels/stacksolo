#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { registry } from '@stacksolo/core';
import type { Deployment } from '@stacksolo/shared';
import { analyzeProject, getPatternInfrastructure } from './tools/patterns';
import { callApi, getApiStatus, API_URL } from './api-client';

// API response types
interface GenerateConfigResult {
  success: boolean;
  files: string[];
}

interface GeneratedFile {
  path: string;
  content: string;
}

// Create the MCP server
const server = new Server(
  {
    name: 'stacksolo',
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
    tools: [
      {
        name: 'status',
        description:
          'Check the status of the StackSolo API connection. Use this first to verify the API is running before calling other tools.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'analyze_project',
        description:
          'Analyze a project directory to detect its type and suggest deployment patterns. Returns matching app patterns based on project structure.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the project directory',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_patterns',
        description:
          'List all available app patterns for deployment. Returns pattern IDs, names, and descriptions.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_pattern_infrastructure',
        description:
          'Get the infrastructure resources that would be created for a pattern with the given configuration answers.',
        inputSchema: {
          type: 'object',
          properties: {
            patternId: {
              type: 'string',
              description: 'The pattern ID (e.g., "nextjs-cloud-run")',
            },
            answers: {
              type: 'object',
              description:
                'Answers to the pattern prompts (e.g., { "needsDatabase": true })',
              additionalProperties: true,
            },
          },
          required: ['patternId'],
        },
      },
      {
        name: 'create_project',
        description:
          'Create a new StackSolo project for deployment. Returns the project ID.',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Project name',
            },
            provider: {
              type: 'string',
              description: 'Cloud provider (e.g., "gcp")',
              default: 'gcp',
            },
            gcpProjectId: {
              type: 'string',
              description: 'GCP project ID',
            },
            region: {
              type: 'string',
              description: 'Region for deployment (e.g., "us-central1")',
              default: 'us-central1',
            },
            path: {
              type: 'string',
              description: 'Local path to the project codebase',
            },
            patternId: {
              type: 'string',
              description: 'App pattern to use (e.g., "nextjs-cloud-run")',
            },
          },
          required: ['name', 'gcpProjectId'],
        },
      },
      {
        name: 'list_projects',
        description: 'List all StackSolo projects.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_project',
        description: 'Get details of a specific project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'deploy',
        description:
          'Deploy a project. This triggers the Pulumi deployment process.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID to deploy',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'build',
        description:
          'Build a Docker image for a project using its app pattern. Generates Dockerfile, builds, and pushes to registry.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID to build',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'get_deployment_status',
        description: 'Get the status of the latest deployment for a project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'destroy',
        description:
          'Destroy all deployed resources for a project. This is irreversible.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID',
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'generate_config',
        description:
          'Generate configuration files (.env.local and stacksolo.config.ts) for a project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID',
            },
            resourceOutputs: {
              type: 'object',
              description: 'Resource outputs from deployment (optional)',
              additionalProperties: true,
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'preview_code',
        description: 'Preview the generated Pulumi code for a project.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'The project ID',
            },
          },
          required: ['projectId'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'status': {
        const status = await getApiStatus();
        const patterns = registry.getAllPatterns();
        const providers = registry.getAllProviders();

        const statusText = status.connected
          ? `StackSolo API is connected.\n\nAPI URL: ${status.url}\nProviders: ${providers.map((p) => p.name).join(', ')}\nPatterns: ${patterns.map((p) => p.id).join(', ')}`
          : `StackSolo API is NOT connected.\n\nAPI URL: ${status.url}\nError: ${status.error}\n\nTo start the API:\n  1. Run 'stacksolo serve' in a terminal\n  2. Or open the StackSolo desktop app\n  3. Or set STACKSOLO_API_URL environment variable`;

        return {
          content: [{ type: 'text', text: statusText }],
        };
      }

      case 'analyze_project': {
        const { path } = args as { path: string };
        const result = await analyzeProject(path);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_patterns': {
        const patterns = registry.getAllPatterns().map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          provider: p.provider,
          prompts: p.prompts.map((pr) => ({
            id: pr.id,
            type: pr.type,
            label: pr.label,
            description: pr.description,
          })),
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }],
        };
      }

      case 'get_pattern_infrastructure': {
        const { patternId, answers = {} } = args as {
          patternId: string;
          answers?: Record<string, unknown>;
        };
        const result = getPatternInfrastructure(patternId, answers);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'create_project': {
        const {
          name,
          provider = 'gcp',
          gcpProjectId,
          region = 'us-central1',
          path,
          patternId,
        } = args as {
          name: string;
          provider?: string;
          gcpProjectId: string;
          region?: string;
          path?: string;
          patternId?: string;
        };

        const result = await callApi('projects.create', {
          name,
          provider,
          providerConfig: {
            projectId: gcpProjectId,
            region,
          },
          path,
          patternId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_projects': {
        const result = await callApi('projects.list', {});
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_project': {
        const { projectId } = args as { projectId: string };
        const result = await callApi('projects.get', { id: projectId });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'deploy': {
        const { projectId } = args as { projectId: string };
        const result = await callApi<Deployment>('deployments.deploy', { projectId });
        return {
          content: [
            {
              type: 'text',
              text: `Deployment started. ID: ${result.id}\nStatus: ${result.status}\n\nUse get_deployment_status to check progress.`,
            },
          ],
        };
      }

      case 'build': {
        const { projectId } = args as { projectId: string };
        const result = await callApi<Deployment>('deployments.build', { projectId });
        return {
          content: [
            {
              type: 'text',
              text: `Build started. ID: ${result.id}\nStatus: ${result.status}\n\nUse get_deployment_status to check progress.`,
            },
          ],
        };
      }

      case 'get_deployment_status': {
        const { projectId } = args as { projectId: string };
        const deployments = await callApi<Deployment[]>('deployments.listByProject', {
          projectId,
        });
        if (!deployments || deployments.length === 0) {
          return {
            content: [{ type: 'text', text: 'No deployments found for this project.' }],
          };
        }
        const latest = deployments[0];
        return {
          content: [{ type: 'text', text: JSON.stringify(latest, null, 2) }],
        };
      }

      case 'destroy': {
        const { projectId } = args as { projectId: string };
        await callApi('deployments.destroy', { projectId });
        return {
          content: [{ type: 'text', text: 'Resources destroyed successfully.' }],
        };
      }

      case 'generate_config': {
        const { projectId, resourceOutputs } = args as {
          projectId: string;
          resourceOutputs?: Record<string, { outputs?: Record<string, string> }>;
        };
        const result = await callApi<GenerateConfigResult>('deployments.generateConfig', {
          projectId,
          resourceOutputs,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Config files generated:\n${result.files.join('\n')}`,
            },
          ],
        };
      }

      case 'preview_code': {
        const { projectId } = args as { projectId: string };
        const files = await callApi<GeneratedFile[]>('deployments.getCode', { projectId });
        const output = files
          .map((f) => `--- ${f.path} ---\n${f.content}`)
          .join('\n\n');
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, message);
  }
});

// Start the server
async function main() {
  // Load GCP plugin to register patterns
  const gcpPlugin = await import('@stacksolo/plugin-gcp');
  registry.registerPlugin(gcpPlugin.default);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('StackSolo MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
