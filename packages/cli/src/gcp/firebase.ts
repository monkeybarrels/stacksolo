/**
 * Firebase project management utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FirebaseProject {
  projectId: string;
  displayName: string;
  projectNumber: string;
}

/**
 * Check if Firebase CLI is installed
 */
export async function isFirebaseInstalled(): Promise<boolean> {
  try {
    await execAsync('which firebase');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Firebase CLI is authenticated
 */
export async function checkFirebaseAuth(): Promise<string | null> {
  try {
    // firebase login:list returns authenticated accounts
    const { stdout } = await execAsync('firebase login:list --json 2>/dev/null');
    const result = JSON.parse(stdout);
    if (result.status === 'success' && result.result?.length > 0) {
      return result.result[0].user?.email || result.result[0];
    }
    return null;
  } catch {
    // Try alternative check - see if we can list projects
    try {
      const { stdout } = await execAsync('firebase projects:list --json 2>/dev/null');
      const result = JSON.parse(stdout);
      if (result.status === 'success') {
        return 'authenticated'; // We know it's authenticated, just don't have email
      }
    } catch {
      // Not authenticated
    }
    return null;
  }
}

/**
 * List Firebase projects
 */
export async function listFirebaseProjects(): Promise<FirebaseProject[]> {
  try {
    const { stdout } = await execAsync('firebase projects:list --json 2>/dev/null');
    const result = JSON.parse(stdout);
    if (result.status === 'success' && result.result) {
      return result.result.map((p: { projectId: string; displayName: string; projectNumber: string }) => ({
        projectId: p.projectId,
        displayName: p.displayName,
        projectNumber: p.projectNumber,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if a GCP project already has Firebase enabled
 */
export async function hasFirebaseEnabled(projectId: string): Promise<boolean> {
  try {
    const projects = await listFirebaseProjects();
    return projects.some((p) => p.projectId === projectId);
  } catch {
    return false;
  }
}

/**
 * Add Firebase to an existing GCP project
 * This links Firebase to the GCP project
 */
export async function addFirebaseToProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // firebase projects:addfirebase adds Firebase to an existing GCP project
    await execAsync(`firebase projects:addfirebase ${projectId} 2>&1`);
    return { success: true };
  } catch (error: unknown) {
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

    // Already has Firebase
    if (errorMessage.includes('already exists') || errorMessage.includes('ALREADY_EXISTS')) {
      return { success: true }; // Not an error, already set up
    }

    // Permission issues
    if (errorMessage.includes('PERMISSION_DENIED')) {
      return {
        success: false,
        error: 'Permission denied. Make sure you have Firebase Admin permissions on the GCP project.',
      };
    }

    // Project not found
    if (errorMessage.includes('NOT_FOUND')) {
      return {
        success: false,
        error: 'GCP project not found. Make sure the project ID is correct.',
      };
    }

    return { success: false, error: errorMessage || 'Failed to add Firebase to project' };
  }
}

/**
 * Get the Firebase console URL for enabling Authentication
 */
export function getFirebaseAuthConsoleUrl(projectId: string): string {
  return `https://console.firebase.google.com/project/${projectId}/authentication`;
}

/**
 * Get the Firebase console URL for the project
 */
export function getFirebaseConsoleUrl(projectId: string): string {
  return `https://console.firebase.google.com/project/${projectId}/overview`;
}

/**
 * Get the GCP billing console URL
 */
export function getBillingConsoleUrl(projectId: string): string {
  return `https://console.cloud.google.com/billing/linkedaccount?project=${projectId}`;
}

/**
 * Check if billing is enabled for a project
 */
export async function isBillingEnabled(projectId: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `gcloud billing projects describe ${projectId} --format="value(billingEnabled)" 2>/dev/null`
    );
    return stdout.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

/**
 * Generate a unique project ID based on project name
 * Format: name-randomstring (max 30 chars)
 */
export function generateProjectId(name: string): string {
  // Clean the name: lowercase, alphanumeric and hyphens only
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Generate random suffix (6 chars)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Combine, ensuring max 30 chars total
  // Leave room for hyphen and suffix: name + '-' + 6 chars = 23 chars max for name
  const maxNameLen = 30 - 1 - suffix.length;
  const truncatedName = cleanName.slice(0, maxNameLen);

  return `${truncatedName}-${suffix}`;
}

/**
 * Validate a project ID
 */
export function isValidProjectId(projectId: string): { valid: boolean; error?: string } {
  if (!projectId) {
    return { valid: false, error: 'Project ID is required' };
  }

  if (projectId.length < 6 || projectId.length > 30) {
    return { valid: false, error: 'Project ID must be 6-30 characters' };
  }

  if (!/^[a-z]/.test(projectId)) {
    return { valid: false, error: 'Project ID must start with a lowercase letter' };
  }

  if (!/[a-z0-9]$/.test(projectId)) {
    return { valid: false, error: 'Project ID must end with a letter or digit' };
  }

  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(projectId)) {
    return {
      valid: false,
      error: 'Project ID can only contain lowercase letters, digits, and hyphens',
    };
  }

  return { valid: true };
}
