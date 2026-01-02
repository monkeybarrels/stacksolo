/**
 * StackSolo Kernel Plugin
 *
 * Provides hybrid HTTP + NATS shared infrastructure:
 * - HTTP: /auth/validate (public), /health
 * - NATS: kernel.files.*, kernel.events.* (internal)
 */

import type { Plugin } from '@stacksolo/core';
import { kernelResource } from './resources/index';

/** Plugin version - must match package.json */
const VERSION = '0.1.0';

export const plugin: Plugin = {
  name: '@stacksolo/plugin-kernel',
  version: VERSION,
  resources: [kernelResource],
  services: [
    {
      name: 'kernel',
      image: `ghcr.io/monkeybarrels/stacksolo-kernel:${VERSION}`,
      sourcePath: './service',
      ports: {
        http: 8080,
        nats: 4222,
      },
      env: {
        NATS_PORT: '4222',
        HTTP_PORT: '8080',
        FIREBASE_PROJECT_ID: '',
        GCS_BUCKET: '',
      },
      resources: {
        cpu: '1',
        memory: '512Mi',
      },
    },
  ],
};

export default plugin;

// Re-export types
export type { KernelConfig, KernelOutputs } from './types';