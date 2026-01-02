/**
 * Secrets Manager client for StackSolo applications
 * Fetches secrets from GCP Secret Manager in production,
 * falls back to environment variables in local development.
 */

import { env } from './env';

// Lazy-loaded Secret Manager client
let secretManagerClient: any = null;

/**
 * Get the Secret Manager client (lazy-loaded)
 */
async function getSecretManagerClient() {
  if (secretManagerClient) {
    return secretManagerClient;
  }

  try {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    secretManagerClient = new SecretManagerServiceClient();
    return secretManagerClient;
  } catch {
    throw new Error(
      '@google-cloud/secret-manager is required for secrets. Install it with: npm install @google-cloud/secret-manager'
    );
  }
}

/**
 * Secret cache to avoid repeated API calls
 */
const secretCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Default cache TTL (5 minutes)
 */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export interface GetSecretOptions {
  /** Version of the secret (default: 'latest') */
  version?: string;
  /** Cache TTL in milliseconds (default: 5 minutes, 0 to disable) */
  cacheTtlMs?: number;
  /** Fallback value if secret not found */
  fallback?: string;
  /** Environment variable name to check first (for local dev) */
  envVar?: string;
}

/**
 * Get a secret value from Secret Manager
 *
 * In local development (when emulators are detected), returns the
 * environment variable value instead of calling Secret Manager.
 *
 * @param secretName - Name of the secret (without project prefix)
 * @param options - Optional configuration
 * @returns The secret value
 *
 * @example
 * ```ts
 * import { getSecret } from '@stacksolo/runtime';
 *
 * // Simple usage
 * const apiKey = await getSecret('api-key');
 *
 * // With options
 * const dbPassword = await getSecret('db-password', {
 *   version: '2',
 *   cacheTtlMs: 60000, // 1 minute cache
 *   envVar: 'DB_PASSWORD', // Check this env var first
 * });
 * ```
 */
export async function getSecret(
  secretName: string,
  options: GetSecretOptions = {}
): Promise<string> {
  const {
    version = 'latest',
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    fallback,
    envVar,
  } = options;

  // In local dev, check environment variable first
  if (env.isLocal) {
    // Try explicit envVar if provided
    if (envVar && process.env[envVar]) {
      return process.env[envVar]!;
    }

    // Try common naming conventions
    const envName = secretNameToEnvVar(secretName);
    if (process.env[envName]) {
      return process.env[envName]!;
    }

    // Return fallback if available
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(
      `Secret '${secretName}' not found. In local dev, set environment variable ${envName} or ${envVar || envName}`
    );
  }

  // Check cache first
  const cacheKey = `${secretName}:${version}`;
  const cached = secretCache.get(cacheKey);
  if (cached && cacheTtlMs > 0 && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  // Fetch from Secret Manager
  const projectId = env.gcpProjectId;
  if (!projectId) {
    throw new Error('GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT environment variable is required');
  }

  const client = await getSecretManagerClient();
  const secretPath = `projects/${projectId}/secrets/${secretName}/versions/${version}`;

  try {
    const [response] = await client.accessSecretVersion({ name: secretPath });
    const payload = response.payload?.data;

    if (!payload) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error(`Secret '${secretName}' has no payload`);
    }

    const value = typeof payload === 'string' ? payload : payload.toString('utf8');

    // Cache the value
    if (cacheTtlMs > 0) {
      secretCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + cacheTtlMs,
      });
    }

    return value;
  } catch (error: any) {
    if (error.code === 5 /* NOT_FOUND */) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error(`Secret '${secretName}' not found in project ${projectId}`);
    }
    throw error;
  }
}

/**
 * Get a required secret (throws if not found)
 */
export async function requireSecret(
  secretName: string,
  options: Omit<GetSecretOptions, 'fallback'> = {}
): Promise<string> {
  return getSecret(secretName, { ...options, fallback: undefined });
}

/**
 * Clear the secret cache (useful for testing or forcing refresh)
 */
export function clearSecretCache(): void {
  secretCache.clear();
}

/**
 * Clear a specific secret from cache
 */
export function invalidateSecret(secretName: string, version = 'latest'): void {
  secretCache.delete(`${secretName}:${version}`);
}

/**
 * Batch fetch multiple secrets
 *
 * @example
 * ```ts
 * const secrets = await getSecrets(['api-key', 'db-password', 'jwt-secret']);
 * console.log(secrets['api-key']);
 * ```
 */
export async function getSecrets(
  secretNames: string[],
  options: GetSecretOptions = {}
): Promise<Record<string, string>> {
  const results = await Promise.all(
    secretNames.map(async (name) => {
      const value = await getSecret(name, options);
      return [name, value] as const;
    })
  );

  return Object.fromEntries(results);
}

/**
 * Convert secret name to environment variable format
 * e.g., 'api-key' -> 'API_KEY', 'db-password' -> 'DB_PASSWORD'
 */
function secretNameToEnvVar(secretName: string): string {
  return secretName
    .replace(/-/g, '_')
    .replace(/\./g, '_')
    .toUpperCase();
}

/**
 * Secrets helper object for convenient access
 */
export const secrets = {
  get: getSecret,
  require: requireSecret,
  getMany: getSecrets,
  clearCache: clearSecretCache,
  invalidate: invalidateSecret,
};
