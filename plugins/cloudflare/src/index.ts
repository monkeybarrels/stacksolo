import type { Plugin } from '@stacksolo/core';
import { cloudflareProvider } from './provider';

// Export the provider
export { cloudflareProvider } from './provider';

// Export individual resources
export { dnsRecord } from './resources/dns-record';

// Export as plugin for auto-discovery
const plugin: Plugin = {
  providers: [cloudflareProvider],
  patterns: [],
};

export default plugin;
