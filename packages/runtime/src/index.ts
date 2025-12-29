/**
 * @stacksolo/runtime
 *
 * Runtime helpers for StackSolo-deployed applications.
 * Install this package in your app to get typed config access and utility functions.
 */

// Config types and factory
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
