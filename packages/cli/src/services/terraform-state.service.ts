import { existsSync, readFileSync } from 'fs';
import path from 'path';

export interface TerraformStateResource {
  address: string;
  type: string;
  name: string;
  attributes: Record<string, unknown>;
}

export interface TerraformState {
  version: number;
  resources: TerraformStateResource[];
}

export type GcpResourceType =
  | 'cloudfunctions'
  | 'cloudrun'
  | 'storage'
  | 'vpc_network'
  | 'vpc_connector'
  | 'artifact_registry'
  | 'global_address'
  | 'url_map'
  | 'backend_service'
  | 'backend_bucket'
  | 'forwarding_rule'
  | 'target_http_proxy'
  | 'target_https_proxy'
  | 'network_endpoint_group'
  | 'ssl_certificate';

export interface GcpResource {
  type: GcpResourceType;
  name: string;
  location?: string;
  selfLink?: string;
  createdAt?: string;
}

const GCP_TO_TERRAFORM_TYPE: Record<GcpResourceType, string> = {
  cloudfunctions: 'google_cloudfunctions2_function',
  cloudrun: 'google_cloud_run_v2_service',
  storage: 'google_storage_bucket',
  vpc_network: 'google_compute_network',
  vpc_connector: 'google_vpc_access_connector',
  artifact_registry: 'google_artifact_registry_repository',
  global_address: 'google_compute_global_address',
  url_map: 'google_compute_url_map',
  backend_service: 'google_compute_backend_service',
  backend_bucket: 'google_compute_backend_bucket',
  forwarding_rule: 'google_compute_global_forwarding_rule',
  target_http_proxy: 'google_compute_target_http_proxy',
  target_https_proxy: 'google_compute_target_https_proxy',
  network_endpoint_group: 'google_compute_region_network_endpoint_group',
  ssl_certificate: 'google_compute_managed_ssl_certificate',
};

/**
 * Find the Terraform state file path
 */
export function findTerraformStatePath(cwd: string): string | null {
  const cdktfStatePath = path.join(
    cwd,
    '.stacksolo',
    'cdktf',
    'cdktf.out',
    'stacks',
    'main',
    'terraform.tfstate'
  );

  if (existsSync(cdktfStatePath)) {
    return cdktfStatePath;
  }

  const legacyStatePath = path.join(
    cwd,
    '.stacksolo',
    'terraform-state',
    'terraform.tfstate'
  );

  if (existsSync(legacyStatePath)) {
    return legacyStatePath;
  }

  return null;
}

/**
 * Parse the terraform.tfstate file
 */
export function parseTerraformState(statePath: string): TerraformState | null {
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content);

    const resources: TerraformStateResource[] = [];

    for (const resource of state.resources || []) {
      if (resource.mode !== 'managed') continue;

      const instances = resource.instances || [];
      for (const instance of instances) {
        resources.push({
          address: `${resource.type}.${resource.name}`,
          type: resource.type,
          name: resource.name,
          attributes: instance.attributes || {},
        });
      }
    }

    return {
      version: state.version || 4,
      resources,
    };
  } catch (error) {
    console.error(`Failed to parse Terraform state: ${error}`);
    return null;
  }
}

/**
 * Get all resources from Terraform state
 */
export function getStateResources(statePath: string): TerraformStateResource[] {
  const state = parseTerraformState(statePath);
  return state?.resources || [];
}

/**
 * Check if a GCP resource exists in Terraform state
 */
export function isResourceInState(
  gcpResource: GcpResource,
  state: TerraformState
): { inState: boolean; terraformAddress?: string } {
  const tfType = GCP_TO_TERRAFORM_TYPE[gcpResource.type];
  if (!tfType) {
    return { inState: false };
  }

  for (const stateResource of state.resources) {
    if (stateResource.type !== tfType) continue;

    // Compare by name attribute in state
    const stateName = stateResource.attributes.name as string | undefined;
    if (stateName === gcpResource.name) {
      return { inState: true, terraformAddress: stateResource.address };
    }

    // Also check the resource name in the address for cases where
    // the TF resource name matches the GCP resource name
    const sanitizedName = gcpResource.name.replace(/[^a-zA-Z0-9]/g, '-');
    if (stateResource.name === sanitizedName || stateResource.name === gcpResource.name) {
      return { inState: true, terraformAddress: stateResource.address };
    }
  }

  return { inState: false };
}

/**
 * Get the Terraform resource type for a GCP resource type
 */
export function getTerraformType(gcpType: GcpResourceType): string {
  return GCP_TO_TERRAFORM_TYPE[gcpType];
}
