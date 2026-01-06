/**
 * Firebase Auth Tool
 *
 * Documentation for Firebase Authentication with StackSolo.
 */

import type { Tool } from './types';
import {
  firebaseAuthOverview,
  kernelAuthReference,
  firebaseEmulatorConfig,
} from '../knowledge/index';

export const firebaseAuthTool: Tool = {
  definition: {
    name: 'stacksolo_firebase_auth',
    description:
      'Get documentation for Firebase Authentication with StackSolo. Includes client-side auth, server-side middleware, and emulator configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['overview', 'kernel', 'emulators', 'all'],
          description:
            'Specific topic: overview (getting started), kernel (auth middleware), emulators (local dev), or all',
        },
      },
    },
  },
  handler: async (args) => {
    const { topic = 'all' } = args as { topic?: string };
    let output = '';

    if (topic === 'overview' || topic === 'all') {
      output += firebaseAuthOverview + '\n\n';
    }
    if (topic === 'kernel' || topic === 'all') {
      output += kernelAuthReference + '\n\n';
    }
    if (topic === 'emulators' || topic === 'all') {
      output += firebaseEmulatorConfig + '\n\n';
    }

    return {
      content: [{ type: 'text', text: output.trim() }],
    };
  },
};
