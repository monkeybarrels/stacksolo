/**
 * StackSolo Kernel Plugin
 *
 * Provides hybrid HTTP + NATS shared infrastructure:
 * - HTTP: /auth/validate (public), /health
 * - NATS: kernel.files.*, kernel.events.* (internal)
 */

import type { Plugin } from '@stacksolo/core';
import { kernelResource } from './resources';

export const plugin: Plugin = {
  resources: [kernelResource],
};

export default plugin;

// Re-export types
export type { KernelConfig, KernelOutputs } from './types';