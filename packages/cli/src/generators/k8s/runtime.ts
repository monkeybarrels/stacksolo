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
 */
export function getFrameworkConfig(framework: UIFramework): FrameworkConfig {
  switch (framework) {
    case 'vue':
    case 'nuxt':
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0'],
      };

    case 'react':
    case 'next':
      return {
        command: ['npm', 'run', 'dev', '--', '--hostname', '0.0.0.0'],
      };

    case 'svelte':
    case 'sveltekit':
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0'],
      };

    default:
      // Generic fallback
      return {
        command: ['npm', 'run', 'dev', '--', '--host', '0.0.0.0'],
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
