/**
 * Validation for merged configs
 */

import type { StackSoloConfig, ValidationResult } from '../schema.js';
import { validateConfig } from '../parser.js';

export interface MergeValidationResult extends ValidationResult {
  warnings: string[];
}

/**
 * Validate a merged config
 */
export function validateMergedConfig(config: StackSoloConfig): MergeValidationResult {
  const warnings: string[] = [];

  // Run standard validation
  const baseResult = validateConfig(config);

  // Additional merge-specific validation
  const project = config.project;

  // Check for very long resource names (approaching 63 char limit)
  const checkNameLength = (name: string, path: string) => {
    if (name.length > 50) {
      warnings.push(`${path}: name "${name}" is ${name.length} chars (max 63). Consider shorter names.`);
    }
  };

  // Check buckets
  for (const bucket of project.buckets || []) {
    checkNameLength(bucket.name, `bucket ${bucket.name}`);
  }

  // Check secrets
  for (const secret of project.secrets || []) {
    checkNameLength(secret.name, `secret ${secret.name}`);
  }

  // Check network resources
  for (const network of project.networks || []) {
    checkNameLength(network.name, `network ${network.name}`);

    for (const container of network.containers || []) {
      checkNameLength(container.name, `container ${container.name}`);
    }

    for (const fn of network.functions || []) {
      checkNameLength(fn.name, `function ${fn.name}`);
    }

    for (const db of network.databases || []) {
      checkNameLength(db.name, `database ${db.name}`);
    }

    for (const cache of network.caches || []) {
      checkNameLength(cache.name, `cache ${cache.name}`);
    }

    for (const ui of network.uis || []) {
      checkNameLength(ui.name, `ui ${ui.name}`);
    }
  }

  // Check load balancer route conflicts
  const routePaths = new Map<string, string[]>();
  for (const network of project.networks || []) {
    if (network.loadBalancer?.routes) {
      for (const route of network.loadBalancer.routes) {
        if (!routePaths.has(route.path)) {
          routePaths.set(route.path, []);
        }
        routePaths.get(route.path)!.push(route.backend);
      }
    }
  }

  for (const [path, backends] of routePaths) {
    if (backends.length > 1) {
      warnings.push(`Route path "${path}" is used by multiple backends: ${backends.join(', ')}`);
    }
  }

  return {
    ...baseResult,
    warnings,
  };
}

/**
 * Validate cross-project references in a merged config
 */
export function validateCrossProjectReferences(
  config: StackSoloConfig,
  sourceProjects: string[]
): string[] {
  const errors: string[] = [];

  // Collect all resource names with their types
  const resources = new Map<string, Set<string>>(); // type -> Set<name>

  // Add global resources
  for (const bucket of config.project.buckets || []) {
    if (!resources.has('bucket')) resources.set('bucket', new Set());
    resources.get('bucket')!.add(bucket.name);
  }

  for (const secret of config.project.secrets || []) {
    if (!resources.has('secret')) resources.set('secret', new Set());
    resources.get('secret')!.add(secret.name);
  }

  for (const topic of config.project.topics || []) {
    if (!resources.has('topic')) resources.set('topic', new Set());
    resources.get('topic')!.add(topic.name);
  }

  // Add network resources
  for (const network of config.project.networks || []) {
    for (const container of network.containers || []) {
      if (!resources.has('container')) resources.set('container', new Set());
      resources.get('container')!.add(container.name);
    }

    for (const fn of network.functions || []) {
      if (!resources.has('function')) resources.set('function', new Set());
      resources.get('function')!.add(fn.name);
    }

    for (const db of network.databases || []) {
      if (!resources.has('database')) resources.set('database', new Set());
      resources.get('database')!.add(db.name);
    }

    for (const cache of network.caches || []) {
      if (!resources.has('cache')) resources.set('cache', new Set());
      resources.get('cache')!.add(cache.name);
    }
  }

  // Check all references resolve
  const checkReference = (ref: string, context: string) => {
    if (!ref.startsWith('@')) return;

    // Parse reference: @type/name or @project/type/name
    const projectMatch = ref.match(/^@([a-z0-9-]+)\/(\w+)\/([^.]+)/);
    const simpleMatch = ref.match(/^@(\w+)\/([^.]+)/);

    if (projectMatch) {
      // Cross-project reference: @project/type/name
      const [, projectName, type, name] = projectMatch;
      if (!sourceProjects.includes(projectName)) {
        errors.push(`${context}: reference "${ref}" refers to unknown project "${projectName}"`);
      }
      // Can't validate cross-project resource existence without the full config
    } else if (simpleMatch) {
      // Simple reference: @type/name
      const [, type, name] = simpleMatch;
      const typeResources = resources.get(type);
      if (!typeResources?.has(name)) {
        errors.push(`${context}: reference "${ref}" refers to non-existent ${type} "${name}"`);
      }
    }
  };

  // Check env references in all resources
  for (const network of config.project.networks || []) {
    for (const container of network.containers || []) {
      for (const [key, value] of Object.entries(container.env || {})) {
        checkReference(value, `container ${container.name}.env.${key}`);
      }
      for (const [key, value] of Object.entries(container.secrets || {})) {
        checkReference(value, `container ${container.name}.secrets.${key}`);
      }
    }

    for (const fn of network.functions || []) {
      for (const [key, value] of Object.entries(fn.env || {})) {
        checkReference(value, `function ${fn.name}.env.${key}`);
      }
      for (const [key, value] of Object.entries(fn.secrets || {})) {
        checkReference(value, `function ${fn.name}.secrets.${key}`);
      }
    }
  }

  // Check cron targets
  for (const cron of config.project.crons || []) {
    checkReference(cron.target, `cron ${cron.name}.target`);
  }

  return errors;
}
