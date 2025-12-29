/**
 * @stacksolo/blueprint
 * Config parser and code generator for StackSolo infrastructure
 */

// Schema types
export type {
  StackSoloConfig,
  ProjectConfig,
  NetworkConfig,
  ContainerConfig,
  FunctionConfig,
  DatabaseConfig,
  CacheConfig,
  BucketConfig,
  SecretConfig,
  TopicConfig,
  QueueConfig,
  CronConfig,
  ServiceAccountConfig,
  SubnetConfig,
  FirewallRuleConfig,
  ResolvedResource,
  ResolvedConfig,
  Reference,
  ReferenceType,
  ValidationResult,
  ValidationError,
} from './schema.js';

// Parser
export {
  findConfigFile,
  parseConfig,
  parseConfigFromDir,
  validateConfig,
} from './parser.js';

// Resolver
export {
  resolveConfig,
  getResourceIds,
  findResource,
  findResourcesByType,
  findResourcesByNetwork,
} from './resolver.js';

// References
export {
  parseReference,
  isReference,
  getReferenceResourceId,
  getReferenceOutputName,
  resolveReferenceToPulumi,
  resolveReference,
  findEnvReferences,
  resolveEnvReferences,
  extractDependencies,
  validateReferences,
} from './references.js';

// Dependencies
export {
  buildDependencyGraph,
  detectCycles,
  topologicalSort,
  getResourcesInOrder,
  getParallelBatches,
  getDependencies,
  getDependents,
  getTransitiveDependencies,
  resolveWithOrder,
} from './dependencies.js';

// Generator
export {
  generateFromConfig,
  generatePulumiProgram,
  generatePulumiYaml,
  type GeneratedCode,
} from './generator.js';

// =============================================================================
// Convenience Functions
// =============================================================================

import { parseConfig, validateConfig } from './parser.js';
import { resolveConfig } from './resolver.js';
import { resolveWithOrder } from './dependencies.js';
import { generatePulumiProgram, generatePulumiYaml } from './generator.js';
import type { ValidationResult } from './schema.js';

/**
 * Full pipeline: parse, validate, resolve, generate
 */
export function processConfig(configPath: string): {
  valid: boolean;
  errors: string[];
  code?: string;
  yaml?: string;
} {
  // Parse
  const config = parseConfig(configPath);

  // Validate
  const validation = validateConfig(config);
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors.map(e => `${e.path}: ${e.message}`),
    };
  }

  // Resolve
  const resolved = resolveConfig(config);
  const withOrder = resolveWithOrder(resolved);

  // Generate
  const code = generatePulumiProgram(withOrder);
  const yaml = generatePulumiYaml(withOrder);

  return {
    valid: true,
    errors: [],
    code,
    yaml,
  };
}

/**
 * Validate a config file without generating code
 */
export function validateConfigFile(configPath: string): ValidationResult {
  const config = parseConfig(configPath);
  return validateConfig(config);
}

/**
 * Preview what resources will be created from a config
 */
export function previewConfig(configPath: string): {
  valid: boolean;
  errors: string[];
  resources?: Array<{ id: string; type: string; name: string; dependsOn: string[] }>;
} {
  const config = parseConfig(configPath);
  const validation = validateConfig(config);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors.map(e => `${e.path}: ${e.message}`),
    };
  }

  const resolved = resolveConfig(config);
  const withOrder = resolveWithOrder(resolved);

  return {
    valid: true,
    errors: [],
    resources: withOrder.resources.map(r => ({
      id: r.id,
      type: r.type,
      name: r.name,
      dependsOn: r.dependsOn,
    })),
  };
}
