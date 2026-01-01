/**
 * Kernel manifest generator
 * Creates Deployment and Service for the StackSolo kernel (HTTP + NATS)
 */

import type {
  K8sDeployment,
  K8sService,
  GeneratedManifest,
} from './types';
import { generateYamlDocument, combineYamlDocuments } from './yaml';
import { sanitizeNamespaceName } from './namespace';

export interface KernelOptions {
  projectName: string;
  kernelName?: string;
  httpPort?: number;
  natsPort?: number;
  natsClusterPort?: number;
  firebaseProjectId?: string;
  gcsBucket?: string;
}

/**
 * Generate kernel manifests (HTTP + embedded NATS)
 *
 * The kernel provides:
 * - HTTP: /health, /auth/validate (port 8090)
 * - NATS: internal messaging (port 4222)
 */
export function generateKernelManifests(options: KernelOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);
  const kernelName = options.kernelName || 'kernel';
  const httpPort = options.httpPort || 8090;
  const natsPort = options.natsPort || 4222;

  const labels = {
    'app.kubernetes.io/name': kernelName,
    'app.kubernetes.io/component': 'kernel',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  // Environment variables for the kernel
  const envVars = [
    { name: 'NODE_ENV', value: 'development' },
    { name: 'HTTP_PORT', value: String(httpPort) },
    { name: 'NATS_URL', value: 'nats://localhost:4222' },
    { name: 'FIREBASE_PROJECT_ID', value: options.firebaseProjectId || 'demo-stacksolo' },
    // Point to Firebase emulator in the cluster
    { name: 'FIREBASE_AUTH_EMULATOR_HOST', value: 'firebase-emulator:9099' },
  ];

  // Add GCS bucket if specified
  if (options.gcsBucket) {
    envVars.push({ name: 'GCS_BUCKET', value: options.gcsBucket });
  }

  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: kernelName,
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': kernelName,
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': kernelName,
            'app.kubernetes.io/component': 'kernel',
          },
        },
        spec: {
          containers: [
            {
              name: 'kernel',
              // Use local build - image built by `stacksolo dev`
              image: `${kernelName}:dev`,
              imagePullPolicy: 'Never',
              ports: [
                {
                  containerPort: httpPort,
                  name: 'http',
                },
                {
                  containerPort: natsPort,
                  name: 'nats',
                },
              ],
              env: envVars,
              resources: {
                limits: {
                  memory: '512Mi',
                },
                requests: {
                  memory: '256Mi',
                },
              },
            },
          ],
        },
      },
    },
  };

  const service: K8sService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: kernelName,
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': kernelName,
      },
      ports: [
        {
          port: httpPort,
          targetPort: httpPort,
          name: 'http',
        },
        {
          port: natsPort,
          targetPort: natsPort,
          name: 'nats',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `StackSolo Kernel (HTTP + NATS)\nPorts:\n  - HTTP: ${httpPort}\n  - NATS: ${natsPort}`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([deploymentYaml, serviceYaml]);

  return {
    filename: `${kernelName}.yaml`,
    content,
  };
}

/**
 * Generate a standalone NATS server for development
 * Use this when you want NATS without the full kernel
 */
export function generateNatsEmulator(options: { projectName: string }): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);

  const labels = {
    'app.kubernetes.io/name': 'nats-emulator',
    'app.kubernetes.io/component': 'emulator',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'nats-emulator',
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': 'nats-emulator',
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'nats-emulator',
            'app.kubernetes.io/component': 'emulator',
          },
        },
        spec: {
          containers: [
            {
              name: 'nats',
              image: 'nats:2.10-alpine',
              args: ['--jetstream', '--store_dir=/data'],
              ports: [
                {
                  containerPort: 4222,
                  name: 'nats',
                },
                {
                  containerPort: 8222,
                  name: 'monitor',
                },
              ],
              resources: {
                limits: {
                  memory: '256Mi',
                },
                requests: {
                  memory: '64Mi',
                },
              },
            },
          ],
        },
      },
    },
  };

  const service: K8sService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'nats-emulator',
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': 'nats-emulator',
      },
      ports: [
        {
          port: 4222,
          targetPort: 4222,
          name: 'nats',
        },
        {
          port: 8222,
          targetPort: 8222,
          name: 'monitor',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `NATS Server with JetStream\nPorts:\n  - NATS: 4222\n  - Monitor: 8222`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([deploymentYaml, serviceYaml]);

  return {
    filename: 'nats-emulator.yaml',
    content,
  };
}
