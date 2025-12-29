/**
 * Deployment repository - CRUD operations for deployments in the registry
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import type {
  RegistryDeployment,
  CreateDeploymentInput,
  UpdateDeploymentInput,
  DeploymentAction,
  DeploymentStatus,
} from '../types.js';

/**
 * Convert database row to RegistryDeployment
 */
function toDeployment(row: {
  id: string;
  project_id: string;
  action: string;
  status: string;
  config_snapshot: string;
  log_path: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}): RegistryDeployment {
  return {
    id: row.id,
    projectId: row.project_id,
    action: row.action as DeploymentAction,
    status: row.status as DeploymentStatus,
    configSnapshot: JSON.parse(row.config_snapshot),
    logPath: row.log_path,
    error: row.error,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export class DeploymentRepository {
  /**
   * Create a new deployment
   */
  async create(input: CreateDeploymentInput): Promise<RegistryDeployment> {
    const db = getDb();
    const now = new Date().toISOString();
    const id = uuidv4();

    const row = {
      id,
      project_id: input.projectId,
      action: input.action,
      status: 'pending' as const,
      config_snapshot: JSON.stringify(input.configSnapshot),
      log_path: input.logPath ?? null,
      error: null,
      started_at: now,
      completed_at: null,
    };

    await db.insertInto('deployments').values(row).execute();

    return toDeployment(row);
  }

  /**
   * Find a deployment by ID
   */
  async findById(id: string): Promise<RegistryDeployment | null> {
    const db = getDb();
    const row = await db
      .selectFrom('deployments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toDeployment(row) : null;
  }

  /**
   * Find deployments by project ID
   */
  async findByProjectId(projectId: string): Promise<RegistryDeployment[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('deployments')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('started_at', 'desc')
      .execute();

    return rows.map(toDeployment);
  }

  /**
   * Find the latest deployment for a project
   */
  async findLatest(projectId: string): Promise<RegistryDeployment | null> {
    const db = getDb();
    const row = await db
      .selectFrom('deployments')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('started_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row ? toDeployment(row) : null;
  }

  /**
   * Update a deployment
   */
  async update(id: string, input: UpdateDeploymentInput): Promise<RegistryDeployment> {
    const db = getDb();

    const updates: Record<string, unknown> = {};

    if (input.status !== undefined) updates.status = input.status;
    if (input.logPath !== undefined) updates.log_path = input.logPath;
    if (input.error !== undefined) updates.error = input.error;
    if (input.completedAt !== undefined) {
      updates.completed_at = input.completedAt.toISOString();
    }

    if (Object.keys(updates).length > 0) {
      await db.updateTable('deployments').set(updates).where('id', '=', id).execute();
    }

    const deployment = await this.findById(id);
    if (!deployment) {
      throw new Error(`Deployment not found: ${id}`);
    }

    return deployment;
  }

  /**
   * Update deployment status
   */
  async updateStatus(
    id: string,
    status: DeploymentStatus,
    error?: string
  ): Promise<void> {
    const db = getDb();

    const updates: Record<string, unknown> = {
      status,
    };

    // Set completed_at for terminal states
    if (status === 'succeeded' || status === 'failed') {
      updates.completed_at = new Date().toISOString();
    }

    if (error !== undefined) {
      updates.error = error;
    }

    await db.updateTable('deployments').set(updates).where('id', '=', id).execute();
  }

  /**
   * Mark deployment as running
   */
  async markRunning(id: string): Promise<void> {
    await this.updateStatus(id, 'running');
  }

  /**
   * Mark deployment as succeeded
   */
  async markSucceeded(id: string): Promise<void> {
    await this.updateStatus(id, 'succeeded');
  }

  /**
   * Mark deployment as failed
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.updateStatus(id, 'failed', error);
  }

  /**
   * Delete a deployment
   */
  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.deleteFrom('deployments').where('id', '=', id).execute();
  }

  /**
   * Delete all deployments for a project
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    const db = getDb();
    await db.deleteFrom('deployments').where('project_id', '=', projectId).execute();
  }
}
