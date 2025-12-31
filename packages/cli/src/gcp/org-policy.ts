/**
 * GCP Organization Policy utilities
 *
 * Handles detection and fixing of org policy restrictions,
 * specifically iam.allowedPolicyMemberDomains which blocks allUsers.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OrgPolicyStatus {
  hasRestriction: boolean;
  allowedDomains?: string[];
  canOverride: boolean;
}

/**
 * Check org policy for iam.allowedPolicyMemberDomains restriction
 */
export async function checkOrgPolicy(projectId: string): Promise<OrgPolicyStatus> {
  try {
    // First ensure orgpolicy API is enabled
    await execAsync(
      `gcloud services enable orgpolicy.googleapis.com --project=${projectId} 2>/dev/null`
    );

    // Check effective policy (includes inherited from org)
    const { stdout } = await execAsync(
      `gcloud org-policies describe iam.allowedPolicyMemberDomains --project=${projectId} --effective --format=json 2>/dev/null`
    );

    const policy = JSON.parse(stdout);

    // Check if there's a restriction in the new format
    if (policy.spec?.rules) {
      for (const rule of policy.spec.rules) {
        // If allowAll is true, no restriction
        if (rule.allowAll === true) {
          return { hasRestriction: false, canOverride: true };
        }
        // If there are allowed values, there's a restriction
        if (rule.values?.allowedValues) {
          return {
            hasRestriction: true,
            allowedDomains: rule.values.allowedValues,
            canOverride: true,
          };
        }
      }
    }

    // Check legacy listPolicy format
    if (policy.listPolicy?.allowedValues) {
      return {
        hasRestriction: true,
        allowedDomains: policy.listPolicy.allowedValues,
        canOverride: true,
      };
    }

    // No restriction found
    return { hasRestriction: false, canOverride: true };
  } catch (error) {
    const errorStr = String(error);

    // Permission denied means we can't check/override
    if (errorStr.includes('PERMISSION_DENIED')) {
      return { hasRestriction: true, canOverride: false };
    }

    // No policy found or other error - assume no restriction
    return { hasRestriction: false, canOverride: true };
  }
}

/**
 * Reset org policy to allow all domains at project level
 *
 * This uses `gcloud org-policies reset` which creates a project-level
 * override that resets to the default (allowing all). This only affects
 * the specific project, not the entire organization.
 */
export async function fixOrgPolicy(projectId: string): Promise<boolean> {
  try {
    await execAsync(
      `gcloud org-policies reset iam.allowedPolicyMemberDomains --project=${projectId} 2>/dev/null`
    );
    return true;
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('PERMISSION_DENIED')) {
      return false;
    }
    // Other errors - throw
    throw error;
  }
}
