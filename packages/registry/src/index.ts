/**
 * @stacksolo/registry
 *
 * Global registry for StackSolo projects and resources.
 * Stores data at ~/.stacksolo/registry.db
 */

// Database
export {
  getDb,
  initRegistry,
  closeRegistry,
  getRegistryDir,
  getRegistryDbPath,
} from './db.js';

// Types
export type {
  ProjectStatus,
  ResourceLogicalType,
  ResourceStatus,
  DeploymentAction,
  DeploymentStatus,
  RegistryProject,
  RegistryResource,
  RegistryDeployment,
  ResourceOutputs,
  CreateProjectInput,
  UpdateProjectInput,
  CreateResourceInput,
  UpdateResourceInput,
  CreateDeploymentInput,
  UpdateDeploymentInput,
  CrossProjectReference,
} from './types.js';

// Event Log Types
export type {
  EventCategory,
  EventType,
  Session,
  Event,
  CreateSessionInput,
  CreateEventInput,
  EventFilters,
  PhaseEventData,
  PromptEventData,
  ResponseEventData,
  ConflictEventData,
  TerraformCommandData,
  TerraformOutputData,
  TerraformEndData,
  TerraformResourceData,
  TerraformResourceCompleteData,
  TerraformResourceErrorData,
  TerraformImportData,
  DockerBuildStartData,
  DockerBuildEndData,
  DockerPushEndData,
  FileWriteData,
  GcsUploadEndData,
  GcloudCommandStartData,
  GcloudCommandEndData,
} from './event-log.types.js';

// Repositories
export { ProjectRepository } from './repositories/project.repository.js';
export { ResourceRepository } from './repositories/resource.repository.js';
export { DeploymentRepository } from './repositories/deployment.repository.js';
export { SessionRepository } from './repositories/session.repository.js';
export { EventRepository } from './repositories/event.repository.js';

// Services
export { RegistryService, getRegistry } from './services/registry.service.js';
export { ReferenceService } from './services/reference.service.js';
export { EventLogService } from './services/event-log.service.js';

// Event Log Functions (convenience exports)
export {
  startSession,
  endSession,
  getSession,
  getLatestSession,
  listSessions,
  logEvent,
  getSessionEvents,
  getEventsByResource,
  getEventCount,
  logPhaseStart,
  logPhaseEnd,
  logTerraformEvent,
  logTerraformResourceEvent,
  logFileWrite,
  logGcloudCommand,
  logConflictDetected,
  logUserPrompt,
  logUserResponse,
} from './services/event-log.service.js';
