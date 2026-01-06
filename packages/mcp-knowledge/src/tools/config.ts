/**
 * Config Tools
 *
 * Tools for config schema and examples.
 */

import type { Tool } from './types';
import { configSchema, configExamples } from '../knowledge/index';
import { validateConfig } from '@stacksolo/blueprint';

export const configSchemaTool: Tool = {
  definition: {
    name: 'stacksolo_config_schema',
    description:
      'Get the complete config schema for stacksolo.config.json. Use this to understand what fields are available and how to structure the config.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    return {
      content: [{ type: 'text', text: configSchema }],
    };
  },
};

export const configExamplesTool: Tool = {
  definition: {
    name: 'stacksolo_config_examples',
    description:
      'Get example configurations for common use cases (minimal API, API with database, full stack app, shared VPC).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    return {
      content: [{ type: 'text', text: configExamples }],
    };
  },
};

export const validateTool: Tool = {
  definition: {
    name: 'stacksolo_validate',
    description:
      'Validate a StackSolo configuration. Returns validation errors if the config is invalid.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'string',
          description: 'The JSON configuration to validate (as a string)',
        },
      },
      required: ['config'],
    },
  },
  handler: async (args) => {
    const { config: configStr } = args as { config: string };

    try {
      const configObj = JSON.parse(configStr);
      const validation = validateConfig(configObj);

      if (validation.valid) {
        return {
          content: [
            {
              type: 'text',
              text: '# Validation Result: VALID\n\nThe configuration is valid and can be deployed.',
            },
          ],
        };
      } else {
        let output = '# Validation Result: INVALID\n\n';
        output += 'The configuration has the following errors:\n\n';
        for (const error of validation.errors) {
          output += `- **${error.path || 'root'}**: ${error.message}\n`;
        }
        return {
          content: [{ type: 'text', text: output }],
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `# Validation Result: ERROR\n\nFailed to parse config: ${message}`,
          },
        ],
      };
    }
  },
};
