// Database entity types
export interface Project {
  id: string;
  name: string;
  provider: string;
  providerConfig: ProviderConfig;
  path: string | null; // Local project path for app pattern detection
  patternId: string | null; // Selected app pattern (e.g., 'nextjs-cloud-run')
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderConfig {
  // GCP-specific
  projectId?: string;
  region?: string;
  // Extendable for other providers
  [key: string]: unknown;
}

export interface Resource {
  id: string;
  projectId: string;
  type: string; // e.g., 'gcp:storage_bucket'
  name: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deployment {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  startedAt: Date;
  finishedAt: Date | null;
  logs: string | null;
  error: string | null;
}

export type DeploymentStatus = 'pending' | 'running' | 'succeeded' | 'failed';

// API input types
export interface CreateProjectInput {
  name: string;
  provider: string;
  providerConfig: ProviderConfig;
  path?: string; // Optional local project path
  patternId?: string; // Optional app pattern
}

export interface UpdateProjectInput {
  name?: string;
  providerConfig?: ProviderConfig;
  path?: string;
  patternId?: string;
}

export interface CreateResourceInput {
  projectId: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
}

export interface UpdateResourceInput {
  name?: string;
  config?: Record<string, unknown>;
}

// Generated code output
export interface GeneratedCode {
  imports: string[];
  code: string;
  outputs: string[];
}

export interface ProjectCode {
  projectId: string;
  files: GeneratedFile[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}
