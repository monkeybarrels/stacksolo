import { defineProvider } from '@stacksolo/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
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

const execAsync = promisify(exec);

export const gcpProvider = defineProvider({
  id: 'gcp',
  name: 'Google Cloud Platform',
  icon: 'cloud',

  auth: {
    type: 'cli',
    command: 'gcloud',
    instructions: `
To authenticate with GCP:

1. Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
2. Run: gcloud auth login
3. Run: gcloud auth application-default login
4. Set your project: gcloud config set project YOUR_PROJECT_ID
    `.trim(),

    validate: async (): Promise<boolean> => {
      try {
        const { stdout } = await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)"');
        return stdout.trim().length > 0;
      } catch {
        return false;
      }
    },
  },

  resources: [
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
  ],
});
