/**
 * StackSolo resource labeling utilities
 *
 * All GCP resources created by StackSolo are tagged with these labels
 * to enable inventory tracking, orphan detection, and shared resource management.
 */

export interface StackSoloLabels {
  /** Always 'true' - identifies this as a StackSolo-managed resource */
  stacksolo: 'true';
  /** The StackSolo project name that created this resource */
  'stacksolo-project': string;
  /** Resource type identifier (e.g., 'vpc-network', 'cloud-run', 'storage-bucket') */
  'stacksolo-resource': string;
}

/**
 * Generate standard StackSolo labels for a GCP resource
 *
 * @param projectName - The StackSolo project name
 * @param resourceType - The type of resource (e.g., 'vpc-network', 'cloud-run')
 * @returns Label object to include in resource configuration
 */
export function generateLabels(projectName: string, resourceType: string): StackSoloLabels {
  return {
    stacksolo: 'true',
    'stacksolo-project': sanitizeLabelValue(projectName),
    'stacksolo-resource': sanitizeLabelValue(resourceType),
  };
}

/**
 * Generate CDKTF code for labels block
 *
 * @param projectName - The StackSolo project name
 * @param resourceType - The type of resource
 * @returns String of CDKTF code for the labels property
 */
export function generateLabelsCode(projectName: string, resourceType: string): string {
  // Always use sanitized literal string values for labels
  // Strip any variable reference syntax like ${var.project_name}
  const cleanProjectName = projectName.startsWith('${')
    ? projectName.replace(/^\$\{|\}$/g, '').replace(/^var\./, '')
    : projectName;

  return `labels: {
    stacksolo: 'true',
    'stacksolo-project': '${sanitizeLabelValue(cleanProjectName)}',
    'stacksolo-resource': '${sanitizeLabelValue(resourceType)}',
  },`;
}

/**
 * Sanitize a value for use as a GCP label
 *
 * GCP label requirements:
 * - Max 63 characters
 * - Lowercase letters, numbers, underscores, hyphens
 * - Must start with a lowercase letter
 * - Cannot be empty
 */
export function sanitizeLabelValue(value: string): string {
  if (!value) return 'unknown';

  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')  // Replace invalid chars with hyphen
    .replace(/^[^a-z]/, 'x')       // Ensure starts with letter
    .slice(0, 63);                  // Max 63 chars
}

/**
 * Resource type identifiers used in labels
 */
export const RESOURCE_TYPES = {
  VPC_NETWORK: 'vpc-network',
  VPC_CONNECTOR: 'vpc-connector',
  CLOUD_RUN: 'cloud-run',
  CLOUD_FUNCTION: 'cloud-function',
  STORAGE_BUCKET: 'storage-bucket',
  STORAGE_WEBSITE: 'storage-website',
  ARTIFACT_REGISTRY: 'artifact-registry',
  LOAD_BALANCER: 'load-balancer',
  GLOBAL_ADDRESS: 'global-address',
  BACKEND_SERVICE: 'backend-service',
  BACKEND_BUCKET: 'backend-bucket',
  URL_MAP: 'url-map',
  SSL_CERTIFICATE: 'ssl-certificate',
  NEG: 'network-endpoint-group',
} as const;