import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import {
  overview,
  targetAudience,
  configSchema,
  configExamples,
  cliReference,
  commonWorkflows,
  resources,
  getResourcesOverview,
} from './knowledge/index';

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
    tools: [
      {
        name: 'stacksolo_overview',
        description:
          'Get an overview of what StackSolo is, its key concepts, and who it is for. Call this first to understand StackSolo before helping users.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'stacksolo_config_schema',
        description:
          'Get the complete config schema for stacksolo.config.json. Use this to understand what fields are available and how to structure the config.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'stacksolo_config_examples',
        description:
          'Get example configurations for common use cases (minimal API, API with database, full stack app, shared VPC).',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'stacksolo_resources',
        description:
          'Get detailed information about available resource types (Cloud Functions, Cloud Run, Cloud SQL, Redis, etc).',
        inputSchema: {
          type: 'object',
          properties: {
            resourceType: {
              type: 'string',
              description:
                'Optional: specific resource type to get info about (e.g., "cloud-function", "cloud-run", "cloud-sql")',
            },
          },
        },
      },
      {
        name: 'stacksolo_cli',
        description:
          'Get CLI command reference and common workflows. Use this to help users run the right commands.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description:
                'Optional: specific command to get help for (e.g., "deploy", "init", "clone")',
            },
          },
        },
      },
      {
        name: 'stacksolo_suggest',
        description:
          'Get a suggested configuration based on what the user wants to build. Describe the app and get a recommended config.',
        inputSchema: {
          type: 'object',
          properties: {
            description: {
              type: 'string',
              description:
                'Description of what the user wants to build (e.g., "Next.js app with PostgreSQL database and Redis cache")',
            },
          },
          required: ['description'],
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
      case 'stacksolo_overview': {
        return {
          content: [
            {
              type: 'text',
              text: overview + '\n\n' + targetAudience,
            },
          ],
        };
      }

      case 'stacksolo_config_schema': {
        return {
          content: [{ type: 'text', text: configSchema }],
        };
      }

      case 'stacksolo_config_examples': {
        return {
          content: [{ type: 'text', text: configExamples }],
        };
      }

      case 'stacksolo_resources': {
        const { resourceType } = args as { resourceType?: string };

        if (resourceType) {
          const resource = resources.find(
            (r) =>
              r.id === resourceType ||
              r.configKey === resourceType ||
              r.name.toLowerCase().includes(resourceType.toLowerCase())
          );

          if (!resource) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Resource type "${resourceType}" not found. Available types:\n${resources.map((r) => `- ${r.id}: ${r.name}`).join('\n')}`,
                },
              ],
            };
          }

          let output = `# ${resource.name}\n\n`;
          output += `${resource.description}\n\n`;
          output += `## Config Key\n\`${resource.configKey}\`\n\n`;
          output += `## Required Fields\n${resource.requiredFields.map((f) => `- \`${f}\``).join('\n')}\n\n`;
          output += `## Optional Fields\n`;
          for (const [field, desc] of Object.entries(resource.optionalFields)) {
            output += `- \`${field}\`: ${desc}\n`;
          }
          output += `\n## Example\n\`\`\`json\n${resource.example}\n\`\`\``;

          return {
            content: [{ type: 'text', text: output }],
          };
        }

        return {
          content: [{ type: 'text', text: getResourcesOverview() }],
        };
      }

      case 'stacksolo_cli': {
        const { command } = args as { command?: string };

        if (command) {
          // Extract specific command help from the reference
          const lowerCommand = command.toLowerCase();
          const sections = cliReference.split('####');
          const matchingSection = sections.find((s) =>
            s.toLowerCase().includes(`\`stacksolo ${lowerCommand}`)
          );

          if (matchingSection) {
            return {
              content: [{ type: 'text', text: '####' + matchingSection }],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Command "${command}" not found in reference. Here's the full CLI reference:\n\n${cliReference}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: cliReference + '\n\n' + commonWorkflows,
            },
          ],
        };
      }

      case 'stacksolo_suggest': {
        const { description } = args as { description: string };
        const lowerDesc = description.toLowerCase();

        let suggestion = '# Suggested Configuration\n\n';
        suggestion += `Based on: "${description}"\n\n`;

        // Detect what resources are needed
        const needsDatabase =
          lowerDesc.includes('database') ||
          lowerDesc.includes('postgres') ||
          lowerDesc.includes('mysql') ||
          lowerDesc.includes('sql');
        const needsRedis =
          lowerDesc.includes('redis') ||
          lowerDesc.includes('cache') ||
          lowerDesc.includes('session');
        const needsStorage =
          lowerDesc.includes('upload') ||
          lowerDesc.includes('file') ||
          lowerDesc.includes('image') ||
          lowerDesc.includes('storage');
        const isNextjs =
          lowerDesc.includes('next') || lowerDesc.includes('nextjs');
        const isApi =
          lowerDesc.includes('api') ||
          lowerDesc.includes('backend') ||
          lowerDesc.includes('server');
        const hasUI =
          lowerDesc.includes('frontend') ||
          lowerDesc.includes('ui') ||
          lowerDesc.includes('web') ||
          isNextjs;
        const isFunction =
          lowerDesc.includes('function') ||
          lowerDesc.includes('serverless') ||
          lowerDesc.includes('lambda');

        // Build config
        const config: Record<string, unknown> = {
          project: {
            name: 'my-app',
            gcpProjectId: 'YOUR_GCP_PROJECT_ID',
            region: 'us-central1',
            networks: [
              {
                name: 'main',
              } as Record<string, unknown>,
            ],
          },
        };

        const network = (config.project as Record<string, unknown>)
          .networks as Record<string, unknown>[];

        // Add resources based on detection
        if (isNextjs || (isApi && !isFunction)) {
          network[0].containers = [
            {
              name: isNextjs ? 'web' : 'api',
              port: isNextjs ? 3000 : 8080,
              allowUnauthenticated: true,
              env: {} as Record<string, string>,
            },
          ];

          if (needsDatabase) {
            (
              (network[0].containers as Record<string, unknown>[])[0]
                .env as Record<string, string>
            )['DATABASE_URL'] = '@sql/db.connectionString';
          }
          if (needsRedis) {
            (
              (network[0].containers as Record<string, unknown>[])[0]
                .env as Record<string, string>
            )['REDIS_URL'] = '@redis/cache.url';
          }
        } else if (isFunction || isApi) {
          network[0].functions = [
            {
              name: 'api',
              runtime: 'nodejs20',
              entryPoint: 'handler',
              allowUnauthenticated: true,
              env: {} as Record<string, string>,
            },
          ];

          if (needsDatabase) {
            (
              (network[0].functions as Record<string, unknown>[])[0]
                .env as Record<string, string>
            )['DATABASE_URL'] = '@sql/db.connectionString';
          }
        }

        if (hasUI && !isNextjs) {
          network[0].uis = [
            {
              name: 'web',
              buildCommand: 'npm run build',
              outputDir: 'dist',
            },
          ];
        }

        if (needsDatabase) {
          network[0].sql = [
            {
              name: 'db',
              databaseVersion: 'POSTGRES_15',
              tier: 'db-f1-micro',
            },
          ];
        }

        if (needsRedis) {
          network[0].redis = [
            {
              name: 'cache',
              tier: 'BASIC',
              memorySizeGb: 1,
            },
          ];
        }

        if (needsStorage) {
          (config.project as Record<string, unknown>).buckets = [
            {
              name: 'my-app-uploads',
              location: 'US',
            },
          ];
        }

        // Add load balancer if multiple backends
        const hasContainers = !!network[0].containers;
        const hasFunctions = !!network[0].functions;
        const hasUis = !!network[0].uis;
        const backendCount =
          (hasContainers ? 1 : 0) + (hasFunctions ? 1 : 0) + (hasUis ? 1 : 0);

        if (backendCount > 0) {
          const routes: { path: string; backend: string }[] = [];

          if (hasContainers) {
            const containerName = (
              network[0].containers as Record<string, unknown>[]
            )[0].name as string;
            if (containerName === 'api') {
              routes.push({ path: '/api/*', backend: 'api' });
            } else {
              routes.push({ path: '/*', backend: containerName });
            }
          }

          if (hasFunctions) {
            routes.push({ path: '/api/*', backend: 'api' });
          }

          if (hasUis) {
            routes.push({ path: '/*', backend: 'web' });
          }

          if (routes.length > 0) {
            network[0].loadBalancer = {
              name: 'gateway',
              routes,
            };
          }
        }

        suggestion += '```json\n' + JSON.stringify(config, null, 2) + '\n```\n\n';

        suggestion += '## Next Steps\n\n';
        suggestion += '1. Replace `YOUR_GCP_PROJECT_ID` with your actual GCP project ID\n';
        suggestion += '2. Save this as `.stacksolo/stacksolo.config.json`\n';
        suggestion += '3. Run `stacksolo scaffold` to generate boilerplate\n';
        suggestion += '4. Write your application code\n';
        suggestion += '5. Run `stacksolo deploy`\n';

        return {
          content: [{ type: 'text', text: suggestion }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
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
