import type { Provider, ResourceType, AppPattern, Plugin, OutputFormatter } from './types';

/**
 * Registry for providers and resource types
 */
export class PluginRegistry {
  private providers: Map<string, Provider> = new Map();
  private resources: Map<string, ResourceType> = new Map();
  private patterns: Map<string, AppPattern> = new Map();
  private formatters: Map<string, OutputFormatter> = new Map();

  /**
   * Register a plugin (provider with its resources and patterns)
   */
  registerPlugin(plugin: Plugin): void {
    if (plugin.providers) {
      for (const provider of plugin.providers) {
        this.registerProvider(provider);
      }
    }
    if (plugin.resources) {
      for (const resource of plugin.resources) {
        this.registerResource(resource);
      }
    }
    if (plugin.patterns) {
      for (const pattern of plugin.patterns) {
        this.registerPattern(pattern);
      }
    }
    if (plugin.outputFormatters) {
      for (const formatter of plugin.outputFormatters) {
        this.registerFormatter(formatter);
      }
    }
  }

  /**
   * Register a provider
   */
  registerProvider(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);

    // Also register all resources from this provider
    for (const resource of provider.resources) {
      this.registerResource(resource);
    }
  }

  /**
   * Register a resource type
   */
  registerResource(resource: ResourceType): void {
    if (this.resources.has(resource.id)) {
      throw new Error(`Resource type already registered: ${resource.id}`);
    }
    this.resources.set(resource.id, resource);
  }

  /**
   * Get a provider by ID
   */
  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get a resource type by ID
   */
  getResource(id: string): ResourceType | undefined {
    return this.resources.get(id);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all registered resource types
   */
  getAllResources(): ResourceType[] {
    return Array.from(this.resources.values());
  }

  /**
   * Get all resource types for a specific provider
   */
  getResourcesByProvider(providerId: string): ResourceType[] {
    return Array.from(this.resources.values()).filter(
      (r) => r.provider === providerId
    );
  }

  /**
   * Register an app pattern
   */
  registerPattern(pattern: AppPattern): void {
    if (this.patterns.has(pattern.id)) {
      throw new Error(`App pattern already registered: ${pattern.id}`);
    }
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Get an app pattern by ID
   */
  getPattern(id: string): AppPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get all registered app patterns
   */
  getAllPatterns(): AppPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get all app patterns for a specific provider
   */
  getPatternsByProvider(providerId: string): AppPattern[] {
    return Array.from(this.patterns.values()).filter(
      (p) => p.provider === providerId
    );
  }

  /**
   * Detect applicable patterns for a project path
   */
  async detectPatterns(projectPath: string): Promise<AppPattern[]> {
    const detected: AppPattern[] = [];
    for (const pattern of this.patterns.values()) {
      try {
        if (await pattern.detect(projectPath)) {
          detected.push(pattern);
        }
      } catch {
        // Pattern detection failed, skip it
      }
    }
    return detected;
  }

  /**
   * Register an output formatter
   */
  registerFormatter(formatter: OutputFormatter): void {
    if (this.formatters.has(formatter.id)) {
      throw new Error(`Output formatter already registered: ${formatter.id}`);
    }
    this.formatters.set(formatter.id, formatter);
  }

  /**
   * Get an output formatter by ID
   */
  getFormatter(id: string): OutputFormatter | undefined {
    return this.formatters.get(id);
  }

  /**
   * Get all registered output formatters
   */
  getAllFormatters(): OutputFormatter[] {
    return Array.from(this.formatters.values());
  }
}

// Global registry instance
export const registry = new PluginRegistry();
