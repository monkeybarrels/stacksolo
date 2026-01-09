/**
 * StackSolo GCP Kernel Plugin
 *
 * GCP-native kernel implementation using Cloud Run + Pub/Sub.
 * This is the serverless alternative to the NATS-based kernel plugin.
 *
 * Endpoints:
 * - GET  /health          - Health check
 * - POST /auth/validate   - Validate Firebase token
 * - POST /files/*         - File operations (upload-url, download-url, list, delete, move, metadata)
 * - POST /events/publish  - Publish event to Pub/Sub
 * - POST /events/subscribe - Register HTTP push subscription
 */

import type { Plugin } from '@stacksolo/core';
import { gcpKernelResource } from './resources/index';

/** Plugin version - must match package.json */
const VERSION = '0.1.2';

export const plugin: Plugin = {
  name: '@stacksolo/plugin-gcp-kernel',
  version: VERSION,
  resources: [gcpKernelResource],
  services: [
    {
      name: 'gcp-kernel',
      image: `ghcr.io/monkeybarrels/stacksolo-gcp-kernel:${VERSION}`,
      sourcePath: './service',
      ports: {
        http: 8080,
      },
      env: {
        // PORT is automatically set by Cloud Run - don't specify it
        GCP_PROJECT_ID: '',
        FIREBASE_PROJECT_ID: '',
        GCS_BUCKET: '',
        PUBSUB_EVENTS_TOPIC: '',
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
export type { GcpKernelConfig, GcpKernelOutputs } from './types';
