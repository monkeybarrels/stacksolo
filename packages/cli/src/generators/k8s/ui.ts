/**
 * UI manifest generator
 * Creates Deployment and Service for UI applications in local K8s
 */

import type {
  K8sDeployment,
  K8sService,
  GeneratedManifest,
  UIFramework,
} from './types';
import { generateYamlDocument, combineYamlDocuments } from './yaml';
import { sanitizeNamespaceName } from './namespace';
import { getFrameworkConfig } from './runtime';

export interface UIConfig {
  name: string;
  framework: UIFramework;
}

export interface UIManifestOptions {
  projectName: string;
  ui: UIConfig;
  sourceDir: string;
  port: number;
}

/**
 * Generate Deployment and Service manifests for a UI application
 */
export function generateUIManifests(options: UIManifestOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);
  const uiName = sanitizeName(options.ui.name);
  const frameworkConfig = getFrameworkConfig(options.ui.framework, options.port);

  const labels = {
    'app.kubernetes.io/name': uiName,
    'app.kubernetes.io/component': 'ui',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  // Create Deployment
  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: uiName,
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': uiName,
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': uiName,
            'app.kubernetes.io/component': 'ui',
          },
        },
        spec: {
          containers: [
            {
              name: uiName,
              image: 'node:20-slim',
              command: ['sh', '-c', `[ -d node_modules ] || npm install; ${frameworkConfig.command.join(' ')}`],
              ports: [
                {
                  containerPort: options.port,
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
                  mountPath: '/app',
                },
              ],
              workingDir: '/app',
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
          volumes: [
            {
              name: 'source',
              hostPath: {
                path: options.sourceDir,
                type: 'DirectoryOrCreate',
              },
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
      name: uiName,
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': uiName,
      },
      ports: [
        {
          port: options.port,
          targetPort: options.port,
          name: 'http',
        },
      ],
      type: 'ClusterIP',
    },
  };

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `UI: ${options.ui.name}\nFramework: ${options.ui.framework}`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([deploymentYaml, serviceYaml]);

  return {
    filename: `ui-${uiName}.yaml`,
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
