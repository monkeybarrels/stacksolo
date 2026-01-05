/**
 * Session repository - CRUD operations for deploy sessions in the registry
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import type { Session, CreateSessionInput } from '../event-log.types.js';

/**
 * Convert database row to Session
 */
function toSession(row: {
  id: string;
  started_at: string;
  finished_at: string | null;
  command: string;
  args: string | null;
  config_hash: string | null;
  project_name: string | null;
  gcp_project_id: string | null;
  exit_code: number | null;
}): Session {
  return {
    id: row.id,
    startedAt: new Date(row.started_at),
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
    command: row.command,
    args: row.args,
    configHash: row.config_hash,
    projectName: row.project_name,
    gcpProjectId: row.gcp_project_id,
    exitCode: row.exit_code,
  };
}

export class SessionRepository {
  /**
   * Create a new session
   */
  async create(input: CreateSessionInput): Promise<Session> {
    const db = getDb();
    const now = new Date().toISOString();
    const id = uuidv4();

    const row = {
      id,
      started_at: now,
      finished_at: null,
      command: input.command,
      args: input.args ?? null,
      config_hash: input.configHash ?? null,
      project_name: input.projectName ?? null,
      gcp_project_id: input.gcpProjectId ?? null,
      exit_code: null,
    };

    await db.insertInto('sessions').values(row).execute();

    return toSession(row);
  }

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<Session | null> {
    const db = getDb();
    const row = await db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toSession(row) : null;
  }

  /**
   * Find session by ID prefix (first 8 chars)
   */
  async findByPrefix(prefix: string): Promise<Session | null> {
    const db = getDb();
    const rows = await db
      .selectFrom('sessions')
      .selectAll()
      .orderBy('started_at', 'desc')
      .limit(100)
      .execute();

    const match = rows.find((row) => row.id.startsWith(prefix));
    return match ? toSession(match) : null;
  }

  /**
   * Find the most recent session
   */
  async findLatest(): Promise<Session | null> {
    const db = getDb();
    const row = await db
      .selectFrom('sessions')
      .selectAll()
      .orderBy('started_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row ? toSession(row) : null;
  }

  /**
   * Find all sessions with limit
   */
  async findAll(limit = 10): Promise<Session[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('sessions')
      .selectAll()
      .orderBy('started_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map(toSession);
  }

  /**
   * Find sessions by project name
   */
  async findByProjectName(projectName: string, limit = 10): Promise<Session[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('sessions')
      .selectAll()
      .where('project_name', '=', projectName)
      .orderBy('started_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map(toSession);
  }

  /**
   * End a session with exit code
   */
  async end(id: string, exitCode: number): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .updateTable('sessions')
      .set({
        finished_at: now,
        exit_code: exitCode,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Update session project info
   */
  async updateProjectInfo(
    id: string,
    projectName: string,
    gcpProjectId: string
  ): Promise<void> {
    const db = getDb();

    await db
      .updateTable('sessions')
      .set({
        project_name: projectName,
        gcp_project_id: gcpProjectId,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Delete a session (cascades to events)
   */
  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.deleteFrom('sessions').where('id', '=', id).execute();
  }

  /**
   * Delete old sessions (cleanup)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('sessions')
      .where('started_at', '<', date.toISOString())
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }
}
