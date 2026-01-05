/**
 * Kysely database schema types for the StackSolo registry
 */

import type { ColumnType, Generated } from 'kysely';

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
 * Session table - tracks deploy sessions (each CLI invocation)
 */
export interface SessionTable {
  id: string;
  started_at: ColumnType<string, string, string>;
  finished_at: ColumnType<string | null, string | null, string | null>;
  command: string;
  args: string | null;
  config_hash: string | null;
  project_name: string | null;
  gcp_project_id: string | null;
  exit_code: ColumnType<number | null, number | null, number | null>;
}

/**
 * Event table - high resolution event stream for deploy operations
 */
export interface EventTable {
  id: Generated<number>;
  session_id: string;
  timestamp: ColumnType<string, string, string>;
  seq: number;
  project: string | null;
  category: string;
  event_type: string;
  resource_type: string | null;
  resource_name: string | null;
  terraform_address: string | null;
  data: string;
  parent_event_id: number | null;
  correlation_id: string | null;
}

/**
 * Complete database schema
 */
export interface RegistryDatabase {
  projects: ProjectTable;
  resources: ResourceTable;
  deployments: DeploymentTable;
  sessions: SessionTable;
  events: EventTable;
}
