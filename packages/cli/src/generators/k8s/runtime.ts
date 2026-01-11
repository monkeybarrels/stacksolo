/**
 * Runtime and framework detection utilities
 * Maps config runtime/framework to container images and commands
 */

import type { Runtime, RuntimeConfig, UIFramework, FrameworkConfig } from './types';

/**
 * Get container configuration for a given runtime
 */
export function getRuntimeConfig(runtime: Runtime, entryPoint: string): RuntimeConfig {
  if (runtime.startsWith('nodejs')) {
    return {
      image: 'node:20-slim',
      command: [
        'npx',
        '@google-cloud/functions-framework',
        `--target=${entryPoint}`,
        '--port=8080',
      ],
    };
  }

  if (runtime.startsWith('python')) {
    const pythonVersion = getPythonVersion(runtime);
    return {
      image: `python:${pythonVersion}-slim`,
      command: ['functions-framework', `--target=${entryPoint}`, '--port=8080'],
    };
  }

  // Default to Node.js
  return {
    image: 'node:20-slim',
    command: [
      'npx',
      '@google-cloud/functions-framework',
      `--target=${entryPoint}`,
      '--port=8080',
    ],
  };
}

/**
 * Extract Python version from runtime string
 */
function getPythonVersion(runtime: string): string {
  const match = runtime.match(/python(\d+)/);
  if (!match) return '3.12';

  const version = match[1];
  if (version === '39') return '3.9';
  if (version === '310') return '3.10';
  if (version === '311') return '3.11';
  if (version === '312') return '3.12';

  return '3.12';
}

/**
 * Get dev server command for a UI framework
 * Port parameter is required to ensure the dev server listens on the expected port
 */
export function getFrameworkConfig(framework: UIFramework, port: number = 3000): FrameworkConfig {
  switch (framework) {
    case 'vue':
      // Vite (Vue default) uses --port
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)],
      };

    case 'nuxt':
      // Nuxt uses --port
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)],
      };

    case 'react':
      // Create React App uses PORT env var, Vite uses --port
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)],
      };

    case 'next':
      // Next.js uses -p or --port
      return {
        command: ['npm', 'run', 'dev', '--', '--hostname', '0.0.0.0', '-p', String(port)],
      };

    case 'svelte':
    case 'sveltekit':
      // SvelteKit/Vite uses --port
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)],
      };

    default:
      // Generic fallback - assume Vite-style args
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)],
      };
  }
}

/**
 * Check if a runtime is Node.js based
 */
export function isNodeRuntime(runtime: Runtime): boolean {
  return runtime.startsWith('nodejs');
}

/**
 * Check if a runtime is Python based
 */
export function isPythonRuntime(runtime: Runtime): boolean {
  return runtime.startsWith('python');
}

/**
 * Package manager type (re-export from blueprint for convenience)
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Get the install command for a package manager
 * Returns production-only install to skip devDependencies (which may have workspace:* refs)
 */
export function getInstallCommand(packageManager: PackageManager = 'npm'): string {
  switch (packageManager) {
    case 'pnpm':
      // --prod skips devDependencies, --ignore-workspace prevents workspace:* resolution errors
      return 'pnpm install --prod --ignore-workspace';
    case 'yarn':
      return 'yarn install --production';
    case 'bun':
      return 'bun install --production';
    case 'npm':
    default:
      // --omit=dev skips devDependencies (which may contain workspace:* refs)
      return 'npm install --omit=dev';
  }
}

/**
 * Get the container image for a package manager
 * Some package managers need different base images
 */
export function getNodeImage(packageManager: PackageManager = 'npm'): string {
  switch (packageManager) {
    case 'bun':
      return 'oven/bun:1-slim';
    case 'pnpm':
    case 'yarn':
    case 'npm':
    default:
      return 'node:20-slim';
  }
}

/**
 * Get any setup commands needed before install (e.g., enabling corepack for pnpm/yarn)
 */
export function getPackageManagerSetup(packageManager: PackageManager = 'npm'): string | null {
  switch (packageManager) {
    case 'pnpm':
      return 'corepack enable && corepack prepare pnpm@latest --activate';
    case 'yarn':
      return 'corepack enable';
    case 'bun':
    case 'npm':
    default:
      return null;
  }
}
