/**
 * Architectures Tools
 *
 * Tools for listing and getting details about architecture templates.
 */

import type { Tool } from './types';
import { fetchFromGitHub, ArchitectureManifest } from './github';

const ARCHITECTURES_REPO = 'monkeybarrels/stacksolo-architectures';

export const architecturesTool: Tool = {
  definition: {
    name: 'stacksolo_architectures',
    description:
      'List available tested architecture templates from the community repository. These are pre-built, tested configurations for common use cases.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Optional: filter by tag (e.g., "database", "frontend", "api")',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Optional: filter by difficulty level',
        },
        community: {
          type: 'boolean',
          description: 'Optional: if true, only show community-contributed architectures',
        },
      },
    },
  },
  handler: async (args) => {
    const { tag, difficulty, community } = args as {
      tag?: string;
      difficulty?: 'beginner' | 'intermediate' | 'advanced';
      community?: boolean;
    };

    try {
      const manifest = (await fetchFromGitHub('index.json')) as ArchitectureManifest;

      let architectures = manifest.architectures;

      // Apply filters
      if (tag) {
        architectures = architectures.filter((a) =>
          a.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))
        );
      }
      if (difficulty) {
        architectures = architectures.filter((a) => a.difficulty === difficulty);
      }
      if (community !== undefined) {
        architectures = architectures.filter((a) => (a.community || false) === community);
      }

      let output = '# Available Architecture Templates\n\n';
      output += `*From [stacksolo-architectures](https://github.com/${ARCHITECTURES_REPO})*\n\n`;

      if (architectures.length === 0) {
        output += 'No architectures found matching your filters.\n';
      } else {
        output += '| Name | Description | Difficulty | Tags |\n';
        output += '|------|-------------|------------|------|\n';
        for (const arch of architectures) {
          const communityBadge = arch.community ? ' :star:' : '';
          output += `| **${arch.name}**${communityBadge} | ${arch.description} | ${arch.difficulty} | ${arch.tags.join(', ')} |\n`;
        }
        output += '\n';
        output += ':star: = Community contributed\n\n';
        output += '## Usage\n\n';
        output +=
          'To get the full config for an architecture, use `stacksolo_architecture_detail` with the architecture ID.\n\n';
        output += '### Available IDs:\n';
        for (const arch of architectures) {
          output += `- \`${arch.id}\` - ${arch.name}\n`;
        }
      }

      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `# Error Fetching Architectures\n\nFailed to fetch architecture list: ${message}\n\nThe architecture repository may not be set up yet or may be temporarily unavailable.`,
          },
        ],
      };
    }
  },
};

export const architectureDetailTool: Tool = {
  definition: {
    name: 'stacksolo_architecture_detail',
    description:
      'Get detailed information about a specific architecture template, including the full config, README, and customizable variables.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The architecture ID (e.g., "nextjs-postgres", "api-redis-cache")',
        },
      },
      required: ['id'],
    },
  },
  handler: async (args) => {
    const { id } = args as { id: string };

    try {
      // First get the manifest to find the architecture path
      const manifest = (await fetchFromGitHub('index.json')) as ArchitectureManifest;
      const architecture = manifest.architectures.find((a) => a.id === id);

      if (!architecture) {
        const availableIds = manifest.architectures.map((a) => a.id).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `# Architecture Not Found\n\nNo architecture found with ID "${id}".\n\nAvailable architectures: ${availableIds}`,
            },
          ],
        };
      }

      // Fetch the architecture details
      const [config, readme, variables] = await Promise.all([
        fetchFromGitHub(`${architecture.path}/config.json`).catch(() => null),
        fetchFromGitHub(`${architecture.path}/README.md`).catch(() => null),
        fetchFromGitHub(`${architecture.path}/variables.json`).catch(() => null),
      ]);

      let output = `# ${architecture.name}\n\n`;
      output += `**Difficulty:** ${architecture.difficulty}\n`;
      output += `**Tags:** ${architecture.tags.join(', ')}\n`;
      if (architecture.community) {
        output += `**Source:** Community contributed :star:\n`;
      }
      output += '\n';

      if (readme) {
        output += '## Description\n\n';
        output += readme as string;
        output += '\n\n';
      } else {
        output += `${architecture.description}\n\n`;
      }

      if (variables) {
        const vars = variables as Record<
          string,
          { description: string; default?: string; required?: boolean }
        >;
        output += '## Customizable Variables\n\n';
        output += 'These values should be customized for your project:\n\n';
        for (const [key, info] of Object.entries(vars)) {
          const required = info.required ? ' (required)' : '';
          const defaultVal = info.default ? ` [default: ${info.default}]` : '';
          output += `- **${key}**${required}: ${info.description}${defaultVal}\n`;
        }
        output += '\n';
      }

      if (config) {
        output += '## Configuration\n\n';
        output += '```json\n';
        output += JSON.stringify(config, null, 2);
        output += '\n```\n\n';
      }

      output += '## Next Steps\n\n';
      output += '1. Copy the configuration above to `.stacksolo/stacksolo.config.json`\n';
      output += '2. Update the customizable variables for your project\n';
      output += '3. Run `stacksolo scaffold` to generate boilerplate\n';
      output += '4. Run `stacksolo deploy` when ready\n';

      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `# Error Fetching Architecture\n\nFailed to fetch architecture details: ${message}`,
          },
        ],
      };
    }
  },
};
