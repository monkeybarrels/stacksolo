import type { Plugin } from '@stacksolo/core';
import { gcpProvider } from './provider';
import { nextjsCloudRun, sveltekitCloudRun, reactFunctions } from './patterns/index';

export { gcpProvider } from './provider';
export {
  // Storage
  storageBucket,
  artifactRegistry,
  firestore,
  // Compute
  cloudRun,
  cloudFunction,
  cloudRunJob,
  // Database
  cloudSql,
  memorystore,
  // Security
  secretManager,
  serviceAccount,
  iamBinding,
  // Messaging
  pubsubTopic,
  pubsubSubscription,
  cloudScheduler,
  cloudTasks,
  // Networking
  loadBalancer,
  cloudCdn,
  cloudDns,
  cloudNat,
  vpcNetwork,
  vpcSubnet,
  firewall,
} from './resources/index';
export { nextjsCloudRun, sveltekitCloudRun, reactFunctions } from './patterns/index';

// Export as plugin for auto-discovery
const plugin: Plugin = {
  providers: [gcpProvider],
  patterns: [nextjsCloudRun, sveltekitCloudRun, reactFunctions],
};

export default plugin;
