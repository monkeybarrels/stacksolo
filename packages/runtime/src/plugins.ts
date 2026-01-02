/**
 * Plugin Registry for Runtime Extensions
 *
 * Allows plugins to register their own clients and utilities
 * that can be accessed via the runtime package.
 *
 * @example Plugin registration (in plugin package):
 * ```ts
 * import { registerPlugin } from '@stacksolo/runtime';
 *
 * registerPlugin('my-plugin', {
 *   createClient: (config) => new MyPluginClient(config),
 *   // Optional: provide types for better DX
 * });
 * ```
 *
 * @example Usage (in user code):
 * ```ts
 * import { getPluginClient } from '@stacksolo/runtime';
 *
 * const myClient = getPluginClient<MyPluginClient>('my-plugin');
 * await myClient.doSomething();
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration passed to plugin client factories
 */
export interface PluginClientConfig {
  /** Environment (development, production) */
  environment: 'development' | 'production';
  /** Project name from config */
  projectName?: string;
  /** Additional plugin-specific config from environment */
  [key: string]: unknown;
}

/**
 * Plugin registration options
 */
export interface PluginRegistration<T = unknown> {
  /**
   * Factory function to create the plugin client
   * Called lazily on first access
   */
  createClient: (config: PluginClientConfig) => T | Promise<T>;

  /**
   * Optional cleanup function called on shutdown
   */
  cleanup?: (client: T) => void | Promise<void>;

  /**
   * Optional: config keys this plugin reads from environment
   * Used for documentation and validation
   */
  envKeys?: string[];
}

/**
 * Internal plugin entry with cached client
 */
interface PluginEntry<T = unknown> {
  registration: PluginRegistration<T>;
  client: T | null;
  initializing: Promise<T> | null;
}

// =============================================================================
// Registry
// =============================================================================

/** Plugin registry - maps plugin name to registration */
const pluginRegistry = new Map<string, PluginEntry>();

/** Get current environment config for plugins */
function getPluginConfig(): PluginClientConfig {
  const nodeEnv = process.env.NODE_ENV;
  const isLocal =
    nodeEnv === 'development' || !!process.env.FIRESTORE_EMULATOR_HOST;

  return {
    environment: isLocal ? 'development' : 'production',
    projectName: process.env.STACKSOLO_PROJECT_NAME || process.env.PROJECT_NAME,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Register a plugin with the runtime
 *
 * Plugins call this to make their clients available via `getPluginClient()`.
 * Registration is idempotent - calling multiple times with the same name
 * will update the registration.
 *
 * @param name - Unique plugin identifier (e.g., 'my-plugin', 'payments')
 * @param registration - Plugin registration options
 *
 * @example
 * ```ts
 * // In your plugin's index.ts or a dedicated runtime.ts
 * import { registerPlugin } from '@stacksolo/runtime';
 * import { MyServiceClient } from './client';
 *
 * registerPlugin('my-service', {
 *   createClient: (config) => {
 *     const endpoint = config.environment === 'development'
 *       ? 'http://localhost:3000'
 *       : process.env.MY_SERVICE_URL;
 *     return new MyServiceClient({ endpoint });
 *   },
 *   cleanup: (client) => client.close(),
 *   envKeys: ['MY_SERVICE_URL'],
 * });
 * ```
 */
export function registerPlugin<T>(
  name: string,
  registration: PluginRegistration<T>
): void {
  // Clean up existing client if re-registering
  const existing = pluginRegistry.get(name);
  if (existing?.client && existing.registration.cleanup) {
    try {
      existing.registration.cleanup(existing.client);
    } catch {
      // Ignore cleanup errors on re-registration
    }
  }

  pluginRegistry.set(name, {
    registration: registration as PluginRegistration,
    client: null,
    initializing: null,
  });
}

/**
 * Get a plugin client by name
 *
 * Returns the cached client instance, creating it if necessary.
 * The client is created lazily on first access.
 *
 * @param name - Plugin name (as registered with `registerPlugin`)
 * @returns The plugin client instance
 * @throws Error if plugin is not registered
 *
 * @example
 * ```ts
 * import { getPluginClient } from '@stacksolo/runtime';
 * import type { MyServiceClient } from '@my-org/my-plugin';
 *
 * const client = getPluginClient<MyServiceClient>('my-service');
 * const result = await client.fetchData();
 * ```
 */
export async function getPluginClient<T = unknown>(name: string): Promise<T> {
  const entry = pluginRegistry.get(name);

  if (!entry) {
    throw new Error(
      `Plugin '${name}' is not registered. ` +
        `Make sure to import the plugin package before accessing its client. ` +
        `Available plugins: ${getRegisteredPlugins().join(', ') || '(none)'}`
    );
  }

  // Return cached client
  if (entry.client !== null) {
    return entry.client as T;
  }

  // Wait for existing initialization
  if (entry.initializing !== null) {
    return entry.initializing as Promise<T>;
  }

  // Initialize client
  const config = getPluginConfig();
  const initPromise = Promise.resolve(entry.registration.createClient(config));

  entry.initializing = initPromise;

  try {
    const client = await initPromise;
    entry.client = client;
    entry.initializing = null;
    return client as T;
  } catch (error) {
    entry.initializing = null;
    throw error;
  }
}

/**
 * Get a plugin client synchronously (must already be initialized)
 *
 * Use this when you know the client has been initialized elsewhere.
 * Throws if the client hasn't been initialized yet.
 *
 * @param name - Plugin name
 * @returns The plugin client instance
 * @throws Error if plugin not registered or not yet initialized
 *
 * @example
 * ```ts
 * // At startup
 * await getPluginClient('my-service');
 *
 * // Later, in synchronous code
 * const client = getPluginClientSync<MyServiceClient>('my-service');
 * ```
 */
export function getPluginClientSync<T = unknown>(name: string): T {
  const entry = pluginRegistry.get(name);

  if (!entry) {
    throw new Error(
      `Plugin '${name}' is not registered. ` +
        `Make sure to import the plugin package before accessing its client.`
    );
  }

  if (entry.client === null) {
    throw new Error(
      `Plugin '${name}' client has not been initialized. ` +
        `Call getPluginClient('${name}') first to initialize it.`
    );
  }

  return entry.client as T;
}

/**
 * Check if a plugin is registered
 *
 * @param name - Plugin name to check
 * @returns true if the plugin is registered
 */
export function hasPlugin(name: string): boolean {
  return pluginRegistry.has(name);
}

/**
 * Get list of registered plugin names
 *
 * @returns Array of registered plugin names
 */
export function getRegisteredPlugins(): string[] {
  return Array.from(pluginRegistry.keys());
}

/**
 * Cleanup all plugin clients
 *
 * Call this during graceful shutdown to allow plugins to clean up resources.
 *
 * @example
 * ```ts
 * import { cleanupPlugins } from '@stacksolo/runtime';
 *
 * process.on('SIGTERM', async () => {
 *   await cleanupPlugins();
 *   process.exit(0);
 * });
 * ```
 */
export async function cleanupPlugins(): Promise<void> {
  const cleanupPromises: Promise<void>[] = [];

  for (const [name, entry] of pluginRegistry.entries()) {
    if (entry.client !== null && entry.registration.cleanup) {
      const cleanupPromise = Promise.resolve(
        entry.registration.cleanup(entry.client)
      ).catch((error) => {
        console.error(`Error cleaning up plugin '${name}':`, error);
      });
      cleanupPromises.push(cleanupPromise);
    }
    entry.client = null;
    entry.initializing = null;
  }

  await Promise.all(cleanupPromises);
}

/**
 * Clear all plugin registrations (mainly for testing)
 */
export function clearPluginRegistry(): void {
  pluginRegistry.clear();
}

// =============================================================================
// Plugin Namespace Object
// =============================================================================

/**
 * Plugins namespace for accessing registered plugin clients
 *
 * This provides a convenient way to access plugins as a namespace object.
 *
 * @example
 * ```ts
 * import { plugins } from '@stacksolo/runtime';
 *
 * // Get a client
 * const myClient = await plugins.get<MyClient>('my-plugin');
 *
 * // Check if registered
 * if (plugins.has('my-plugin')) {
 *   // ...
 * }
 *
 * // List all plugins
 * console.log('Available:', plugins.list());
 * ```
 */
export const plugins = {
  /** Get a plugin client (async, creates if needed) */
  get: getPluginClient,

  /** Get a plugin client (sync, must be initialized) */
  getSync: getPluginClientSync,

  /** Register a plugin */
  register: registerPlugin,

  /** Check if a plugin is registered */
  has: hasPlugin,

  /** List registered plugins */
  list: getRegisteredPlugins,

  /** Cleanup all plugins */
  cleanup: cleanupPlugins,

  /** Clear registry (testing) */
  clear: clearPluginRegistry,
};
