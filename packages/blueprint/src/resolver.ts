/**
 * StackSolo Blueprint Resolver
 * Expands config into individual resources with proper typing
 */

import type {
  StackSoloConfig,
  ProjectConfig,
  NetworkConfig,
  ResolvedResource,
  ResolvedConfig,
  BucketConfig,
  SecretConfig,
  TopicConfig,
  QueueConfig,
  CronConfig,
  ContainerConfig,
  FunctionConfig,
  DatabaseConfig,
  CacheConfig,
  ServiceAccountConfig,
  SubnetConfig,
  FirewallRuleConfig,
} from './schema.js';

/**
 * Resolve a StackSolo config into individual resources
 */
export function resolveConfig(config: StackSoloConfig): ResolvedConfig {
  const resources: ResolvedResource[] = [];
  const project = config.project;

  // Extract project info
  const projectInfo = {
    name: project.name,
    region: project.region,
    gcpProjectId: project.gcpProjectId,
  };

  // Resolve global resources first (no network dependency)
  if (project.serviceAccount) {
    resources.push(resolveServiceAccount(project.serviceAccount, projectInfo.region));
  }

  if (project.buckets) {
    for (const bucket of project.buckets) {
      resources.push(resolveBucket(bucket, projectInfo.region));
    }
  }

  if (project.secrets) {
    for (const secret of project.secrets) {
      resources.push(resolveSecret(secret));
    }
  }

  if (project.topics) {
    for (const topic of project.topics) {
      resources.push(resolveTopic(topic));
    }
  }

  if (project.queues) {
    for (const queue of project.queues) {
      resources.push(resolveQueue(queue, projectInfo.region));
    }
  }

  // Resolve networks and their resources
  if (project.networks) {
    for (const network of project.networks) {
      resources.push(...resolveNetwork(network, projectInfo.region));
    }
  }

  // Resolve crons last (they reference other resources)
  if (project.crons) {
    for (const cron of project.crons) {
      resources.push(resolveCron(cron, projectInfo.region));
    }
  }

  return {
    project: projectInfo,
    resources,
    order: [], // Will be filled by dependency resolver
  };
}

// =============================================================================
// Resource Resolvers
// =============================================================================

function resolveServiceAccount(sa: ServiceAccountConfig, region: string): ResolvedResource {
  return {
    id: `service-account-${sa.name}`,
    type: 'gcp:service_account',
    name: sa.name,
    config: {
      name: sa.name,
      displayName: sa.displayName,
      description: sa.description,
      createKey: sa.createKey,
    },
    dependsOn: [],
  };
}

function resolveBucket(bucket: BucketConfig, defaultRegion: string): ResolvedResource {
  return {
    id: `bucket-${bucket.name}`,
    type: 'gcp:storage_bucket',
    name: bucket.name,
    config: {
      name: bucket.name,
      location: bucket.location || defaultRegion,
      storageClass: bucket.storageClass || 'STANDARD',
      versioning: bucket.versioning ?? false,
      uniformBucketLevelAccess: bucket.uniformBucketLevelAccess ?? true,
      publicAccess: bucket.publicAccess ?? false,
      cors: bucket.cors,
      lifecycle: bucket.lifecycle,
    },
    dependsOn: [],
  };
}

function resolveSecret(secret: SecretConfig): ResolvedResource {
  return {
    id: `secret-${secret.name}`,
    type: 'gcp:secret',
    name: secret.name,
    config: {
      name: secret.name,
      value: secret.value,
      labels: secret.labels,
    },
    dependsOn: [],
  };
}

function resolveTopic(topic: TopicConfig): ResolvedResource {
  return {
    id: `topic-${topic.name}`,
    type: 'gcp:pubsub_topic',
    name: topic.name,
    config: {
      name: topic.name,
      messageRetentionDuration: topic.messageRetentionDuration,
      labels: topic.labels,
    },
    dependsOn: [],
  };
}

function resolveQueue(queue: QueueConfig, defaultRegion: string): ResolvedResource {
  return {
    id: `queue-${queue.name}`,
    type: 'gcp:cloud_tasks',
    name: queue.name,
    config: {
      name: queue.name,
      location: queue.location || defaultRegion,
      rateLimits: queue.rateLimits,
      retryConfig: queue.retryConfig,
    },
    dependsOn: [],
  };
}

function resolveCron(cron: CronConfig, defaultRegion: string): ResolvedResource {
  // Parse target to determine dependencies
  const dependsOn: string[] = [];

  if (cron.target.startsWith('@')) {
    // Reference format: @container/name or @function/name
    const match = cron.target.match(/^@(container|function)\/([a-z0-9-]+)/);
    if (match) {
      const [, type, name] = match;
      dependsOn.push(`${type}-${name}`);
    }
  } else if (cron.target.includes('/')) {
    // Network/resource format: main/api
    const [network, resource] = cron.target.split('/');
    // Could be container or function - we'll resolve this later
    dependsOn.push(`container-${resource}`);
    dependsOn.push(`function-${resource}`);
  }

  return {
    id: `cron-${cron.name}`,
    type: 'gcp:scheduler_job',
    name: cron.name,
    config: {
      name: cron.name,
      schedule: cron.schedule,
      timezone: cron.timezone || 'UTC',
      description: cron.description,
      target: cron.target,
      path: cron.path,
      httpMethod: cron.method || 'GET',
      httpBody: cron.body,
      httpHeaders: cron.headers,
      retryCount: cron.retryCount ?? 3,
      attemptDeadline: cron.attemptDeadline || '180s',
    },
    dependsOn,
  };
}

// =============================================================================
// Network Resources
// =============================================================================

function resolveNetwork(network: NetworkConfig, defaultRegion: string): ResolvedResource[] {
  const resources: ResolvedResource[] = [];
  const networkId = `network-${network.name}`;
  const registryId = `registry-${network.name}`;

  // Create the VPC network
  resources.push({
    id: networkId,
    type: 'gcp:vpc_network',
    name: network.name,
    config: {
      name: network.name,
      description: network.description,
      autoCreateSubnetworks: network.autoCreateSubnetworks ?? false,
      routingMode: network.routingMode || 'REGIONAL',
      mtu: network.mtu || 1460,
    },
    dependsOn: [],
  });

  // Create subnets
  if (network.subnets) {
    for (const subnet of network.subnets) {
      resources.push(resolveSubnet(subnet, network.name, defaultRegion, networkId));
    }
  }

  // Create firewall rules
  if (network.firewallRules) {
    for (const rule of network.firewallRules) {
      resources.push(resolveFirewallRule(rule, network.name, networkId));
    }
  }

  // Auto-create Artifact Registry if containers or functions exist
  const hasContainers = network.containers && network.containers.length > 0;
  const hasFunctions = network.functions && network.functions.length > 0;

  if (hasContainers || hasFunctions) {
    resources.push({
      id: registryId,
      type: 'gcp:artifact_registry',
      name: `${network.name}-registry`,
      config: {
        name: `${network.name}-registry`,
        location: defaultRegion,
        format: 'DOCKER',
        description: `Container registry for ${network.name} network`,
      },
      dependsOn: [networkId],
      network: network.name,
    });
  }

  // Create containers (Cloud Run) - depend on registry if it exists
  if (network.containers) {
    for (const container of network.containers) {
      resources.push(resolveContainer(container, network.name, defaultRegion, networkId, registryId));
    }
  }

  // Create functions - depend on registry if it exists
  if (network.functions) {
    for (const fn of network.functions) {
      resources.push(resolveFunction(fn, network.name, defaultRegion, networkId, registryId));
    }
  }

  // Create databases
  if (network.databases) {
    for (const db of network.databases) {
      resources.push(resolveDatabase(db, network.name, defaultRegion, networkId));
    }
  }

  // Create caches
  if (network.caches) {
    for (const cache of network.caches) {
      resources.push(resolveCache(cache, network.name, defaultRegion, networkId));
    }
  }

  return resources;
}

function resolveSubnet(
  subnet: SubnetConfig,
  networkName: string,
  defaultRegion: string,
  networkId: string
): ResolvedResource {
  return {
    id: `subnet-${subnet.name}`,
    type: 'gcp:vpc_subnet',
    name: subnet.name,
    config: {
      name: subnet.name,
      network: networkName,
      region: subnet.region || defaultRegion,
      ipCidrRange: subnet.ipCidrRange,
      privateIpGoogleAccess: subnet.privateGoogleAccess ?? true,
      logConfig: subnet.flowLogs ?? false,
      secondaryIpRanges: subnet.secondaryRanges,
    },
    dependsOn: [networkId],
    network: networkName,
  };
}

function resolveFirewallRule(
  rule: FirewallRuleConfig,
  networkName: string,
  networkId: string
): ResolvedResource {
  return {
    id: `firewall-${rule.name}`,
    type: 'gcp:firewall',
    name: rule.name,
    config: {
      name: rule.name,
      network: networkName,
      direction: rule.direction || 'INGRESS',
      priority: rule.priority ?? 1000,
      action: rule.action || 'allow',
      protocol: rule.protocol || 'tcp',
      ports: rule.ports,
      sourceRanges: rule.sourceRanges,
      targetTags: rule.targetTags,
      description: rule.description,
    },
    dependsOn: [networkId],
    network: networkName,
  };
}

function resolveContainer(
  container: ContainerConfig,
  networkName: string,
  defaultRegion: string,
  networkId: string,
  registryId?: string
): ResolvedResource {
  const dependsOn = [networkId];

  // Depend on registry if it exists
  if (registryId) {
    dependsOn.push(registryId);
  }

  // Parse env references to find dependencies
  if (container.env) {
    for (const value of Object.values(container.env)) {
      if (typeof value === 'string' && value.startsWith('@')) {
        const dep = parseReferenceToDependency(value);
        if (dep) dependsOn.push(dep);
      }
    }
  }

  // Parse secrets references
  if (container.secrets) {
    for (const secretRef of Object.values(container.secrets)) {
      if (typeof secretRef === 'string' && secretRef.startsWith('@')) {
        const dep = parseReferenceToDependency(secretRef);
        if (dep) dependsOn.push(dep);
      }
    }
  }

  return {
    id: `container-${container.name}`,
    type: 'gcp:cloud_run',
    name: container.name,
    config: {
      name: container.name,
      image: container.image,
      port: container.port || 8080,
      memory: container.memory || '512Mi',
      cpu: container.cpu || '1',
      minInstances: container.minInstances ?? 0,
      maxInstances: container.maxInstances ?? 100,
      concurrency: container.concurrency ?? 80,
      timeout: container.timeout || '300s',
      allowUnauthenticated: container.allowUnauthenticated ?? true,
      env: container.env,
      secrets: container.secrets,
      serviceAccount: container.serviceAccount,
      vpcConnector: container.vpcConnector,
      labels: container.labels,
      location: defaultRegion,
    },
    dependsOn: [...new Set(dependsOn)], // Deduplicate
    network: networkName,
  };
}

function resolveFunction(
  fn: FunctionConfig,
  networkName: string,
  defaultRegion: string,
  networkId: string,
  registryId?: string
): ResolvedResource {
  const dependsOn = [networkId];

  // Depend on registry if it exists
  if (registryId) {
    dependsOn.push(registryId);
  }

  // Parse env references to find dependencies
  if (fn.env) {
    for (const value of Object.values(fn.env)) {
      if (typeof value === 'string' && value.startsWith('@')) {
        const dep = parseReferenceToDependency(value);
        if (dep) dependsOn.push(dep);
      }
    }
  }

  // Parse secrets references
  if (fn.secrets) {
    for (const secretRef of Object.values(fn.secrets)) {
      if (typeof secretRef === 'string' && secretRef.startsWith('@')) {
        const dep = parseReferenceToDependency(secretRef);
        if (dep) dependsOn.push(dep);
      }
    }
  }

  // Check trigger dependencies
  if (fn.trigger) {
    if (fn.trigger.type === 'pubsub' && fn.trigger.topic) {
      dependsOn.push(`topic-${fn.trigger.topic}`);
    }
    if (fn.trigger.type === 'storage' && fn.trigger.bucket) {
      dependsOn.push(`bucket-${fn.trigger.bucket}`);
    }
  }

  return {
    id: `function-${fn.name}`,
    type: 'gcp:cloud_function',
    name: fn.name,
    config: {
      name: fn.name,
      sourceDir: fn.sourceDir || 'functions',
      entryPoint: fn.entryPoint || fn.name,
      runtime: fn.runtime || 'nodejs20',
      memory: fn.memory || '256Mi',
      minInstances: fn.minInstances ?? 0,
      maxInstances: fn.maxInstances ?? 100,
      timeout: fn.timeout || 60,
      allowUnauthenticated: fn.allowUnauthenticated ?? true,
      env: fn.env,
      secrets: fn.secrets,
      serviceAccount: fn.serviceAccount,
      vpcConnector: fn.vpcConnector,
      labels: fn.labels,
      location: defaultRegion,
      trigger: fn.trigger,
    },
    dependsOn: [...new Set(dependsOn)],
    network: networkName,
  };
}

function resolveDatabase(
  db: DatabaseConfig,
  networkName: string,
  defaultRegion: string,
  networkId: string
): ResolvedResource {
  return {
    id: `database-${db.name}`,
    type: 'gcp:cloud_sql',
    name: db.name,
    config: {
      name: db.name,
      databaseVersion: db.databaseVersion || 'POSTGRES_15',
      tier: db.tier || 'db-f1-micro',
      diskSize: db.diskSize || 10,
      diskType: db.diskType || 'PD_SSD',
      databaseName: db.databaseName || db.name,
      enablePublicIp: db.enablePublicIp ?? false,
      requireSsl: db.requireSsl ?? true,
      backupEnabled: db.backupEnabled ?? true,
      backupStartTime: db.backupStartTime || '02:00',
      maintenanceWindowDay: db.maintenanceWindowDay ?? 7,
      maintenanceWindowHour: db.maintenanceWindowHour ?? 3,
      flags: db.flags,
      labels: db.labels,
      region: defaultRegion,
      network: networkName,
    },
    dependsOn: [networkId],
    network: networkName,
  };
}

function resolveCache(
  cache: CacheConfig,
  networkName: string,
  defaultRegion: string,
  networkId: string
): ResolvedResource {
  return {
    id: `cache-${cache.name}`,
    type: 'gcp:memorystore',
    name: cache.name,
    config: {
      name: cache.name,
      tier: cache.tier || 'BASIC',
      memorySizeGb: cache.memorySizeGb || 1,
      redisVersion: cache.redisVersion || 'REDIS_7_0',
      authEnabled: cache.authEnabled ?? false,
      transitEncryptionMode: cache.transitEncryptionMode || 'DISABLED',
      labels: cache.labels,
      region: defaultRegion,
      authorizedNetwork: networkName,
    },
    dependsOn: [networkId],
    network: networkName,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse a reference string to a dependency ID
 */
function parseReferenceToDependency(ref: string): string | null {
  // @secret/api-key -> secret-api-key
  // @database/db.connectionString -> database-db
  // @bucket/uploads -> bucket-uploads
  const match = ref.match(/^@([a-z]+)\/([a-z0-9-]+)/);
  if (!match) return null;

  const [, type, name] = match;
  return `${type}-${name}`;
}

/**
 * Get all resource IDs from resolved config
 */
export function getResourceIds(resolved: ResolvedConfig): string[] {
  return resolved.resources.map((r) => r.id);
}

/**
 * Find a resource by ID
 */
export function findResource(resolved: ResolvedConfig, id: string): ResolvedResource | undefined {
  return resolved.resources.find((r) => r.id === id);
}

/**
 * Find resources by type
 */
export function findResourcesByType(resolved: ResolvedConfig, type: string): ResolvedResource[] {
  return resolved.resources.filter((r) => r.type === type);
}

/**
 * Find resources by network
 */
export function findResourcesByNetwork(resolved: ResolvedConfig, network: string): ResolvedResource[] {
  return resolved.resources.filter((r) => r.network === network);
}
