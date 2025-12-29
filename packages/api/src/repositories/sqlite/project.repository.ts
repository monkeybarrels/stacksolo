import { v4 as uuid } from 'uuid';
import { db } from '../../db/index.js';
import type { ProjectRepository } from '../interfaces.js';
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
} from '@stacksolo/shared';

export class SQLiteProjectRepository implements ProjectRepository {
  async create(data: CreateProjectInput): Promise<Project> {
    const id = uuid();
    const now = new Date().toISOString();

    await db
      .insertInto('projects')
      .values({
        id,
        name: data.name,
        provider: data.provider,
        provider_config: JSON.stringify(data.providerConfig),
        path: data.path || null,
        pattern_id: data.patternId || null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return this.findById(id) as Promise<Project>;
  }

  async findById(id: string): Promise<Project | null> {
    const row = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      providerConfig: JSON.parse(row.provider_config),
      path: row.path,
      patternId: row.pattern_id,
      createdAt: new Date(row.created_at as unknown as string),
      updatedAt: new Date(row.updated_at as unknown as string),
    };
  }

  async findAll(): Promise<Project[]> {
    const rows = await db
      .selectFrom('projects')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      providerConfig: JSON.parse(row.provider_config),
      path: row.path,
      patternId: row.pattern_id,
      createdAt: new Date(row.created_at as unknown as string),
      updatedAt: new Date(row.updated_at as unknown as string),
    }));
  }

  async update(id: string, data: UpdateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };

    if (data.name !== undefined) {
      updates.name = data.name;
    }
    if (data.providerConfig !== undefined) {
      updates.provider_config = JSON.stringify(data.providerConfig);
    }
    if (data.path !== undefined) {
      updates.path = data.path;
    }
    if (data.patternId !== undefined) {
      updates.pattern_id = data.patternId;
    }

    await db
      .updateTable('projects')
      .set(updates)
      .where('id', '=', id)
      .execute();

    return this.findById(id) as Promise<Project>;
  }

  async delete(id: string): Promise<void> {
    await db.deleteFrom('projects').where('id', '=', id).execute();
  }
}
