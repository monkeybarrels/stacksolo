/**
 * Overview Tool
 *
 * Provides general StackSolo overview and target audience info.
 */

import type { Tool } from './types';
import { overview, targetAudience } from '../knowledge/index';

export const overviewTool: Tool = {
  definition: {
    name: 'stacksolo_overview',
    description:
      'Get an overview of what StackSolo is, its key concepts, and who it is for. Call this first to understand StackSolo before helping users.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    return {
      content: [
        {
          type: 'text',
          text: overview + '\n\n' + targetAudience,
        },
      ],
    };
  },
};
