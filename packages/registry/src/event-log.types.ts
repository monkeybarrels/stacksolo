/**
 * Event Log Types
 *
 * High-resolution event logging for deploy operations.
 * Provides full observability of every operation during deployment.
 */

// =============================================================================
// Event Categories
// =============================================================================

export type EventCategory =
  | 'internal' // Session lifecycle, phase transitions, prompts
  | 'terraform' // Terraform init, plan, apply operations
  | 'docker' // Docker build and push
  | 'gcloud' // gcloud CLI commands
  | 'file' // File system operations
  | 'gcs'; // GCS uploads

// =============================================================================
// Event Types by Category
// =============================================================================

export type InternalEventType =
  | 'session_start'
  | 'session_end'
  | 'phase_start'
  | 'phase_end'
  | 'conflict_detected'
  | 'user_prompt'
  | 'user_response';

export type TerraformEventType =
  | 'init_start'
  | 'init_end'
  | 'plan_start'
  | 'plan_output'
  | 'plan_end'
  | 'apply_start'
  | 'resource_creating'
  | 'resource_created'
  | 'resource_updating'
  | 'resource_updated'
  | 'resource_destroying'
  | 'resource_destroyed'
  | 'resource_error'
  | 'apply_end'
  | 'import_start'
  | 'import_end';

export type DockerEventType =
  | 'build_start'
  | 'build_layer'
  | 'build_end'
  | 'push_start'
  | 'push_progress'
  | 'push_end';

export type GcloudEventType = 'command_start' | 'command_output' | 'command_end';

export type FileEventType = 'write' | 'delete' | 'mkdir';

export type GcsEventType = 'upload_start' | 'upload_end';

export type EventType =
  | InternalEventType
  | TerraformEventType
  | DockerEventType
  | GcloudEventType
  | FileEventType
  | GcsEventType;

// =============================================================================
// Session
// =============================================================================

export interface Session {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  command: string;
  args: string | null;
  configHash: string | null;
  projectName: string | null;
  gcpProjectId: string | null;
  exitCode: number | null;
}

export interface CreateSessionInput {
  command: string;
  args?: string;
  configHash?: string;
  projectName?: string;
  gcpProjectId?: string;
}

// =============================================================================
// Event
// =============================================================================

export interface Event {
  id: number;
  sessionId: string;
  timestamp: Date;
  seq: number;
  project: string | null;
  category: EventCategory;
  eventType: EventType;
  resourceType: string | null;
  resourceName: string | null;
  terraformAddress: string | null;
  data: Record<string, unknown>;
  parentEventId: number | null;
  correlationId: string | null;
}

export interface CreateEventInput {
  sessionId: string;
  project?: string;
  category: EventCategory;
  eventType: EventType;
  resourceType?: string;
  resourceName?: string;
  terraformAddress?: string;
  data: Record<string, unknown>;
  parentEventId?: number;
  correlationId?: string;
}

// =============================================================================
// Event Data Payloads
// =============================================================================

// Internal events
export interface PhaseEventData {
  phase: string;
}

export interface PromptEventData {
  question: string;
  choices?: string[];
}

export interface ResponseEventData {
  choice: string;
}

export interface ConflictEventData {
  resources: Array<{
    type: string;
    name: string;
    address?: string;
  }>;
}

// Terraform events
export interface TerraformCommandData {
  args: string[];
  cwd: string;
}

export interface TerraformOutputData {
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface TerraformEndData {
  exitCode: number;
  durationMs: number;
  changes?: {
    add: number;
    change: number;
    destroy: number;
  };
}

export interface TerraformResourceData {
  address: string;
  type: string;
  name: string;
}

export interface TerraformResourceCompleteData {
  address: string;
  durationMs: number;
}

export interface TerraformResourceErrorData {
  address: string;
  error: string;
}

export interface TerraformImportData {
  address: string;
  importId: string;
}

// Docker events
export interface DockerBuildStartData {
  dockerfile: string;
  context: string;
  tag: string;
  args?: Record<string, string>;
}

export interface DockerBuildLayerData {
  step: number;
  total: number;
  command: string;
}

export interface DockerBuildEndData {
  image: string;
  sizeBytes?: number;
  durationMs: number;
}

export interface DockerPushStartData {
  image: string;
}

export interface DockerPushProgressData {
  layer: string;
  percent: number;
  bytes: number;
}

export interface DockerPushEndData {
  image: string;
  digest: string;
  durationMs: number;
}

// File events
export interface FileWriteData {
  path: string;
  size: number;
  hash?: string;
  contentPreview?: string;
}

export interface FileDeleteData {
  path: string;
  existed: boolean;
}

export interface FileMkdirData {
  path: string;
}

// GCS events
export interface GcsUploadStartData {
  bucket: string;
  object: string;
  localPath: string;
}

export interface GcsUploadEndData {
  bucket: string;
  object: string;
  size: number;
  durationMs: number;
}

// gcloud events
export interface GcloudCommandStartData {
  command: string[];
  cwd?: string;
}

export interface GcloudCommandOutputData {
  line: string;
  stream: 'stdout' | 'stderr';
}

export interface GcloudCommandEndData {
  exitCode: number;
  durationMs: number;
}

// =============================================================================
// Query Filters
// =============================================================================

export interface EventFilters {
  category?: EventCategory;
  eventType?: EventType;
  resourceName?: string;
  since?: Date;
  correlationId?: string;
  limit?: number;
}
