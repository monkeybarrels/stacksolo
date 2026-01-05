/**
 * StackSolo Helm Plugin
 *
 * Provides Helm chart generation from Kubernetes manifests.
 * Use with: stacksolo deploy --helm
 */

import type { Plugin } from '@stacksolo/core';
import { helmFormatter } from './formatter';

/** Plugin version - must match package.json */
const VERSION = '0.1.0';

export const plugin: Plugin = {
  name: '@stacksolo/plugin-helm',
  version: VERSION,
  outputFormatters: [helmFormatter],
};

export default plugin;

// Re-export types
export type { HelmChartConfig, HelmValues, DeploymentValues } from './types';
