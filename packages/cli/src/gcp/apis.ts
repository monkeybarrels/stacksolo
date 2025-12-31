/**
 * GCP API enablement utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ApiStatus {
  api: string;
  name: string;
  enabled: boolean;
}

/**
 * Required APIs for StackSolo
 */
export const REQUIRED_APIS = [
  'run.googleapis.com',
  'cloudfunctions.googleapis.com',
  'cloudbuild.googleapis.com',
  'compute.googleapis.com',
  'secretmanager.googleapis.com',
  'vpcaccess.googleapis.com',
  'orgpolicy.googleapis.com',
  'artifactregistry.googleapis.com',
];

/**
 * Optional APIs based on project type
 */
export const OPTIONAL_APIS = {
  database: 'sqladmin.googleapis.com',
  scheduler: 'cloudscheduler.googleapis.com',
  redis: 'redis.googleapis.com',
};

/**
 * Get human-readable name for an API
 */
function getApiDisplayName(api: string): string {
  const names: Record<string, string> = {
    'run.googleapis.com': 'Cloud Run API',
    'cloudfunctions.googleapis.com': 'Cloud Functions API',
    'cloudbuild.googleapis.com': 'Cloud Build API',
    'compute.googleapis.com': 'Compute Engine API',
    'secretmanager.googleapis.com': 'Secret Manager API',
    'vpcaccess.googleapis.com': 'VPC Access API',
    'orgpolicy.googleapis.com': 'Organization Policy API',
    'artifactregistry.googleapis.com': 'Artifact Registry API',
    'sqladmin.googleapis.com': 'Cloud SQL Admin API',
    'cloudscheduler.googleapis.com': 'Cloud Scheduler API',
    'redis.googleapis.com': 'Memorystore Redis API',
  };
  return names[api] || api.replace('.googleapis.com', '');
}

/**
 * List currently enabled APIs for a project
 */
export async function listEnabledApis(projectId: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `gcloud services list --project=${projectId} --format="value(config.name)" 2>/dev/null`
    );
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check which required APIs are enabled
 */
export async function checkApis(projectId: string, apis: string[]): Promise<ApiStatus[]> {
  const enabled = await listEnabledApis(projectId);

  return apis.map((api) => ({
    api,
    name: getApiDisplayName(api),
    enabled: enabled.includes(api),
  }));
}

/**
 * Enable a single API
 */
export async function enableApi(projectId: string, api: string): Promise<boolean> {
  try {
    await execAsync(`gcloud services enable ${api} --project=${projectId} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enable multiple APIs
 */
export async function enableApis(
  projectId: string,
  apis: string[],
  onProgress?: (api: string, success: boolean) => void
): Promise<{ enabled: string[]; failed: string[] }> {
  const enabled: string[] = [];
  const failed: string[] = [];

  for (const api of apis) {
    const success = await enableApi(projectId, api);
    if (success) {
      enabled.push(api);
    } else {
      failed.push(api);
    }
    onProgress?.(api, success);
  }

  return { enabled, failed };
}
