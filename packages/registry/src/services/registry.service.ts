/**
 * Registry Service - High-level operations for the StackSolo registry
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { initRegistry } from '../db.js';
import { ProjectRepository } from '../repositories/project.repository.js';
import { ResourceRepository } from '../repositories/resource.repository.js';
import { DeploymentRepository } from '../repositories/deployment.repository.js';
import type {
  RegistryProject,
  RegistryResource,
  RegistryDeployment,
  CreateProjectInput,
  UpdateProjectInput,
  CreateResourceInput,
  UpdateResourceInput,
  CreateDeploymentInput,
  ResourceOutputs,
  ProjectStatus,
  ResourceStatus,
  DeploymentStatus,
} from '../types.js';

export class RegistryService {
  private projectRepo: ProjectRepository;
  private resourceRepo: ResourceRepository;
  private deploymentRepo: DeploymentRepository;
  private initialized: boolean = false;

  constructor() {
    this.projectRepo = new ProjectRepository();
    this.resourceRepo = new ResourceRepository();
    this.deploymentRepo = new DeploymentRepository();
  }

  /**
   * Initialize the registry database
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await initRegistry();
    this.initialized = true;
  }

  // ==================== Project Operations ====================

  /**
   * Register a project in the registry
   */
  async registerProject(input: CreateProjectInput): Promise<RegistryProject> {
    await this.init();

    // Compute config hash if path provided
    let configHash = input.configHash;
    if (input.configPath && existsSync(input.configPath) && !configHash) {
      configHash = this.hashFile(input.configPath);
    }

    return this.projectRepo.create({
      ...input,
      configHash,
    });
  }

  /**
   * Find a project by name
   */
  async findProjectByName(name: string): Promise<RegistryProject | null> {
    await this.init();
    return this.projectRepo.findByName(name);
  }

  /**
   * Find a project by ID
   */
  async findProjectById(id: string): Promise<RegistryProject | null> {
    await this.init();
    return this.projectRepo.findById(id);
  }

  /**
   * Find a project by config path
   */
  async findProjectByPath(configPath: string): Promise<RegistryProject | null> {
    await this.init();
    return this.projectRepo.findByConfigPath(configPath);
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<RegistryProject[]> {
    await this.init();
    return this.projectRepo.findAll();
  }

  /**
   * Update a project
   */
  async updateProject(id: string, input: UpdateProjectInput): Promise<RegistryProject> {
    await this.init();
    return this.projectRepo.update(id, input);
  }

  /**
   * Update project status
   */
  async updateProjectStatus(id: string, status: ProjectStatus): Promise<void> {
    await this.init();
    await this.projectRepo.updateStatus(id, status);
  }

  /**
   * Mark a project as deployed
   */
  async markProjectDeployed(id: string): Promise<void> {
    await this.init();
    await this.projectRepo.markDeployed(id);
  }

  /**
   * Unregister a project (delete from registry)
   */
  async unregisterProject(id: string): Promise<void> {
    await this.init();
    await this.projectRepo.delete(id);
  }

  /**
   * Unregister a project by name
   */
  async unregisterProjectByName(name: string): Promise<boolean> {
    await this.init();
    const project = await this.projectRepo.findByName(name);
    if (!project) return false;
    await this.projectRepo.delete(project.id);
    return true;
  }

  // ==================== Config Change Detection ====================

  /**
   * Check if the config file has changed since last registered
   */
  async checkConfigChanged(
    projectId: string
  ): Promise<{ changed: boolean; currentHash: string | null; storedHash: string | null }> {
    await this.init();
    const project = await this.projectRepo.findById(projectId);

    if (!project || !project.configPath) {
      return { changed: false, currentHash: null, storedHash: null };
    }

    if (!existsSync(project.configPath)) {
      return { changed: true, currentHash: null, storedHash: project.configHash };
    }

    const currentHash = this.hashFile(project.configPath);
    const changed = currentHash !== project.configHash;

    return {
      changed,
      currentHash,
      storedHash: project.configHash,
    };
  }

  /**
   * Update the stored config hash
   */
  async updateConfigHash(projectId: string, hash: string): Promise<void> {
    await this.init();
    await this.projectRepo.update(projectId, { configHash: hash });
  }

  /**
   * Compute SHA256 hash of a file
   */
  private hashFile(filePath: string): string {
    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  // ==================== Resource Operations ====================

  /**
   * Create a resource
   */
  async createResource(input: CreateResourceInput): Promise<RegistryResource> {
    await this.init();
    return this.resourceRepo.create(input);
  }

  /**
   * Find resources by project ID
   */
  async findResourcesByProject(projectId: string): Promise<RegistryResource[]> {
    await this.init();
    return this.resourceRepo.findByProjectId(projectId);
  }

  /**
   * Find a resource by reference
   */
  async findResourceByRef(
    projectId: string,
    resourceName: string,
    network?: string | null
  ): Promise<RegistryResource | null> {
    await this.init();
    return this.resourceRepo.findByReference(projectId, resourceName, network);
  }

  /**
   * Update a resource
   */
  async updateResource(
    id: string,
    input: UpdateResourceInput
  ): Promise<RegistryResource> {
    await this.init();
    return this.resourceRepo.update(id, input);
  }

  /**
   * Update resource outputs
   */
  async updateResourceOutputs(id: string, outputs: ResourceOutputs): Promise<void> {
    await this.init();
    await this.resourceRepo.updateOutputs(id, outputs);
  }

  /**
   * Update resource status
   */
  async updateResourceStatus(id: string, status: ResourceStatus): Promise<void> {
    await this.init();
    await this.resourceRepo.updateStatus(id, status);
  }

  /**
   * Upsert resources for a project (sync from config)
   */
  async upsertResources(
    projectId: string,
    resources: CreateResourceInput[]
  ): Promise<void> {
    await this.init();
    await this.resourceRepo.upsert(projectId, resources);
  }

  // ==================== Deployment Operations ====================

  /**
   * Record a new deployment
   */
  async recordDeployment(input: CreateDeploymentInput): Promise<RegistryDeployment> {
    await this.init();
    return this.deploymentRepo.create(input);
  }

  /**
   * Find deployments by project ID
   */
  async findDeploymentsByProject(projectId: string): Promise<RegistryDeployment[]> {
    await this.init();
    return this.deploymentRepo.findByProjectId(projectId);
  }

  /**
   * Find the latest deployment for a project
   */
  async findLatestDeployment(projectId: string): Promise<RegistryDeployment | null> {
    await this.init();
    return this.deploymentRepo.findLatest(projectId);
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    id: string,
    status: DeploymentStatus,
    error?: string
  ): Promise<void> {
    await this.init();
    await this.deploymentRepo.updateStatus(id, status, error);
  }

  /**
   * Mark deployment as running
   */
  async markDeploymentRunning(id: string): Promise<void> {
    await this.init();
    await this.deploymentRepo.markRunning(id);
  }

  /**
   * Mark deployment as succeeded
   */
  async markDeploymentSucceeded(id: string): Promise<void> {
    await this.init();
    await this.deploymentRepo.markSucceeded(id);
  }

  /**
   * Mark deployment as failed
   */
  async markDeploymentFailed(id: string, error: string): Promise<void> {
    await this.init();
    await this.deploymentRepo.markFailed(id, error);
  }
}

// Singleton instance
let registryInstance: RegistryService | null = null;

/**
 * Get the registry service instance
 */
export function getRegistry(): RegistryService {
  if (!registryInstance) {
    registryInstance = new RegistryService();
  }
  return registryInstance;
}
