/**
 * Kubernetes Deploy Service
 *
 * Handles building container images, generating production K8s manifests,
 * and deploying to Kubernetes clusters.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { StackSoloConfig, ResolvedResource } from '@stacksolo/blueprint';
import {
  toYaml,
  generateYamlDocument,
  combineYamlDocuments,
} from '../generators/k8s/yaml';
import type {
  K8sDeployment,
  K8sService,
  K8sNamespace,
  K8sConfigMap,
  K8sIngress,
  GeneratedManifest,
} from '../generators/k8s/types';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export interface K8sDeployOptions {
  config: StackSoloConfig;
  resources: ResolvedResource[];
  imageTag?: string;
  dryRun?: boolean;
  verbose?: boolean;
  onLog?: (message: string) => void;
  onVerbose?: (message: string) => void;
}

export interface K8sDeployResult {
  success: boolean;
  manifests: string[];
  outputs: {
    namespace: string;
    services: Record<string, string>;
    ingressUrl?: string;
  };
  error?: string;
}

export interface ImageBuildResult {
  success: boolean;
  images: string[];
  error?: string;
}

// =============================================================================
// Main Deploy Function
// =============================================================================

/**
 * Deploy to Kubernetes cluster
 */
export async function deployToKubernetes(
  options: K8sDeployOptions
): Promise<K8sDeployResult> {
  const { config, resources, imageTag = 'latest', dryRun = false, onLog = console.log, onVerbose } = options;
  const project = config.project;
  const k8sConfig = project.kubernetes!;
  const namespace = k8sConfig.namespace || project.name;
  const manifestDir = path.join(process.cwd(), '.stacksolo', 'k8s-prod');

  const log = (msg: string) => onLog(msg);
  const verbose = (msg: string) => onVerbose?.(msg);

  try {
    // Ensure manifest directory exists
    await fs.mkdir(manifestDir, { recursive: true });

    // Generate all manifests
    log('Generating Kubernetes manifests...');
    const manifests = await generateAllManifests(config, resources, imageTag);

    // Write manifests to disk
    const manifestPaths: string[] = [];
    for (const manifest of manifests) {
      const filePath = path.join(manifestDir, manifest.filename);
      await fs.writeFile(filePath, manifest.content, 'utf-8');
      manifestPaths.push(filePath);
      verbose?.(`  Written: ${manifest.filename}`);
    }

    log(`Generated ${manifests.length} manifest files`);

    if (dryRun) {
      log('Dry run complete - manifests generated but not applied');
      return {
        success: true,
        manifests: manifestPaths,
        outputs: {
          namespace,
          services: {},
        },
      };
    }

    // Apply manifests to cluster
    log('Applying manifests to cluster...');
    const kubectlArgs = k8sConfig.context ? `--context ${k8sConfig.context}` : '';
    const kubeconfigArg = k8sConfig.kubeconfig ? `--kubeconfig ${k8sConfig.kubeconfig}` : '';

    await execAsync(
      `kubectl apply -f "${manifestDir}" ${kubectlArgs} ${kubeconfigArg}`.trim(),
      { timeout: 120000 }
    );

    // Wait for deployments to be ready
    log('Waiting for deployments to be ready...');
    const deploymentResources = resources.filter((r) => r.type === 'k8s:deployment');
    for (const deployment of deploymentResources) {
      const deploymentName = deployment.config.name as string;
      verbose?.(`  Waiting for ${deploymentName}...`);
      try {
        await execAsync(
          `kubectl rollout status deployment/${deploymentName} -n ${namespace} --timeout=120s ${kubectlArgs} ${kubeconfigArg}`.trim(),
          { timeout: 130000 }
        );
      } catch (err) {
        log(`Warning: Deployment ${deploymentName} may not be ready yet`);
      }
    }

    // Get service URLs
    const services: Record<string, string> = {};
    const serviceResources = resources.filter((r) => r.type === 'k8s:service');
    for (const service of serviceResources) {
      const serviceName = service.config.name as string;
      services[serviceName] = `${serviceName}.${namespace}.svc.cluster.local`;
    }

    // Get ingress URL if configured
    let ingressUrl: string | undefined;
    if (k8sConfig.ingress?.host) {
      ingressUrl = k8sConfig.ingress.tlsSecretName
        ? `https://${k8sConfig.ingress.host}`
        : `http://${k8sConfig.ingress.host}`;
    }

    log('Deployment complete');

    return {
      success: true,
      manifests: manifestPaths,
      outputs: {
        namespace,
        services,
        ingressUrl,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      manifests: [],
      outputs: { namespace, services: {} },
      error,
    };
  }
}

// =============================================================================
// Image Building
// =============================================================================

/**
 * Build and push container images
 */
export async function buildAndPushImages(
  config: StackSoloConfig,
  resources: ResolvedResource[],
  tag: string = 'latest',
  options: {
    onLog?: (msg: string) => void;
    onVerbose?: (msg: string) => void;
    verbose?: boolean;
  } = {}
): Promise<ImageBuildResult> {
  const { onLog = console.log, onVerbose, verbose = false } = options;
  const k8sConfig = config.project.kubernetes!;
  const registryUrl = k8sConfig.registry.url;
  const builtImages: string[] = [];

  const log = (msg: string) => onLog(msg);
  const verboseLog = (msg: string) => verbose && onVerbose?.(msg);

  try {
    // Find all deployment resources that need images built
    const deployments = resources.filter((r) => r.type === 'k8s:deployment');

    for (const deployment of deployments) {
      const deploymentConfig = deployment.config as Record<string, unknown>;
      const name = deploymentConfig.name as string;
      const sourceDir = deploymentConfig.sourceDir as string | undefined;
      const runtime = deploymentConfig.runtime as string | undefined;

      // Skip if no source directory (pre-built image)
      if (!sourceDir) {
        verboseLog?.(`Skipping ${name} - using existing image`);
        continue;
      }

      const fullSourceDir = path.resolve(process.cwd(), sourceDir);
      const imageUrl = `${registryUrl}/${name.split('-').pop()}:${tag}`;

      log(`Building image for ${name}...`);

      // Check if source directory exists
      try {
        await fs.access(fullSourceDir);
      } catch {
        throw new Error(`Source directory not found: ${fullSourceDir}`);
      }

      // Generate Dockerfile if needed (for functions)
      if (runtime && runtime.startsWith('nodejs')) {
        await generateFunctionDockerfile(fullSourceDir, runtime);
      }

      // Build image
      verboseLog?.(`  docker build -t ${imageUrl} ${fullSourceDir}`);
      await execAsync(`docker build -t "${imageUrl}" "${fullSourceDir}"`, {
        timeout: 300000,
      });

      // Push image
      log(`Pushing ${imageUrl}...`);
      await execAsync(`docker push "${imageUrl}"`, { timeout: 300000 });

      builtImages.push(imageUrl);
    }

    return {
      success: true,
      images: builtImages,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      images: builtImages,
      error,
    };
  }
}

/**
 * Generate Dockerfile for function deployments
 */
async function generateFunctionDockerfile(
  sourceDir: string,
  runtime: string
): Promise<void> {
  const dockerfilePath = path.join(sourceDir, 'Dockerfile');

  // Check if Dockerfile already exists
  try {
    await fs.access(dockerfilePath);
    return; // Dockerfile exists, skip generation
  } catch {
    // Generate Dockerfile
  }

  const nodeVersion = runtime === 'nodejs20' ? '20' : '18';

  const dockerfile = `# Auto-generated Dockerfile for StackSolo function
FROM node:${nodeVersion}-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build if needed
RUN if [ -f "tsconfig.json" ]; then npm run build 2>/dev/null || true; fi

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Use functions-framework to serve
RUN npm install --save @google-cloud/functions-framework

# Start the function
CMD ["npx", "functions-framework", "--target=api", "--port=8080"]
`;

  await fs.writeFile(dockerfilePath, dockerfile, 'utf-8');
}

// =============================================================================
// Manifest Generation
// =============================================================================

/**
 * Generate all K8s manifests from resolved resources
 */
async function generateAllManifests(
  config: StackSoloConfig,
  resources: ResolvedResource[],
  imageTag: string
): Promise<GeneratedManifest[]> {
  const manifests: GeneratedManifest[] = [];
  const project = config.project;
  const k8sConfig = project.kubernetes!;

  for (const resource of resources) {
    switch (resource.type) {
      case 'k8s:namespace':
        manifests.push(generateNamespaceManifest(resource));
        break;
      case 'k8s:configmap':
        manifests.push(generateConfigMapManifest(resource));
        break;
      case 'k8s:deployment':
        manifests.push(generateDeploymentManifest(resource, k8sConfig, imageTag));
        break;
      case 'k8s:service':
        manifests.push(generateServiceManifest(resource));
        break;
      case 'k8s:ingress':
        manifests.push(generateIngressManifest(resource));
        break;
    }
  }

  return manifests;
}

/**
 * Generate Namespace manifest
 */
function generateNamespaceManifest(resource: ResolvedResource): GeneratedManifest {
  const config = resource.config as { name: string; labels?: Record<string, string> };

  const namespace: K8sNamespace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: config.name,
      labels: config.labels,
    },
  };

  return {
    filename: 'namespace.yaml',
    content: generateYamlDocument(namespace as Record<string, unknown>, 'Kubernetes Namespace'),
  };
}

/**
 * Generate ConfigMap manifest
 */
function generateConfigMapManifest(resource: ResolvedResource): GeneratedManifest {
  const config = resource.config as { name: string; namespace: string; data: Record<string, string> };

  const configMap: K8sConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: config.name,
      namespace: config.namespace,
    },
    data: config.data,
  };

  return {
    filename: 'configmap.yaml',
    content: generateYamlDocument(configMap as Record<string, unknown>, 'Configuration'),
  };
}

/**
 * Generate Deployment manifest with production settings
 */
function generateDeploymentManifest(
  resource: ResolvedResource,
  k8sConfig: NonNullable<StackSoloConfig['project']['kubernetes']>,
  imageTag: string
): GeneratedManifest {
  const config = resource.config as {
    name: string;
    namespace: string;
    image: string;
    port: number;
    replicas: number;
    memory: string;
    cpu: string;
    env?: Record<string, string>;
    imagePullSecret?: string;
  };

  // Update image tag
  const image = config.image.includes(':') ? config.image : `${config.image}:${imageTag}`;

  // Build environment variables
  const envVars = Object.entries(config.env || {}).map(([name, value]) => ({
    name,
    value,
  }));

  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: {
        app: config.name,
        'app.kubernetes.io/name': config.name,
        'app.kubernetes.io/managed-by': 'stacksolo',
      },
    },
    spec: {
      replicas: config.replicas,
      selector: {
        matchLabels: {
          app: config.name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: config.name,
            'app.kubernetes.io/name': config.name,
          },
        },
        spec: {
          containers: [
            {
              name: config.name,
              image,
              imagePullPolicy: 'Always',
              ports: [
                {
                  containerPort: config.port,
                  name: 'http',
                },
              ],
              env: envVars.length > 0 ? envVars : undefined,
              resources: {
                limits: {
                  memory: config.memory,
                  cpu: config.cpu,
                },
                requests: {
                  memory: k8sConfig.resources?.defaultMemoryRequest || '128Mi',
                  cpu: k8sConfig.resources?.defaultCpuRequest || '100m',
                },
              },
            },
          ],
        },
      },
    },
  };

  // Add imagePullSecrets if configured
  if (config.imagePullSecret) {
    (deployment.spec.template.spec as Record<string, unknown>).imagePullSecrets = [
      { name: config.imagePullSecret },
    ];
  }

  // Add liveness and readiness probes
  const container = deployment.spec.template.spec.containers[0] as Record<string, unknown>;
  container.livenessProbe = {
    httpGet: {
      path: '/health',
      port: 'http',
    },
    initialDelaySeconds: 10,
    periodSeconds: 10,
    failureThreshold: 3,
  };
  container.readinessProbe = {
    httpGet: {
      path: '/health',
      port: 'http',
    },
    initialDelaySeconds: 5,
    periodSeconds: 5,
    failureThreshold: 3,
  };

  return {
    filename: `deployment-${config.name}.yaml`,
    content: generateYamlDocument(
      deployment as unknown as Record<string, unknown>,
      `Deployment: ${config.name}`
    ),
  };
}

/**
 * Generate Service manifest
 */
function generateServiceManifest(resource: ResolvedResource): GeneratedManifest {
  const config = resource.config as {
    name: string;
    namespace: string;
    port: number;
    targetPort: number;
    selector: string;
  };

  const service: K8sService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: {
        app: config.name,
        'app.kubernetes.io/name': config.name,
        'app.kubernetes.io/managed-by': 'stacksolo',
      },
    },
    spec: {
      selector: {
        app: config.selector,
      },
      ports: [
        {
          port: config.port,
          targetPort: config.targetPort,
          name: 'http',
        },
      ],
      type: 'ClusterIP',
    },
  };

  return {
    filename: `service-${config.name}.yaml`,
    content: generateYamlDocument(service as Record<string, unknown>, `Service: ${config.name}`),
  };
}

/**
 * Generate Ingress manifest
 */
function generateIngressManifest(resource: ResolvedResource): GeneratedManifest {
  const config = resource.config as {
    name: string;
    namespace: string;
    className: string;
    host?: string;
    tlsSecretName?: string;
    annotations?: Record<string, string>;
    routes: Array<{ path: string; serviceName: string; servicePort: number }>;
  };

  const ingress: K8sIngress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'stacksolo',
      },
      annotations: config.annotations,
    },
    spec: {
      ingressClassName: config.className,
      rules: [
        {
          host: config.host,
          http: {
            paths: config.routes.map((route) => ({
              path: route.path.replace('/*', ''),
              pathType: 'Prefix' as const,
              backend: {
                service: {
                  name: route.serviceName,
                  port: {
                    number: route.servicePort,
                  },
                },
              },
            })),
          },
        },
      ],
    },
  };

  // Add TLS if configured
  if (config.tlsSecretName && config.host) {
    (ingress.spec as Record<string, unknown>).tls = [
      {
        hosts: [config.host],
        secretName: config.tlsSecretName,
      },
    ];
  }

  return {
    filename: 'ingress.yaml',
    content: generateYamlDocument(ingress as Record<string, unknown>, 'Ingress'),
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if kubectl is available and can connect to a cluster
 */
export async function checkKubernetesConnection(
  context?: string,
  kubeconfig?: string
): Promise<{ connected: boolean; error?: string }> {
  try {
    const contextArg = context ? `--context ${context}` : '';
    const kubeconfigArg = kubeconfig ? `--kubeconfig ${kubeconfig}` : '';

    await execAsync(
      `kubectl cluster-info ${contextArg} ${kubeconfigArg}`.trim(),
      { timeout: 10000 }
    );

    return { connected: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { connected: false, error };
  }
}

/**
 * Preview K8s deployment (dry-run)
 */
export async function previewKubernetesDeployment(
  options: K8sDeployOptions
): Promise<K8sDeployResult> {
  return deployToKubernetes({ ...options, dryRun: true });
}
