import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import type { StackSoloConfig } from '@stacksolo/blueprint';
import {
  generateScaffold,
  writeScaffoldFiles,
  createLocalStorageDirs,
  updateGitignore,
} from '../scaffold/generators/index';
import { generateEnvFiles } from '../scaffold/generators/env';
import { generateDockerCompose } from '../scaffold/generators/docker-compose';
import { generateServiceScaffolds } from '../scaffold/generators/services';

async function createTempDir(): Promise<string> {
  const tempDir = path.join(tmpdir(), `stacksolo-scaffold-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

// ============================================================================
// Environment file generation
// ============================================================================

describe('generateEnvFiles', () => {
  it('should generate .env.local with project info', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envLocal.path).toBe('.env.local');
    expect(result.envLocal.content).toContain('PROJECT_NAME=test-app');
    expect(result.envLocal.content).toContain('GCP_PROJECT_ID=my-project');
    expect(result.envLocal.content).toContain('GCP_REGION=us-central1');
  });

  it('should generate .env.example with empty secret values', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        secrets: [{ name: 'api-key' }],
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envExample.path).toBe('.env.example');
    expect(result.envExample.content).toContain('API_KEY=');
    // .env.local should have placeholder value
    expect(result.envLocal.content).toContain('API_KEY=your-api-key-here');
  });

  it('should generate database env vars from config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            databases: [
              {
                name: 'main-db',
                databaseVersion: 'POSTGRES_15',
                databaseName: 'myapp',
              },
            ],
          },
        ],
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envLocal.content).toContain('MAIN_DB_HOST=localhost');
    expect(result.envLocal.content).toContain('MAIN_DB_PORT=5432');
    expect(result.envLocal.content).toContain('MAIN_DB_DATABASE=myapp');
    expect(result.envLocal.content).toContain('MAIN_DB_CONNECTION_STRING=postgres://postgres:postgres@localhost:5432/myapp');
  });

  it('should generate MySQL env vars correctly', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            databases: [
              {
                name: 'mysql-db',
                databaseVersion: 'MYSQL_8_0',
                databaseName: 'myapp',
              },
            ],
          },
        ],
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envLocal.content).toContain('MYSQL_DB_PORT=3306');
    expect(result.envLocal.content).toContain('MYSQL_DB_CONNECTION_STRING=mysql://root:postgres@localhost:3306/myapp');
  });

  it('should generate cache env vars from config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            caches: [{ name: 'redis' }],
          },
        ],
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envLocal.content).toContain('REDIS_HOST=localhost');
    expect(result.envLocal.content).toContain('REDIS_PORT=6379');
    expect(result.envLocal.content).toContain('REDIS_URL=redis://localhost:6379');
  });

  it('should generate bucket env vars from config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'uploads' }],
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envLocal.content).toContain('BUCKET_UPLOADS_PATH=./local-storage/uploads');
  });

  it('should generate lib/env.ts with type-safe accessors', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        secrets: [{ name: 'jwt-secret' }],
        networks: [
          {
            name: 'main',
            databases: [{ name: 'db' }],
            caches: [{ name: 'redis' }],
          },
        ],
      },
    };

    const result = generateEnvFiles(config);

    expect(result.envTs.path).toBe('lib/env.ts');
    expect(result.envTs.content).toContain('export const env = {');
    expect(result.envTs.content).toContain('requireEnv');
    expect(result.envTs.content).toContain('optionalEnv');
  });
});

// ============================================================================
// Docker Compose generation
// ============================================================================

describe('generateDockerCompose', () => {
  it('should return null when no databases or caches', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const result = generateDockerCompose(config);

    expect(result.dockerCompose).toBeNull();
    expect(result.services).toHaveLength(0);
  });

  it('should generate postgres service from database config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            databases: [
              {
                name: 'main-db',
                databaseVersion: 'POSTGRES_15',
                databaseName: 'myapp',
              },
            ],
          },
        ],
      },
    };

    const result = generateDockerCompose(config);

    expect(result.dockerCompose).not.toBeNull();
    expect(result.dockerCompose!.content).toContain('image: postgres:15');
    expect(result.dockerCompose!.content).toContain('POSTGRES_DB: myapp');
    expect(result.dockerCompose!.content).toContain('5432:5432');
    expect(result.services).toContain('main_db');
  });

  it('should generate mysql service from database config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            databases: [
              {
                name: 'mysql-db',
                databaseVersion: 'MYSQL_8_0',
                databaseName: 'myapp',
              },
            ],
          },
        ],
      },
    };

    const result = generateDockerCompose(config);

    expect(result.dockerCompose).not.toBeNull();
    expect(result.dockerCompose!.content).toContain('image: mysql:8.0');
    expect(result.dockerCompose!.content).toContain('MYSQL_DATABASE: myapp');
    expect(result.dockerCompose!.content).toContain('3306:3306');
  });

  it('should generate redis service from cache config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            caches: [{ name: 'sessions', redisVersion: '7' }],
          },
        ],
      },
    };

    const result = generateDockerCompose(config);

    expect(result.dockerCompose).not.toBeNull();
    expect(result.dockerCompose!.content).toContain('image: redis:7-alpine');
    expect(result.dockerCompose!.content).toContain('6379:6379');
    expect(result.services).toContain('sessions');
  });

  it('should include volume definitions', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            databases: [{ name: 'db' }],
          },
        ],
      },
    };

    const result = generateDockerCompose(config);

    expect(result.dockerCompose!.content).toContain('volumes:');
    expect(result.dockerCompose!.content).toContain('db_data:');
  });

  it('should include healthcheck configurations', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            databases: [{ name: 'db' }],
            caches: [{ name: 'redis' }],
          },
        ],
      },
    };

    const result = generateDockerCompose(config);

    expect(result.dockerCompose!.content).toContain('healthcheck:');
    expect(result.dockerCompose!.content).toContain('pg_isready');
    expect(result.dockerCompose!.content).toContain('redis-cli');
  });
});

// ============================================================================
// Service scaffolding
// ============================================================================

describe('generateServiceScaffolds', () => {
  it('should return empty when no containers or functions', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    const result = generateServiceScaffolds(config);

    expect(result.services).toHaveLength(0);
    expect(result.files).toHaveLength(0);
  });

  it('should scaffold container service with Dockerfile', () => {
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
                port: 3000,
                memory: '512Mi',
              },
            ],
          },
        ],
      },
    };

    const result = generateServiceScaffolds(config);

    expect(result.services).toHaveLength(1);
    expect(result.services[0].name).toBe('api');
    expect(result.services[0].type).toBe('container');

    const filePaths = result.files.map((f) => f.path);
    expect(filePaths).toContain('containers/api/Dockerfile');
    expect(filePaths).toContain('containers/api/package.json');
    expect(filePaths).toContain('containers/api/tsconfig.json');
    expect(filePaths).toContain('containers/api/src/index.ts');
    expect(filePaths).toContain('containers/api/.gitignore');
  });

  it('should generate Dockerfile with correct port', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            containers: [{ name: 'api', port: 3000 }],
          },
        ],
      },
    };

    const result = generateServiceScaffolds(config);
    const dockerfile = result.files.find((f) => f.path.includes('Dockerfile'));

    expect(dockerfile).toBeDefined();
    expect(dockerfile!.content).toContain('EXPOSE 3000');
    expect(dockerfile!.content).toContain('ENV PORT=3000');
  });

  it('should scaffold function service with handler', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            functions: [
              {
                name: 'processor',
                runtime: 'nodejs20',
                trigger: { type: 'http' },
              },
            ],
          },
        ],
      },
    };

    const result = generateServiceScaffolds(config);

    expect(result.services).toHaveLength(1);
    expect(result.services[0].name).toBe('processor');
    expect(result.services[0].type).toBe('function');

    const filePaths = result.files.map((f) => f.path);
    expect(filePaths).toContain('functions/processor/package.json');
    expect(filePaths).toContain('functions/processor/src/index.ts');
    // Functions don't have Dockerfile
    expect(filePaths).not.toContain('functions/processor/Dockerfile');
  });

  it('should generate pubsub function handler', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            functions: [
              {
                name: 'worker',
                trigger: { type: 'pubsub', topic: 'events' },
              },
            ],
          },
        ],
      },
    };

    const result = generateServiceScaffolds(config);
    const indexTs = result.files.find((f) => f.path.includes('src/index.ts'));

    expect(indexTs).toBeDefined();
    expect(indexTs!.content).toContain('Pub/Sub function');
    expect(indexTs!.content).toContain('Triggered by: events');
    expect(indexTs!.content).toContain('CloudEvent');
  });

  it('should generate storage function handler', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            functions: [
              {
                name: 'image-processor',
                trigger: { type: 'storage', bucket: 'uploads' },
              },
            ],
          },
        ],
      },
    };

    const result = generateServiceScaffolds(config);
    const indexTs = result.files.find((f) => f.path.includes('src/index.ts'));

    expect(indexTs).toBeDefined();
    expect(indexTs!.content).toContain('Storage function');
    expect(indexTs!.content).toContain('uploads bucket');
    expect(indexTs!.content).toContain('StorageObjectData');
  });

  it('should include functions-framework in function package.json', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            functions: [{ name: 'handler' }],
          },
        ],
      },
    };

    const result = generateServiceScaffolds(config);
    const pkgJson = result.files.find((f) => f.path.includes('package.json'));

    expect(pkgJson).toBeDefined();
    const pkg = JSON.parse(pkgJson!.content);
    expect(pkg.dependencies).toHaveProperty('@google-cloud/functions-framework');
  });
});

// ============================================================================
// Full scaffold generation
// ============================================================================

describe('generateScaffold', () => {
  it('should generate all files by default', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'full-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        secrets: [{ name: 'api-key' }],
        buckets: [{ name: 'uploads' }],
        networks: [
          {
            name: 'main',
            containers: [{ name: 'api' }],
            databases: [{ name: 'db' }],
            caches: [{ name: 'redis' }],
          },
        ],
      },
    };

    const result = generateScaffold(config);

    const filePaths = result.files.map((f) => f.path);

    // Env files
    expect(filePaths).toContain('.env.local');
    expect(filePaths).toContain('.env.example');
    expect(filePaths).toContain('lib/env.ts');

    // Service files (containers now go to containers/ not services/)
    expect(filePaths.some((p) => p.startsWith('containers/api/'))).toBe(true);

    // Summary
    expect(result.summary.envVars).toBeGreaterThan(0);
    expect(result.summary.dockerServices).toBe(0); // docker-compose no longer generated by scaffold
    expect(result.summary.serviceDirectories).toBe(1); // api container
  });

  it('should only generate env files with --env-only', () => {
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

    const result = generateScaffold(config, { envOnly: true, targetDir: '.', force: false });

    const filePaths = result.files.map((f) => f.path);

    expect(filePaths).toContain('.env.local');
    expect(filePaths).toContain('.env.example');
    // No more docker-compose generation in scaffold
    expect(filePaths.some((p) => p.startsWith('containers/'))).toBe(false);
    expect(filePaths.some((p) => p.startsWith('functions/'))).toBe(false);
  });

  it('should only generate services with --services-only', () => {
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

    const result = generateScaffold(config, { servicesOnly: true, targetDir: '.', force: false });

    const filePaths = result.files.map((f) => f.path);

    // Services go to containers/ or functions/ directories
    expect(filePaths.some((p) => p.startsWith('containers/'))).toBe(true);
    expect(filePaths).not.toContain('.env.local');
  });
});

// ============================================================================
// File writing
// ============================================================================

describe('writeScaffoldFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should write files to target directory', async () => {
    const files = [
      { path: '.env.local', content: 'TEST=value' },
      { path: 'lib/env.ts', content: 'export const env = {}' },
    ];

    const { written, skipped } = await writeScaffoldFiles(files, tempDir, false);

    expect(written).toContain('.env.local');
    expect(written).toContain('lib/env.ts');
    expect(skipped).toHaveLength(0);

    const envContent = await fs.readFile(path.join(tempDir, '.env.local'), 'utf-8');
    expect(envContent).toBe('TEST=value');
  });

  it('should skip existing files without force', async () => {
    // Create existing file
    await fs.writeFile(path.join(tempDir, '.env.local'), 'EXISTING=true');

    const files = [{ path: '.env.local', content: 'NEW=value' }];

    const { written, skipped } = await writeScaffoldFiles(files, tempDir, false);

    expect(written).toHaveLength(0);
    expect(skipped).toContain('.env.local');

    // Original content should be preserved
    const content = await fs.readFile(path.join(tempDir, '.env.local'), 'utf-8');
    expect(content).toBe('EXISTING=true');
  });

  it('should overwrite existing files with force', async () => {
    // Create existing file
    await fs.writeFile(path.join(tempDir, '.env.local'), 'EXISTING=true');

    const files = [{ path: '.env.local', content: 'NEW=value' }];

    const { written, skipped } = await writeScaffoldFiles(files, tempDir, true);

    expect(written).toContain('.env.local');
    expect(skipped).toHaveLength(0);

    const content = await fs.readFile(path.join(tempDir, '.env.local'), 'utf-8');
    expect(content).toBe('NEW=value');
  });

  it('should create nested directories', async () => {
    const files = [
      { path: 'services/api/src/index.ts', content: 'console.log("hello")' },
    ];

    await writeScaffoldFiles(files, tempDir, false);

    const content = await fs.readFile(
      path.join(tempDir, 'services/api/src/index.ts'),
      'utf-8'
    );
    expect(content).toBe('console.log("hello")');
  });
});

describe('createLocalStorageDirs', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create directories for buckets', async () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [{ name: 'uploads' }, { name: 'backups' }],
      },
    };

    const created = await createLocalStorageDirs(config, tempDir);

    expect(created).toContain('local-storage/uploads');
    expect(created).toContain('local-storage/backups');

    // Check directories exist
    const uploadsExists = await fs.stat(path.join(tempDir, 'local-storage/uploads'))
      .then(() => true)
      .catch(() => false);
    expect(uploadsExists).toBe(true);

    // Check .gitkeep exists
    const gitkeepExists = await fs.stat(path.join(tempDir, 'local-storage/uploads/.gitkeep'))
      .then(() => true)
      .catch(() => false);
    expect(gitkeepExists).toBe(true);
  });
});

describe('updateGitignore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create .gitignore if not exists', async () => {
    await updateGitignore(tempDir);

    const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('# StackSolo local development');
    expect(content).toContain('.env.local');
    expect(content).toContain('local-storage/');
  });

  it('should append to existing .gitignore', async () => {
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n');

    await updateGitignore(tempDir);

    const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.env.local');
  });

  it('should not duplicate entries', async () => {
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'node_modules/\n# StackSolo local development\n.env.local\n'
    );

    await updateGitignore(tempDir);

    const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    const matches = content.match(/# StackSolo local development/g);
    expect(matches).toHaveLength(1);
  });
});
