/**
 * GCP Project management utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GcpProject {
  projectId: string;
  name: string;
}

export interface GcpAuthInfo {
  account: string;
  project: string;
}

/**
 * Check if gcloud CLI is installed
 */
export async function isGcloudInstalled(): Promise<boolean> {
  try {
    await execAsync('which gcloud');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if gcloud CLI is authenticated
 */
export async function checkGcloudAuth(): Promise<GcpAuthInfo | null> {
  try {
    const { stdout: account } = await execAsync('gcloud config get-value account 2>/dev/null');
    const { stdout: project } = await execAsync('gcloud config get-value project 2>/dev/null');

    const trimmedAccount = account.trim();
    const trimmedProject = project.trim();

    if (!trimmedAccount || trimmedAccount === '(unset)') {
      return null;
    }

    return {
      account: trimmedAccount,
      project: trimmedProject !== '(unset)' ? trimmedProject : '',
    };
  } catch {
    return null;
  }
}

/**
 * List accessible GCP projects
 */
export async function listProjects(): Promise<GcpProject[]> {
  try {
    const { stdout } = await execAsync(
      'gcloud projects list --format="json(projectId,name)" --limit=50 2>/dev/null'
    );
    const projects = JSON.parse(stdout) as Array<{ projectId: string; name: string }>;
    return projects.map((p) => ({ projectId: p.projectId, name: p.name }));
  } catch {
    return [];
  }
}

/**
 * Get current default GCP project
 */
export async function getCurrentProject(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('gcloud config get-value project 2>/dev/null');
    const project = stdout.trim();
    return project && project !== '(unset)' ? project : null;
  } catch {
    return null;
  }
}

/**
 * Set the active GCP project
 */
export async function setActiveProject(projectId: string): Promise<boolean> {
  try {
    await execAsync(`gcloud config set project ${projectId} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new GCP project
 */
export async function createProject(
  projectId: string,
  projectName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `gcloud projects create ${projectId} --name="${projectName}" 2>&1`
    );
    return { success: true };
  } catch (error: unknown) {
    // Extract the actual error message from the command output
    let errorMessage = '';
    if (error && typeof error === 'object' && 'stdout' in error) {
      errorMessage = String((error as { stdout: string }).stdout);
    }
    if (!errorMessage && error && typeof error === 'object' && 'stderr' in error) {
      errorMessage = String((error as { stderr: string }).stderr);
    }
    if (!errorMessage) {
      errorMessage = String(error);
    }

    // Parse common errors
    if (errorMessage.includes('already exists') || errorMessage.includes('ALREADY_EXISTS')) {
      return { success: false, error: 'Project ID already exists. Choose a different ID.' };
    }
    if (errorMessage.includes('PERMISSION_DENIED')) {
      return { success: false, error: 'Permission denied. You may need to be in an organization with project creation rights.' };
    }
    if (errorMessage.includes('invalid') || errorMessage.includes('INVALID')) {
      return { success: false, error: 'Invalid project ID. Must be 6-30 lowercase letters, digits, or hyphens.' };
    }
    if (errorMessage.includes('Request contains an invalid argument')) {
      // Try to extract more specific error
      const match = errorMessage.match(/details:\s*"([^"]+)"/);
      if (match) {
        return { success: false, error: match[1] };
      }
      return { success: false, error: 'Invalid project configuration. Check the project ID format.' };
    }

    // Return a cleaner error message
    const cleanError = errorMessage
      .replace(/^Error:.*?gcloud projects create.*?\n/m, '')
      .replace(/ERROR:.*?\n/g, '')
      .trim()
      .split('\n')[0]; // Get first meaningful line

    return { success: false, error: cleanError || 'Failed to create project. Check gcloud configuration.' };
  }
}

/**
 * Link a project to a billing account
 */
export async function linkBillingAccount(
  projectId: string,
  billingAccountId: string
): Promise<boolean> {
  try {
    await execAsync(
      `gcloud billing projects link ${projectId} --billing-account=${billingAccountId} 2>/dev/null`
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * List available billing accounts
 */
export async function listBillingAccounts(): Promise<Array<{ id: string; name: string }>> {
  try {
    const { stdout } = await execAsync(
      'gcloud billing accounts list --format="json(name,displayName)" 2>/dev/null'
    );
    const accounts = JSON.parse(stdout) as Array<{ name: string; displayName: string }>;
    return accounts.map((a) => ({
      id: a.name.replace('billingAccounts/', ''),
      name: a.displayName,
    }));
  } catch {
    return [];
  }
}
