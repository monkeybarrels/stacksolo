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
  KubernetesConfig,
} from './schema.js';

import {
  getLoadBalancerName,
  getBackendServiceName,
  type NamingContext,
} from './naming.js';

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

  // Route to backend-specific resolvers
  if (project.backend === 'kubernetes') {
    return resolveKubernetesConfig(config, projectInfo);
  }

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

  // Create storage buckets defined at network level
  if (network.storageBuckets) {
    for (const bucket of network.storageBuckets) {
      resources.push({
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
        network: network.name,
      });
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
    type: 'gcp-cdktf:cloud_run',
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
    type: 'gcp-cdktf:cloud_function',
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
  const hasKernelConfig = !!project.kernel;
  const hasGcpKernelConfig = !!project.gcpKernel;

  if (functions.length === 0 && containers.length === 0 && uis.length === 0 && !hasKernelConfig && !hasGcpKernelConfig) {
    throw new Error('CDKTF backend requires at least one function, container, kernel, gcpKernel, or UI');
  }

  // Can't use both kernel types
  if (hasKernelConfig && hasGcpKernelConfig) {
    throw new Error('Cannot use both `kernel` and `gcpKernel`. Choose one: NATS-based (kernel) or GCP-native (gcpKernel).');
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

  // Validate IAP requires HTTPS (domain + enableHttps)
  if (project.zeroTrust?.iapWebBackends?.length) {
    const lbConfig = network.loadBalancer;
    if (!lbConfig?.domain || !lbConfig?.enableHttps) {
      throw new Error(
        'IAP (Identity-Aware Proxy) requires HTTPS. Please configure loadBalancer with:\n' +
        '  - domain: your domain (e.g., "app.example.com")\n' +
        '  - enableHttps: true\n' +
        '  - redirectHttpToHttps: true (recommended)\n\n' +
        'Example:\n' +
        '  loadBalancer:\n' +
        '    name: my-lb\n' +
        '    domain: app.example.com\n' +
        '    enableHttps: true\n' +
        '    redirectHttpToHttps: true\n' +
        '    routes: [...]\n\n' +
        'Note: DNS for the domain must point to the load balancer IP after deployment.'
      );
    }
  }

  // Check if using existing network (skip VPC creation)
  const useExistingNetwork = network.existing === true;
  const networkName = useExistingNetwork ? network.name : `${projectInfo.name}-${network.name}`;
  const connectorName = `${projectInfo.name}-connector`;

  // =========================================================================
  // Build lookup maps for resolving @function/ and @container/ references
  // These allow env vars like "@function/mcp.url" to resolve to CDKTF code refs
  // =========================================================================
  function toVariableName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
  }

  // Map short function name (e.g., "mcp") to CDKTF expression (e.g., "claimready_mcpFunction.url")
  const functionUrlRefs = new Map<string, string>();
  for (const fn of functions) {
    const fullName = `${projectInfo.name}-${fn.name}`;
    const varName = toVariableName(fullName);
    functionUrlRefs.set(fn.name, `${varName}Function.url`);
  }

  // Map short container name to CDKTF expression
  const containerUrlRefs = new Map<string, string>();
  for (const container of containers) {
    const fullName = `${projectInfo.name}-${container.name}`;
    const varName = toVariableName(fullName);
    containerUrlRefs.set(container.name, `${varName}Service.status.get(0).url`);
  }

  /**
   * Resolve @function/ and @container/ references in env vars to CDKTF interpolation strings.
   * This allows cross-resource references at deploy time.
   *
   * Examples:
   *   "@function/mcp.url" -> "${claimready_mcpFunction.url}"
   *   "@function/mcp" -> "${claimready_mcpFunction.url}" (url is default)
   *   "@container/api.url" -> "${claimready_apiService.status.get(0).url}"
   */
  function resolveCdktfEnvReferences(env: Record<string, string> | undefined): Record<string, string> {
    if (!env) return {};
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.startsWith('@function/')) {
        // Match @function/name or @function/name.url
        const match = value.match(/^@function\/([a-z0-9-]+)(?:\.url)?$/);
        if (match) {
          const fnName = match[1];
          const cdktfRef = functionUrlRefs.get(fnName);
          if (cdktfRef) {
            // Wrap in ${} for CDKTF interpolation - resource generators will unwrap it
            resolved[key] = `\${${cdktfRef}}`;
            continue;
          }
        }
      }
      if (typeof value === 'string' && value.startsWith('@container/')) {
        const match = value.match(/^@container\/([a-z0-9-]+)(?:\.url)?$/);
        if (match) {
          const containerName = match[1];
          const cdktfRef = containerUrlRefs.get(containerName);
          if (cdktfRef) {
            resolved[key] = `\${${cdktfRef}}`;
            continue;
          }
        }
      }
      resolved[key] = value;
    }
    return resolved;
  }

  const networkId = `network-${network.name}`;
  const connectorId = `connector-${network.name}`;
  // Use centralized naming for load balancer
  const namingCtx: NamingContext = { projectName: projectInfo.name, networkName: network.name };
  const lbName = getLoadBalancerName(namingCtx);
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

  // 3. Artifact Registry (if containers or NATS kernel exist - GCP kernel doesn't need registry)
  const registryName = `${projectInfo.name}-registry`;
  const registryId = `registry-${network.name}`;
  const hasKernel = !!project.kernel;
  const hasGcpKernel = !!project.gcpKernel;

  if (containers.length > 0 || hasKernel) {
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

  // 3b. Storage Buckets (from network.storageBuckets)
  // These are created before functions/containers so they can be used as trigger sources
  const storageBuckets = network.storageBuckets || [];
  for (const bucket of storageBuckets) {
    const bucketId = `bucket-${bucket.name}`;
    resources.push({
      id: bucketId,
      type: 'gcp-cdktf:storage_bucket',
      name: bucket.name,
      config: {
        name: bucket.name,
        location: bucket.location || projectInfo.region,
        storageClass: bucket.storageClass || 'STANDARD',
        uniformBucketLevelAccess: bucket.uniformBucketLevelAccess ?? true,
        versioning: bucket.versioning ?? false,
        projectId: projectInfo.gcpProjectId,
        projectName: projectInfo.name,
      },
      dependsOn: [],
      network: network.name,
    });
  }

  // 4. Kernel (special container at project level)
  const kernelIds: string[] = [];
  const kernelNames: string[] = [];
  let kernelBucketName: string | undefined;
  let kernelBucketId: string | undefined;

  if (project.kernel) {
    const kernelName = `${projectInfo.name}-${project.kernel.name}`;
    const kernelId = `kernel-${project.kernel.name}`;
    kernelIds.push(kernelId);
    kernelNames.push(kernelName);

    // Auto-create a bucket for kernel file operations if not specified
    kernelBucketName = project.kernel.gcsBucket || `${projectInfo.gcpProjectId}-${projectInfo.name}-kernel-files`;
    kernelBucketId = `bucket-kernel-files`;

    // Only create the bucket if not explicitly specified (user may have existing bucket)
    if (!project.kernel.gcsBucket) {
      resources.push({
        id: kernelBucketId,
        type: 'gcp-cdktf:storage_bucket',
        name: kernelBucketName,
        config: {
          name: kernelBucketName,
          location: projectInfo.region,
          storageClass: 'STANDARD',
          uniformBucketLevelAccess: true,
          versioning: false,
          cors: [{
            origin: ['*'],
            method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
            responseHeader: ['Content-Type', 'Authorization'],
            maxAgeSeconds: 3600,
          }],
          projectId: projectInfo.gcpProjectId,
        },
        dependsOn: [],
        network: network.name,
      });
    }

    // Build image URL from Artifact Registry
    const imageUrl = `${projectInfo.region}-docker.pkg.dev/${projectInfo.gcpProjectId}/${registryName}/${project.kernel.name}:latest`;

    // Kernel environment variables
    const kernelEnv: Record<string, string> = {
      FIREBASE_PROJECT_ID: project.kernel.firebaseProjectId || projectInfo.gcpProjectId,
      GCS_BUCKET: kernelBucketName,
      GCP_PROJECT_ID: projectInfo.gcpProjectId,
      STACKSOLO_PROJECT_NAME: projectInfo.name,
      ...project.kernel.env,
    };

    resources.push({
      id: kernelId,
      type: 'gcp-cdktf:cloud_run',
      name: kernelName,
      config: {
        name: kernelName,
        location: projectInfo.region,
        image: imageUrl,
        port: 8090, // Kernel default port
        memory: project.kernel.memory || '512Mi',
        cpu: project.kernel.cpu || '1',
        minInstances: project.kernel.minInstances ?? 0,
        maxInstances: project.kernel.maxInstances ?? 100,
        concurrency: 80,
        timeout: '300s',
        vpcConnector: connectorName,
        allowUnauthenticated: true,
        environmentVariables: kernelEnv,
        projectId: projectInfo.gcpProjectId,
        projectName: projectInfo.name,
      },
      dependsOn: project.kernel.gcsBucket
        ? [connectorId, registryId]
        : [connectorId, registryId, kernelBucketId],
      network: network.name,
    });
  }

  // 4b. GCP Kernel (serverless Cloud Run + Pub/Sub - no NATS)
  if (hasGcpKernel && project.gcpKernel) {
    const gcpKernelName = `${projectInfo.name}-${project.gcpKernel.name}`;
    const gcpKernelId = `gcp-kernel-${project.gcpKernel.name}`;
    kernelIds.push(gcpKernelId);
    kernelNames.push(gcpKernelName);

    resources.push({
      id: gcpKernelId,
      type: 'gcp-kernel:gcp_kernel',
      name: gcpKernelName,
      config: {
        name: project.gcpKernel.name,
        location: projectInfo.region,
        memory: project.gcpKernel.memory || '512Mi',
        cpu: project.gcpKernel.cpu || '1',
        minInstances: project.gcpKernel.minInstances ?? 0,
        maxInstances: project.gcpKernel.maxInstances ?? 10,
        firebaseProjectId: project.gcpKernel.firebaseProjectId,
        storageBucket: project.gcpKernel.storageBucket,
        eventRetentionDays: project.gcpKernel.eventRetentionDays ?? 7,
        projectId: projectInfo.gcpProjectId,
      },
      dependsOn: [connectorId],
      network: network.name,
    });
  }

  // 5. Cloud Run containers
  const containerIds: string[] = [];
  const containerNames: string[] = [];

  // Determine KERNEL_URL if zeroTrustAuth is configured
  // The kernel URL is needed for containers using the zero-trust-auth runtime
  let kernelUrl: string | undefined;
  if (project.zeroTrustAuth && hasGcpKernel && project.gcpKernel) {
    // The kernel variable name is derived from gcpKernel.name using toVariableName()
    // e.g., "kernel" -> "kernelService", "my-kernel" -> "my_kernelService"
    const kernelVarName = project.gcpKernel.name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
    // Use CDKTF reference to the kernel service URI
    kernelUrl = `\${${kernelVarName}Service.uri}`;
  }

  for (const container of containers) {
    const containerName = `${projectInfo.name}-${container.name}`;
    const containerId = `container-${container.name}`;
    containerIds.push(containerId);
    containerNames.push(containerName);

    // Build image URL from Artifact Registry
    const imageUrl = container.image ||
      `${projectInfo.region}-docker.pkg.dev/${projectInfo.gcpProjectId}/${registryName}/${container.name}:latest`;

    // Merge container env with kernel URL if zeroTrustAuth is configured
    // Then resolve @function/ and @container/ references to CDKTF interpolations
    const containerEnvRaw = { ...container.env };
    if (kernelUrl) {
      containerEnvRaw.KERNEL_URL = kernelUrl;
    }
    // Auto-inject FIREBASE_PROJECT_ID if not set (prevents Firebase auth issues)
    if (!containerEnvRaw.FIREBASE_PROJECT_ID) {
      containerEnvRaw.FIREBASE_PROJECT_ID = projectInfo.gcpProjectId;
    }
    // Resolve @function/ and @container/ references to CDKTF code references
    const containerEnv = resolveCdktfEnvReferences(containerEnvRaw);

    // Container depends on kernel if zeroTrustAuth is configured
    const containerDeps = [connectorId, registryId];
    if (project.zeroTrustAuth && hasGcpKernel) {
      containerDeps.push(`gcp-kernel-${project.gcpKernel?.name}`);
    }

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
        environmentVariables: containerEnv,
        projectId: projectInfo.gcpProjectId,
        projectName: projectInfo.name,
      },
      dependsOn: containerDeps,
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

    // Build environment variables
    // Auto-inject GOOGLE_CLOUD_PROJECT when gcpKernel is configured (required for Firebase/Firestore)
    // Auto-inject FIREBASE_PROJECT_ID if not set (prevents Firebase auth token validation issues)
    // Then resolve @function/ and @container/ references to CDKTF interpolations
    const functionEnvRaw: Record<string, string> = {
      ...(hasGcpKernel ? { GOOGLE_CLOUD_PROJECT: projectInfo.gcpProjectId } : {}),
      ...fn.env,
    };
    if (!functionEnvRaw.FIREBASE_PROJECT_ID) {
      functionEnvRaw.FIREBASE_PROJECT_ID = projectInfo.gcpProjectId;
    }
    // Resolve @function/ and @container/ references to CDKTF code references
    const functionEnv = resolveCdktfEnvReferences(functionEnvRaw);

    // Build dependencies - include trigger bucket/topic if present
    const functionDeps = [connectorId];
    if (fn.trigger?.type === 'storage' && fn.trigger.bucket) {
      // Check if this bucket is in storageBuckets (network-scoped)
      const storageBuckets = network.storageBuckets || [];
      if (storageBuckets.some(b => b.name === fn.trigger!.bucket)) {
        functionDeps.push(`bucket-${fn.trigger.bucket}`);
      }
    } else if (fn.trigger?.type === 'pubsub' && fn.trigger.topic) {
      functionDeps.push(`topic-${fn.trigger.topic}`);
    }

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
        projectName: projectInfo.name,
        environmentVariables: Object.keys(functionEnv).length > 0 ? functionEnv : undefined,
        trigger: fn.trigger,
      },
      dependsOn: functionDeps,
      network: network.name,
    });
  }

  // 4. Static UI Sites (Storage Website + CDN) - skip Firebase-hosted UIs
  const uiIds: string[] = [];
  const uiNames: string[] = [];
  const gcsUis = uis.filter(ui => ui.hosting !== 'firebase');
  const firebaseUis = uis.filter(ui => ui.hosting === 'firebase');

  for (const ui of gcsUis) {
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
        originalName: ui.name, // Short name for route matching
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

  // Firebase-hosted UIs are tracked but not created as CDKTF resources
  // They will be deployed via `firebase deploy --only hosting` in deploy command
  for (const ui of firebaseUis) {
    const uiId = `ui-${ui.name}`;
    uiIds.push(uiId);
    uiNames.push(`${projectInfo.name}-${ui.name}`);
  }

  // 7. Load Balancer (HTTP) - routes to functions, containers, and UIs based on loadBalancer config
  // Build default routes if none specified (only GCS-hosted UIs can be load-balanced)
  let routes: LoadBalancerRouteConfig[];
  if (network.loadBalancer?.routes) {
    routes = network.loadBalancer.routes;
  } else if (containers.length > 0) {
    // Default to first container if no explicit routes
    routes = [{ path: '/*', backend: containers[0].name }];
  } else if (functions.length > 0) {
    routes = [{ path: '/*', backend: functions[0].name }];
  } else if (gcsUis.length > 0) {
    // Only GCS-hosted UIs can be load-balanced (Firebase Hosting has its own CDN)
    routes = [{ path: '/*', backend: gcsUis[0].name }];
  } else {
    routes = [];
  }

  // Map routes to function, container, or UI backends
  const mappedRoutes = routes.map((r: LoadBalancerRouteConfig) => {
    // Check if backend is a GCS-hosted UI (Firebase UIs can't be load-balanced)
    const isGcsUI = gcsUis.some(ui => ui.name === r.backend);
    if (isGcsUI) {
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
    // Get HTTPS configuration from loadBalancer config
    const lbHttpsConfig = network.loadBalancer as { domain?: string; enableHttps?: boolean; redirectHttpToHttps?: boolean } | undefined;

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
        // HTTPS configuration
        domain: lbHttpsConfig?.domain,
        enableHttps: lbHttpsConfig?.enableHttps,
        redirectHttpToHttps: lbHttpsConfig?.redirectHttpToHttps,
      },
      dependsOn: [...kernelIds, ...containerIds, ...functionIds, ...uiIds],
      network: network.name,
    });
  }

  // 8. Zero Trust IAP Web Backends (depends on load balancer backend services)
  if (project.zeroTrust?.iapWebBackends) {
    for (const iapConfig of project.zeroTrust.iapWebBackends) {
      // Use centralized naming utility for consistent backend service names
      const backendServiceName = getBackendServiceName(namingCtx, iapConfig.backend);

      resources.push({
        id: `iap-web-backend-${iapConfig.name}`,
        type: 'zero-trust:iap_web_backend',
        name: iapConfig.name,
        config: {
          name: iapConfig.name,
          backendService: backendServiceName,
          allowedMembers: iapConfig.allowedMembers,
          supportEmail: iapConfig.supportEmail,
          applicationTitle: iapConfig.applicationTitle || `${projectInfo.name} - ${iapConfig.name}`,
          projectId: projectInfo.gcpProjectId,
        },
        dependsOn: [loadBalancerId],
        network: network.name,
      });
    }
  }

  return {
    project: projectInfo,
    resources,
    order: resources.map((r) => r.id),
  };
}

// =============================================================================
// Kubernetes Backend Resolution
// =============================================================================

/**
 * Resolve config for Kubernetes backend
 * Creates K8s resources: Namespace, ConfigMap, Deployments, Services, Ingress
 */
function resolveKubernetesConfig(
  config: StackSoloConfig,
  projectInfo: { name: string; region: string; gcpProjectId: string }
): ResolvedConfig {
  const project = config.project;
  const resources: ResolvedResource[] = [];

  // Validate kubernetes config is present
  if (!project.kubernetes) {
    throw new Error('Kubernetes backend requires kubernetes configuration with registry settings');
  }

  const k8sConfig = project.kubernetes;
  const namespace = k8sConfig.namespace || project.name;

  // Validate we have at least one network with deployable resources
  const network = project.networks?.[0];
  if (!network) {
    throw new Error('Kubernetes backend requires at least one network with containers or functions');
  }

  const containers = network.containers || [];
  const functions = network.functions || [];
  const uis = network.uis || [];
  const hasKernel = !!project.kernel;

  if (containers.length === 0 && functions.length === 0 && uis.length === 0 && !hasKernel) {
    throw new Error('Kubernetes backend requires at least one container, function, UI, or kernel');
  }

  // Kubernetes doesn't support GCP-native features
  if (project.gcpKernel) {
    throw new Error('Kubernetes backend uses kernel (NATS-based), not gcpKernel. Remove gcpKernel or use backend: "cdktf"');
  }
  if (project.crons?.length) {
    throw new Error('Kubernetes backend does not support crons. Use CronJob resources directly or backend: "cdktf"');
  }

  // 1. Namespace
  const namespaceId = 'k8s-namespace';
  resources.push({
    id: namespaceId,
    type: 'k8s:namespace',
    name: namespace,
    config: {
      name: namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'stacksolo',
        'stacksolo.dev/project': project.name,
      },
    },
    dependsOn: [],
  });

  // 2. ConfigMap for environment variables
  const configMapId = 'k8s-configmap';
  const configMapEnv: Record<string, string> = {
    STACKSOLO_PROJECT_NAME: project.name,
    GCP_PROJECT_ID: project.gcpProjectId,
  };
  resources.push({
    id: configMapId,
    type: 'k8s:configmap',
    name: `${project.name}-config`,
    config: {
      name: `${project.name}-config`,
      namespace,
      data: configMapEnv,
    },
    dependsOn: [namespaceId],
  });

  // 3. Kernel (if configured)
  const kernelIds: string[] = [];
  if (project.kernel) {
    const kernelName = `${project.name}-${project.kernel.name}`;
    const kernelId = `k8s-kernel-${project.kernel.name}`;
    kernelIds.push(kernelId);

    resources.push({
      id: kernelId,
      type: 'k8s:deployment',
      name: kernelName,
      config: {
        name: kernelName,
        namespace,
        image: `${k8sConfig.registry.url}/${project.kernel.name}:latest`,
        port: 8090,
        replicas: k8sConfig.replicas || 1,
        memory: project.kernel.memory || '512Mi',
        cpu: project.kernel.cpu || '500m',
        env: {
          ...configMapEnv,
          ...project.kernel.env,
        },
        imagePullSecret: k8sConfig.registry.authSecret,
        resourceDefaults: k8sConfig.resources,
      },
      dependsOn: [namespaceId, configMapId],
      network: network.name,
    });

    // Kernel Service
    resources.push({
      id: `k8s-service-${project.kernel.name}`,
      type: 'k8s:service',
      name: kernelName,
      config: {
        name: kernelName,
        namespace,
        port: 8090,
        targetPort: 8090,
        selector: kernelName,
      },
      dependsOn: [kernelId],
      network: network.name,
    });
  }

  // 4. Containers
  const containerIds: string[] = [];
  for (const container of containers) {
    const containerName = `${project.name}-${container.name}`;
    const containerId = `k8s-deployment-${container.name}`;
    containerIds.push(containerId);

    resources.push({
      id: containerId,
      type: 'k8s:deployment',
      name: containerName,
      config: {
        name: containerName,
        namespace,
        image: container.image || `${k8sConfig.registry.url}/${container.name}:latest`,
        port: container.port || 8080,
        replicas: container.minInstances || k8sConfig.replicas || 1,
        memory: container.memory || k8sConfig.resources?.defaultMemoryLimit || '512Mi',
        cpu: container.cpu || k8sConfig.resources?.defaultCpuLimit || '500m',
        env: container.env || {},
        imagePullSecret: k8sConfig.registry.authSecret,
        resourceDefaults: k8sConfig.resources,
      },
      dependsOn: [namespaceId, configMapId, ...kernelIds],
      network: network.name,
    });

    // Container Service
    resources.push({
      id: `k8s-service-${container.name}`,
      type: 'k8s:service',
      name: containerName,
      config: {
        name: containerName,
        namespace,
        port: 80,
        targetPort: container.port || 8080,
        selector: containerName,
      },
      dependsOn: [containerId],
      network: network.name,
    });
  }

  // 5. Functions (as Deployments using functions-framework image)
  const functionIds: string[] = [];
  for (const fn of functions) {
    const functionName = `${project.name}-${fn.name}`;
    const functionId = `k8s-deployment-fn-${fn.name}`;
    functionIds.push(functionId);

    resources.push({
      id: functionId,
      type: 'k8s:deployment',
      name: functionName,
      config: {
        name: functionName,
        namespace,
        image: `${k8sConfig.registry.url}/${fn.name}:latest`,
        port: 8080,
        replicas: fn.minInstances || k8sConfig.replicas || 1,
        memory: fn.memory || k8sConfig.resources?.defaultMemoryLimit || '256Mi',
        cpu: k8sConfig.resources?.defaultCpuLimit || '250m',
        env: {
          FUNCTION_TARGET: fn.entryPoint || fn.name,
          ...fn.env,
        },
        imagePullSecret: k8sConfig.registry.authSecret,
        resourceDefaults: k8sConfig.resources,
        sourceDir: fn.sourceDir || `functions/${fn.name}`,
        runtime: fn.runtime || 'nodejs20',
      },
      dependsOn: [namespaceId, configMapId],
      network: network.name,
    });

    // Function Service
    resources.push({
      id: `k8s-service-fn-${fn.name}`,
      type: 'k8s:service',
      name: functionName,
      config: {
        name: functionName,
        namespace,
        port: 80,
        targetPort: 8080,
        selector: functionName,
      },
      dependsOn: [functionId],
      network: network.name,
    });
  }

  // 6. UIs (as Deployments serving static files via nginx)
  const uiIds: string[] = [];
  for (const ui of uis) {
    const uiName = `${project.name}-${ui.name}`;
    const uiId = `k8s-deployment-ui-${ui.name}`;
    uiIds.push(uiId);

    resources.push({
      id: uiId,
      type: 'k8s:deployment',
      name: uiName,
      config: {
        name: uiName,
        namespace,
        image: `${k8sConfig.registry.url}/${ui.name}:latest`,
        port: 80,
        replicas: k8sConfig.replicas || 1,
        memory: k8sConfig.resources?.defaultMemoryLimit || '128Mi',
        cpu: k8sConfig.resources?.defaultCpuLimit || '100m',
        imagePullSecret: k8sConfig.registry.authSecret,
        resourceDefaults: k8sConfig.resources,
        sourceDir: ui.sourceDir || `ui/${ui.name}`,
        framework: ui.framework,
        buildCommand: ui.buildCommand,
        buildOutputDir: ui.buildOutputDir,
      },
      dependsOn: [namespaceId],
      network: network.name,
    });

    // UI Service
    resources.push({
      id: `k8s-service-ui-${ui.name}`,
      type: 'k8s:service',
      name: uiName,
      config: {
        name: uiName,
        namespace,
        port: 80,
        targetPort: 80,
        selector: uiName,
      },
      dependsOn: [uiId],
      network: network.name,
    });
  }

  // 7. Ingress (if routes are configured)
  if (network.loadBalancer?.routes && k8sConfig.ingress) {
    const ingressId = 'k8s-ingress';
    const routes = network.loadBalancer.routes.map((route) => {
      // Determine service name based on backend type
      let serviceName = `${project.name}-${route.backend}`;
      return {
        path: route.path,
        serviceName,
        servicePort: 80,
      };
    });

    resources.push({
      id: ingressId,
      type: 'k8s:ingress',
      name: `${project.name}-ingress`,
      config: {
        name: `${project.name}-ingress`,
        namespace,
        className: k8sConfig.ingress.className || 'nginx',
        host: k8sConfig.ingress.host,
        tlsSecretName: k8sConfig.ingress.tlsSecretName,
        annotations: k8sConfig.ingress.annotations,
        routes,
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
