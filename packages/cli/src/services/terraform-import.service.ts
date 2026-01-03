import { exec } from 'child_process';
import { promisify } from 'util';
import { GcpResource, GcpResourceType } from './terraform-state.service';

const execAsync = promisify(exec);

export interface StackSoloConfig {
  project: {
    name: string;
    gcpProjectId: string;
    region: string;
  };
}

export interface ConflictResult {
  resource: GcpResource;
  inTerraformState: boolean;
  terraformAddress?: string;
  expectedName: string;
  conflictType: 'exists_not_in_state' | 'orphaned_from_previous';
}

interface ImportMapping {
  gcpResourceType: GcpResourceType;
  terraformResourceType: string;
  importIdFormatter: (resource: GcpResource, config: StackSoloConfig) => string;
  terraformAddressFormatter: (resource: GcpResource) => string;
}

/**
 * Convert a resource name to a valid Terraform variable name
 */
function toTerraformName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Import mapping for each GCP resource type
 */
export const IMPORT_MAPPINGS: Record<GcpResourceType, ImportMapping> = {
  cloudfunctions: {
    gcpResourceType: 'cloudfunctions',
    terraformResourceType: 'google_cloudfunctions2_function',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/locations/${r.location || config.project.region}/functions/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_cloudfunctions2_function.${toTerraformName(r.name)}`,
  },
  cloudrun: {
    gcpResourceType: 'cloudrun',
    terraformResourceType: 'google_cloud_run_v2_service',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/locations/${r.location || config.project.region}/services/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_cloud_run_v2_service.${toTerraformName(r.name)}`,
  },
  storage: {
    gcpResourceType: 'storage',
    terraformResourceType: 'google_storage_bucket',
    importIdFormatter: (r) => r.name,
    terraformAddressFormatter: (r) =>
      `google_storage_bucket.${toTerraformName(r.name)}`,
  },
  vpc_network: {
    gcpResourceType: 'vpc_network',
    terraformResourceType: 'google_compute_network',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/networks/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_network.${toTerraformName(r.name)}`,
  },
  vpc_connector: {
    gcpResourceType: 'vpc_connector',
    terraformResourceType: 'google_vpc_access_connector',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/locations/${r.location || config.project.region}/connectors/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_vpc_access_connector.${toTerraformName(r.name)}`,
  },
  artifact_registry: {
    gcpResourceType: 'artifact_registry',
    terraformResourceType: 'google_artifact_registry_repository',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/locations/${r.location || config.project.region}/repositories/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_artifact_registry_repository.${toTerraformName(r.name)}`,
  },
  global_address: {
    gcpResourceType: 'global_address',
    terraformResourceType: 'google_compute_global_address',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/addresses/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_global_address.${toTerraformName(r.name)}`,
  },
  url_map: {
    gcpResourceType: 'url_map',
    terraformResourceType: 'google_compute_url_map',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/urlMaps/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_url_map.${toTerraformName(r.name)}`,
  },
  backend_service: {
    gcpResourceType: 'backend_service',
    terraformResourceType: 'google_compute_backend_service',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/backendServices/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_backend_service.${toTerraformName(r.name)}`,
  },
  backend_bucket: {
    gcpResourceType: 'backend_bucket',
    terraformResourceType: 'google_compute_backend_bucket',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/backendBuckets/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_backend_bucket.${toTerraformName(r.name)}`,
  },
  forwarding_rule: {
    gcpResourceType: 'forwarding_rule',
    terraformResourceType: 'google_compute_global_forwarding_rule',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/forwardingRules/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_global_forwarding_rule.${toTerraformName(r.name)}`,
  },
  target_http_proxy: {
    gcpResourceType: 'target_http_proxy',
    terraformResourceType: 'google_compute_target_http_proxy',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/targetHttpProxies/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_target_http_proxy.${toTerraformName(r.name)}`,
  },
  target_https_proxy: {
    gcpResourceType: 'target_https_proxy',
    terraformResourceType: 'google_compute_target_https_proxy',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/targetHttpsProxies/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_target_https_proxy.${toTerraformName(r.name)}`,
  },
  network_endpoint_group: {
    gcpResourceType: 'network_endpoint_group',
    terraformResourceType: 'google_compute_region_network_endpoint_group',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/regions/${r.location || config.project.region}/networkEndpointGroups/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_region_network_endpoint_group.${toTerraformName(r.name)}`,
  },
  ssl_certificate: {
    gcpResourceType: 'ssl_certificate',
    terraformResourceType: 'google_compute_managed_ssl_certificate',
    importIdFormatter: (r, config) =>
      `projects/${config.project.gcpProjectId}/global/sslCertificates/${r.name}`,
    terraformAddressFormatter: (r) =>
      `google_compute_managed_ssl_certificate.${toTerraformName(r.name)}`,
  },
};

/**
 * Import priority for dependency ordering (lower = import first)
 * Resources with lower priority should be imported before those with higher priority
 */
const IMPORT_PRIORITY: Record<GcpResourceType, number> = {
  vpc_network: 10,
  storage: 20,
  artifact_registry: 20,
  vpc_connector: 30,
  cloudfunctions: 40,
  cloudrun: 40,
  network_endpoint_group: 50,
  backend_service: 60,
  backend_bucket: 60,
  url_map: 70,
  ssl_certificate: 75,
  target_http_proxy: 80,
  target_https_proxy: 80,
  global_address: 85,
  forwarding_rule: 90,
};

/**
 * Sort conflicts for import (dependency order - import dependencies first)
 */
export function sortConflictsForImport(conflicts: ConflictResult[]): ConflictResult[] {
  return [...conflicts].sort((a, b) => {
    const priorityA = IMPORT_PRIORITY[a.resource.type] || 50;
    const priorityB = IMPORT_PRIORITY[b.resource.type] || 50;
    return priorityA - priorityB;
  });
}

/**
 * Execute terraform import for a single resource
 */
async function importResource(
  conflict: ConflictResult,
  config: StackSoloConfig,
  stackDir: string
): Promise<{ success: boolean; error?: string }> {
  const mapping = IMPORT_MAPPINGS[conflict.resource.type];
  if (!mapping) {
    return {
      success: false,
      error: `Unknown resource type for import: ${conflict.resource.type}`,
    };
  }

  const importId = mapping.importIdFormatter(conflict.resource, config);
  const tfAddress = mapping.terraformAddressFormatter(conflict.resource);

  try {
    await execAsync(`terraform import '${tfAddress}' '${importId}'`, {
      cwd: stackDir,
      timeout: 60000,
    });
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error & { stderr?: string };
    return {
      success: false,
      error: err.stderr || err.message,
    };
  }
}

/**
 * Import all conflicting resources into Terraform state
 */
export async function importConflicts(
  conflicts: ConflictResult[],
  config: StackSoloConfig,
  stackDir: string
): Promise<{ success: string[]; failed: Array<{ name: string; error: string }> }> {
  const success: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  // Import in dependency order
  const sortedConflicts = sortConflictsForImport(conflicts);

  for (const conflict of sortedConflicts) {
    const result = await importResource(conflict, config, stackDir);
    if (result.success) {
      success.push(conflict.resource.name);
    } else {
      failed.push({
        name: conflict.resource.name,
        error: result.error || 'Unknown error',
      });
    }
  }

  return { success, failed };
}

/**
 * Get the terraform import command for a resource (for display purposes)
 */
export function getImportCommand(
  resource: GcpResource,
  config: StackSoloConfig
): string {
  const mapping = IMPORT_MAPPINGS[resource.type];
  if (!mapping) {
    return `# Unknown resource type: ${resource.type}`;
  }

  const importId = mapping.importIdFormatter(resource, config);
  const tfAddress = mapping.terraformAddressFormatter(resource);

  return `terraform import '${tfAddress}' '${importId}'`;
}
