/**
 * Event repository - CRUD operations for deploy events in the registry
 */

import { getDb } from '../db.js';
import type {
  Event,
  CreateEventInput,
  EventCategory,
  EventType,
  EventFilters,
} from '../event-log.types.js';

/**
 * Convert database row to Event
 */
function toEvent(row: {
  id: number;
  session_id: string;
  timestamp: string;
  seq: number;
  project: string | null;
  category: string;
  event_type: string;
  resource_type: string | null;
  resource_name: string | null;
  terraform_address: string | null;
  data: string;
  parent_event_id: number | null;
  correlation_id: string | null;
}): Event {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: new Date(row.timestamp),
    seq: row.seq,
    project: row.project,
    category: row.category as EventCategory,
    eventType: row.event_type as EventType,
    resourceType: row.resource_type,
    resourceName: row.resource_name,
    terraformAddress: row.terraform_address,
    data: JSON.parse(row.data),
    parentEventId: row.parent_event_id,
    correlationId: row.correlation_id,
  };
}

export class EventRepository {
  // Sequence counter per session (in-memory for performance)
  private seqCounters = new Map<string, number>();

  /**
   * Get the next sequence number for a session
   */
  private getNextSeq(sessionId: string): number {
    const current = this.seqCounters.get(sessionId) || 0;
    const next = current + 1;
    this.seqCounters.set(sessionId, next);
    return next;
  }

  /**
   * Reset sequence counter for a session
   */
  resetSeq(sessionId: string): void {
    this.seqCounters.delete(sessionId);
  }

  /**
   * Create a new event
   */
  async create(input: CreateEventInput): Promise<Event> {
    const db = getDb();
    const now = new Date().toISOString();
    const seq = this.getNextSeq(input.sessionId);

    const result = await db
      .insertInto('events')
      .values({
        session_id: input.sessionId,
        timestamp: now,
        seq,
        project: input.project || null,
        category: input.category,
        event_type: input.eventType,
        resource_type: input.resourceType || null,
        resource_name: input.resourceName || null,
        terraform_address: input.terraformAddress || null,
        data: JSON.stringify(input.data),
        parent_event_id: input.parentEventId || null,
        correlation_id: input.correlationId || null,
      })
      .returning(['id'])
      .executeTakeFirst();

    const id = result?.id ?? 0;

    return {
      id,
      sessionId: input.sessionId,
      timestamp: new Date(now),
      seq,
      project: input.project || null,
      category: input.category,
      eventType: input.eventType,
      resourceType: input.resourceType || null,
      resourceName: input.resourceName || null,
      terraformAddress: input.terraformAddress || null,
      data: input.data,
      parentEventId: input.parentEventId || null,
      correlationId: input.correlationId || null,
    };
  }

  /**
   * Find an event by ID
   */
  async findById(id: number): Promise<Event | null> {
    const db = getDb();
    const row = await db
      .selectFrom('events')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toEvent(row) : null;
  }

  /**
   * Find events by session ID with optional filters
   */
  async findBySessionId(sessionId: string, filters?: EventFilters): Promise<Event[]> {
    const db = getDb();

    let query = db
      .selectFrom('events')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('seq', 'asc');

    if (filters?.category) {
      query = query.where('category', '=', filters.category);
    }

    if (filters?.eventType) {
      query = query.where('event_type', '=', filters.eventType);
    }

    if (filters?.resourceName) {
      query = query.where('resource_name', '=', filters.resourceName);
    }

    if (filters?.correlationId) {
      query = query.where('correlation_id', '=', filters.correlationId);
    }

    if (filters?.since) {
      query = query.where('timestamp', '>=', filters.since.toISOString());
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const rows = await query.execute();
    return rows.map(toEvent);
  }

  /**
   * Find events by resource name across all sessions
   */
  async findByResourceName(resourceName: string, limit = 100): Promise<Event[]> {
    const db = getDb();

    const rows = await db
      .selectFrom('events')
      .selectAll()
      .where('resource_name', '=', resourceName)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .execute();

    return rows.map(toEvent);
  }

  /**
   * Find events by project name
   */
  async findByProject(project: string, limit = 100): Promise<Event[]> {
    const db = getDb();

    const rows = await db
      .selectFrom('events')
      .selectAll()
      .where('project', '=', project)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .execute();

    return rows.map(toEvent);
  }

  /**
   * Find events by correlation ID
   */
  async findByCorrelationId(correlationId: string): Promise<Event[]> {
    const db = getDb();

    const rows = await db
      .selectFrom('events')
      .selectAll()
      .where('correlation_id', '=', correlationId)
      .orderBy('seq', 'asc')
      .execute();

    return rows.map(toEvent);
  }

  /**
   * Count events for a session
   */
  async countBySessionId(sessionId: string): Promise<number> {
    const db = getDb();

    const result = await db
      .selectFrom('events')
      .select(db.fn.count<number>('id').as('count'))
      .where('session_id', '=', sessionId)
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  /**
   * Delete events for a session
   */
  async deleteBySessionId(sessionId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('events')
      .where('session_id', '=', sessionId)
      .executeTakeFirst();

    this.resetSeq(sessionId);
    return Number(result.numDeletedRows);
  }

  /**
   * Delete old events (cleanup)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const db = getDb();
    const result = await db
      .deleteFrom('events')
      .where('timestamp', '<', date.toISOString())
      .executeTakeFirst();

    return Number(result.numDeletedRows);
  }
}
