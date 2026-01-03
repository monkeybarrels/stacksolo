/**
 * GCP Kernel manifest generator
 * Creates Deployment and Service for the GCP-native kernel (HTTP + Pub/Sub)
 *
 * This kernel uses GCP services (Pub/Sub, Cloud Storage) instead of NATS,
 * but can run anywhere - including Kubernetes - with GCP credentials.
 */

import type {
  K8sDeployment,
  K8sService,
  GeneratedManifest,
} from './types';
import { generateYamlDocument, combineYamlDocuments } from './yaml';
import { sanitizeNamespaceName } from './namespace';

export interface GcpKernelOptions {
  projectName: string;
  kernelName?: string;
  httpPort?: number;
  firebaseProjectId: string;
  gcsBucket: string;
  pubsubEventsTopic: string;
  gcpProjectId?: string;
}

/**
 * Generate GCP kernel manifests (HTTP + Pub/Sub)
 *
 * The GCP kernel provides:
 * - HTTP: /health, /auth/validate, /files/*, /events/* (port 8080)
 * - Uses GCP Pub/Sub for events (replaces NATS)
 * - Uses GCP Cloud Storage for files
 * - Uses Firebase Admin SDK for auth
 */
export function generateGcpKernelManifests(options: GcpKernelOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);
  const kernelName = options.kernelName || 'gcp-kernel';
  const httpPort = options.httpPort || 8080;
  const gcpProjectId = options.gcpProjectId || options.firebaseProjectId;

  const labels = {
    'app.kubernetes.io/name': kernelName,
    'app.kubernetes.io/component': 'gcp-kernel',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  // Environment variables for the GCP kernel
  const envVars = [
    { name: 'NODE_ENV', value: 'development' },
    { name: 'PORT', value: String(httpPort) },
    { name: 'GCP_PROJECT_ID', value: gcpProjectId },
    { name: 'FIREBASE_PROJECT_ID', value: options.firebaseProjectId },
    { name: 'GCS_BUCKET', value: options.gcsBucket },
    { name: 'PUBSUB_EVENTS_TOPIC', value: options.pubsubEventsTopic },
    { name: 'KERNEL_TYPE', value: 'gcp' },
    { name: 'STACKSOLO_PROJECT_NAME', value: options.projectName },
  ];

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
            'app.kubernetes.io/component': 'gcp-kernel',
          },
        },
        spec: {
          containers: [
            {
              name: 'gcp-kernel',
              // Use local build - image built by `stacksolo dev`
              image: `${kernelName}:dev`,
              imagePullPolicy: 'Never',
              ports: [
                {
                  containerPort: httpPort,
                  name: 'http',
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
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: httpPort,
                },
                initialDelaySeconds: 5,
                periodSeconds: 10,
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: httpPort,
                },
                initialDelaySeconds: 5,
                periodSeconds: 5,
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
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `StackSolo GCP Kernel (HTTP + Pub/Sub)\nPort: ${httpPort}\nUses GCP services for files and events`
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
