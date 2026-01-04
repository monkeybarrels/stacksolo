import type { Plugin } from '@stacksolo/core';
import { zeroTrustAuthProvider } from './provider';
import { accessControl } from './resources/index';

// Export the provider and resource for direct use
export { zeroTrustAuthProvider } from './provider';
export { accessControl } from './resources/index';

// Export as plugin for auto-discovery
const plugin: Plugin = {
  name: '@stacksolo/plugin-zero-trust-auth',
  version: '0.1.0',
  providers: [zeroTrustAuthProvider],
  resources: [accessControl],
};

export default plugin;
