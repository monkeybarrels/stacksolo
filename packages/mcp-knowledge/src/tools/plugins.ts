/**
 * Plugins Tool
 *
 * Tools for showing installed plugins and their resources.
 */

import type { Tool } from './types';
import { registry } from '@stacksolo/core';

export const pluginsTool: Tool = {
  definition: {
    name: 'stacksolo_plugins',
    description:
      'Get information about installed StackSolo plugins, providers, and resource types. Shows what is actually available in the current installation.',
    inputSchema: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['providers', 'resources', 'patterns', 'formatters', 'all'],
          description:
            'What to show: providers, resources, patterns, formatters, or all (default: all)',
        },
      },
    },
  },
  handler: async (args) => {
    const { detail = 'all' } = args as { detail?: string };
    let output = '# Installed StackSolo Plugins\n\n';

    const providers = registry.getAllProviders();
    const allResources = registry.getAllResources();
    const patterns = registry.getAllPatterns();
    const formatters = registry.getAllFormatters();

    if (detail === 'all' || detail === 'providers') {
      output += '## Providers\n\n';
      if (providers.length === 0) {
        output += 'No providers registered.\n\n';
      } else {
        for (const provider of providers) {
          output += `### ${provider.name} (\`${provider.id}\`)\n`;
          output += `- Auth: ${provider.auth.type}\n`;
          output += `- Resources: ${provider.resources.length}\n\n`;
        }
      }
    }

    if (detail === 'all' || detail === 'resources') {
      output += '## Resource Types\n\n';
      if (allResources.length === 0) {
        output += 'No resources registered.\n\n';
      } else {
        output += '| ID | Name | Provider | Description |\n';
        output += '|----|------|----------|-------------|\n';
        for (const resource of allResources) {
          output += `| \`${resource.id}\` | ${resource.name} | ${resource.provider} | ${resource.description.slice(0, 50)}... |\n`;
        }
        output += '\n';

        // Add detailed config schema for each resource
        output += '### Resource Config Schemas\n\n';
        for (const resource of allResources) {
          output += `#### ${resource.name} (\`${resource.id}\`)\n\n`;
          output += `${resource.description}\n\n`;
          if (resource.configSchema && resource.configSchema.properties) {
            output += '**Config options:**\n';
            for (const [key, prop] of Object.entries(resource.configSchema.properties)) {
              const propTyped = prop as {
                type?: string;
                description?: string;
                default?: unknown;
              };
              output += `- \`${key}\` (${propTyped.type || 'unknown'}): ${propTyped.description || 'No description'}`;
              if (propTyped.default !== undefined) {
                output += ` (default: ${JSON.stringify(propTyped.default)})`;
              }
              output += '\n';
            }
          }
          output += '\n';
        }
      }
    }

    if (detail === 'all' || detail === 'patterns') {
      output += '## App Patterns\n\n';
      if (patterns.length === 0) {
        output += 'No patterns registered.\n\n';
      } else {
        for (const pattern of patterns) {
          output += `### ${pattern.name} (\`${pattern.id}\`)\n`;
          output += `${pattern.description}\n`;
          output += `- Provider: ${pattern.provider}\n`;
          if (pattern.prompts && pattern.prompts.length > 0) {
            output += `- Prompts: ${pattern.prompts.map((p) => p.label).join(', ')}\n`;
          }
          output += '\n';
        }
      }
    }

    if (detail === 'all' || detail === 'formatters') {
      output += '## Output Formatters\n\n';
      if (formatters.length === 0) {
        output += 'No formatters registered.\n\n';
      } else {
        for (const formatter of formatters) {
          output += `### ${formatter.name} (\`${formatter.id}\`)\n`;
          output += `${formatter.description}\n\n`;
        }
      }
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  },
};
