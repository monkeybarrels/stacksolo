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
  LoadBalancerRouteConfig,
  UIConfig,
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

  // CDKTF backend uses composite resources
  if (project.backend === 'cdktf') {
    return resolveCdktfConfig(config, projectInfo);
  }

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
      sourceDir: fn.sourceDir || `functions/${fn.name}`,
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

// =============================================================================
// CDKTF Backend Resolution
// =============================================================================

/**
 * Resolve config for CDKTF backend
 * Creates individual resources: vpc_network, vpc_connector, cloud_function, load_balancer
 */
function resolveCdktfConfig(
  config: StackSoloConfig,
  projectInfo: { name: string; region: string; gcpProjectId: string }
): ResolvedConfig {
  const project = config.project;
  const resources: ResolvedResource[] = [];

  // Validate CDKTF-compatible config
  const network = project.networks?.[0];
  if (!network) {
    throw new Error('CDKTF backend requires at least one network with a function');
  }

  const functions = network.functions || [];
  const containers = network.containers || [];
  const uis = network.uis || [];

  if (functions.length === 0 && containers.length === 0 && uis.length === 0) {
    throw new Error('CDKTF backend requires at least one function, container, or UI in the network');
  }

  // Check for unsupported resources
  if (network.databases?.length) {
    throw new Error('CDKTF backend does not support databases. Use backend: "pulumi" instead.');
  }
  if (network.caches?.length) {
    throw new Error('CDKTF backend does not support caches. Use backend: "pulumi" instead.');
  }
  if (project.crons?.length) {
    throw new Error('CDKTF backend does not support crons. Use backend: "pulumi" instead.');
  }

  // Check if using existing network (skip VPC creation)
  const useExistingNetwork = network.existing === true;
  const networkName = useExistingNetwork ? network.name : `${projectInfo.name}-${network.name}`;
  const connectorName = `${projectInfo.name}-connector`;

  const networkId = `network-${network.name}`;
  const connectorId = `connector-${network.name}`;
  const lbName = `${projectInfo.name}-lb`;
  const loadBalancerId = `lb-${network.name}`;

  // 1. VPC Network (skip if using existing)
  if (!useExistingNetwork) {
    resources.push({
      id: networkId,
      type: 'gcp-cdktf:vpc_network',
      name: networkName,
      config: {
        name: networkName,
        description: network.description,
        autoCreateSubnetworks: network.autoCreateSubnetworks ?? true,
      },
      dependsOn: [],
      network: network.name,
    });
  }

  // 2. VPC Access Connector (references existing or new network by name)
  resources.push({
    id: connectorId,
    type: 'gcp-cdktf:vpc_connector',
    name: connectorName,
    config: {
      name: connectorName,
      region: projectInfo.region,
      network: networkName,
      existingNetwork: useExistingNetwork, // Flag to use data source instead of resource reference
      ipCidrRange: '10.8.0.0/28',
      minThroughput: 200,
      maxThroughput: 300,
    },
    dependsOn: useExistingNetwork ? [] : [networkId],
    network: network.name,
  });

  // 3. Artifact Registry (if containers exist)
  const registryName = `${projectInfo.name}-registry`;
  const registryId = `registry-${network.name}`;

  if (containers.length > 0) {
    resources.push({
      id: registryId,
      type: 'gcp-cdktf:artifact_registry',
      name: registryName,
      config: {
        name: registryName,
        location: projectInfo.region,
        format: 'DOCKER',
        description: `Container registry for ${projectInfo.name}`,
        projectId: projectInfo.gcpProjectId,
      },
      dependsOn: [],
      network: network.name,
    });
  }

  // 4. Cloud Run containers
  const containerIds: string[] = [];
  const containerNames: string[] = [];

  for (const container of containers) {
    const containerName = `${projectInfo.name}-${container.name}`;
    const containerId = `container-${container.name}`;
    containerIds.push(containerId);
    containerNames.push(containerName);

    // Build image URL from Artifact Registry
    const imageUrl = container.image ||
      `${projectInfo.region}-docker.pkg.dev/${projectInfo.gcpProjectId}/${registryName}/${container.name}:latest`;

    resources.push({
      id: containerId,
      type: 'gcp-cdktf:cloud_run',
      name: containerName,
      config: {
        name: containerName,
        location: projectInfo.region,
        image: imageUrl,
        port: container.port || 8080,
        memory: container.memory || '512Mi',
        cpu: container.cpu || '1',
        minInstances: container.minInstances ?? 0,
        maxInstances: container.maxInstances ?? 100,
        concurrency: container.concurrency ?? 80,
        timeout: container.timeout || '300s',
        vpcConnector: connectorName,
        allowUnauthenticated: container.allowUnauthenticated ?? true,
        environmentVariables: container.env,
        projectId: projectInfo.gcpProjectId,
        projectName: projectInfo.name,
      },
      dependsOn: [connectorId, registryId],
      network: network.name,
    });
  }

  // 5. Cloud Functions (Gen2) - create one for each function in config
  const functionIds: string[] = [];
  const functionNames: string[] = [];

  for (const fn of functions) {
    const functionName = `${projectInfo.name}-${fn.name}`;
    const functionId = `function-${fn.name}`;
    functionIds.push(functionId);
    functionNames.push(functionName);

    resources.push({
      id: functionId,
      type: 'gcp-cdktf:cloud_function',
      name: functionName,
      config: {
        name: functionName,
        location: projectInfo.region,
        sourceDir: fn.sourceDir || `functions/${fn.name}`,
        entryPoint: fn.entryPoint || fn.name,
        runtime: fn.runtime || 'nodejs20',
        memory: fn.memory || '256Mi',
        timeout: fn.timeout || 60,
        minInstances: fn.minInstances ?? 0,
        maxInstances: fn.maxInstances ?? 100,
        vpcConnector: connectorName,
        allowUnauthenticated: fn.allowUnauthenticated ?? true,
        projectId: projectInfo.gcpProjectId,
      },
      dependsOn: [connectorId],
      network: network.name,
    });
  }

  // 4. Static UI Sites (Storage Website + CDN)
  const uiIds: string[] = [];
  const uiNames: string[] = [];

  for (const ui of uis) {
    const uiName = `${projectInfo.name}-${ui.name}`;
    const uiId = `ui-${ui.name}`;
    uiIds.push(uiId);
    uiNames.push(uiName);

    resources.push({
      id: uiId,
      type: 'gcp-cdktf:storage_website',
      name: uiName,
      config: {
        name: uiName,
        location: 'US', // Multi-region for CDN
        sourceDir: ui.sourceDir || `apps/${ui.name}`,
        framework: ui.framework,
        buildCommand: ui.buildCommand || 'npm run build',
        buildOutputDir: ui.buildOutputDir,
        indexDocument: ui.indexDocument || 'index.html',
        errorDocument: ui.errorDocument || 'index.html',
        enableCdn: true,
        projectId: projectInfo.gcpProjectId,
      },
      dependsOn: [],
      network: network.name,
    });
  }

  // 7. Load Balancer (HTTP) - routes to functions, containers, and UIs based on loadBalancer config
  // Build default routes if none specified
  let routes: LoadBalancerRouteConfig[];
  if (network.loadBalancer?.routes) {
    routes = network.loadBalancer.routes;
  } else if (containers.length > 0) {
    // Default to first container if no explicit routes
    routes = [{ path: '/*', backend: containers[0].name }];
  } else if (functions.length > 0) {
    routes = [{ path: '/*', backend: functions[0].name }];
  } else if (uis.length > 0) {
    routes = [{ path: '/*', backend: uis[0].name }];
  } else {
    routes = [];
  }

  // Map routes to function, container, or UI backends
  const mappedRoutes = routes.map((r: LoadBalancerRouteConfig) => {
    // Check if backend is a UI
    const isUI = uis.some(ui => ui.name === r.backend);
    if (isUI) {
      return {
        path: r.path,
        uiName: `${projectInfo.name}-${r.backend}`,
      };
    }
    // Check if backend is a container
    const isContainer = containers.some(c => c.name === r.backend);
    if (isContainer) {
      return {
        path: r.path,
        containerName: `${projectInfo.name}-${r.backend}`,
      };
    }
    // Otherwise it's a function
    return {
      path: r.path,
      functionName: `${projectInfo.name}-${r.backend}`,
    };
  });

  // Only create load balancer if we have routes
  if (routes.length > 0) {
    resources.push({
      id: loadBalancerId,
      type: 'gcp-cdktf:load_balancer',
      name: lbName,
      config: {
        name: lbName,
        region: projectInfo.region,
        routes: mappedRoutes,
        // Keep single function for backwards compat (if functions exist)
        functionName: functionNames.length > 0 ? functionNames[0] : undefined,
      },
      dependsOn: [...containerIds, ...functionIds, ...uiIds],
      network: network.name,
    });
  }

  return {
    project: projectInfo,
    resources,
    order: resources.map((r) => r.id),
  };
}
