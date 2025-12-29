import { v4 as uuid } from 'uuid';
import { db } from '../../db/index.js';
import type { ResourceRepository } from '../interfaces.js';
import type {
  Resource,
  CreateResourceInput,
  UpdateResourceInput,
} from '@stacksolo/shared';

export class SQLiteResourceRepository implements ResourceRepository {
  async create(data: CreateResourceInput): Promise<Resource> {
    const id = uuid();
    const now = new Date().toISOString();

    await db
      .insertInto('resources')
      .values({
        id,
        project_id: data.projectId,
        type: data.type,
        name: data.name,
        config: JSON.stringify(data.config),
        created_at: now,
        updated_at: now,
      })
      .execute();

    return this.findById(id) as Promise<Resource>;
  }

  async findById(id: string): Promise<Resource | null> {
    const row = await db
      .selectFrom('resources')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      name: row.name,
      config: JSON.parse(row.config),
      createdAt: new Date(row.created_at as unknown as string),
      updatedAt: new Date(row.updated_at as unknown as string),
    };
  }

  async findByProjectId(projectId: string): Promise<Resource[]> {
    const rows = await db
      .selectFrom('resources')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      name: row.name,
      config: JSON.parse(row.config),
      createdAt: new Date(row.created_at as unknown as string),
      updatedAt: new Date(row.updated_at as unknown as string),
    }));
  }

  async update(id: string, data: UpdateResourceInput): Promise<Resource> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.name !== undefined) {
      updates.name = data.name;
    }
    if (data.config !== undefined) {
      updates.config = JSON.stringify(data.config);
    }

    await db
      .updateTable('resources')
      .set(updates)
      .where('id', '=', id)
      .execute();

    return this.findById(id) as Promise<Resource>;
  }

  async delete(id: string): Promise<void> {
    await db.deleteFrom('resources').where('id', '=', id).execute();
  }
}
