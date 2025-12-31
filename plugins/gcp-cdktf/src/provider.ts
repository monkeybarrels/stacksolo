import { defineProvider } from '@stacksolo/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { vpcNetwork, vpcConnector, cloudFunction, loadBalancer, storageWebsite } from './resources/index.js';

const execAsync = promisify(exec);

/**
 * GCP CDKTF Provider
 *
 * This provider uses CDK for Terraform (CDKTF) for infrastructure deployment.
 * Supports function-api template (Cloud Function + Load Balancer) with
 * multi-function path-based routing.
 */
export const gcpCdktfProvider = defineProvider({
  id: 'gcp-cdktf',
  name: 'Google Cloud Platform (CDKTF)',
  icon: 'cloud',

  auth: {
    type: 'cli',
    command: 'gcloud',
    instructions: `
To authenticate with GCP for CDKTF deployment:

1. Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
2. Run: gcloud auth login
3. Run: gcloud auth application-default login
4. Set your project: gcloud config set project YOUR_PROJECT_ID
5. Install Terraform: https://developer.hashicorp.com/terraform/downloads
    `.trim(),

    validate: async (): Promise<boolean> => {
      try {
        // Check gcloud auth
        const { stdout: gcloudAuth } = await execAsync(
          'gcloud auth list --filter=status:ACTIVE --format="value(account)"'
        );
        if (!gcloudAuth.trim()) {
          return false;
        }

        // Check terraform is installed
        await execAsync('terraform version');
        return true;
      } catch {
        return false;
      }
    },
  },

  resources: [
    vpcNetwork,
    vpcConnector,
    cloudFunction,
    loadBalancer,
    storageWebsite,
  ],
});
