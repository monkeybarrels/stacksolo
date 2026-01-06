/**
 * Resources Tool
 *
 * Tools for getting resource type information.
 */

import type { Tool } from './types';
import { resources, getResourcesOverview } from '../knowledge/index';

export const resourcesTool: Tool = {
  definition: {
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
  handler: async (args) => {
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
  },
};
