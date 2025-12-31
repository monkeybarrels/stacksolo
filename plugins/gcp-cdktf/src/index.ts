import type { Plugin } from '@stacksolo/core';
import { gcpCdktfProvider } from './provider.js';

// Export the provider
export { gcpCdktfProvider } from './provider.js';

// Export individual resources
export { vpcNetwork } from './resources/vpc-network.js';
export { vpcConnector } from './resources/vpc-connector.js';
export { cloudFunction } from './resources/cloud-function.js';
export { loadBalancer } from './resources/load-balancer.js';

// Export as plugin for auto-discovery
const plugin: Plugin = {
  providers: [gcpCdktfProvider],
  patterns: [],
};

export default plugin;
