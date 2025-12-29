/**
 * Project repository - CRUD operations for projects in the registry
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import type {
  RegistryProject,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
} from '../types.js';

/**
 * Convert database row to RegistryProject
 */
function toProject(row: {
  id: string;
  name: string;
  gcp_project_id: string;
  region: string;
  config_path: string | null;
  config_hash: string | null;
  status: string;
  last_deployed_at: string | null;
  created_at: string;
  updated_at: string;
}): RegistryProject {
  return {
    id: row.id,
    name: row.name,
    gcpProjectId: row.gcp_project_id,
    region: row.region,
    configPath: row.config_path,
    configHash: row.config_hash,
    status: row.status as ProjectStatus,
    lastDeployedAt: row.last_deployed_at ? new Date(row.last_deployed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class ProjectRepository {
  /**
   * Create a new project
   */
  async create(input: CreateProjectInput): Promise<RegistryProject> {
    const db = getDb();
    const now = new Date().toISOString();
    const id = uuidv4();

    const row = {
      id,
      name: input.name,
      gcp_project_id: input.gcpProjectId,
      region: input.region,
      config_path: input.configPath ?? null,
      config_hash: input.configHash ?? null,
      status: 'pending',
      last_deployed_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto('projects').values(row).execute();

    return toProject(row);
  }

  /**
   * Find a project by ID
   */
  async findById(id: string): Promise<RegistryProject | null> {
    const db = getDb();
    const row = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toProject(row) : null;
  }

  /**
   * Find a project by name
   */
  async findByName(name: string): Promise<RegistryProject | null> {
    const db = getDb();
    const row = await db
      .selectFrom('projects')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();

    return row ? toProject(row) : null;
  }

  /**
   * Find a project by config path
   */
  async findByConfigPath(configPath: string): Promise<RegistryProject | null> {
    const db = getDb();
    const row = await db
      .selectFrom('projects')
      .selectAll()
      .where('config_path', '=', configPath)
      .executeTakeFirst();

    return row ? toProject(row) : null;
  }

  /**
   * Find all projects by GCP project ID
   */
  async findByGcpProjectId(gcpProjectId: string): Promise<RegistryProject[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('projects')
      .selectAll()
      .where('gcp_project_id', '=', gcpProjectId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map(toProject);
  }

  /**
   * Find all projects
   */
  async findAll(): Promise<RegistryProject[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('projects')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map(toProject);
  }

  /**
   * Update a project
   */
  async update(id: string, input: UpdateProjectInput): Promise<RegistryProject> {
    const db = getDb();
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.gcpProjectId !== undefined) updates.gcp_project_id = input.gcpProjectId;
    if (input.region !== undefined) updates.region = input.region;
    if (input.configPath !== undefined) updates.config_path = input.configPath;
    if (input.configHash !== undefined) updates.config_hash = input.configHash;
    if (input.status !== undefined) updates.status = input.status;
    if (input.lastDeployedAt !== undefined) {
      updates.last_deployed_at = input.lastDeployedAt.toISOString();
    }

    await db.updateTable('projects').set(updates).where('id', '=', id).execute();

    const project = await this.findById(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    return project;
  }

  /**
   * Update project status
   */
  async updateStatus(id: string, status: ProjectStatus): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .updateTable('projects')
      .set({
        status,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Mark project as deployed
   */
  async markDeployed(id: string): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .updateTable('projects')
      .set({
        status: 'deployed',
        last_deployed_at: now,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Delete a project
   */
  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.deleteFrom('projects').where('id', '=', id).execute();
  }
}
