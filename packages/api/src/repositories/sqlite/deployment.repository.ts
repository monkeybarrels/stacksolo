import { v4 as uuid } from 'uuid';
import { db } from '../../db/index.js';
import type { DeploymentRepository } from '../interfaces.js';
import type { Deployment, DeploymentStatus } from '@stacksolo/shared';

export class SQLiteDeploymentRepository implements DeploymentRepository {
  async create(projectId: string): Promise<Deployment> {
    const id = uuid();
    const now = new Date().toISOString();

    await db
      .insertInto('deployments')
      .values({
        id,
        project_id: projectId,
        status: 'pending',
        started_at: now,
        finished_at: null,
        logs: null,
        error: null,
      })
      .execute();

    return this.findById(id) as Promise<Deployment>;
  }

  async findById(id: string): Promise<Deployment | null> {
    const row = await db
      .selectFrom('deployments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      projectId: row.project_id,
      status: row.status as DeploymentStatus,
      startedAt: new Date(row.started_at as unknown as string),
      finishedAt: row.finished_at ? new Date(row.finished_at as unknown as string) : null,
      logs: row.logs,
      error: row.error,
    };
  }

  async findByProjectId(projectId: string): Promise<Deployment[]> {
    const rows = await db
      .selectFrom('deployments')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('started_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      status: row.status as DeploymentStatus,
      startedAt: new Date(row.started_at as unknown as string),
      finishedAt: row.finished_at ? new Date(row.finished_at as unknown as string) : null,
      logs: row.logs,
      error: row.error,
    }));
  }

  async updateStatus(
    id: string,
    status: DeploymentStatus,
    logs?: string,
    error?: string
  ): Promise<Deployment> {
    const updates: Record<string, unknown> = { status };

    if (status === 'succeeded' || status === 'failed') {
      updates.finished_at = new Date().toISOString();
    }
    if (logs !== undefined) {
      updates.logs = logs;
    }
    if (error !== undefined) {
      updates.error = error;
    }

    await db
      .updateTable('deployments')
      .set(updates)
      .where('id', '=', id)
      .execute();

    return this.findById(id) as Promise<Deployment>;
  }
}
