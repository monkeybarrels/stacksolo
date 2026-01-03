/**
 * StackSolo Web Admin Plugin
 *
 * Provides a web-based admin UI for managing StackSolo projects:
 * - Dashboard with resource overview
 * - Resource management and logs
 * - Deploy controls with real-time streaming
 * - Local dev environment management
 * - Configuration editor
 */

import type { Plugin } from '@stacksolo/core';

/** Plugin version - must match package.json */
const VERSION = '0.1.0';

export const plugin: Plugin = {
  name: '@stacksolo/plugin-web-admin',
  version: VERSION,
  resources: [],
  services: [
    {
      name: 'web-admin',
      image: `ghcr.io/monkeybarrels/stacksolo-web-admin:${VERSION}`,
      sourcePath: './app',
      ports: {
        http: 3000,
      },
      env: {
        NODE_ENV: 'development',
        STACKSOLO_PROJECT_PATH: '',
      },
      resources: {
        cpu: '0.5',
        memory: '256Mi',
      },
    },
  ],
};

export default plugin;
