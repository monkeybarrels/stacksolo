/**
 * StackSolo Blueprint References
 * Parse and resolve @type/name.property references
 */

import type { Reference, ReferenceType, ResolvedResource } from './schema.js';

/**
 * Reference output mappings
 * Maps reference types and properties to Pulumi output variable names
 */
const REFERENCE_OUTPUTS: Record<ReferenceType, Record<string, string>> = {
  secret: {
    default: 'secretId',
    id: 'secretId',
    name: 'secretName',
    version: 'secretVersionId',
  },
  database: {
    default: 'connectionString',
    connectionString: 'connectionString',
    privateIp: 'privateIp',
    publicIp: 'publicIp',
    instanceName: 'instanceName',
    name: 'databaseName',
  },
  bucket: {
    default: 'name',
    name: 'name',
    url: 'url',
    selfLink: 'selfLink',
  },
  cache: {
    default: 'host',
    host: 'host',
    port: 'port',
    connectionString: 'connectionString',
    authString: 'authString',
  },
  container: {
    default: 'url',
    url: 'url',
    name: 'name',
  },
  function: {
    default: 'url',
    url: 'url',
    name: 'name',
  },
  topic: {
    default: 'name',
    name: 'name',
    id: 'topicId',
  },
  queue: {
    default: 'name',
    name: 'name',
    id: 'queueId',
  },
  network: {
    default: 'selfLink',
    name: 'name',
    id: 'networkId',
    selfLink: 'selfLink',
  },
  ui: {
    default: 'url',
    url: 'url',
    bucketName: 'bucketName',
    name: 'name',
  },
};

/**
 * Parse a reference string into its components
 *
 * Examples:
 *   "@secret/api-key" -> { type: 'secret', name: 'api-key' }
 *   "@database/db.connectionString" -> { type: 'database', name: 'db', property: 'connectionString' }
 *   "@bucket/uploads.url" -> { type: 'bucket', name: 'uploads', property: 'url' }
 */
export function parseReference(ref: string): Reference | null {
  if (!ref.startsWith('@')) {
    return null;
  }

  // Match @type/name or @type/name.property
  const match = ref.match(/^@([a-z]+)\/([a-z0-9-]+)(?:\.([a-zA-Z]+))?$/);
  if (!match) {
    return null;
  }

  const [, typeStr, name, property] = match;

  // Validate type
  const validTypes: ReferenceType[] = [
    'secret', 'database', 'bucket', 'cache',
    'container', 'function', 'topic', 'queue', 'network', 'ui'
  ];

  if (!validTypes.includes(typeStr as ReferenceType)) {
    return null;
  }

  return {
    type: typeStr as ReferenceType,
    name,
    property,
  };
}

/**
 * Check if a string is a reference
 */
export function isReference(value: string): boolean {
  return value.startsWith('@') && parseReference(value) !== null;
}

/**
 * Get the resource ID for a reference
 */
export function getReferenceResourceId(ref: Reference): string {
  return `${ref.type}-${ref.name}`;
}

/**
 * Get the Pulumi output variable name for a reference
 */
export function getReferenceOutputName(ref: Reference): string {
  const outputs = REFERENCE_OUTPUTS[ref.type];
  if (!outputs) {
    throw new Error(`Unknown reference type: ${ref.type}`);
  }

  const property = ref.property || 'default';
  const outputName = outputs[property];

  if (!outputName) {
    throw new Error(`Unknown property "${property}" for reference type "${ref.type}"`);
  }

  return outputName;
}

/**
 * Convert a resource name to a valid variable name
 */
function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * Resolve a reference to a Pulumi interpolation string
 *
 * Example:
 *   "@database/db.connectionString" -> "${dbConnectionString}"
 */
export function resolveReferenceToPulumi(ref: Reference): string {
  const varName = toVariableName(ref.name);
  const outputName = getReferenceOutputName(ref);

  // Capitalize first letter of output name for the full variable
  const fullVarName = `${varName}${outputName.charAt(0).toUpperCase()}${outputName.slice(1)}`;

  return `\${${fullVarName}}`;
}

/**
 * Resolve a reference string directly to Pulumi interpolation
 */
export function resolveReference(refString: string): string {
  const ref = parseReference(refString);
  if (!ref) {
    throw new Error(`Invalid reference: ${refString}`);
  }
  return resolveReferenceToPulumi(ref);
}

/**
 * Find all references in an env object
 */
export function findEnvReferences(env: Record<string, string>): Reference[] {
  const references: Reference[] = [];

  for (const value of Object.values(env)) {
    if (typeof value === 'string' && value.startsWith('@')) {
      const ref = parseReference(value);
      if (ref) {
        references.push(ref);
      }
    }
  }

  return references;
}

/**
 * Resolve all references in an env object to Pulumi interpolations
 */
export function resolveEnvReferences(env: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.startsWith('@')) {
      const ref = parseReference(value);
      if (ref) {
        resolved[key] = resolveReferenceToPulumi(ref);
      } else {
        resolved[key] = value; // Keep as-is if not a valid reference
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Extract all dependencies from a resolved resource's config
 */
export function extractDependencies(resource: ResolvedResource): string[] {
  const deps = new Set<string>(resource.dependsOn);
  const config = resource.config as Record<string, unknown>;

  // Check env for references
  if (config.env && typeof config.env === 'object') {
    const env = config.env as Record<string, string>;
    for (const ref of findEnvReferences(env)) {
      deps.add(getReferenceResourceId(ref));
    }
  }

  // Check secrets for references
  if (config.secrets && typeof config.secrets === 'object') {
    const secrets = config.secrets as Record<string, string>;
    for (const ref of findEnvReferences(secrets)) {
      deps.add(getReferenceResourceId(ref));
    }
  }

  return [...deps];
}

/**
 * Validate that all references point to existing resources
 */
export function validateReferences(
  resources: ResolvedResource[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const resourceIds = new Set(resources.map(r => r.id));

  for (const resource of resources) {
    const deps = extractDependencies(resource);
    for (const dep of deps) {
      if (!resourceIds.has(dep)) {
        errors.push(`Resource "${resource.id}" references non-existent resource "${dep}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
