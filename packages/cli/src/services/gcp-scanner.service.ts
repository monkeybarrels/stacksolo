import { exec } from 'child_process';
import { promisify } from 'util';
import { GcpResource, GcpResourceType } from './terraform-state.service';

const execAsync = promisify(exec);

export interface ScanOptions {
  projectId: string;
  region: string;
  projectName: string;
}

export interface ScanResult {
  resources: GcpResource[];
  errors: string[];
}

/**
 * Check if a resource name matches the project naming pattern
 */
function matchesProjectPattern(
  resourceName: string,
  projectName: string,
  gcpProjectId: string
): boolean {
  // Patterns based on discovered naming conventions:
  // - {projectName}-{resourceName}
  // - {gcpProjectId}-{projectName}-{resourceName}
  return (
    resourceName.startsWith(`${projectName}-`) ||
    resourceName.startsWith(`${gcpProjectId}-${projectName}-`)
  );
}

/**
 * Execute a gcloud command and parse JSON output
 */
async function runGcloudCommand<T>(command: string, timeoutMs = 30000): Promise<T[]> {
  try {
    const { stdout } = await execAsync(command, { timeout: timeoutMs });
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === '[]') {
      return [];
    }
    return JSON.parse(trimmed) as T[];
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    // Command timeout or execution error
    if (err.code === 'ETIMEDOUT') {
      throw new Error(`Command timed out: ${command}`);
    }
    // If command fails (e.g., API not enabled), return empty
    return [];
  }
}

/**
 * Scan Cloud Functions (Gen2)
 */
async function scanCloudFunctions(options: ScanOptions): Promise<GcpResource[]> {
  interface CloudFunction {
    name: string;
    state?: string;
    createTime?: string;
  }

  const functions = await runGcloudCommand<CloudFunction>(
    `gcloud functions list --gen2 --project=${options.projectId} --format=json`
  );

  return functions
    .filter((fn) => {
      // Extract function name from full path
      const name = fn.name.split('/').pop() || '';
      return matchesProjectPattern(name, options.projectName, options.projectId);
    })
    .map((fn) => ({
      type: 'cloudfunctions' as GcpResourceType,
      name: fn.name.split('/').pop() || '',
      location: fn.name.match(/locations\/([^/]+)/)?.[1],
      selfLink: fn.name,
      createdAt: fn.createTime,
    }));
}

/**
 * Scan Cloud Run Services
 */
async function scanCloudRunServices(options: ScanOptions): Promise<GcpResource[]> {
  interface CloudRunService {
    metadata?: { name: string; creationTimestamp?: string };
    name?: string;
  }

  const services = await runGcloudCommand<CloudRunService>(
    `gcloud run services list --project=${options.projectId} --format=json`
  );

  return services
    .filter((svc) => {
      const name = svc.metadata?.name || svc.name || '';
      return matchesProjectPattern(name, options.projectName, options.projectId);
    })
    .map((svc) => ({
      type: 'cloudrun' as GcpResourceType,
      name: svc.metadata?.name || svc.name || '',
      location: options.region,
      createdAt: svc.metadata?.creationTimestamp,
    }));
}

/**
 * Scan Storage Buckets
 */
async function scanStorageBuckets(options: ScanOptions): Promise<GcpResource[]> {
  interface StorageBucket {
    name: string;
    timeCreated?: string;
    selfLink?: string;
  }

  const buckets = await runGcloudCommand<StorageBucket>(
    `gcloud storage buckets list --project=${options.projectId} --format=json`
  );

  return buckets
    .filter((bucket) =>
      matchesProjectPattern(bucket.name, options.projectName, options.projectId)
    )
    .map((bucket) => ({
      type: 'storage' as GcpResourceType,
      name: bucket.name,
      selfLink: bucket.selfLink,
      createdAt: bucket.timeCreated,
    }));
}

/**
 * Scan VPC Networks
 */
async function scanVpcNetworks(options: ScanOptions): Promise<GcpResource[]> {
  interface VpcNetwork {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const networks = await runGcloudCommand<VpcNetwork>(
    `gcloud compute networks list --project=${options.projectId} --format=json`
  );

  return networks
    .filter((network) =>
      matchesProjectPattern(network.name, options.projectName, options.projectId)
    )
    .map((network) => ({
      type: 'vpc_network' as GcpResourceType,
      name: network.name,
      selfLink: network.selfLink,
      createdAt: network.creationTimestamp,
    }));
}

/**
 * Scan VPC Access Connectors
 */
async function scanVpcConnectors(options: ScanOptions): Promise<GcpResource[]> {
  interface VpcConnector {
    name: string;
    state?: string;
  }

  const connectors = await runGcloudCommand<VpcConnector>(
    `gcloud compute networks vpc-access connectors list --region=${options.region} --project=${options.projectId} --format=json`
  );

  return connectors
    .filter((connector) => {
      const name = connector.name.split('/').pop() || '';
      return matchesProjectPattern(name, options.projectName, options.projectId);
    })
    .map((connector) => ({
      type: 'vpc_connector' as GcpResourceType,
      name: connector.name.split('/').pop() || '',
      location: options.region,
      selfLink: connector.name,
    }));
}

/**
 * Scan Global Addresses
 */
async function scanGlobalAddresses(options: ScanOptions): Promise<GcpResource[]> {
  interface GlobalAddress {
    name: string;
    address?: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const addresses = await runGcloudCommand<GlobalAddress>(
    `gcloud compute addresses list --global --project=${options.projectId} --format=json`
  );

  return addresses
    .filter((addr) =>
      matchesProjectPattern(addr.name, options.projectName, options.projectId)
    )
    .map((addr) => ({
      type: 'global_address' as GcpResourceType,
      name: addr.name,
      selfLink: addr.selfLink,
      createdAt: addr.creationTimestamp,
    }));
}

/**
 * Scan URL Maps
 */
async function scanUrlMaps(options: ScanOptions): Promise<GcpResource[]> {
  interface UrlMap {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const urlMaps = await runGcloudCommand<UrlMap>(
    `gcloud compute url-maps list --project=${options.projectId} --format=json`
  );

  return urlMaps
    .filter((urlMap) =>
      matchesProjectPattern(urlMap.name, options.projectName, options.projectId)
    )
    .map((urlMap) => ({
      type: 'url_map' as GcpResourceType,
      name: urlMap.name,
      selfLink: urlMap.selfLink,
      createdAt: urlMap.creationTimestamp,
    }));
}

/**
 * Scan Backend Services
 */
async function scanBackendServices(options: ScanOptions): Promise<GcpResource[]> {
  interface BackendService {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const services = await runGcloudCommand<BackendService>(
    `gcloud compute backend-services list --global --project=${options.projectId} --format=json`
  );

  return services
    .filter((svc) =>
      matchesProjectPattern(svc.name, options.projectName, options.projectId)
    )
    .map((svc) => ({
      type: 'backend_service' as GcpResourceType,
      name: svc.name,
      selfLink: svc.selfLink,
      createdAt: svc.creationTimestamp,
    }));
}

/**
 * Scan Backend Buckets
 */
async function scanBackendBuckets(options: ScanOptions): Promise<GcpResource[]> {
  interface BackendBucket {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const buckets = await runGcloudCommand<BackendBucket>(
    `gcloud compute backend-buckets list --project=${options.projectId} --format=json`
  );

  return buckets
    .filter((bucket) =>
      matchesProjectPattern(bucket.name, options.projectName, options.projectId)
    )
    .map((bucket) => ({
      type: 'backend_bucket' as GcpResourceType,
      name: bucket.name,
      selfLink: bucket.selfLink,
      createdAt: bucket.creationTimestamp,
    }));
}

/**
 * Scan Global Forwarding Rules
 */
async function scanForwardingRules(options: ScanOptions): Promise<GcpResource[]> {
  interface ForwardingRule {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const rules = await runGcloudCommand<ForwardingRule>(
    `gcloud compute forwarding-rules list --global --project=${options.projectId} --format=json`
  );

  return rules
    .filter((rule) =>
      matchesProjectPattern(rule.name, options.projectName, options.projectId)
    )
    .map((rule) => ({
      type: 'forwarding_rule' as GcpResourceType,
      name: rule.name,
      selfLink: rule.selfLink,
      createdAt: rule.creationTimestamp,
    }));
}

/**
 * Scan Target HTTP Proxies
 */
async function scanTargetHttpProxies(options: ScanOptions): Promise<GcpResource[]> {
  interface TargetHttpProxy {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const proxies = await runGcloudCommand<TargetHttpProxy>(
    `gcloud compute target-http-proxies list --project=${options.projectId} --format=json`
  );

  return proxies
    .filter((proxy) =>
      matchesProjectPattern(proxy.name, options.projectName, options.projectId)
    )
    .map((proxy) => ({
      type: 'target_http_proxy' as GcpResourceType,
      name: proxy.name,
      selfLink: proxy.selfLink,
      createdAt: proxy.creationTimestamp,
    }));
}

/**
 * Scan Target HTTPS Proxies
 */
async function scanTargetHttpsProxies(options: ScanOptions): Promise<GcpResource[]> {
  interface TargetHttpsProxy {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
  }

  const proxies = await runGcloudCommand<TargetHttpsProxy>(
    `gcloud compute target-https-proxies list --project=${options.projectId} --format=json`
  );

  return proxies
    .filter((proxy) =>
      matchesProjectPattern(proxy.name, options.projectName, options.projectId)
    )
    .map((proxy) => ({
      type: 'target_https_proxy' as GcpResourceType,
      name: proxy.name,
      selfLink: proxy.selfLink,
      createdAt: proxy.creationTimestamp,
    }));
}

/**
 * Scan Network Endpoint Groups
 */
async function scanNetworkEndpointGroups(options: ScanOptions): Promise<GcpResource[]> {
  interface NetworkEndpointGroup {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
    zone?: string;
    region?: string;
  }

  const negs = await runGcloudCommand<NetworkEndpointGroup>(
    `gcloud compute network-endpoint-groups list --project=${options.projectId} --format=json`
  );

  return negs
    .filter((neg) =>
      matchesProjectPattern(neg.name, options.projectName, options.projectId)
    )
    .map((neg) => ({
      type: 'network_endpoint_group' as GcpResourceType,
      name: neg.name,
      location: neg.region?.split('/').pop() || neg.zone?.split('/').pop(),
      selfLink: neg.selfLink,
      createdAt: neg.creationTimestamp,
    }));
}

/**
 * Scan all GCP resources matching the project naming pattern
 * Runs queries in parallel for speed
 */
export async function scanGcpResources(options: ScanOptions): Promise<ScanResult> {
  const scanners = [
    { name: 'Cloud Functions', fn: scanCloudFunctions },
    { name: 'Cloud Run', fn: scanCloudRunServices },
    { name: 'Storage Buckets', fn: scanStorageBuckets },
    { name: 'VPC Networks', fn: scanVpcNetworks },
    { name: 'VPC Connectors', fn: scanVpcConnectors },
    { name: 'Global Addresses', fn: scanGlobalAddresses },
    { name: 'URL Maps', fn: scanUrlMaps },
    { name: 'Backend Services', fn: scanBackendServices },
    { name: 'Backend Buckets', fn: scanBackendBuckets },
    { name: 'Forwarding Rules', fn: scanForwardingRules },
    { name: 'Target HTTP Proxies', fn: scanTargetHttpProxies },
    { name: 'Target HTTPS Proxies', fn: scanTargetHttpsProxies },
    { name: 'Network Endpoint Groups', fn: scanNetworkEndpointGroups },
  ];

  const results = await Promise.allSettled(
    scanners.map((scanner) => scanner.fn(options))
  );

  const resources: GcpResource[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      resources.push(...result.value);
    } else {
      errors.push(`${scanners[index].name}: ${result.reason}`);
    }
  });

  return { resources, errors };
}
