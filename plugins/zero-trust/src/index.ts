import type { Plugin } from '@stacksolo/core';
import { zeroTrustProvider } from './provider';

// Export the provider
export { zeroTrustProvider } from './provider';

// Export individual resources
export { iapTunnel } from './resources/iap-tunnel';
export { iapWebBackend } from './resources/iap-web-backend';

// Export as plugin for auto-discovery
const plugin: Plugin = {
  providers: [zeroTrustProvider],
  patterns: [],
};

export default plugin;
