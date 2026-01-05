/**
 * Naming utilities for merged projects
 * Handles prefixing and GCP naming constraints
 */

const MAX_GCP_NAME_LENGTH = 63;

/**
 * Prefix a resource name with the project name
 * Ensures the result fits within GCP's 63 character limit
 */
export function prefixResourceName(projectName: string, resourceName: string): string {
  const prefixed = `${projectName}-${resourceName}`;

  if (prefixed.length <= MAX_GCP_NAME_LENGTH) {
    return prefixed;
  }

  // Truncate but keep recognizable
  // Keep first 20 chars of project name + hash + resource name
  const projectPrefix = projectName.slice(0, 20);
  const hash = simpleHash(projectName).slice(0, 4);
  const remaining = MAX_GCP_NAME_LENGTH - projectPrefix.length - hash.length - 2; // 2 for dashes
  const truncatedResource = resourceName.slice(0, remaining);

  return `${projectPrefix}-${hash}-${truncatedResource}`;
}

/**
 * Prefix a bucket name (globally unique)
 * Buckets have different rules: 3-63 chars, can have underscores
 */
export function prefixBucketName(projectName: string, bucketName: string): string {
  const prefixed = `${projectName}-${bucketName}`;

  if (prefixed.length <= MAX_GCP_NAME_LENGTH) {
    return prefixed;
  }

  // Use a hash to ensure uniqueness while fitting length
  const hash = simpleHash(`${projectName}:${bucketName}`).slice(0, 8);
  const remaining = MAX_GCP_NAME_LENGTH - hash.length - 1;
  const truncated = bucketName.slice(0, remaining);

  return `${truncated}-${hash}`;
}

/**
 * Prefix a path for load balancer routing
 * e.g., "/api/*" becomes "/users-api/api/*"
 */
export function prefixRoutePath(projectName: string, path: string): string {
  // Handle root path
  if (path === '/*' || path === '/') {
    return `/${projectName}/*`;
  }

  // Handle paths like "/api/*"
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/${projectName}${normalized}`;
}

/**
 * Update a source directory path to be relative from the merged output
 * e.g., "./functions/api" from "./users-api" becomes "../users-api/functions/api"
 */
export function relativeSourceDir(
  sourceProjectPath: string,
  sourceDir: string,
  outputDir: string
): string {
  // Calculate relative path from output dir to source project
  const path = require('path');
  const relativeToSource = path.relative(outputDir, sourceProjectPath);

  // Combine with the source dir
  const normalized = sourceDir.startsWith('./') ? sourceDir.slice(2) : sourceDir;
  return path.join(relativeToSource, normalized);
}

/**
 * Simple hash function for creating short unique identifiers
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract the original resource name from a prefixed name
 */
export function extractOriginalName(prefixedName: string, projectName: string): string | null {
  const prefix = `${projectName}-`;
  if (prefixedName.startsWith(prefix)) {
    return prefixedName.slice(prefix.length);
  }
  return null;
}

/**
 * Check if a name is already prefixed with a project name
 */
export function isPrefixed(name: string, projectName: string): boolean {
  return name.startsWith(`${projectName}-`);
}
