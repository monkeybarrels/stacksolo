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

// Repositories
export { ProjectRepository } from './repositories/project.repository.js';
export { ResourceRepository } from './repositories/resource.repository.js';
export { DeploymentRepository } from './repositories/deployment.repository.js';

// Services
export { RegistryService, getRegistry } from './services/registry.service.js';
export { ReferenceService } from './services/reference.service.js';
