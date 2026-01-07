import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import type { StackSoloConfig } from '@stacksolo/blueprint';
import {
  generateK8sManifests,
  writeK8sManifests,
  generateNamespace,
  generateConfigMap,
  generateFunctionManifests,
  generateUIManifests,
  generateFirebaseEmulator,
  generatePubSubEmulator,
  generateIngress,
  createPortAllocator,
  sanitizeNamespaceName,
} from '../generators/k8s';
import { getRuntimeConfig, getFrameworkConfig } from '../generators/k8s/runtime';
import { toYaml, generateYamlDocument } from '../generators/k8s/yaml';

async function createTempDir(): Promise<string> {
  const tempDir = path.join(
    tmpdir(),
    `stacksolo-k8s-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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
// YAML Serialization
// ============================================================================

describe('toYaml', () => {
  it('should serialize simple object', () => {
    const obj = { name: 'test', value: 123 };
    const yaml = toYaml(obj);

    expect(yaml).toContain('name: test');
    expect(yaml).toContain('value: 123');
  });

  it('should handle nested objects', () => {
    const obj = {
      metadata: {
        name: 'my-app',
        namespace: 'default',
      },
    };
    const yaml = toYaml(obj);

    expect(yaml).toContain('metadata:');
    expect(yaml).toContain('  name: my-app');
    expect(yaml).toContain('  namespace: default');
  });

  it('should handle arrays', () => {
    const obj = {
      ports: [8080, 8081, 8082],
    };
    const yaml = toYaml(obj);

    expect(yaml).toContain('ports:');
    expect(yaml).toContain('- 8080');
    expect(yaml).toContain('- 8081');
  });

  it('should handle arrays of objects', () => {
    const obj = {
      containers: [
        { name: 'app', image: 'node:20' },
        { name: 'sidecar', image: 'nginx' },
      ],
    };
    const yaml = toYaml(obj);

    expect(yaml).toContain('containers:');
    expect(yaml).toContain('- name: app');
    // image value may be quoted due to colon
    expect(yaml).toMatch(/image: .*node:20/);
    expect(yaml).toContain('- name: sidecar');
  });

  it('should quote strings with special characters', () => {
    const obj = { path: '/api/*', url: 'http://localhost:8080' };
    const yaml = toYaml(obj);

    // Asterisk in path doesn't require quoting, but colon in URL does
    expect(yaml).toContain('path: /api/*');
    expect(yaml).toContain('url: "http://localhost:8080"');
  });

  it('should handle boolean and null values', () => {
    const obj = { enabled: true, disabled: false, empty: null };
    const yaml = toYaml(obj);

    expect(yaml).toContain('enabled: true');
    expect(yaml).toContain('disabled: false');
    expect(yaml).toContain('empty: null');
  });

  it('should handle empty objects and arrays', () => {
    const obj = { emptyObj: {}, emptyArr: [] };
    const yaml = toYaml(obj);

    expect(yaml).toContain('emptyObj: {}');
    expect(yaml).toContain('emptyArr: []');
  });
});

describe('generateYamlDocument', () => {
  it('should add header comment', () => {
    const resource = { apiVersion: 'v1', kind: 'Namespace' };
    const yaml = generateYamlDocument(resource, 'My comment');

    expect(yaml).toContain('# My comment');
    expect(yaml).toContain('apiVersion: v1');
  });

  it('should handle multi-line comments', () => {
    const resource = { apiVersion: 'v1' };
    const yaml = generateYamlDocument(resource, 'Line 1\nLine 2');

    expect(yaml).toContain('# Line 1');
    expect(yaml).toContain('# Line 2');
  });
});

// ============================================================================
// Namespace Generation
// ============================================================================

describe('generateNamespace', () => {
  it('should generate namespace manifest', () => {
    const result = generateNamespace('my-project');

    expect(result.filename).toBe('namespace.yaml');
    expect(result.content).toContain('kind: Namespace');
    expect(result.content).toContain('name: my-project');
    expect(result.content).toContain('app.kubernetes.io/managed-by: stacksolo');
  });

  it('should sanitize namespace name', () => {
    const result = generateNamespace('My Project_Name!');

    expect(result.content).toContain('name: my-project-name');
  });
});

describe('sanitizeNamespaceName', () => {
  it('should lowercase names', () => {
    expect(sanitizeNamespaceName('MyProject')).toBe('myproject');
  });

  it('should replace invalid characters with hyphens', () => {
    expect(sanitizeNamespaceName('my_project')).toBe('my-project');
    expect(sanitizeNamespaceName('my.project')).toBe('my-project');
    expect(sanitizeNamespaceName('my@project!')).toBe('my-project');
  });

  it('should remove consecutive hyphens', () => {
    expect(sanitizeNamespaceName('my--project')).toBe('my-project');
    expect(sanitizeNamespaceName('my___project')).toBe('my-project');
  });

  it('should ensure name starts with letter', () => {
    expect(sanitizeNamespaceName('123project')).toBe('ns-123project');
    expect(sanitizeNamespaceName('-project')).toBe('project');
  });

  it('should truncate to 63 characters', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeNamespaceName(longName).length).toBe(63);
  });
});

// ============================================================================
// ConfigMap Generation
// ============================================================================

describe('generateConfigMap', () => {
  it('should generate configmap with emulator hosts', () => {
    const result = generateConfigMap({ projectName: 'test-app' });

    expect(result.filename).toBe('configmap.yaml');
    expect(result.content).toContain('kind: ConfigMap');
    expect(result.content).toContain('name: stacksolo-env');
    // Values with colons are quoted in YAML
    expect(result.content).toContain('FIRESTORE_EMULATOR_HOST: "firebase-emulator:8080"');
    expect(result.content).toContain('FIREBASE_AUTH_EMULATOR_HOST: "firebase-emulator:9099"');
    expect(result.content).toContain('PUBSUB_EMULATOR_HOST: "pubsub-emulator:8085"');
    expect(result.content).toContain('NODE_ENV: development');
  });

  it('should use custom emulator hosts if provided', () => {
    const result = generateConfigMap({
      projectName: 'test-app',
      firestoreEmulatorHost: 'custom-host:9000',
    });

    expect(result.content).toContain('FIRESTORE_EMULATOR_HOST: "custom-host:9000"');
  });

  it('should include additional env vars', () => {
    const result = generateConfigMap({
      projectName: 'test-app',
      additionalEnv: {
        CUSTOM_VAR: 'custom-value',
      },
    });

    expect(result.content).toContain('CUSTOM_VAR: custom-value');
  });
});

// ============================================================================
// Function Manifest Generation
// ============================================================================

describe('generateFunctionManifests', () => {
  it('should generate deployment and service for node function', () => {
    const result = generateFunctionManifests({
      projectName: 'test-app',
      function: {
        name: 'api',
        runtime: 'nodejs20',
        entryPoint: 'handler',
      },
      sourceDir: '/app/functions/api',
      port: 8081,
    });

    expect(result.filename).toBe('function-api.yaml');
    expect(result.content).toContain('kind: Deployment');
    expect(result.content).toContain('kind: Service');
    // Image with colon is quoted
    expect(result.content).toContain('image: "node:20-slim"');
    expect(result.content).toContain('node_modules');
    expect(result.content).toContain('@google-cloud/functions-framework');
    expect(result.content).toContain('--target=handler');
  });

  it('should generate python function with correct image', () => {
    const result = generateFunctionManifests({
      projectName: 'test-app',
      function: {
        name: 'processor',
        runtime: 'python312',
        entryPoint: 'main',
      },
      sourceDir: '/app/functions/processor',
      port: 8082,
    });

    expect(result.content).toContain('image: "python:3.12-slim"');
    expect(result.content).toContain('pip install');
    expect(result.content).toContain('functions-framework');
    expect(result.content).toContain('--target=main');
  });

  it('should include volume mount for source code', () => {
    const result = generateFunctionManifests({
      projectName: 'test-app',
      function: {
        name: 'api',
        runtime: 'nodejs20',
        entryPoint: 'handler',
      },
      sourceDir: '/app/functions/api',
      port: 8081,
    });

    expect(result.content).toContain('volumeMounts:');
    expect(result.content).toContain('mountPath: /app');
    expect(result.content).toContain('hostPath:');
    expect(result.content).toContain('path: /app/functions/api');
    expect(result.content).toContain('type: DirectoryOrCreate');
  });

  it('should reference configmap for env vars', () => {
    const result = generateFunctionManifests({
      projectName: 'test-app',
      function: {
        name: 'api',
        runtime: 'nodejs20',
        entryPoint: 'handler',
      },
      sourceDir: '/app/functions/api',
      port: 8081,
    });

    expect(result.content).toContain('envFrom:');
    expect(result.content).toContain('configMapRef:');
    expect(result.content).toContain('name: stacksolo-env');
  });

  it('should include memory limits', () => {
    const result = generateFunctionManifests({
      projectName: 'test-app',
      function: {
        name: 'api',
        runtime: 'nodejs20',
        entryPoint: 'handler',
        memory: '512Mi',
      },
      sourceDir: '/app/functions/api',
      port: 8081,
    });

    expect(result.content).toContain('memory: "512Mi"');
  });
});

// ============================================================================
// UI Manifest Generation
// ============================================================================

describe('generateUIManifests', () => {
  it('should generate deployment and service for vue UI', () => {
    const result = generateUIManifests({
      projectName: 'test-app',
      ui: {
        name: 'web',
        framework: 'vue',
      },
      sourceDir: '/app/ui/web',
      port: 3000,
    });

    expect(result.filename).toBe('ui-web.yaml');
    expect(result.content).toContain('kind: Deployment');
    expect(result.content).toContain('kind: Service');
    expect(result.content).toContain('image: "node:20-slim"');
    expect(result.content).toContain('npm');
    expect(result.content).toContain('dev');
  });

  it('should use correct dev command for react', () => {
    const result = generateUIManifests({
      projectName: 'test-app',
      ui: {
        name: 'dashboard',
        framework: 'react',
      },
      sourceDir: '/app/ui/dashboard',
      port: 3001,
    });

    expect(result.content).toContain('--hostname');
  });

  it('should include volume mount for source', () => {
    const result = generateUIManifests({
      projectName: 'test-app',
      ui: {
        name: 'web',
        framework: 'vue',
      },
      sourceDir: '/app/ui/web',
      port: 3000,
    });

    expect(result.content).toContain('volumeMounts:');
    expect(result.content).toContain('path: /app/ui/web');
    expect(result.content).toContain('type: DirectoryOrCreate');
  });
});

// ============================================================================
// Emulator Manifest Generation
// ============================================================================

describe('generateFirebaseEmulator', () => {
  it('should generate firebase emulator deployment and service', () => {
    const result = generateFirebaseEmulator({ projectName: 'test-app' });

    expect(result.filename).toBe('firebase-emulator.yaml');
    expect(result.content).toContain('kind: Deployment');
    expect(result.content).toContain('kind: Service');
    expect(result.content).toContain('image: "andreysenov/firebase-tools:latest"');
    expect(result.content).toContain('emulators:start');
    expect(result.content).toContain('firestore,auth');
  });

  it('should expose correct ports', () => {
    const result = generateFirebaseEmulator({ projectName: 'test-app' });

    expect(result.content).toContain('containerPort: 8080');
    expect(result.content).toContain('containerPort: 9099');
    expect(result.content).toContain('containerPort: 4000');
  });
});

describe('generatePubSubEmulator', () => {
  it('should generate pubsub emulator deployment and service', () => {
    const result = generatePubSubEmulator({ projectName: 'test-app' });

    expect(result.filename).toBe('pubsub-emulator.yaml');
    expect(result.content).toContain('kind: Deployment');
    expect(result.content).toContain('kind: Service');
    expect(result.content).toContain('google-cloud-cli:emulators');
    expect(result.content).toContain('pubsub');
    expect(result.content).toContain('--host-port=0.0.0.0:8085');
  });
});

// ============================================================================
// Ingress Generation
// ============================================================================

describe('generateIngress', () => {
  it('should generate ingress from routes', () => {
    const result = generateIngress({
      projectName: 'test-app',
      routes: [
        { path: '/api/*', backend: 'api' },
        { path: '/hello/*', backend: 'hello' },
        { path: '/*', backend: 'web' },
      ],
      servicePortMap: {
        api: 8081,
        hello: 8082,
        web: 3000,
      },
    });

    expect(result.filename).toBe('ingress.yaml');
    expect(result.content).toContain('kind: Ingress');
    expect(result.content).toContain('nginx.ingress.kubernetes.io/rewrite-target');
  });

  it('should convert path patterns correctly', () => {
    const result = generateIngress({
      projectName: 'test-app',
      routes: [
        { path: '/api/*', backend: 'api' },
        { path: '/*', backend: 'web' },
      ],
      servicePortMap: { api: 8081, web: 3000 },
    });

    // /api/* should become /api(/|$)(.*)
    expect(result.content).toContain('/api(/|$)(.*)');
    // /* should become /(.*)
    expect(result.content).toContain('/(.*)');
  });

  it('should reference correct service ports', () => {
    const result = generateIngress({
      projectName: 'test-app',
      routes: [{ path: '/api/*', backend: 'api' }],
      servicePortMap: { api: 8081 },
    });

    expect(result.content).toContain('name: api');
    expect(result.content).toContain('number: 8081');
  });
});

// ============================================================================
// Port Allocator
// ============================================================================

describe('createPortAllocator', () => {
  it('should allocate function ports sequentially', () => {
    const allocator = createPortAllocator();

    expect(allocator.nextFunctionPort()).toBe(8081);
    expect(allocator.nextFunctionPort()).toBe(8082);
    expect(allocator.nextFunctionPort()).toBe(8083);
  });

  it('should allocate UI ports sequentially', () => {
    const allocator = createPortAllocator();

    expect(allocator.nextUiPort()).toBe(3000);
    expect(allocator.nextUiPort()).toBe(3001);
    expect(allocator.nextUiPort()).toBe(3002);
  });

  it('should return fixed emulator ports', () => {
    const allocator = createPortAllocator();

    expect(allocator.firestorePort).toBe(8080);
    expect(allocator.authPort).toBe(9099);
    expect(allocator.pubsubPort).toBe(8085);
    expect(allocator.ingressPort).toBe(8000);
  });

  it('should allow custom base ports', () => {
    const allocator = createPortAllocator({
      functionBasePort: 9000,
      uiBasePort: 4000,
    });

    expect(allocator.nextFunctionPort()).toBe(9000);
    expect(allocator.nextUiPort()).toBe(4000);
  });

  it('should reset allocation', () => {
    const allocator = createPortAllocator();

    allocator.nextFunctionPort();
    allocator.nextFunctionPort();
    allocator.reset();

    expect(allocator.nextFunctionPort()).toBe(8081);
  });
});

// ============================================================================
// Runtime Detection
// ============================================================================

describe('getRuntimeConfig', () => {
  it('should return node config for nodejs runtimes', () => {
    const config = getRuntimeConfig('nodejs20', 'handler');

    expect(config.image).toBe('node:20-slim');
    expect(config.command).toContain('npx');
    expect(config.command).toContain('@google-cloud/functions-framework');
    expect(config.command).toContain('--target=handler');
  });

  it('should return python config for python runtimes', () => {
    const config = getRuntimeConfig('python312', 'main');

    expect(config.image).toBe('python:3.12-slim');
    expect(config.command).toContain('functions-framework');
    expect(config.command).toContain('--target=main');
  });

  it('should handle different python versions', () => {
    expect(getRuntimeConfig('python39', 'main').image).toBe('python:3.9-slim');
    expect(getRuntimeConfig('python310', 'main').image).toBe('python:3.10-slim');
    expect(getRuntimeConfig('python311', 'main').image).toBe('python:3.11-slim');
  });
});

describe('getFrameworkConfig', () => {
  it('should return correct command for vue', () => {
    const config = getFrameworkConfig('vue');
    expect(config.command).toContain('npm');
    expect(config.command).toContain('--host');
  });

  it('should return correct command for react', () => {
    const config = getFrameworkConfig('react');
    expect(config.command).toContain('--hostname');
  });

  it('should return correct command for svelte', () => {
    const config = getFrameworkConfig('svelte');
    expect(config.command).toContain('--host');
  });
});

// ============================================================================
// Full K8s Manifest Generation
// ============================================================================

describe('generateK8sManifests', () => {
  it('should generate all manifests from config', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            loadBalancer: {
              name: 'lb',
              routes: [
                { path: '/api/*', backend: 'api' },
                { path: '/*', backend: 'web' },
              ],
            },
            functions: [
              {
                name: 'api',
                runtime: 'nodejs20',
                entryPoint: 'handler',
              },
            ],
            uis: [
              {
                name: 'web',
                framework: 'vue',
              },
            ],
          },
        ],
      },
    };

    const result = generateK8sManifests({
      config,
      projectRoot: '/app',
      includeEmulators: true,
    });

    const filenames = result.manifests.map((m) => m.filename);

    expect(filenames).toContain('namespace.yaml');
    expect(filenames).toContain('configmap.yaml');
    expect(filenames).toContain('firebase-emulator.yaml');
    expect(filenames).toContain('pubsub-emulator.yaml');
    expect(filenames).toContain('function-api.yaml');
    expect(filenames).toContain('ui-web.yaml');
    expect(filenames).toContain('ingress.yaml');

    expect(result.services).toContain('firebase-emulator');
    expect(result.services).toContain('pubsub-emulator');
    expect(result.services).toContain('api');
    expect(result.services).toContain('web');
  });

  it('should skip emulators when disabled', () => {
    const config: StackSoloConfig = {
      project: {
        name: 'test-app',
        region: 'us-central1',
        gcpProjectId: 'my-project',
        networks: [
          {
            name: 'main',
            functions: [{ name: 'api' }],
          },
        ],
      },
    };

    const result = generateK8sManifests({
      config,
      projectRoot: '/app',
      includeEmulators: false,
    });

    const filenames = result.manifests.map((m) => m.filename);

    expect(filenames).not.toContain('firebase-emulator.yaml');
    expect(filenames).not.toContain('pubsub-emulator.yaml');
    expect(result.services).not.toContain('firebase-emulator');
  });
});

// ============================================================================
// File Writing
// ============================================================================

describe('writeK8sManifests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should write manifests to output directory', async () => {
    const manifests = [
      { filename: 'namespace.yaml', content: 'apiVersion: v1\nkind: Namespace' },
      { filename: 'configmap.yaml', content: 'apiVersion: v1\nkind: ConfigMap' },
    ];

    await writeK8sManifests(manifests, tempDir);

    const namespaceExists = await fs
      .stat(path.join(tempDir, 'namespace.yaml'))
      .then(() => true)
      .catch(() => false);
    expect(namespaceExists).toBe(true);

    const content = await fs.readFile(path.join(tempDir, 'namespace.yaml'), 'utf-8');
    expect(content).toContain('kind: Namespace');
  });

  it('should create output directory if not exists', async () => {
    const outputDir = path.join(tempDir, '.stacksolo', 'k8s');
    const manifests = [{ filename: 'test.yaml', content: 'test: true' }];

    await writeK8sManifests(manifests, outputDir);

    const exists = await fs
      .stat(path.join(outputDir, 'test.yaml'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});
