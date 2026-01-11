/**
 * Function manifest generator
 * Creates Deployment and Service for Cloud Functions in local K8s
 */

import type {
  K8sDeployment,
  K8sService,
  GeneratedManifest,
  Runtime,
} from './types';
import { generateYamlDocument, combineYamlDocuments } from './yaml';
import { sanitizeNamespaceName } from './namespace';
import {
  getRuntimeConfig,
  isPythonRuntime,
  getInstallCommand,
  getNodeImage,
  getPackageManagerSetup,
  type PackageManager,
} from './runtime';

export interface FunctionConfig {
  name: string;
  runtime: Runtime;
  entryPoint: string;
  memory?: string;
  timeout?: number;
}

export interface FunctionManifestOptions {
  projectName: string;
  function: FunctionConfig;
  sourceDir: string;
  port: number;
  packageManager?: PackageManager;
}

/**
 * Generate Deployment and Service manifests for a function
 *
 * Uses pre-build mode for monorepo compatibility:
 * - If dist/ folder exists, run the built bundle with functions-framework
 * - This avoids needing to install devDependencies which may have workspace:* refs
 * - Run your build locally first (pnpm build) before stacksolo dev
 */
export function generateFunctionManifests(options: FunctionManifestOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);
  const functionName = sanitizeName(options.function.name);
  const runtimeConfig = getRuntimeConfig(options.function.runtime, options.function.entryPoint);
  const isPython = isPythonRuntime(options.function.runtime);

  let containerCommand: string[];
  let containerImage: string;

  if (isPython) {
    // Python: standard install flow (no workspace:* issues)
    containerImage = runtimeConfig.image;
    containerCommand = [
      'sh',
      '-c',
      [
        'cp -r /source/* /app/ 2>/dev/null || true',
        'cd /app',
        'pip install -r requirements.txt 2>/dev/null || true',
        'pip install functions-framework',
        runtimeConfig.command.join(' '),
      ].join(' && '),
    ];
  } else {
    // Node.js: pre-build mode - check for dist/ folder first
    containerImage = 'node:20-slim';
    const functionsFrameworkCmd = runtimeConfig.command.join(' ');

    // Pre-build mode: if dist/ exists, filter workspace refs from package.json, install prod deps, run
    // The grep -v removes lines with "workspace:" to prevent npm errors
    const command = 'cd /source && if [ -d dist ]; then echo "Running pre-built function from dist/" && find . -maxdepth 1 ! -name node_modules ! -name . -exec cp -r {} /app/ \\; && cd /app && grep -v "workspace:" package.json > package.json.tmp && mv package.json.tmp package.json && npm install --omit=dev && ' + functionsFrameworkCmd + '; else echo "No dist/ folder. Trying dev mode..." && find . -maxdepth 1 ! -name node_modules ! -name . -exec cp -r {} /app/ \\; && cd /app && npm install && (npm run dev 2>/dev/null || ' + functionsFrameworkCmd + '); fi';

    containerCommand = ['sh', '-c', command];
  }

  const labels = {
    'app.kubernetes.io/name': functionName,
    'app.kubernetes.io/component': 'function',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  // Create Deployment
  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: functionName,
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': functionName,
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': functionName,
            'app.kubernetes.io/component': 'function',
          },
        },
        spec: {
          containers: [
            {
              name: functionName,
              image: containerImage,
              command: containerCommand,
              ports: [
                {
                  containerPort: 8080,
                  name: 'http',
                },
              ],
              envFrom: [
                {
                  configMapRef: { name: 'stacksolo-env' },
                },
              ],
              volumeMounts: [
                {
                  name: 'source',
                  mountPath: '/source',
                  readOnly: true,
                },
                {
                  name: 'workdir',
                  mountPath: '/app',
                },
              ],
              workingDir: '/app',
              resources: {
                limits: {
                  memory: options.function.memory || '512Mi',
                },
                requests: {
                  memory: '256Mi',
                },
              },
            },
          ],
          volumes: [
            {
              name: 'source',
              hostPath: {
                path: options.sourceDir,
                type: 'DirectoryOrCreate',
              },
            },
            {
              name: 'workdir',
              emptyDir: {},
            },
          ],
        },
      },
    },
  };

  // Create Service
  const service: K8sService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: functionName,
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': functionName,
      },
      ports: [
        {
          port: options.port,
          targetPort: 8080,
          name: 'http',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `Function: ${options.function.name}\nRuntime: ${options.function.runtime}\nEntry point: ${options.function.entryPoint}`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([deploymentYaml, serviceYaml]);

  return {
    filename: `function-${functionName}.yaml`,
    content,
  };
}

/**
 * Sanitize name for K8s resource naming
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '')
    .slice(0, 63);
}
