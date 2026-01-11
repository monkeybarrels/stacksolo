/**
 * K8s Manifest Generator
 * Main entry point for generating Kubernetes manifests from stacksolo.config.json
 */

import type { StackSoloConfig, PackageManager } from '@stacksolo/blueprint';
import type { GeneratedManifest, K8sGeneratorResult, Runtime, UIFramework } from './types';
import { generateNamespace } from './namespace';
import { generateConfigMap } from './configmap';
import { generateFunctionManifests } from './function';
import { generateUIManifests } from './ui';
import { generateFirebaseEmulator, generatePubSubEmulator } from './emulators';
import { generateKernelManifests, generateNatsEmulator } from './kernel';
import { generateGcpKernelManifests } from './gcp-kernel';
import { generateGateway } from './gateway';
import { createPortAllocator } from './ports';

export * from './types';
export * from './namespace';
export * from './configmap';
export * from './function';
export * from './ui';
export * from './emulators';
export * from './kernel';
export * from './gcp-kernel';
export * from './gateway';
export * from './ports';
export * from './runtime';
export * from './yaml';

export interface GenerateK8sOptions {
  config: StackSoloConfig;
  projectRoot: string;
  includeEmulators?: boolean;
}

/**
 * Generate all K8s manifests from StackSolo config
 */
export function generateK8sManifests(options: GenerateK8sOptions): K8sGeneratorResult {
  const { config, projectRoot, includeEmulators = true } = options;
  const manifests: GeneratedManifest[] = [];
  const services: string[] = [];
  const warnings: string[] = [];

  const projectName = config.project.name;
  const packageManager = config.project.packageManager as PackageManager | undefined;
  const portAllocator = createPortAllocator();

  // Track service ports for ingress
  const servicePortMap: Record<string, number> = {};

  // Determine kernel URL for configmap (need to do this before generating configmap)
  let kernelUrl: string | undefined;
  if (config.project.kernel) {
    // NATS kernel uses port 8090
    kernelUrl = `http://${config.project.kernel.name}:8090`;
  } else if (config.project.gcpKernel) {
    // GCP kernel uses port 8080
    kernelUrl = `http://${config.project.gcpKernel.name}:8080`;
  }

  // 1. Generate namespace
  manifests.push(generateNamespace(projectName));

  // 2. Generate ConfigMap (with kernel URL if configured)
  manifests.push(generateConfigMap({ projectName, kernelUrl }));

  // 3. Generate emulators (if enabled)
  if (includeEmulators) {
    manifests.push(generateFirebaseEmulator({ projectName }));
    manifests.push(generatePubSubEmulator({ projectName }));
    services.push('firebase-emulator', 'pubsub-emulator');
  }

  // 4. Generate kernel (if configured)
  if (config.project.kernel) {
    const kernel = config.project.kernel;
    // Auto-generate bucket name if not specified (for local dev, this is just a placeholder)
    const gcsBucket = kernel.gcsBucket || `${config.project.gcpProjectId || 'local'}-${projectName}-kernel-files`;
    manifests.push(
      generateKernelManifests({
        projectName,
        kernelName: kernel.name,
        firebaseProjectId: kernel.firebaseProjectId || config.project.gcpProjectId,
        gcsBucket,
      })
    );
    services.push(kernel.name);
    servicePortMap[kernel.name] = 8090; // Kernel HTTP port
  }

  // 4b. Generate GCP kernel (if configured) - mutually exclusive with NATS kernel
  if (config.project.gcpKernel) {
    const gcpKernel = config.project.gcpKernel;
    const gcpProjectId = config.project.gcpProjectId || gcpKernel.firebaseProjectId;
    manifests.push(
      generateGcpKernelManifests({
        projectName,
        kernelName: gcpKernel.name,
        httpPort: 8080,
        firebaseProjectId: gcpKernel.firebaseProjectId,
        gcsBucket: gcpKernel.storageBucket,
        pubsubEventsTopic: `${projectName}-events`,
        gcpProjectId,
      })
    );
    services.push(gcpKernel.name);
    servicePortMap[gcpKernel.name] = 8080; // GCP kernel HTTP port
  }

  // 5. Process networks for functions and UIs
  for (const network of config.project.networks || []) {
    // Generate function manifests
    for (const func of network.functions || []) {
      const port = portAllocator.nextFunctionPort();
      // Use sourceDir from config, or default to functions/<name>
      const funcSourceDir = func.sourceDir?.replace(/^\.\//, '') || `functions/${func.name}`;
      const sourceDir = `${projectRoot}/${funcSourceDir}`;

      try {
        const manifest = generateFunctionManifests({
          projectName,
          function: {
            name: func.name,
            runtime: (func.runtime || 'nodejs20') as Runtime,
            entryPoint: func.entryPoint || 'handler',
            memory: func.memory,
            timeout: func.timeout,
          },
          sourceDir,
          port,
          packageManager,
        });

        manifests.push(manifest);
        services.push(func.name);
        servicePortMap[func.name] = port;
      } catch (error) {
        warnings.push(`Failed to generate manifest for function ${func.name}: ${error}`);
      }
    }

    // Generate UI manifests
    for (const ui of network.uis || []) {
      const port = portAllocator.nextUiPort();
      // Use sourceDir from config (required for UI)
      const uiSourceDir = ui.sourceDir?.replace(/^\.\//, '') || `ui/${ui.name}`;
      const sourceDir = `${projectRoot}/${uiSourceDir}`;

      try {
        const manifest = generateUIManifests({
          projectName,
          ui: {
            name: ui.name,
            framework: (ui.framework || 'vue') as UIFramework,
          },
          sourceDir,
          port,
          packageManager,
        });

        manifests.push(manifest);
        services.push(ui.name);
        servicePortMap[ui.name] = port;
      } catch (error) {
        warnings.push(`Failed to generate manifest for UI ${ui.name}: ${error}`);
      }
    }

    // Generate gateway from load balancer routes
    if (network.loadBalancer?.routes) {
      // Filter routes to only include backends that exist as services
      const validRoutes = network.loadBalancer.routes.filter((r) => {
        const backendExists = servicePortMap[r.backend] !== undefined;
        if (!backendExists) {
          warnings.push(
            `Gateway route "${r.path}" references backend "${r.backend}" which does not exist. ` +
              `Available backends: ${Object.keys(servicePortMap).join(', ') || 'none'}. ` +
              `Skipping this route.`
          );
        }
        return backendExists;
      });

      const routes = validRoutes.map((r) => ({
        path: r.path,
        backend: r.backend,
      }));

      if (routes.length > 0) {
        manifests.push(
          generateGateway({
            projectName,
            routes,
            servicePortMap,
          })
        );
        services.push('gateway');
      } else {
        warnings.push('No valid gateway routes found. Gateway will not be created.');
      }
    }
  }

  return {
    manifests,
    services,
    warnings,
  };
}

/**
 * Write generated manifests to disk
 */
export async function writeK8sManifests(
  manifests: GeneratedManifest[],
  outputDir: string
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Write each manifest
  for (const manifest of manifests) {
    const filePath = path.join(outputDir, manifest.filename);
    await fs.writeFile(filePath, manifest.content, 'utf-8');
  }
}
