/**
 * Configuration types and factory for StackSolo-deployed applications
 */

export interface DatabaseConfig {
  /** Database connection URL (e.g., postgres://...) */
  url: string;
}

export interface StorageConfig {
  /** GCP Storage bucket name */
  bucket: string;
  /** Optional: GCP project ID for explicit configuration */
  projectId?: string;
}

export interface AppConfig {
  /** The deployed application URL */
  url: string;
}

export interface StackSoloConfig {
  /** Database configuration (if pattern includes Cloud SQL) */
  database?: DatabaseConfig;
  /** Storage configuration (if pattern includes Cloud Storage) */
  storage?: StorageConfig;
  /** Application configuration */
  app?: AppConfig;
  /** Additional custom configuration */
  custom?: Record<string, unknown>;
}

/**
 * Create a typed StackSolo configuration object.
 * Use this in your stacksolo.config.ts file.
 *
 * @example
 * ```typescript
 * import { createStackSoloConfig } from '@stacksolo/runtime';
 *
 * export const config = createStackSoloConfig({
 *   database: { url: process.env.DATABASE_URL! },
 *   storage: { bucket: process.env.STORAGE_BUCKET! },
 *   app: { url: process.env.APP_URL! },
 * });
 * ```
 */
export function createStackSoloConfig(config: StackSoloConfig): StackSoloConfig {
  return Object.freeze(config);
}
