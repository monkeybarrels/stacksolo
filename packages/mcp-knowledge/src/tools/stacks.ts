/**
 * Stacks Tools
 *
 * MCP tools for listing and getting details about stacks.
 */

import type { Tool } from './types';
import {
  stacksOverview,
  fetchStacksIndex,
  fetchStackMetadata,
  fetchStackReadme,
} from '../knowledge/stacks';

export const stacksTool: Tool = {
  definition: {
    name: 'stacksolo_stacks',
    description:
      'List available stacks - complete, deployable applications with full source code. Stacks include services, apps, and infrastructure config ready to clone and customize.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Optional: filter by tag (e.g., "ai", "chatbot", "rag")',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Optional: filter by difficulty level',
        },
      },
    },
  },
  handler: async (args) => {
    const { tag, difficulty } = args as {
      tag?: string;
      difficulty?: string;
    };

    let output = stacksOverview;
    output += '\n## Available Stacks\n\n';

    try {
      let stacks = await fetchStacksIndex();

      // Apply filters
      if (tag) {
        stacks = stacks.filter((s) =>
          s.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))
        );
      }
      if (difficulty) {
        stacks = stacks.filter((s) => s.difficulty === difficulty);
      }

      if (stacks.length === 0) {
        output += 'No stacks found matching your criteria.\n';
      } else {
        output += '| Stack | Description | Difficulty | Tags |\n';
        output += '|-------|-------------|------------|------|\n';

        for (const stack of stacks) {
          output += `| **${stack.name}** (\`${stack.id}\`) | ${stack.description} | ${stack.difficulty} | ${stack.tags.join(', ')} |\n`;
        }

        output += '\n## Quick Start\n\n';
        output += '```bash\n';
        output += '# Clone a stack\n';
        output += 'stacksolo clone <stack-id> <project-name>\n\n';
        output += '# Example\n';
        output += 'stacksolo clone rag-platform my-chatbot\n';
        output += '```\n\n';
        output +=
          'Use `stacksolo_stack_detail` to get full documentation for a specific stack.\n';
      }
    } catch (error) {
      output += `Error fetching stacks: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
      output +=
        '\nFallback: Visit https://github.com/monkeybarrels/stacksolo-architectures/tree/main/stacks\n';
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  },
};

export const stackDetailTool: Tool = {
  definition: {
    name: 'stacksolo_stack_detail',
    description:
      'Get detailed documentation for a specific stack, including README, variables, and setup instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The stack ID (e.g., "rag-platform")',
        },
      },
      required: ['id'],
    },
  },
  handler: async (args) => {
    const { id } = args as { id: string };

    let output = '';

    try {
      const [metadata, readme] = await Promise.all([
        fetchStackMetadata(id),
        fetchStackReadme(id),
      ]);

      if (!metadata) {
        output = `Stack "${id}" not found.\n\n`;
        output += 'Available stacks:\n';
        const stacks = await fetchStacksIndex();
        for (const stack of stacks) {
          output += `- ${stack.id}: ${stack.name}\n`;
        }
        return {
          content: [{ type: 'text', text: output }],
        };
      }

      // Stack header
      output += `# ${metadata.name}\n\n`;
      output += `${metadata.description}\n\n`;
      output += `**Version:** ${metadata.version} | **Difficulty:** ${metadata.difficulty} | **Tags:** ${metadata.tags.join(', ')}\n\n`;

      // Variables
      if (
        metadata.variables &&
        Object.keys(metadata.variables).length > 0
      ) {
        output += '## Configuration Variables\n\n';
        output += '| Variable | Description | Required | Default |\n';
        output += '|----------|-------------|----------|----------|\n';
        for (const [key, value] of Object.entries(metadata.variables)) {
          output += `| \`${key}\` | ${value.description} | ${value.required ? 'Yes' : 'No'} | ${value.default || '-'} |\n`;
        }
        output += '\n';
      }

      // Clone instructions
      output += '## Clone This Stack\n\n';
      output += '```bash\n';
      output += `stacksolo clone ${id} my-project\n`;
      output += 'cd my-project\n';
      output += 'npm install\n';
      output += 'npm run dev\n';
      output += '```\n\n';

      // README content
      if (readme) {
        output += '---\n\n';
        output += readme;
      }
    } catch (error) {
      output = `Error fetching stack details: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
      output += `\nTry visiting: https://github.com/monkeybarrels/stacksolo-architectures/tree/main/stacks/${id}\n`;
    }

    return {
      content: [{ type: 'text', text: output }],
    };
  },
};
