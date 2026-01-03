import { defineProvider } from '@stacksolo/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { iapTunnel, iapWebBackend } from './resources/index';

const execAsync = promisify(exec);

/**
 * Zero Trust Provider
 *
 * This provider enables Zero Trust network access using Google Cloud's
 * Identity-Aware Proxy (IAP). It allows secure access to internal resources
 * without VPNs, based on user identity rather than network location.
 *
 * Access Methods (no StackSolo CLI required):
 * - SSH/TCP tunnels: `gcloud compute ssh` or `gcloud compute start-iap-tunnel`
 * - Web apps: Browser-based Google login (automatic redirect)
 */
export const zeroTrustProvider = defineProvider({
  id: 'zero-trust',
  name: 'Zero Trust (IAP)',
  icon: 'shield',

  auth: {
    type: 'cli',
    command: 'gcloud',
    instructions: `
To use Zero Trust (IAP) resources:

1. Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
2. Run: gcloud auth login
3. Run: gcloud auth application-default login
4. Set your project: gcloud config set project YOUR_PROJECT_ID
5. Install Terraform: https://developer.hashicorp.com/terraform/downloads

After deployment, users access resources via:
- SSH: gcloud compute ssh INSTANCE --tunnel-through-iap
- TCP tunnel: gcloud compute start-iap-tunnel INSTANCE PORT
- Web apps: Just visit the URL (Google login prompt)
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

  resources: [iapTunnel, iapWebBackend],
});
