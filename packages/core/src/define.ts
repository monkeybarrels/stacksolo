import type {
  Provider,
  ResourceType,
  AppPattern,
  DefineProviderInput,
  DefineResourceInput,
  DefineAppPatternInput,
} from './types';

/**
 * Define a cloud provider plugin
 */
export function defineProvider(input: DefineProviderInput): Provider {
  return {
    id: input.id,
    name: input.name,
    icon: input.icon,
    auth: input.auth,
    resources: input.resources,
  };
}

/**
 * Define a resource type for a provider
 */
export function defineResource(input: DefineResourceInput): ResourceType {
  return {
    id: input.id,
    provider: input.provider,
    name: input.name,
    description: input.description,
    icon: input.icon,
    configSchema: input.configSchema,
    defaultConfig: input.defaultConfig,
    generate: input.generate,
    estimateCost: input.estimateCost,
  };
}

/**
 * Define an app pattern for composing infrastructure
 */
export function defineAppPattern(input: DefineAppPatternInput): AppPattern {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    icon: input.icon,
    provider: input.provider,
    detect: input.detect,
    prompts: input.prompts,
    infrastructure: input.infrastructure,
    build: input.build,
    env: input.env,
  };
}
