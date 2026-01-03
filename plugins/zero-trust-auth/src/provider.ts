import { defineProvider } from '@stacksolo/core';
import { accessControl } from './resources/access-control';

export const zeroTrustAuthProvider = defineProvider({
  id: 'zero-trust-auth',
  name: 'Zero Trust Auth',
  icon: 'lock',
  auth: {
    type: 'cli',
    command: 'gcloud',
    instructions: 'Authenticate with Google Cloud CLI: gcloud auth login',
    validate: async () => {
      try {
        const { execSync } = await import('child_process');
        execSync('gcloud auth print-access-token', { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
  },
  resources: [accessControl],
});
