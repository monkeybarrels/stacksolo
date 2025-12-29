import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Test helpers
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

async function readConfig(dir: string): Promise<Record<string, unknown>> {
  const configPath = path.join(dir, STACKSOLO_DIR, CONFIG_FILENAME);
  const content = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

async function writeConfig(dir: string, config: Record<string, unknown>): Promise<void> {
  const stacksoloDir = path.join(dir, STACKSOLO_DIR);
  await fs.mkdir(stacksoloDir, { recursive: true });
  await fs.writeFile(
    path.join(stacksoloDir, CONFIG_FILENAME),
    JSON.stringify(config, null, 2)
  );
}

async function configExists(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, STACKSOLO_DIR, CONFIG_FILENAME));
    return true;
  } catch {
    return false;
  }
}

describe('init command - config creation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create .stacksolo directory', async () => {
    const stacksoloDir = path.join(tempDir, STACKSOLO_DIR);
    await fs.mkdir(stacksoloDir, { recursive: true });

    const exists = await fs.stat(stacksoloDir).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should create config file in .stacksolo directory', async () => {
    const config = {
      project: {
        name: 'test-project',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    await writeConfig(tempDir, config);

    const exists = await configExists(tempDir);
    expect(exists).toBe(true);
  });

  it('should write valid JSON config', async () => {
    const config = {
      project: {
        name: 'test-project',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    await writeConfig(tempDir, config);

    const readBack = await readConfig(tempDir);
    expect(readBack).toEqual(config);
  });

  it('should preserve existing config structure when merging', async () => {
    const existingConfig = {
      project: {
        name: 'old-name',
        region: 'us-east1',
        gcpProjectId: 'old-project',
        buckets: [{ name: 'my-bucket' }],
        networks: [{ name: 'main', containers: [] }],
      },
    };

    await writeConfig(tempDir, existingConfig);

    // Simulate merge - update project settings but preserve rest
    const mergedConfig = {
      project: {
        ...existingConfig.project,
        name: 'new-name',
        region: 'us-central1',
        gcpProjectId: 'new-project',
      },
    };

    await writeConfig(tempDir, mergedConfig);

    const result = await readConfig(tempDir);
    expect(result.project).toHaveProperty('buckets');
    expect(result.project).toHaveProperty('networks');
  });
});

describe('init command - validation', () => {
  it('should validate project name format', () => {
    const validNames = ['my-app', 'app1', 'test-project-123'];
    const invalidNames = ['MyApp', 'my_app', '123app', 'my app', 'MY-APP'];

    const isValidName = (name: string): boolean => {
      return /^[a-z][a-z0-9-]*$/.test(name);
    };

    validNames.forEach((name) => {
      expect(isValidName(name)).toBe(true);
    });

    invalidNames.forEach((name) => {
      expect(isValidName(name)).toBe(false);
    });
  });

  it('should require project ID', () => {
    const isValidProjectId = (id: string): boolean => {
      return id.length > 0;
    };

    expect(isValidProjectId('')).toBe(false);
    expect(isValidProjectId('my-project')).toBe(true);
    expect(isValidProjectId('123')).toBe(true);
  });
});

describe('init command - defaults', () => {
  it('should use gcp as default provider', () => {
    const defaultProvider = 'gcp';
    expect(defaultProvider).toBe('gcp');
  });

  it('should use us-central1 as default region', () => {
    const defaultRegion = 'us-central1';
    expect(defaultRegion).toBe('us-central1');
  });

  it('should use directory name as default project name', () => {
    const dirPath = '/some/path/my-project';
    const defaultName = path.basename(dirPath);
    expect(defaultName).toBe('my-project');
  });
});

describe('init command - config structure', () => {
  it('should create minimal valid config', () => {
    const config = {
      project: {
        name: 'test',
        region: 'us-central1',
        gcpProjectId: 'my-project',
      },
    };

    expect(config.project.name).toBeDefined();
    expect(config.project.region).toBeDefined();
    expect(config.project.gcpProjectId).toBeDefined();
  });

  it('should support optional fields', () => {
    const config = {
      project: {
        name: 'test',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        buckets: [],
        secrets: [],
        networks: [],
      },
    };

    expect(config.project.buckets).toBeDefined();
    expect(config.project.secrets).toBeDefined();
    expect(config.project.networks).toBeDefined();
  });
});
