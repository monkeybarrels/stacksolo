/**
 * Public types for the StackSolo registry
 */

// Project status values
export type ProjectStatus = 'pending' | 'deploying' | 'deployed' | 'failed' | 'destroyed';

// Resource logical types
export type ResourceLogicalType =
  | 'container'
  | 'function'
  | 'database'
  | 'cache'
  | 'bucket'
  | 'secret'
  | 'topic'
  | 'queue'
  | 'network'
  | 'cron';

// Resource status values
export type ResourceStatus = 'pending' | 'creating' | 'ready' | 'failed' | 'destroyed';

// Deployment actions
export type DeploymentAction = 'deploy' | 'destroy' | 'preview';

// Deployment status values
export type DeploymentStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/**
 * Project entity
 */
export interface RegistryProject {
  id: string;
  name: string;
  gcpProjectId: string;
  region: string;
  configPath: string | null;
  configHash: string | null;
  status: ProjectStatus;
  lastDeployedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resource outputs - values captured after deployment
 */
export interface ResourceOutputs {
  url?: string;
  imageUrl?: string;
  connectionString?: string;
  privateIp?: string;
  publicIp?: string;
  host?: string;
  port?: number;
  name?: string;
  id?: string;
  selfLink?: string;
  secretId?: string;
  instanceName?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Resource entity
 */
export interface RegistryResource {
  id: string;
  projectId: string;
  type: ResourceLogicalType;
  name: string;
  network: string | null;
  resourceType: string;
  config: Record<string, unknown>;
  outputs: ResourceOutputs | null;
  status: ResourceStatus;
  pulumiUrn: string | null;
  lastDeployedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Deployment entity
 */
export interface RegistryDeployment {
  id: string;
  projectId: string;
  action: DeploymentAction;
  status: DeploymentStatus;
  configSnapshot: Record<string, unknown>;
  logPath: string | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

/**
 * Input for creating a project
 */
export interface CreateProjectInput {
  name: string;
  gcpProjectId: string;
  region: string;
  configPath?: string;
  configHash?: string;
}

/**
 * Input for updating a project
 */
export interface UpdateProjectInput {
  name?: string;
  gcpProjectId?: string;
  region?: string;
  configPath?: string;
  configHash?: string;
  status?: ProjectStatus;
  lastDeployedAt?: Date;
}

/**
 * Input for creating a resource
 */
export interface CreateResourceInput {
  projectId: string;
  type: ResourceLogicalType;
  name: string;
  network?: string;
  resourceType: string;
  config: Record<string, unknown>;
}

/**
 * Input for updating a resource
 */
export interface UpdateResourceInput {
  type?: ResourceLogicalType;
  name?: string;
  network?: string;
  resourceType?: string;
  config?: Record<string, unknown>;
  outputs?: ResourceOutputs;
  status?: ResourceStatus;
  pulumiUrn?: string;
  lastDeployedAt?: Date;
}

/**
 * Input for creating a deployment
 */
export interface CreateDeploymentInput {
  projectId: string;
  action: DeploymentAction;
  configSnapshot: Record<string, unknown>;
  logPath?: string;
}

/**
 * Input for updating a deployment
 */
export interface UpdateDeploymentInput {
  status?: DeploymentStatus;
  logPath?: string;
  error?: string;
  completedAt?: Date;
}

/**
 * Cross-project reference parsed
 */
export interface CrossProjectReference {
  projectName: string;
  network: string | null;
  resourceName: string;
  property: string | null;
}
