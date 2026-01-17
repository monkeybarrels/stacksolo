/**
 * Event Log tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Set test database path before importing modules
const testDir = mkdtempSync(join(tmpdir(), 'stacksolo-eventlog-test-'));
process.env.STACKSOLO_REGISTRY_PATH = join(testDir, 'test-registry.db');

import {
  initRegistry,
  closeRegistry,
  SessionRepository,
  EventRepository,
  startSession,
  endSession,
  getSession,
  getLatestSession,
  listSessions,
  logEvent,
  getSessionEvents,
  getEventsByResource,
  getEventCount,
  logPhaseStart,
  logPhaseEnd,
  logTerraformEvent,
  logConflictDetected,
} from '../index.js';

describe('Event Log', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  afterAll(async () => {
    await closeRegistry();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('SessionRepository', () => {
    const sessionRepo = new SessionRepository();

    it('should create a session', async () => {
      const session = await sessionRepo.create({
        command: 'deploy',
        args: '--preview',
        projectName: 'test-project',
        gcpProjectId: 'test-gcp-id',
      });

      expect(session.id).toBeDefined();
      expect(session.command).toBe('deploy');
      expect(session.args).toBe('--preview');
      expect(session.projectName).toBe('test-project');
      expect(session.gcpProjectId).toBe('test-gcp-id');
      expect(session.exitCode).toBeNull();
      expect(session.finishedAt).toBeNull();
    });

    it('should find a session by ID', async () => {
      const created = await sessionRepo.create({ command: 'preview' });
      const found = await sessionRepo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.command).toBe('preview');
    });

    it('should find the latest session', async () => {
      await sessionRepo.create({ command: 'destroy' });
      const latest = await sessionRepo.findLatest();

      expect(latest).not.toBeNull();
      expect(latest!.command).toBe('destroy');
    });

    it('should end a session with exit code', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });
      await sessionRepo.end(session.id, 0);

      const ended = await sessionRepo.findById(session.id);
      expect(ended!.exitCode).toBe(0);
      expect(ended!.finishedAt).not.toBeNull();
    });

    it('should list sessions with limit', async () => {
      const sessions = await sessionRepo.findAll(5);
      expect(sessions.length).toBeLessThanOrEqual(5);
      expect(sessions.length).toBeGreaterThan(0);
    });
  });

  describe('EventRepository', () => {
    const sessionRepo = new SessionRepository();
    const eventRepo = new EventRepository();

    it('should create an event', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });

      const event = await eventRepo.create({
        sessionId: session.id,
        project: 'my-project',
        category: 'internal',
        eventType: 'phase_start',
        data: { phase: 'preflight' },
      });

      expect(event.id).toBeDefined();
      expect(event.sessionId).toBe(session.id);
      expect(event.project).toBe('my-project');
      expect(event.category).toBe('internal');
      expect(event.eventType).toBe('phase_start');
      expect(event.seq).toBe(1);
      expect(event.data).toEqual({ phase: 'preflight' });
    });

    it('should increment sequence numbers per session', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });

      const event1 = await eventRepo.create({
        sessionId: session.id,
        category: 'internal',
        eventType: 'phase_start',
        data: { phase: 'preflight' },
      });

      const event2 = await eventRepo.create({
        sessionId: session.id,
        category: 'internal',
        eventType: 'phase_end',
        data: { phase: 'preflight' },
      });

      expect(event1.seq).toBe(1);
      expect(event2.seq).toBe(2);
    });

    it('should find events by session ID', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });

      await eventRepo.create({
        sessionId: session.id,
        category: 'terraform',
        eventType: 'apply_start',
        data: {},
      });

      await eventRepo.create({
        sessionId: session.id,
        category: 'terraform',
        eventType: 'apply_end',
        data: { exitCode: 0 },
      });

      const events = await eventRepo.findBySessionId(session.id);
      expect(events.length).toBe(2);
      expect(events[0].eventType).toBe('apply_start');
      expect(events[1].eventType).toBe('apply_end');
    });

    it('should filter events by category', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });

      await eventRepo.create({
        sessionId: session.id,
        category: 'internal',
        eventType: 'phase_start',
        data: {},
      });

      await eventRepo.create({
        sessionId: session.id,
        category: 'terraform',
        eventType: 'apply_start',
        data: {},
      });

      const filtered = await eventRepo.findBySessionId(session.id, {
        category: 'terraform',
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].category).toBe('terraform');
    });

    it('should find events by resource name', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });

      await eventRepo.create({
        sessionId: session.id,
        category: 'terraform',
        eventType: 'resource_created',
        resourceType: 'google_storage_bucket',
        resourceName: 'web-assets',
        terraformAddress: 'google_storage_bucket.web-assets',
        data: {},
      });

      const events = await eventRepo.findByResourceName('web-assets');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].resourceName).toBe('web-assets');
    });

    it('should find events by project', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });
      const uniqueProjectName = `unique-project-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await eventRepo.create({
        sessionId: session.id,
        project: uniqueProjectName,
        category: 'internal',
        eventType: 'session_start',
        data: {},
      });

      const events = await eventRepo.findByProject(uniqueProjectName);
      expect(events.length).toBe(1);
      expect(events[0].project).toBe(uniqueProjectName);
    });

    it('should count events for a session', async () => {
      const session = await sessionRepo.create({ command: 'deploy' });

      await eventRepo.create({
        sessionId: session.id,
        category: 'internal',
        eventType: 'phase_start',
        data: {},
      });

      await eventRepo.create({
        sessionId: session.id,
        category: 'internal',
        eventType: 'phase_end',
        data: {},
      });

      const count = await eventRepo.countBySessionId(session.id);
      expect(count).toBe(2);
    });
  });

  describe('EventLogService (convenience functions)', () => {
    it('should start and end a session', async () => {
      const sessionId = await startSession({
        command: 'deploy',
        projectName: 'service-test-project',
      });

      expect(sessionId).toBeDefined();

      const session = await getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session!.command).toBe('deploy');

      await endSession(sessionId, 0);

      const ended = await getSession(sessionId);
      expect(ended!.exitCode).toBe(0);
    });

    it('should get latest session', async () => {
      await startSession({ command: 'latest-test' });

      const latest = await getLatestSession();
      expect(latest).not.toBeNull();
      expect(latest!.command).toBe('latest-test');
    });

    it('should list sessions', async () => {
      const sessions = await listSessions(10);
      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should log events with logEvent', async () => {
      const sessionId = await startSession({ command: 'event-test' });

      const eventId = await logEvent({
        sessionId,
        project: 'event-test-project',
        category: 'file',
        eventType: 'write',
        data: { path: '/tmp/test.tf', size: 1024 },
      });

      expect(eventId).toBeGreaterThan(0);

      const events = await getSessionEvents(sessionId);
      // Should have session_start + our event
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should log phase events', async () => {
      const sessionId = await startSession({ command: 'phase-test' });

      await logPhaseStart(sessionId, 'preflight');
      await logPhaseEnd(sessionId, 'preflight');

      const events = await getSessionEvents(sessionId, { category: 'internal' });
      const phaseEvents = events.filter(
        (e) => e.eventType === 'phase_start' || e.eventType === 'phase_end'
      );

      expect(phaseEvents.length).toBe(2);
      expect(phaseEvents[0].data).toEqual({ phase: 'preflight' });
    });

    it('should log terraform events', async () => {
      const sessionId = await startSession({ command: 'tf-test' });

      await logTerraformEvent(sessionId, 'apply_start', {
        preview: false,
        resourceCount: 5,
      });

      await logTerraformEvent(sessionId, 'apply_end', {
        exitCode: 0,
        durationMs: 30000,
      });

      const events = await getSessionEvents(sessionId, { category: 'terraform' });
      expect(events.length).toBe(2);
      expect(events[0].eventType).toBe('apply_start');
      expect(events[1].eventType).toBe('apply_end');
    });

    it('should log conflict events', async () => {
      const sessionId = await startSession({ command: 'conflict-test' });

      await logConflictDetected(sessionId, [
        { type: 'storage', name: 'bucket-1', address: 'google_storage_bucket.bucket-1' },
        { type: 'function', name: 'func-1' },
      ]);

      const events = await getSessionEvents(sessionId, { eventType: 'conflict_detected' });
      expect(events.length).toBe(1);
      expect(events[0].data).toEqual({
        resources: [
          { type: 'storage', name: 'bucket-1', address: 'google_storage_bucket.bucket-1' },
          { type: 'function', name: 'func-1' },
        ],
        count: 2,
      });
    });

    it('should get events by resource', async () => {
      const sessionId = await startSession({ command: 'resource-test' });

      await logEvent({
        sessionId,
        category: 'terraform',
        eventType: 'resource_created',
        resourceType: 'google_cloudfunctions2_function',
        resourceName: 'api-handler',
        terraformAddress: 'google_cloudfunctions2_function.api-handler',
        data: {},
      });

      const events = await getEventsByResource('api-handler');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].resourceName).toBe('api-handler');
    });

    it('should get event count', async () => {
      const sessionId = await startSession({ command: 'count-test' });

      await logEvent({
        sessionId,
        category: 'file',
        eventType: 'write',
        data: {},
      });

      const count = await getEventCount(sessionId);
      // session_start + our event
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });
});
