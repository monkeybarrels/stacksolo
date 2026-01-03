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

// Secrets (GCP Secret Manager)
export { secrets, getSecret, requireSecret, getSecrets, clearSecretCache, invalidateSecret } from './secrets';
export type { GetSecretOptions } from './secrets';

// Kernel client (Auth + NATS + Extensions)
export {
  kernel,
  validateToken,
  files,
  events,
  KernelError,
  closeConnection,
  isConnected,
  // Extension system (for plugins to add methods)
  extendKernel,
  getKernelExtension,
  hasKernelExtension,
  getKernelExtensions,
} from './kernel';
export type {
  ValidateTokenResult,
  ValidateTokenError,
  ValidateTokenResponse,
  UploadUrlRequest,
  UploadUrlResponse,
  DownloadUrlRequest,
  DownloadUrlResponse,
  KernelErrorResponse,
} from './kernel';

// Plugin system
export {
  plugins,
  registerPlugin,
  getPluginClient,
  getPluginClientSync,
  hasPlugin,
  getRegisteredPlugins,
  cleanupPlugins,
  clearPluginRegistry,
} from './plugins';
export type { PluginClientConfig, PluginRegistration } from './plugins';
