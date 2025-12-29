import type { Generated, ColumnType } from 'kysely';

// Database column types
export interface ProjectTable {
  id: string;
  name: string;
  provider: string;
  provider_config: string; // JSON string
  path: string | null; // Local project path
  pattern_id: string | null; // Selected app pattern ID
  created_at: ColumnType<Date, string, string>;
  updated_at: ColumnType<Date, string, string>;
}

export interface ResourceTable {
  id: string;
  project_id: string;
  type: string;
  name: string;
  config: string; // JSON string
  created_at: ColumnType<Date, string, string>;
  updated_at: ColumnType<Date, string, string>;
}

export interface DeploymentTable {
  id: string;
  project_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  started_at: ColumnType<Date, string, string>;
  finished_at: ColumnType<Date | null, string | null, string | null>;
  logs: string | null;
  error: string | null;
}

// Database interface for Kysely
export interface Database {
  projects: ProjectTable;
  resources: ResourceTable;
  deployments: DeploymentTable;
}
