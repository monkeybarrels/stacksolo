/**
 * Reference Service - Cross-project reference resolution
 *
 * Parses and resolves references like:
 *   @project/resource.property
 *   @project/network/resource.property
 */

import type { RegistryService } from './registry.service.js';
import type { CrossProjectReference, ResourceLogicalType, RegistryResource } from '../types.js';

/**
 * Default output properties for each resource type
 */
const DEFAULT_OUTPUTS: Record<ResourceLogicalType, string> = {
  container: 'url',
  function: 'url',
  database: 'connectionString',
  cache: 'host',
  bucket: 'name',
  secret: 'secretId',
  topic: 'name',
  queue: 'name',
  network: 'selfLink',
  cron: 'name',
};

export class ReferenceService {
  constructor(private registry: RegistryService) {}

  /**
   * Parse a cross-project reference string
   *
   * Formats:
   *   @project/resource.property
   *   @project/network/resource.property
   *
   * Examples:
   *   @shared-infra/users-db.connectionString
   *   @shared-infra/main/api.url
   *   @shared-infra/uploads (defaults to 'name' for bucket)
   */
  parseReference(ref: string): CrossProjectReference | null {
    if (!ref.startsWith('@')) {
      return null;
    }

    // Try format: @project/network/resource.property
    const withNetwork = ref.match(
      /^@([a-z0-9-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\.([a-zA-Z]+))?$/
    );
    if (withNetwork) {
      const [, projectName, network, resourceName, property] = withNetwork;
      return {
        projectName,
        network,
        resourceName,
        property: property || null,
      };
    }

    // Try format: @project/resource.property
    const withoutNetwork = ref.match(
      /^@([a-z0-9-]+)\/([a-z0-9-]+)(?:\.([a-zA-Z]+))?$/
    );
    if (withoutNetwork) {
      const [, projectName, resourceName, property] = withoutNetwork;
      return {
        projectName,
        network: null,
        resourceName,
        property: property || null,
      };
    }

    return null;
  }

  /**
   * Check if a string is a cross-project reference
   */
  isCrossProjectReference(value: string): boolean {
    return this.parseReference(value) !== null;
  }

  /**
   * Resolve a reference to its actual value from the registry
   */
  async resolve(ref: string): Promise<string> {
    const parsed = this.parseReference(ref);
    if (!parsed) {
      throw new Error(`Invalid cross-project reference: ${ref}`);
    }

    // Find the project
    const project = await this.registry.findProjectByName(parsed.projectName);
    if (!project) {
      throw new Error(`Project not found: ${parsed.projectName}`);
    }

    // Find the resource
    const resource = await this.registry.findResourceByRef(
      project.id,
      parsed.resourceName,
      parsed.network
    );

    if (!resource) {
      const location = parsed.network
        ? `${parsed.projectName}/${parsed.network}/${parsed.resourceName}`
        : `${parsed.projectName}/${parsed.resourceName}`;
      throw new Error(`Resource not found: ${location}`);
    }

    // Check if resource has outputs
    if (!resource.outputs) {
      throw new Error(
        `Resource "${ref}" has not been deployed (no outputs available)`
      );
    }

    // Get the property (or default)
    const property = parsed.property || this.getDefaultProperty(resource.type);
    const value = resource.outputs[property];

    if (value === undefined || value === null) {
      const available = Object.keys(resource.outputs).join(', ');
      throw new Error(
        `Property "${property}" not found in outputs for "${ref}". Available: ${available}`
      );
    }

    return String(value);
  }

  /**
   * Resolve a reference, returning the resource and value
   */
  async resolveWithResource(
    ref: string
  ): Promise<{ value: string; resource: RegistryResource }> {
    const parsed = this.parseReference(ref);
    if (!parsed) {
      throw new Error(`Invalid cross-project reference: ${ref}`);
    }

    const project = await this.registry.findProjectByName(parsed.projectName);
    if (!project) {
      throw new Error(`Project not found: ${parsed.projectName}`);
    }

    const resource = await this.registry.findResourceByRef(
      project.id,
      parsed.resourceName,
      parsed.network
    );

    if (!resource) {
      throw new Error(`Resource not found in reference: ${ref}`);
    }

    if (!resource.outputs) {
      throw new Error(`Resource "${ref}" has not been deployed`);
    }

    const property = parsed.property || this.getDefaultProperty(resource.type);
    const value = resource.outputs[property];

    if (value === undefined || value === null) {
      throw new Error(`Property "${property}" not found for "${ref}"`);
    }

    return {
      value: String(value),
      resource,
    };
  }

  /**
   * Validate that a reference can be resolved
   * Returns null if valid, error message if invalid
   */
  async validate(ref: string): Promise<string | null> {
    try {
      await this.resolve(ref);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Unknown error';
    }
  }

  /**
   * Find all cross-project references in an object
   */
  findReferences(obj: Record<string, unknown>): string[] {
    const refs: string[] = [];

    const walk = (value: unknown) => {
      if (typeof value === 'string' && this.isCrossProjectReference(value)) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(walk);
      }
    };

    walk(obj);
    return refs;
  }

  /**
   * Resolve all cross-project references in an object
   */
  async resolveAll(obj: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resolveValue = async (value: unknown): Promise<unknown> => {
      if (typeof value === 'string' && this.isCrossProjectReference(value)) {
        return this.resolve(value);
      } else if (Array.isArray(value)) {
        return Promise.all(value.map(resolveValue));
      } else if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = await resolveValue(v);
        }
        return result;
      }
      return value;
    };

    return (await resolveValue(obj)) as Record<string, unknown>;
  }

  /**
   * Get the default output property for a resource type
   */
  private getDefaultProperty(type: ResourceLogicalType): string {
    return DEFAULT_OUTPUTS[type] || 'name';
  }
}
