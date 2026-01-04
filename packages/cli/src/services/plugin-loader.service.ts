/**
 * Plugin Loader Service
 *
 * Dynamically loads plugins from config and registers them with the registry.
 * Supports:
 * - NPM packages (from node_modules)
 * - Monorepo detection (builds from source in development)
 * - Auto-installation of missing plugins
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
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
    '@stacksolo/plugin-gcp-kernel': 'plugins/gcp-kernel',
    '@stacksolo/plugin-zero-trust': 'plugins/zero-trust',
    '@stacksolo/plugin-zero-trust-auth': 'plugins/zero-trust-auth',
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
  let modulePath = pathOrName;

  // If it's a package name (not a path), resolve from project's node_modules
  if (!pathOrName.startsWith('/') && !pathOrName.startsWith('.')) {
    const projectNodeModules = path.join(process.cwd(), 'node_modules', pathOrName);
    if (fs.existsSync(projectNodeModules)) {
      // ESM requires explicit path to entry file, read from package.json
      const pkgJsonPath = path.join(projectNodeModules, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        // Use exports['.'].import, main, or default to dist/index.js
        const entryPoint =
          pkgJson.exports?.['.']?.import ||
          pkgJson.main ||
          './dist/index.js';
        modulePath = path.join(projectNodeModules, entryPoint);
      }
    }
  }

  const module = await import(modulePath);
  // Support both default export and named 'plugin' export
  return module.default || module.plugin;
}

/**
 * Check if a plugin is installed in node_modules
 */
function isPluginInstalled(pluginName: string): boolean {
  try {
    // Check in current working directory's node_modules
    const modulePath = path.join(process.cwd(), 'node_modules', pluginName);
    return fs.existsSync(modulePath);
  } catch {
    return false;
  }
}

/**
 * Install a plugin from npm
 */
function installPlugin(pluginName: string): void {
  console.log(`Installing plugin ${pluginName}...`);

  const cwd = process.cwd();

  // Check if package.json exists, create minimal one if not
  const packageJsonPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    const minimalPackageJson = {
      name: path.basename(cwd),
      version: '1.0.0',
      private: true,
      dependencies: {},
    };
    fs.writeFileSync(packageJsonPath, JSON.stringify(minimalPackageJson, null, 2));
  }

  // Install the plugin
  try {
    execSync(`npm install ${pluginName}`, {
      cwd,
      stdio: 'inherit',
    });
    console.log(`Successfully installed ${pluginName}`);
  } catch (error) {
    throw new Error(
      `Failed to install plugin ${pluginName}: ${error instanceof Error ? error.message : error}`
    );
  }
}

/**
 * Ensure a plugin is installed, installing it if necessary
 */
async function ensurePluginInstalled(pluginName: string): Promise<void> {
  // Skip if in monorepo (plugins loaded from source)
  if (getMonorepoRoot()) {
    return;
  }

  if (!isPluginInstalled(pluginName)) {
    installPlugin(pluginName);
  }
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
      // Auto-install plugin if not present (only for user projects, not monorepo)
      await ensurePluginInstalled(pluginName);

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
      // First try monorepo path
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

      // Fall back to node_modules (handles file: references and symlinks)
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', pluginName);
      if (fs.existsSync(nodeModulesPath)) {
        // Resolve symlinks to get the real path
        const realPath = fs.realpathSync(nodeModulesPath);
        const servicePath = path.join(realPath, service.sourcePath);
        if (fs.existsSync(servicePath)) {
          return servicePath;
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
