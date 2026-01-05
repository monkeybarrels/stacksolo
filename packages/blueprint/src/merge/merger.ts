/**
 * Core merge logic for combining multiple StackSolo projects
 */

import type {
  StackSoloConfig,
  ProjectConfig,
  NetworkConfig,
  BucketConfig,
  SecretConfig,
  TopicConfig,
  QueueConfig,
  CronConfig,
  ContainerConfig,
  FunctionConfig,
  DatabaseConfig,
  CacheConfig,
  UIConfig,
  LoadBalancerConfig,
  LoadBalancerRouteConfig,
} from '../schema.js';

import { prefixResourceName, prefixBucketName, prefixRoutePath, relativeSourceDir } from './naming.js';
import { detectConflicts, type ConflictResult } from './conflicts.js';

/**
 * Merge metadata stored in the output config
 */
export interface MergeMetadata {
  sources: Array<{
    name: string;
    path: string;
    originalGcpProjectId: string;
    originalRegion: string;
  }>;
  timestamp: string;
  version: string;
}

/**
 * Options for merging configs
 */
export interface MergeOptions {
  /** Name for the merged project */
  name: string;
  /** Output directory for merged config */
  outputDir: string;
  /** Use a shared VPC (name of existing VPC or 'auto' to create) */
  sharedVpc?: string;
  /** Use a shared artifact registry */
  sharedRegistry?: boolean;
  /** Dry run - don't write files */
  dryRun?: boolean;
}

/**
 * Input for a single project to merge
 */
export interface MergeInput {
  name: string;
  path: string;
  config: StackSoloConfig;
}

/**
 * Result of merging configs
 */
export interface MergeResult {
  success: boolean;
  conflicts: ConflictResult;
  config?: StackSoloConfig & { _merge?: MergeMetadata };
  errors: string[];
}

/**
 * Merge multiple StackSolo project configs into one
 */
export function mergeConfigs(inputs: MergeInput[], options: MergeOptions): MergeResult {
  const errors: string[] = [];

  // Validate inputs
  if (inputs.length === 0) {
    return {
      success: false,
      conflicts: { hasErrors: true, conflicts: [] },
      errors: ['No projects provided to merge'],
    };
  }

  // Detect conflicts
  const conflictInputs = inputs.map(i => ({ name: i.name, config: i.config }));
  const conflicts = detectConflicts(conflictInputs);

  if (conflicts.hasErrors) {
    return {
      success: false,
      conflicts,
      errors: ['Cannot merge due to conflicts'],
    };
  }

  // Use first project's GCP settings (validated to be the same)
  const firstProject = inputs[0].config.project;
  const gcpProjectId = firstProject.gcpProjectId;
  const region = firstProject.region;
  const backend = firstProject.backend || 'cdktf';

  // Build merged config
  const mergedConfig: StackSoloConfig & { _merge?: MergeMetadata } = {
    $schema: 'https://stacksolo.dev/schema/config.json',
    project: {
      name: options.name,
      region,
      gcpProjectId,
      backend,
      buckets: [],
      secrets: [],
      topics: [],
      queues: [],
      crons: [],
      networks: [],
    },
    _merge: {
      sources: inputs.map(i => ({
        name: i.name,
        path: i.path,
        originalGcpProjectId: i.config.project.gcpProjectId,
        originalRegion: i.config.project.region,
      })),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  };

  // Merge global resources from all projects
  for (const input of inputs) {
    const project = input.config.project;

    // Merge buckets
    for (const bucket of project.buckets || []) {
      const mergedBucket = mergeBucket(bucket, input.name);
      mergedConfig.project.buckets!.push(mergedBucket);
    }

    // Merge secrets
    for (const secret of project.secrets || []) {
      const mergedSecret = mergeSecret(secret, input.name);
      mergedConfig.project.secrets!.push(mergedSecret);
    }

    // Merge topics
    for (const topic of project.topics || []) {
      const mergedTopic = mergeTopic(topic, input.name);
      mergedConfig.project.topics!.push(mergedTopic);
    }

    // Merge queues
    for (const queue of project.queues || []) {
      const mergedQueue = mergeQueue(queue, input.name);
      mergedConfig.project.queues!.push(mergedQueue);
    }

    // Merge crons
    for (const cron of project.crons || []) {
      const mergedCron = mergeCron(cron, input.name);
      mergedConfig.project.crons!.push(mergedCron);
    }
  }

  // Merge networks
  if (options.sharedVpc) {
    // Create a single shared network
    const sharedNetwork = createSharedNetwork(inputs, options);
    mergedConfig.project.networks = [sharedNetwork];
  } else {
    // Keep separate networks (prefixed)
    for (const input of inputs) {
      for (const network of input.config.project.networks || []) {
        const mergedNetwork = mergeNetwork(network, input, options);
        mergedConfig.project.networks!.push(mergedNetwork);
      }
    }
  }

  // Remove empty arrays
  if (mergedConfig.project.buckets?.length === 0) delete mergedConfig.project.buckets;
  if (mergedConfig.project.secrets?.length === 0) delete mergedConfig.project.secrets;
  if (mergedConfig.project.topics?.length === 0) delete mergedConfig.project.topics;
  if (mergedConfig.project.queues?.length === 0) delete mergedConfig.project.queues;
  if (mergedConfig.project.crons?.length === 0) delete mergedConfig.project.crons;

  return {
    success: true,
    conflicts,
    config: mergedConfig,
    errors,
  };
}

/**
 * Merge a bucket config with prefixing
 */
function mergeBucket(bucket: BucketConfig, projectName: string): BucketConfig & { _source?: string } {
  return {
    ...bucket,
    name: prefixBucketName(projectName, bucket.name),
    _source: projectName,
  };
}

/**
 * Merge a secret config with prefixing
 */
function mergeSecret(secret: SecretConfig, projectName: string): SecretConfig & { _source?: string } {
  return {
    ...secret,
    name: prefixResourceName(projectName, secret.name),
    _source: projectName,
  };
}

/**
 * Merge a topic config with prefixing
 */
function mergeTopic(topic: TopicConfig, projectName: string): TopicConfig & { _source?: string } {
  return {
    ...topic,
    name: prefixResourceName(projectName, topic.name),
    _source: projectName,
  };
}

/**
 * Merge a queue config with prefixing
 */
function mergeQueue(queue: QueueConfig, projectName: string): QueueConfig & { _source?: string } {
  return {
    ...queue,
    name: prefixResourceName(projectName, queue.name),
    _source: projectName,
  };
}

/**
 * Merge a cron config with prefixing
 */
function mergeCron(cron: CronConfig, projectName: string): CronConfig & { _source?: string } {
  // Update target reference to use prefixed name
  let target = cron.target;
  if (target.startsWith('@')) {
    // Convert @container/api to @container/projectName-api
    const match = target.match(/^@(\w+)\/([^.]+)(\..*)?$/);
    if (match) {
      const [, type, name, property = ''] = match;
      target = `@${type}/${prefixResourceName(projectName, name)}${property}`;
    }
  }

  return {
    ...cron,
    name: prefixResourceName(projectName, cron.name),
    target,
    _source: projectName,
  };
}

/**
 * Merge a network config with prefixing
 */
function mergeNetwork(
  network: NetworkConfig,
  input: MergeInput,
  options: MergeOptions
): NetworkConfig & { _source?: string } {
  const projectName = input.name;

  const merged: NetworkConfig & { _source?: string } = {
    ...network,
    name: prefixResourceName(projectName, network.name),
    _source: projectName,
  };

  // Merge containers
  if (network.containers) {
    merged.containers = network.containers.map(c =>
      mergeContainer(c, projectName, input.path, options.outputDir)
    );
  }

  // Merge functions
  if (network.functions) {
    merged.functions = network.functions.map(f =>
      mergeFunction(f, projectName, input.path, options.outputDir)
    );
  }

  // Merge databases
  if (network.databases) {
    merged.databases = network.databases.map(d => mergeDatabase(d, projectName));
  }

  // Merge caches
  if (network.caches) {
    merged.caches = network.caches.map(c => mergeCache(c, projectName));
  }

  // Merge UIs
  if (network.uis) {
    merged.uis = network.uis.map(u =>
      mergeUI(u, projectName, input.path, options.outputDir)
    );
  }

  // Merge load balancer routes
  if (network.loadBalancer) {
    merged.loadBalancer = mergeLoadBalancer(network.loadBalancer, projectName);
  }

  return merged;
}

/**
 * Create a single shared network from all projects
 */
function createSharedNetwork(inputs: MergeInput[], options: MergeOptions): NetworkConfig {
  const sharedNetwork: NetworkConfig = {
    name: options.sharedVpc === 'auto' ? 'shared' : options.sharedVpc!,
    existing: options.sharedVpc !== 'auto',
    containers: [],
    functions: [],
    databases: [],
    caches: [],
    uis: [],
  };

  // Collect all routes for a combined load balancer
  const allRoutes: LoadBalancerRouteConfig[] = [];

  for (const input of inputs) {
    const projectName = input.name;

    for (const network of input.config.project.networks || []) {
      // Merge containers
      for (const container of network.containers || []) {
        sharedNetwork.containers!.push(
          mergeContainer(container, projectName, input.path, options.outputDir)
        );
      }

      // Merge functions
      for (const fn of network.functions || []) {
        sharedNetwork.functions!.push(
          mergeFunction(fn, projectName, input.path, options.outputDir)
        );
      }

      // Merge databases
      for (const db of network.databases || []) {
        sharedNetwork.databases!.push(mergeDatabase(db, projectName));
      }

      // Merge caches
      for (const cache of network.caches || []) {
        sharedNetwork.caches!.push(mergeCache(cache, projectName));
      }

      // Merge UIs
      for (const ui of network.uis || []) {
        sharedNetwork.uis!.push(
          mergeUI(ui, projectName, input.path, options.outputDir)
        );
      }

      // Collect load balancer routes
      if (network.loadBalancer?.routes) {
        for (const route of network.loadBalancer.routes) {
          allRoutes.push({
            path: prefixRoutePath(projectName, route.path),
            backend: prefixResourceName(projectName, route.backend),
          });
        }
      }
    }
  }

  // Create combined load balancer if there are routes
  if (allRoutes.length > 0) {
    sharedNetwork.loadBalancer = {
      name: 'merged-lb',
      routes: allRoutes,
    };
  }

  // Remove empty arrays
  if (sharedNetwork.containers?.length === 0) delete sharedNetwork.containers;
  if (sharedNetwork.functions?.length === 0) delete sharedNetwork.functions;
  if (sharedNetwork.databases?.length === 0) delete sharedNetwork.databases;
  if (sharedNetwork.caches?.length === 0) delete sharedNetwork.caches;
  if (sharedNetwork.uis?.length === 0) delete sharedNetwork.uis;

  return sharedNetwork;
}

/**
 * Merge a container config
 */
function mergeContainer(
  container: ContainerConfig,
  projectName: string,
  sourcePath: string,
  outputDir: string
): ContainerConfig & { _source?: string } {
  const merged: ContainerConfig & { _source?: string } = {
    ...container,
    name: prefixResourceName(projectName, container.name),
    _source: projectName,
  };

  // Update source dir if present
  if (container.image && !container.image.includes('/')) {
    // Local image reference - update path
    const defaultSourceDir = `containers/${container.name}`;
    merged.image = undefined; // Will be built from source
  }

  // Update env references
  if (container.env) {
    merged.env = prefixEnvReferences(container.env, projectName);
  }

  // Update secrets references
  if (container.secrets) {
    merged.secrets = prefixEnvReferences(container.secrets, projectName);
  }

  return merged;
}

/**
 * Merge a function config
 */
function mergeFunction(
  fn: FunctionConfig,
  projectName: string,
  sourcePath: string,
  outputDir: string
): FunctionConfig & { _source?: string } {
  const merged: FunctionConfig & { _source?: string } = {
    ...fn,
    name: prefixResourceName(projectName, fn.name),
    _source: projectName,
  };

  // Update source dir
  const originalSourceDir = fn.sourceDir || `functions/${fn.name}`;
  merged.sourceDir = relativeSourceDir(sourcePath, originalSourceDir, outputDir);

  // Update env references
  if (fn.env) {
    merged.env = prefixEnvReferences(fn.env, projectName);
  }

  // Update secrets references
  if (fn.secrets) {
    merged.secrets = prefixEnvReferences(fn.secrets, projectName);
  }

  // Update trigger references
  if (fn.trigger) {
    if (fn.trigger.topic) {
      merged.trigger = {
        ...fn.trigger,
        topic: prefixResourceName(projectName, fn.trigger.topic),
      };
    }
    if (fn.trigger.bucket) {
      merged.trigger = {
        ...fn.trigger,
        bucket: prefixBucketName(projectName, fn.trigger.bucket),
      };
    }
  }

  return merged;
}

/**
 * Merge a database config
 */
function mergeDatabase(
  db: DatabaseConfig,
  projectName: string
): DatabaseConfig & { _source?: string } {
  return {
    ...db,
    name: prefixResourceName(projectName, db.name),
    _source: projectName,
  };
}

/**
 * Merge a cache config
 */
function mergeCache(
  cache: CacheConfig,
  projectName: string
): CacheConfig & { _source?: string } {
  return {
    ...cache,
    name: prefixResourceName(projectName, cache.name),
    _source: projectName,
  };
}

/**
 * Merge a UI config
 */
function mergeUI(
  ui: UIConfig,
  projectName: string,
  sourcePath: string,
  outputDir: string
): UIConfig & { _source?: string } {
  const merged: UIConfig & { _source?: string } = {
    ...ui,
    name: prefixResourceName(projectName, ui.name),
    _source: projectName,
  };

  // Update source dir
  const originalSourceDir = ui.sourceDir || `ui/${ui.name}`;
  merged.sourceDir = relativeSourceDir(sourcePath, originalSourceDir, outputDir);

  return merged;
}

/**
 * Merge a load balancer config
 */
function mergeLoadBalancer(
  lb: LoadBalancerConfig,
  projectName: string
): LoadBalancerConfig {
  const merged: LoadBalancerConfig = {
    ...lb,
    name: prefixResourceName(projectName, lb.name),
  };

  // Update routes
  if (lb.routes) {
    merged.routes = lb.routes.map(route => ({
      path: prefixRoutePath(projectName, route.path),
      backend: prefixResourceName(projectName, route.backend),
    }));
  }

  return merged;
}

/**
 * Prefix environment variable references
 */
function prefixEnvReferences(
  env: Record<string, string>,
  projectName: string
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value.startsWith('@')) {
      // Parse and prefix the reference
      const match = value.match(/^@(\w+)\/([^.]+)(\..*)?$/);
      if (match) {
        const [, type, name, property = ''] = match;
        result[key] = `@${type}/${prefixResourceName(projectName, name)}${property}`;
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}
