/**
 * Registry tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Set test database path before importing modules
const testDir = mkdtempSync(join(tmpdir(), 'stacksolo-registry-test-'));
process.env.STACKSOLO_REGISTRY_PATH = join(testDir, 'test-registry.db');

import {
  getRegistry,
  ReferenceService,
  closeRegistry,
} from '../index.js';

describe('Registry', () => {
  const registry = getRegistry();

  beforeAll(async () => {
    await registry.init();
  });

  afterAll(async () => {
    await closeRegistry();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('ProjectRepository', () => {
    it('should create a project', async () => {
      const project = await registry.registerProject({
        name: 'test-project',
        gcpProjectId: 'test-gcp-project',
        region: 'us-central1',
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('test-project');
      expect(project.gcpProjectId).toBe('test-gcp-project');
      expect(project.region).toBe('us-central1');
      expect(project.status).toBe('pending');
    });

    it('should find a project by name', async () => {
      const project = await registry.findProjectByName('test-project');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('test-project');
    });

    it('should list all projects', async () => {
      const projects = await registry.listProjects();
      expect(projects.length).toBeGreaterThan(0);
      expect(projects.some((p) => p.name === 'test-project')).toBe(true);
    });

    it('should update project status', async () => {
      const project = await registry.findProjectByName('test-project');
      await registry.updateProjectStatus(project!.id, 'deployed');

      const updated = await registry.findProjectByName('test-project');
      expect(updated!.status).toBe('deployed');
    });
  });

  describe('ResourceRepository', () => {
    it('should create a resource', async () => {
      const project = await registry.findProjectByName('test-project');

      const resource = await registry.createResource({
        projectId: project!.id,
        type: 'database',
        name: 'users-db',
        network: 'main',
        resourceType: 'gcp:cloud_sql',
        config: { databaseVersion: 'POSTGRES_15' },
      });

      expect(resource.id).toBeDefined();
      expect(resource.name).toBe('users-db');
      expect(resource.type).toBe('database');
      expect(resource.network).toBe('main');
    });

    it('should find resources by project', async () => {
      const project = await registry.findProjectByName('test-project');
      const resources = await registry.findResourcesByProject(project!.id);

      expect(resources.length).toBeGreaterThan(0);
      expect(resources.some((r) => r.name === 'users-db')).toBe(true);
    });

    it('should update resource outputs', async () => {
      const project = await registry.findProjectByName('test-project');
      const resources = await registry.findResourcesByProject(project!.id);
      const dbResource = resources.find((r) => r.name === 'users-db');

      await registry.updateResourceOutputs(dbResource!.id, {
        connectionString: 'postgresql://user:pass@10.0.0.1/db',
        privateIp: '10.0.0.1',
      });

      const updated = await registry.findResourceByRef(
        project!.id,
        'users-db',
        'main'
      );

      expect(updated!.outputs).not.toBeNull();
      expect(updated!.outputs!.connectionString).toBe(
        'postgresql://user:pass@10.0.0.1/db'
      );
      expect(updated!.status).toBe('ready');
    });
  });

  describe('ReferenceService', () => {
    const refService = new ReferenceService(registry);

    it('should parse a simple reference', () => {
      const ref = refService.parseReference('@test-project/users-db.connectionString');
      expect(ref).not.toBeNull();
      expect(ref!.projectName).toBe('test-project');
      expect(ref!.resourceName).toBe('users-db');
      expect(ref!.property).toBe('connectionString');
      expect(ref!.network).toBeNull();
    });

    it('should parse a reference with network', () => {
      const ref = refService.parseReference('@test-project/main/users-db.connectionString');
      expect(ref).not.toBeNull();
      expect(ref!.projectName).toBe('test-project');
      expect(ref!.network).toBe('main');
      expect(ref!.resourceName).toBe('users-db');
      expect(ref!.property).toBe('connectionString');
    });

    it('should resolve a reference', async () => {
      const value = await refService.resolve(
        '@test-project/main/users-db.connectionString'
      );
      expect(value).toBe('postgresql://user:pass@10.0.0.1/db');
    });

    it('should resolve a reference without property (use default)', async () => {
      const value = await refService.resolve('@test-project/main/users-db');
      // Default for database is connectionString
      expect(value).toBe('postgresql://user:pass@10.0.0.1/db');
    });

    it('should throw for invalid reference', () => {
      expect(refService.parseReference('not-a-reference')).toBeNull();
      expect(refService.parseReference('@')).toBeNull();
      expect(refService.parseReference('@project')).toBeNull();
    });

    it('should find all references in an object', () => {
      const refs = refService.findReferences({
        env: {
          DATABASE_URL: '@other-project/db.connectionString',
          API_URL: '@api-project/api.url',
          STATIC: 'not-a-ref',
        },
        nested: {
          value: '@nested/resource.name',
        },
      });

      expect(refs).toHaveLength(3);
      expect(refs).toContain('@other-project/db.connectionString');
      expect(refs).toContain('@api-project/api.url');
      expect(refs).toContain('@nested/resource.name');
    });
  });

  describe('Deployment tracking', () => {
    it('should record a deployment', async () => {
      const project = await registry.findProjectByName('test-project');

      const deployment = await registry.recordDeployment({
        projectId: project!.id,
        action: 'deploy',
        configSnapshot: { project: { name: 'test-project' } },
      });

      expect(deployment.id).toBeDefined();
      expect(deployment.action).toBe('deploy');
      expect(deployment.status).toBe('pending');
    });

    it('should find latest deployment', async () => {
      const project = await registry.findProjectByName('test-project');
      const latest = await registry.findLatestDeployment(project!.id);

      expect(latest).not.toBeNull();
      expect(latest!.action).toBe('deploy');
    });

    it('should update deployment status', async () => {
      const project = await registry.findProjectByName('test-project');
      const deployment = await registry.findLatestDeployment(project!.id);

      await registry.markDeploymentSucceeded(deployment!.id);

      const updated = await registry.findLatestDeployment(project!.id);
      expect(updated!.status).toBe('succeeded');
      expect(updated!.completedAt).not.toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should unregister a project', async () => {
      const result = await registry.unregisterProjectByName('test-project');
      expect(result).toBe(true);

      const project = await registry.findProjectByName('test-project');
      expect(project).toBeNull();
    });
  });
});
