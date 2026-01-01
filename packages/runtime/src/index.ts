/**
 * @stacksolo/runtime
 *
 * Runtime utilities for StackSolo applications.
 * Provides environment detection, service-to-service calls,
 * and auto-configured GCP SDK clients.
 */

// Environment configuration
export { env } from './env';
export type { StackSoloEnv } from './env';

// Firestore client
export { firestore, resetFirestore } from './firestore';

// Service-to-service calls
export { services, call, create } from './services';
export type { ServiceCallOptions, ServiceResponse } from './services';

// Config types and factory (legacy)
export {
  createStackSoloConfig,
  type StackSoloConfig,
  type DatabaseConfig,
  type StorageConfig,
  type AppConfig,
} from './config';

// Validation helpers
export { validateConfig, getRequiredEnv } from './validation';

// Storage helpers (GCP)
export { getStorageClient, uploadFile, downloadFile } from './storage';
