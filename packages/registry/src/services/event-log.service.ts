/**
 * Event Log Service
 *
 * High-resolution event logging for deploy operations.
 * Provides full observability of every operation during deployment.
 *
 * Uses SessionRepository and EventRepository for data access.
 */

import { SessionRepository } from '../repositories/session.repository.js';
import { EventRepository } from '../repositories/event.repository.js';
import type {
  Session,
  Event,
  CreateSessionInput,
  CreateEventInput,
  EventFilters,
} from '../event-log.types.js';

// Singleton repository instances
const sessionRepo = new SessionRepository();
const eventRepo = new EventRepository();

// =============================================================================
// Session Operations
// =============================================================================

/**
 * Start a new deploy session
 */
export async function startSession(input: CreateSessionInput): Promise<string> {
  const session = await sessionRepo.create(input);

  // Log session start event
  await logEvent({
    sessionId: session.id,
    category: 'internal',
    eventType: 'session_start',
    data: {
      command: input.command,
      args: input.args,
      projectName: input.projectName,
      gcpProjectId: input.gcpProjectId,
    },
  });

  return session.id;
}

/**
 * End a deploy session
 */
export async function endSession(sessionId: string, exitCode: number): Promise<void> {
  // Log session end event first
  await logEvent({
    sessionId,
    category: 'internal',
    eventType: 'session_end',
    data: { exitCode },
  });

  await sessionRepo.end(sessionId, exitCode);

  // Clean up sequence counter
  eventRepo.resetSeq(sessionId);
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  return sessionRepo.findById(sessionId);
}

/**
 * Get the most recent session
 */
export async function getLatestSession(): Promise<Session | null> {
  return sessionRepo.findLatest();
}

/**
 * List recent sessions
 */
export async function listSessions(limit = 10): Promise<Session[]> {
  return sessionRepo.findAll(limit);
}

// =============================================================================
// Event Operations
// =============================================================================

/**
 * Log an event to the current session
 */
export async function logEvent(input: CreateEventInput): Promise<number> {
  const event = await eventRepo.create(input);
  return event.id;
}

/**
 * Get events for a session with optional filters
 */
export async function getSessionEvents(
  sessionId: string,
  filters?: EventFilters
): Promise<Event[]> {
  return eventRepo.findBySessionId(sessionId, filters);
}

/**
 * Get events by resource name across all sessions
 */
export async function getEventsByResource(resourceName: string, limit = 100): Promise<Event[]> {
  return eventRepo.findByResourceName(resourceName, limit);
}

/**
 * Get event count for a session
 */
export async function getEventCount(sessionId: string): Promise<number> {
  return eventRepo.countBySessionId(sessionId);
}

// =============================================================================
// Helper Functions for Common Event Types
// =============================================================================

/**
 * Log a phase start event
 */
export async function logPhaseStart(
  sessionId: string,
  phase: string,
  options?: { project?: string; correlationId?: string }
): Promise<number> {
  return logEvent({
    sessionId,
    project: options?.project,
    category: 'internal',
    eventType: 'phase_start',
    data: { phase },
    correlationId: options?.correlationId,
  });
}

/**
 * Log a phase end event
 */
export async function logPhaseEnd(
  sessionId: string,
  phase: string,
  options?: { project?: string; correlationId?: string }
): Promise<number> {
  return logEvent({
    sessionId,
    project: options?.project,
    category: 'internal',
    eventType: 'phase_end',
    data: { phase },
    correlationId: options?.correlationId,
  });
}

/**
 * Log a terraform event
 */
export async function logTerraformEvent(
  sessionId: string,
  eventType: 'init_start' | 'init_end' | 'plan_start' | 'plan_end' | 'apply_start' | 'apply_end',
  data: Record<string, unknown>,
  options?: { project?: string; correlationId?: string }
): Promise<number> {
  return logEvent({
    sessionId,
    project: options?.project,
    category: 'terraform',
    eventType,
    data,
    correlationId: options?.correlationId,
  });
}

/**
 * Log a terraform resource event
 */
export async function logTerraformResourceEvent(
  sessionId: string,
  eventType:
    | 'resource_creating'
    | 'resource_created'
    | 'resource_updating'
    | 'resource_updated'
    | 'resource_destroying'
    | 'resource_destroyed'
    | 'resource_error',
  address: string,
  data: Record<string, unknown>,
  correlationId?: string
): Promise<number> {
  // Parse address to extract type and name (e.g., google_storage_bucket.web)
  const [resourceType, resourceName] = address.split('.');

  return logEvent({
    sessionId,
    category: 'terraform',
    eventType,
    resourceType,
    resourceName,
    terraformAddress: address,
    data: { address, ...data },
    correlationId,
  });
}

/**
 * Log a file write event
 */
export async function logFileWrite(
  sessionId: string,
  path: string,
  size: number,
  hash?: string
): Promise<number> {
  return logEvent({
    sessionId,
    category: 'file',
    eventType: 'write',
    data: { path, size, hash },
  });
}

/**
 * Log a gcloud command event
 */
export async function logGcloudCommand(
  sessionId: string,
  eventType: 'command_start' | 'command_end',
  data: Record<string, unknown>,
  correlationId?: string
): Promise<number> {
  return logEvent({
    sessionId,
    category: 'gcloud',
    eventType,
    data,
    correlationId,
  });
}

/**
 * Log a conflict detection event
 */
export async function logConflictDetected(
  sessionId: string,
  resources: Array<{ type: string; name: string; address?: string }>
): Promise<number> {
  return logEvent({
    sessionId,
    category: 'internal',
    eventType: 'conflict_detected',
    data: { resources, count: resources.length },
  });
}

/**
 * Log a user prompt/response event
 */
export async function logUserPrompt(
  sessionId: string,
  question: string,
  choices?: string[]
): Promise<number> {
  return logEvent({
    sessionId,
    category: 'internal',
    eventType: 'user_prompt',
    data: { question, choices },
  });
}

export async function logUserResponse(sessionId: string, choice: string): Promise<number> {
  return logEvent({
    sessionId,
    category: 'internal',
    eventType: 'user_response',
    data: { choice },
  });
}

// =============================================================================
// Repository Access (for advanced usage)
// =============================================================================

/**
 * Get the session repository instance
 */
export function getSessionRepository(): SessionRepository {
  return sessionRepo;
}

/**
 * Get the event repository instance
 */
export function getEventRepository(): EventRepository {
  return eventRepo;
}

// =============================================================================
// Singleton Service
// =============================================================================

export const EventLogService = {
  // Session operations
  startSession,
  endSession,
  getSession,
  getLatestSession,
  listSessions,

  // Event operations
  logEvent,
  getSessionEvents,
  getEventsByResource,
  getEventCount,

  // Helper functions
  logPhaseStart,
  logPhaseEnd,
  logTerraformEvent,
  logTerraformResourceEvent,
  logFileWrite,
  logGcloudCommand,
  logConflictDetected,
  logUserPrompt,
  logUserResponse,

  // Repository access
  getSessionRepository,
  getEventRepository,
};
