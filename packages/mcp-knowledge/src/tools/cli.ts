/**
 * CLI Tool
 *
 * Tools for CLI command reference and workflows.
 */

import type { Tool } from './types';
import { cliReference, commonWorkflows } from '../knowledge/index';

export const cliTool: Tool = {
  definition: {
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
  handler: async (args) => {
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
  },
};
