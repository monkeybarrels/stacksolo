import { describe, it, expect } from 'vitest';
import { resolveConfig, findResource, findResourcesByType } from '../resolver';
import type { StackSoloConfig } from '../schema';

describe('resolveConfig', () => {
  describe('basic resolution', () => {
    it('should resolve project info', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
        },
      };

      const resolved = resolveConfig(config);

      expect(resolved.project.name).toBe('my-app');
      expect(resolved.project.region).toBe('us-central1');
      expect(resolved.project.gcpProjectId).toBe('my-project');
    });

    it('should resolve empty config to empty resources', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
        },
      };

      const resolved = resolveConfig(config);

      expect(resolved.resources).toHaveLength(0);
    });
  });

  describe('bucket resolution', () => {
    it('should resolve buckets to storage_bucket resources', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [
            { name: 'uploads', storageClass: 'STANDARD' },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const bucket = findResource(resolved, 'bucket-uploads');

      expect(bucket).toBeDefined();
      expect(bucket?.type).toBe('gcp:storage_bucket');
      expect(bucket?.config.name).toBe('uploads');
      expect(bucket?.config.storageClass).toBe('STANDARD');
      expect(bucket?.dependsOn).toHaveLength(0);
    });

    it('should inherit region from project', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'europe-west1',
          gcpProjectId: 'my-project',
          buckets: [{ name: 'uploads' }],
        },
      };

      const resolved = resolveConfig(config);
      const bucket = findResource(resolved, 'bucket-uploads');

      expect(bucket?.config.location).toBe('europe-west1');
    });
  });

  describe('secret resolution', () => {
    it('should resolve secrets to secret resources', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          secrets: [
            { name: 'api-key', value: 'secret123' },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const secret = findResource(resolved, 'secret-api-key');

      expect(secret).toBeDefined();
      expect(secret?.type).toBe('gcp:secret');
      expect(secret?.config.value).toBe('secret123');
    });
  });

  describe('network resolution', () => {
    it('should resolve networks to vpc_network resources', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            { name: 'main', routingMode: 'GLOBAL' },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const network = findResource(resolved, 'network-main');

      expect(network).toBeDefined();
      expect(network?.type).toBe('gcp:vpc_network');
      expect(network?.config.routingMode).toBe('GLOBAL');
    });

    it('should resolve containers within network', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            {
              name: 'main',
              containers: [
                { name: 'api', image: 'gcr.io/project/api:latest', memory: '1Gi' },
              ],
            },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const container = findResource(resolved, 'container-api');

      expect(container).toBeDefined();
      expect(container?.type).toBe('gcp-cdktf:cloud_run');
      expect(container?.config.image).toBe('gcr.io/project/api:latest');
      expect(container?.config.memory).toBe('1Gi');
      expect(container?.network).toBe('main');
      expect(container?.dependsOn).toContain('network-main');
    });

    it('should resolve databases within network', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            {
              name: 'main',
              databases: [
                { name: 'db', databaseVersion: 'POSTGRES_15', tier: 'db-g1-small' },
              ],
            },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const database = findResource(resolved, 'database-db');

      expect(database).toBeDefined();
      expect(database?.type).toBe('gcp:cloud_sql');
      expect(database?.config.databaseVersion).toBe('POSTGRES_15');
      expect(database?.network).toBe('main');
    });

    it('should resolve caches within network', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            {
              name: 'main',
              caches: [
                { name: 'redis', tier: 'STANDARD_HA', memorySizeGb: 2 },
              ],
            },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const cache = findResource(resolved, 'cache-redis');

      expect(cache).toBeDefined();
      expect(cache?.type).toBe('gcp:memorystore');
      expect(cache?.config.tier).toBe('STANDARD_HA');
      expect(cache?.config.memorySizeGb).toBe(2);
    });
  });

  describe('dependency resolution', () => {
    it('should add dependency when container references a secret', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          secrets: [{ name: 'api-key' }],
          networks: [
            {
              name: 'main',
              containers: [
                {
                  name: 'api',
                  env: {
                    API_KEY: '@secret/api-key',
                  },
                },
              ],
            },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const container = findResource(resolved, 'container-api');

      expect(container?.dependsOn).toContain('secret-api-key');
    });

    it('should add dependency when container references a database', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          networks: [
            {
              name: 'main',
              containers: [
                {
                  name: 'api',
                  env: {
                    DATABASE_URL: '@database/db.connectionString',
                  },
                },
              ],
              databases: [{ name: 'db' }],
            },
          ],
        },
      };

      const resolved = resolveConfig(config);
      const container = findResource(resolved, 'container-api');

      expect(container?.dependsOn).toContain('database-db');
    });
  });

  describe('findResourcesByType', () => {
    it('should find all resources of a given type', () => {
      const config: StackSoloConfig = {
        project: {
          name: 'my-app',
          region: 'us-central1',
          gcpProjectId: 'my-project',
          buckets: [
            { name: 'uploads' },
            { name: 'backups' },
          ],
          secrets: [{ name: 'api-key' }],
        },
      };

      const resolved = resolveConfig(config);
      const buckets = findResourcesByType(resolved, 'gcp:storage_bucket');

      expect(buckets).toHaveLength(2);
      expect(buckets.map(b => b.name)).toContain('uploads');
      expect(buckets.map(b => b.name)).toContain('backups');
    });
  });
});
