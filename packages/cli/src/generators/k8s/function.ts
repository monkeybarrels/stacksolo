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
import { getRuntimeConfig, isPythonRuntime } from './runtime';

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
}

/**
 * Generate Deployment and Service manifests for a function
 */
export function generateFunctionManifests(options: FunctionManifestOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);
  const functionName = sanitizeName(options.function.name);
  const runtimeConfig = getRuntimeConfig(options.function.runtime, options.function.entryPoint);
  const isPython = isPythonRuntime(options.function.runtime);

  // Build command that copies source and installs fresh Linux deps
  // This avoids platform-specific native module issues (macOS node_modules in Linux container)
  // For Node.js dev, prefer npm run dev which handles TypeScript via tsx
  // Fall back to direct functions-framework if no dev script exists
  const runCmd = isPython
    ? runtimeConfig.command.join(' ')
    : 'npm run dev 2>/dev/null || ' + runtimeConfig.command.join(' ');

  const containerCommand = isPython
    ? [
        'sh',
        '-c',
        [
          'cp -r /source/* /app/ 2>/dev/null || true',
          'cd /app',
          'pip install -r requirements.txt 2>/dev/null || true',
          'pip install functions-framework',
          runCmd,
        ].join(' && '),
      ]
    : [
        'sh',
        '-c',
        [
          // Copy source files to /app, excluding node_modules (macOS binaries don't work in Linux)
          'cd /source',
          'find . -maxdepth 1 ! -name node_modules ! -name . -exec cp -r {} /app/ \\;',
          'cd /app',
          // Always install fresh for Linux platform
          'npm install',
          // Run the dev server
          runCmd,
        ].join(' && '),
      ];

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
              image: runtimeConfig.image,
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
