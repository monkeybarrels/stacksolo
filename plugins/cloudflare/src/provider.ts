import { defineProvider } from '@stacksolo/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dnsRecord } from './resources/index';

const execAsync = promisify(exec);

/**
 * Cloudflare CDKTF Provider
 *
 * This provider uses CDK for Terraform (CDKTF) for Cloudflare resource deployment.
 * Supports DNS record management for pointing domains to GCP load balancers.
 */
export const cloudflareProvider = defineProvider({
  id: 'cloudflare',
  name: 'Cloudflare',
  icon: 'cloud',

  auth: {
    type: 'api_key',
    command: 'cloudflare',
    instructions: `
To authenticate with Cloudflare for CDKTF deployment:

1. Get your Cloudflare API token: https://dash.cloudflare.com/profile/api-tokens
2. Create a token with "Edit zone DNS" permissions for your zone
3. Store the token as a secret: @secret/cloudflare-api-token
4. Add your zone ID to the config (found in Cloudflare dashboard Overview tab)
    `.trim(),

    validate: async (): Promise<boolean> => {
      try {
        // Check terraform is installed (Cloudflare resources require terraform)
        await execAsync('terraform version');
        // Note: We don't validate the API token here - that happens at deploy time
        return true;
      } catch {
        return false;
      }
    },
  },

  resources: [dnsRecord],
});
