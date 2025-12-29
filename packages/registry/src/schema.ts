/**
 * Kysely database schema types for the StackSolo registry
 */

import type { ColumnType } from 'kysely';

/**
 * Project table - tracks all StackSolo projects on the machine
 */
export interface ProjectTable {
  id: string;
  name: string;
  gcp_project_id: string;
  region: string;
  config_path: string | null;
  config_hash: string | null;
  status: string;
  last_deployed_at: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<string, string, string>;
  updated_at: ColumnType<string, string, string>;
}

/**
 * Resource table - tracks resources within projects
 */
export interface ResourceTable {
  id: string;
  project_id: string;
  type: string;
  name: string;
  network: string | null;
  resource_type: string;
  config: string;
  outputs: string | null;
  status: string;
  pulumi_urn: string | null;
  last_deployed_at: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<string, string, string>;
  updated_at: ColumnType<string, string, string>;
}

/**
 * Deployment table - tracks deployment history
 */
export interface DeploymentTable {
  id: string;
  project_id: string;
  action: string;
  status: string;
  config_snapshot: string;
  log_path: string | null;
  error: string | null;
  started_at: ColumnType<string, string, string>;
  completed_at: ColumnType<string | null, string | null, string | null>;
}

/**
 * Complete database schema
 */
export interface RegistryDatabase {
  projects: ProjectTable;
  resources: ResourceTable;
  deployments: DeploymentTable;
}
