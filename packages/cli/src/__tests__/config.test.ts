import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { parseConfig, validateConfig, resolveConfig, topologicalSort } from '@stacksolo/blueprint';
import type { StackSoloConfig } from '@stacksolo/blueprint';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

async function createTempDir(): Promise<string> {
  const tempDir = path.join(tmpdir(), `stacksolo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function writeConfig(dir: string, config: StackSoloConfig): Promise<string> {
  const stacksoloDir = path.join(dir, STACKSOLO_DIR);
  await fs.mkdir(stacksoloDir, { recursive: true });
  const configPath = path.join(stacksoloDir, CONFIG_FILENAME);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

describe('config show', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should parse a minimal config', async () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const configPath = await writeConfig(tempDir, config);
    const parsed = parseConfig(configPath);

    expect(parsed.project.name).toBe('test-app');
    expect(parsed.project.region).toBe('us-central1');
    expect(parsed.project.gcpProjectId).toBe('my-project');
  });

  it('should parse config with buckets', async () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [
          { name: 'uploads', storageClass: 'STANDARD' },
          { name: 'backups', storageClass: 'NEARLINE' },
        ],
      },
    };

    const configPath = await writeConfig(tempDir, config);
    const parsed = parseConfig(configPath);

    expect(parsed.project.buckets).toHaveLength(2);
    expect(parsed.project.buckets?.[0].name).toBe('uploads');
    expect(parsed.project.buckets?.[1].storageClass).toBe('NEARLINE');
  });

  it('should parse config with secrets', async () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        secrets: [
          { name: 'api-key' },
          { name: 'db-password' },
        ],
      },
    };

    const configPath = await writeConfig(tempDir, config);
    const parsed = parseConfig(configPath);

    expect(parsed.project.secrets).toHaveLength(2);
  });

  it('should parse config with networks and containers', async () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            containers: [
              {
                name: 'api',
                image: 'gcr.io/project/api:latest',
                memory: '512Mi',
              },
            ],
          },
        ],
      },
    };

    const configPath = await writeConfig(tempDir, config);
    const parsed = parseConfig(configPath);

    expect(parsed.project.networks).toHaveLength(1);
    expect(parsed.project.networks?.[0].containers).toHaveLength(1);
    expect(parsed.project.networks?.[0].containers?.[0].name).toBe('api');
  });
});

describe('config validate', () => {
  it('should validate a correct minimal config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject config with empty project name', () => {
    const config: StackSoloConfig = {
      project: {
        name: '',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes('name'))).toBe(true);
  });

  it('should reject config with invalid project name format', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'Invalid_Name',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should validate config with all resource types', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'full-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'uploads' }],
        secrets: [{ name: 'api-key' }],
        topics: [{ name: 'events' }],
        networks: [
          {
            name: 'main',
            containers: [{ name: 'api' }],
            databases: [{ name: 'main-db' }],
            caches: [{ name: 'redis' }],
          },
        ],
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(true);
  });

  it('should detect duplicate bucket names', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [
          { name: 'same-name' },
          { name: 'same-name' },
        ],
      },
    };

    const result = validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('duplicate'))).toBe(true);
  });
});

describe('config resources', () => {
  it('should resolve resources from config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'uploads' }],
        secrets: [{ name: 'api-key' }],
      },
    };

    const resolved = resolveConfig(config);

    expect(resolved.resources.length).toBe(2);
    expect(resolved.resources.some((r) => r.type === 'gcp:storage_bucket')).toBe(true);
    expect(resolved.resources.some((r) => r.type === 'gcp:secret')).toBe(true);
  });

  it('should resolve network resources', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            containers: [{ name: 'api' }],
            databases: [{ name: 'db' }],
          },
        ],
      },
    };

    const resolved = resolveConfig(config);

    expect(resolved.resources.some((r) => r.type === 'gcp:vpc_network')).toBe(true);
    expect(resolved.resources.some((r) => r.type === 'gcp-cdktf:cloud_run')).toBe(true);
    expect(resolved.resources.some((r) => r.type === 'gcp:cloud_sql')).toBe(true);
  });

  it('should generate correct resource IDs', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'my-bucket' }],
      },
    };

    const resolved = resolveConfig(config);
    const bucket = resolved.resources.find((r) => r.type === 'gcp:storage_bucket');

    expect(bucket?.id).toBe('bucket-my-bucket');
  });

  it('should topologically sort resources', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
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
    const order = topologicalSort(resolved.resources);

    const secretIndex = order.indexOf('secret-api-key');
    const containerIndex = order.indexOf('container-api');

    expect(secretIndex).toBeLessThan(containerIndex);
  });
});

describe('config references', () => {
  it('should detect secret references in container env', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
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
    const container = resolved.resources.find((r) => r.id === 'container-api');

    expect(container?.dependsOn).toContain('secret-api-key');
  });

  it('should detect database references', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
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
    const container = resolved.resources.find((r) => r.id === 'container-api');

    expect(container?.dependsOn).toContain('database-db');
  });

  it('should detect cache references', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            containers: [
              {
                name: 'api',
                env: {
                  REDIS_HOST: '@cache/redis.host',
                },
              },
            ],
            caches: [{ name: 'redis' }],
          },
        ],
      },
    };

    const resolved = resolveConfig(config);
    const container = resolved.resources.find((r) => r.id === 'container-api');

    expect(container?.dependsOn).toContain('cache-redis');
  });

  it('should detect bucket references', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'uploads' }],
        networks: [
          {
            name: 'main',
            containers: [
              {
                name: 'api',
                env: {
                  BUCKET: '@bucket/uploads.name',
                },
              },
            ],
          },
        ],
      },
    };

    const resolved = resolveConfig(config);
    const container = resolved.resources.find((r) => r.id === 'container-api');

    expect(container?.dependsOn).toContain('bucket-uploads');
  });

  it('should handle multiple references in same container', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'uploads' }],
        secrets: [{ name: 'jwt' }],
        networks: [
          {
            name: 'main',
            containers: [
              {
                name: 'api',
                env: {
                  BUCKET: '@bucket/uploads.name',
                  JWT_SECRET: '@secret/jwt',
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
    const container = resolved.resources.find((r) => r.id === 'container-api');

    expect(container?.dependsOn).toContain('bucket-uploads');
    expect(container?.dependsOn).toContain('secret-jwt');
    expect(container?.dependsOn).toContain('database-db');
  });
});

describe('config - error handling', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should throw on invalid JSON', async () => {
    const configPath = path.join(tempDir, STACKSOLO_DIR, CONFIG_FILENAME);
    await fs.mkdir(path.join(tempDir, STACKSOLO_DIR), { recursive: true });
    await fs.writeFile(configPath, '{ invalid json }');

    expect(() => parseConfig(configPath)).toThrow();
  });

  it('should throw on missing file', () => {
    const nonExistentPath = path.join(tempDir, STACKSOLO_DIR, 'nonexistent.json');
    expect(() => parseConfig(nonExistentPath)).toThrow();
  });
});
