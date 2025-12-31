/**
 * GCP IAM permission utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface IamBindingCheck {
  serviceAccount: string;
  role: string;
  hasBinding: boolean;
}

/**
 * Get the default compute service account for a project
 */
export async function getDefaultComputeServiceAccount(
  projectId: string
): Promise<string | null> {
  try {
    // Get project number
    const { stdout } = await execAsync(
      `gcloud projects describe ${projectId} --format="value(projectNumber)" 2>/dev/null`
    );
    const projectNumber = stdout.trim();

    if (!projectNumber) {
      return null;
    }

    return `${projectNumber}-compute@developer.gserviceaccount.com`;
  } catch {
    return null;
  }
}

/**
 * Check if a service account has a specific IAM role on a project
 */
export async function checkIamBinding(
  projectId: string,
  serviceAccount: string,
  role: string
): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `gcloud projects get-iam-policy ${projectId} --format="json" 2>/dev/null`
    );

    const policy = JSON.parse(stdout);
    const member = `serviceAccount:${serviceAccount}`;

    for (const binding of policy.bindings || []) {
      if (binding.role === role && binding.members?.includes(member)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Grant an IAM role to a service account on a project
 */
export async function grantIamRole(
  projectId: string,
  serviceAccount: string,
  role: string
): Promise<boolean> {
  try {
    await execAsync(
      `gcloud projects add-iam-policy-binding ${projectId} ` +
        `--member="serviceAccount:${serviceAccount}" ` +
        `--role="${role}" ` +
        `--quiet 2>/dev/null`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Required IAM bindings for Cloud Functions Gen2 deployment
 */
export const REQUIRED_IAM_BINDINGS = [
  {
    role: 'roles/logging.logWriter',
    description: 'Cloud Build logging',
  },
];

/**
 * Check and fix required IAM bindings for Cloud Functions deployment
 */
export async function checkAndFixCloudBuildPermissions(
  projectId: string,
  onLog?: (message: string) => void
): Promise<{ success: boolean; fixed: string[]; failed: string[] }> {
  const log = onLog || console.log;
  const fixed: string[] = [];
  const failed: string[] = [];

  // Get the default compute service account
  const serviceAccount = await getDefaultComputeServiceAccount(projectId);

  if (!serviceAccount) {
    log('Could not determine default compute service account');
    return { success: false, fixed, failed: ['Could not get service account'] };
  }

  // Check each required binding
  for (const binding of REQUIRED_IAM_BINDINGS) {
    const hasBinding = await checkIamBinding(projectId, serviceAccount, binding.role);

    if (!hasBinding) {
      log(`Granting ${binding.role} to ${serviceAccount}...`);
      const granted = await grantIamRole(projectId, serviceAccount, binding.role);

      if (granted) {
        fixed.push(binding.role);
      } else {
        failed.push(binding.role);
      }
    }
  }

  return {
    success: failed.length === 0,
    fixed,
    failed,
  };
}
