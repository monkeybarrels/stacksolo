/**
 * Plugin Loader Service
 *
 * Dynamically loads plugins from config and registers them with the registry.
 * Supports:
 * - NPM packages (from node_modules)
 * - Monorepo detection (builds from source in development)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, PluginService } from '@stacksolo/core';
import { registry } from '@stacksolo/core';

/** Default plugins that are always loaded */
const DEFAULT_PLUGINS = ['@stacksolo/plugin-gcp-cdktf'];

/** Loaded plugins cache */
const loadedPlugins = new Map<string, Plugin>();

/**
 * Check if we're running inside the stacksolo monorepo
 */
export function isMonorepo(): boolean {
  // Check for monorepo indicators
  const cwd = process.cwd();

  // Look for pnpm-workspace.yaml or packages/cli directory
  const indicators = [
    path.join(cwd, 'pnpm-workspace.yaml'),
    path.join(cwd, 'packages', 'cli'),
    path.join(cwd, 'plugins', 'kernel'),
  ];

  return indicators.some((p) => fs.existsSync(p));
}

/**
 * Get the monorepo root directory
 */
export function getMonorepoRoot(): string | null {
  let dir = process.cwd();

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Load a single plugin by name
 */
export async function loadPlugin(pluginName: string): Promise<Plugin> {
  // Check cache
  if (loadedPlugins.has(pluginName)) {
    return loadedPlugins.get(pluginName)!;
  }

  let plugin: Plugin;

  // Check if we're in monorepo and the plugin exists locally
  const monorepoRoot = getMonorepoRoot();
  if (monorepoRoot) {
    const localPluginPath = resolveLocalPlugin(monorepoRoot, pluginName);
    if (localPluginPath) {
      console.log(`Loading plugin ${pluginName} from monorepo: ${localPluginPath}`);
      plugin = await importPlugin(localPluginPath);
      loadedPlugins.set(pluginName, plugin);
      return plugin;
    }
  }

  // Try to load from node_modules
  try {
    plugin = await importPlugin(pluginName);
    loadedPlugins.set(pluginName, plugin);
    return plugin;
  } catch (error) {
    throw new Error(
      `Failed to load plugin ${pluginName}: ${error instanceof Error ? error.message : error}\n` +
        `Make sure the plugin is installed: npm install ${pluginName}`
    );
  }
}

/**
 * Resolve local plugin path in monorepo
 */
function resolveLocalPlugin(monorepoRoot: string, pluginName: string): string | null {
  // Map plugin names to local paths
  const pluginPaths: Record<string, string> = {
    '@stacksolo/plugin-gcp-cdktf': 'plugins/gcp-cdktf',
    '@stacksolo/plugin-kernel': 'plugins/kernel',
  };

  const relativePath = pluginPaths[pluginName];
  if (!relativePath) {
    return null;
  }

  const fullPath = path.join(monorepoRoot, relativePath);
  if (fs.existsSync(fullPath)) {
    // Return the dist/index.js path for the built plugin
    const distPath = path.join(fullPath, 'dist', 'index.js');
    if (fs.existsSync(distPath)) {
      return distPath;
    }
    // Fall back to src if dist doesn't exist (dev mode)
    return fullPath;
  }

  return null;
}

/**
 * Import a plugin module
 */
async function importPlugin(pathOrName: string): Promise<Plugin> {
  const module = await import(pathOrName);
  // Support both default export and named 'plugin' export
  return module.default || module.plugin;
}

/**
 * Load all plugins from config
 */
export async function loadPlugins(configPlugins?: string[]): Promise<Plugin[]> {
  const pluginNames = new Set<string>([
    ...DEFAULT_PLUGINS,
    ...(configPlugins || []),
  ]);

  const plugins: Plugin[] = [];

  for (const pluginName of pluginNames) {
    try {
      const plugin = await loadPlugin(pluginName);
      plugins.push(plugin);

      // Register providers from the plugin
      if (plugin.providers) {
        for (const provider of plugin.providers) {
          try {
            registry.registerProvider(provider);
          } catch {
            // Already registered, skip
          }
        }
      }

      // Register standalone resources
      if (plugin.resources) {
        for (const resource of plugin.resources) {
          try {
            registry.registerResource(resource);
          } catch {
            // Already registered, skip
          }
        }
      }
    } catch (error) {
      console.error(`Warning: Failed to load plugin ${pluginName}:`, error);
    }
  }

  return plugins;
}

/**
 * Get all services from loaded plugins
 */
export function getPluginServices(): PluginService[] {
  const services: PluginService[] = [];

  for (const plugin of loadedPlugins.values()) {
    if (plugin.services) {
      services.push(...plugin.services);
    }
  }

  return services;
}

/**
 * Get a specific service by name
 */
export function getPluginService(serviceName: string): PluginService | undefined {
  for (const plugin of loadedPlugins.values()) {
    const service = plugin.services?.find((s) => s.name === serviceName);
    if (service) {
      return service;
    }
  }
  return undefined;
}

/**
 * Get the source path for a plugin service (for local dev builds)
 */
export function getServiceSourcePath(service: PluginService): string | null {
  if (!service.sourcePath) {
    return null;
  }

  // Find which plugin owns this service
  for (const [pluginName, plugin] of loadedPlugins.entries()) {
    if (plugin.services?.includes(service)) {
      // Get the plugin's location
      const monorepoRoot = getMonorepoRoot();
      if (monorepoRoot) {
        const localPath = resolveLocalPlugin(monorepoRoot, pluginName);
        if (localPath) {
          // localPath points to dist/index.js or the plugin dir
          const pluginDir = localPath.endsWith('.js')
            ? path.dirname(path.dirname(localPath))
            : localPath;
          return path.join(pluginDir, service.sourcePath);
        }
      }
    }
  }

  return null;
}

/**
 * Clear the plugin cache (useful for testing)
 */
export function clearPluginCache(): void {
  loadedPlugins.clear();
}
