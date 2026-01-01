/**
 * Emulator manifest generators
 * Creates Deployments and Services for Firebase and Pub/Sub emulators
 */

import type {
  K8sDeployment,
  K8sService,
  GeneratedManifest,
} from './types';
import { generateYamlDocument, combineYamlDocuments } from './yaml';
import { sanitizeNamespaceName } from './namespace';

export interface EmulatorOptions {
  projectName: string;
}

/**
 * Generate Firebase emulator manifests (Firestore + Auth)
 */
export function generateFirebaseEmulator(options: EmulatorOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);

  const labels = {
    'app.kubernetes.io/name': 'firebase-emulator',
    'app.kubernetes.io/component': 'emulator',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'firebase-emulator',
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': 'firebase-emulator',
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'firebase-emulator',
            'app.kubernetes.io/component': 'emulator',
          },
        },
        spec: {
          containers: [
            {
              name: 'firebase',
              // Use andreysenov/firebase-tools which includes Node.js, Java, and firebase-tools
              image: 'andreysenov/firebase-tools:latest',
              command: [
                'firebase',
                'emulators:start',
                '--only',
                'firestore,auth',
                '--project',
                'demo-stacksolo',
              ],
              ports: [
                {
                  containerPort: 8080,
                  name: 'firestore',
                },
                {
                  containerPort: 9099,
                  name: 'auth',
                },
                {
                  containerPort: 4000,
                  name: 'ui',
                },
              ],
              resources: {
                limits: {
                  memory: '1Gi',
                },
                requests: {
                  memory: '512Mi',
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
      name: 'firebase-emulator',
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': 'firebase-emulator',
      },
      ports: [
        {
          port: 8080,
          targetPort: 8080,
          name: 'firestore',
        },
        {
          port: 9099,
          targetPort: 9099,
          name: 'auth',
        },
        {
          port: 4000,
          targetPort: 4000,
          name: 'ui',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `Firebase Emulator (Firestore + Auth)\nPorts:\n  - Firestore: 8080\n  - Auth: 9099\n  - UI: 4000`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([deploymentYaml, serviceYaml]);

  return {
    filename: 'firebase-emulator.yaml',
    content,
  };
}

/**
 * Generate Pub/Sub emulator manifests
 */
export function generatePubSubEmulator(options: EmulatorOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);

  const labels = {
    'app.kubernetes.io/name': 'pubsub-emulator',
    'app.kubernetes.io/component': 'emulator',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'pubsub-emulator',
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': 'pubsub-emulator',
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'pubsub-emulator',
            'app.kubernetes.io/component': 'emulator',
          },
        },
        spec: {
          containers: [
            {
              name: 'pubsub',
              image: 'gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators',
              command: [
                'gcloud',
                'beta',
                'emulators',
                'pubsub',
                'start',
                '--host-port=0.0.0.0:8085',
              ],
              ports: [
                {
                  containerPort: 8085,
                  name: 'pubsub',
                },
              ],
              resources: {
                limits: {
                  memory: '256Mi',
                },
                requests: {
                  memory: '128Mi',
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
      name: 'pubsub-emulator',
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': 'pubsub-emulator',
      },
      ports: [
        {
          port: 8085,
          targetPort: 8085,
          name: 'pubsub',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `Pub/Sub Emulator\nPort: 8085`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([deploymentYaml, serviceYaml]);

  return {
    filename: 'pubsub-emulator.yaml',
    content,
  };
}
