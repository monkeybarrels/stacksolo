/**
 * CLI Deploy Service
 *
 * Standalone deployment using CDKTF (Terraform).
 * No API server required.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { StackSoloConfig } from '@stacksolo/blueprint';
import { resolveConfig } from '@stacksolo/blueprint';
import { registry } from '@stacksolo/core';
import { loadPlugins } from './plugin-loader.service';

const execAsync = promisify(exec);

/**
 * Execute a command with real-time output streaming
 */
async function execStreaming(
  command: string,
  options: { cwd?: string; onOutput?: (line: string) => void; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const { cwd, onOutput, timeout = 300000 } = options;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn('sh', ['-c', command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (onOutput) {
        const lines = text.split('\n').filter((l) => l.trim());
        lines.forEach((line) => onOutput(line));
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (onOutput) {
        const lines = text.split('\n').filter((l) => l.trim());
        lines.forEach((line) => onOutput(line));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeout}ms`));
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Flag to track if plugins have been loaded */
let pluginsLoaded = false;

export interface DeployResult {
  success: boolean;
  outputs: Record<string, unknown>;
  logs: string[];
  error?: string;
}

export interface DeployOptions {
  onLog?: (message: string) => void;
  onVerbose?: (message: string) => void;
  preview?: boolean;
  destroy?: boolean;
  verbose?: boolean;
}

/**
 * Deploy infrastructure from a StackSolo config (CDKTF/Terraform)
 */
export async function deployConfig(
  config: StackSoloConfig,
  _stateDir: string, // Not used - CDKTF manages its own state
  options: DeployOptions = {}
): Promise<DeployResult> {
  const { onLog = console.log, onVerbose, preview = false, destroy = false, verbose = false } = options;
  const logs: string[] = [];

  const log = (msg: string) => {
    logs.push(msg);
    onLog(msg);
  };

  // Verbose output handler for streaming command output
  const verboseLog = (msg: string) => {
    if (verbose && onVerbose) {
      onVerbose(msg);
    }
  };

  try {
    // Load plugins from config (registers providers/resources with registry)
    if (!pluginsLoaded) {
      await loadPlugins(config.project.plugins);
      pluginsLoaded = true;
    }

    // Resolve config to get resources
    const resolved = resolveConfig(config);

    log(`Resolved ${resolved.resources.length} resources (CDKTF backend)`);

    // CDKTF uses individual resources: vpc_network, vpc_connector, cloud_function, cloud_run, load_balancer, storage_website
    // Find all deployable resources
    const functionResources = resolved.resources.filter(r => r.type === 'gcp-cdktf:cloud_function');
    const containerResources = resolved.resources.filter(r => r.type === 'gcp-cdktf:cloud_run');
    const uiResources = resolved.resources.filter(r => r.type === 'gcp-cdktf:storage_website');
    const gcpKernelResources = resolved.resources.filter(r => r.type === 'gcp-kernel:gcp_kernel');

    if (functionResources.length === 0 && containerResources.length === 0 && uiResources.length === 0 && gcpKernelResources.length === 0) {
      throw new Error('CDKTF backend requires at least one cloud_function, cloud_run, gcp_kernel, or UI resource');
    }

    // Generate CDKTF code for all resources
    const allImports = new Set<string>();
    const allCode: string[] = [];
    const allOutputs: string[] = [];

    for (const resource of resolved.resources) {
      const resourceDef = registry.getResource(resource.type);
      if (!resourceDef) {
        log(`Warning: Unknown resource type: ${resource.type}`);
        continue;
      }

      const generated = resourceDef.generate(resource.config as { name: string; [key: string]: unknown });

      for (const imp of generated.imports || []) {
        allImports.add(imp);
      }
      allCode.push(`// ${resource.type}: ${resource.name}`);
      allCode.push(generated.code);
      allCode.push('');

      if (generated.outputs) {
        allOutputs.push(...generated.outputs);
      }
    }

    const generated = {
      imports: Array.from(allImports),
      code: allCode.join('\n'),
      outputs: allOutputs,
    };

    log('Generated CDKTF code for all resources');

    // Use .stacksolo/cdktf directory for CDKTF work files
    const stacksoloDir = path.join(process.cwd(), '.stacksolo');
    const workDir = path.join(stacksoloDir, 'cdktf');
    await fs.mkdir(workDir, { recursive: true });

    // Create source zip for each function
    const sourceZips: { name: string; zipPath: string }[] = [];

    for (const fnResource of functionResources) {
      const fnName = fnResource.config.name as string;
      const sourceDir = path.resolve(process.cwd(), fnResource.config.sourceDir as string || `functions/${fnName}`);
      const sourceZipPath = path.join(workDir, `${fnName}-source.zip`);

      log(`Creating source archive for ${fnName} from ${sourceDir}...`);

      // Check if source directory exists
      try {
        await fs.access(sourceDir);
      } catch {
        throw new Error(`Source directory not found for function ${fnName}: ${sourceDir}`);
      }

      // Check if package.json exists and has a build script (TypeScript project)
      const packageJsonPath = path.join(sourceDir, 'package.json');
      let isTypeScriptProject = false;

      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // Install dependencies if node_modules doesn't exist
        const nodeModulesPath = path.join(sourceDir, 'node_modules');
        try {
          await fs.access(nodeModulesPath);
        } catch {
          log(`Installing dependencies for ${fnName}...`);
          await execAsync('npm install', { cwd: sourceDir, timeout: 120000 });
        }

        // Run build if script exists (TypeScript compilation)
        if (packageJson.scripts?.build) {
          log(`Building ${fnName} (TypeScript)...`);
          await execAsync('npm run build', { cwd: sourceDir, timeout: 60000 });
          isTypeScriptProject = true;
        }
      } catch {
        // No package.json or not a Node.js project - continue without build
      }

      // Create zip: for TypeScript, zip dist folder + package.json
      if (isTypeScriptProject) {
        const distDir = path.join(sourceDir, 'dist');
        const stagingDir = path.join(workDir, `staging-${fnName}`);
        await fs.mkdir(stagingDir, { recursive: true });

        // Copy dist contents to staging
        await execAsync(`cp -r "${distDir}"/* "${stagingDir}"/`, { timeout: 30000 });

        // Copy and fix package.json for deployment:
        // - Update main field since dist/ files are now at root
        // - Remove build script so Cloud Build doesn't try to recompile
        // - Remove devDependencies since code is already compiled
        const pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.main && pkg.main.startsWith('dist/')) {
          pkg.main = pkg.main.replace('dist/', '');
        }
        // Remove build-related scripts and devDependencies
        if (pkg.scripts) {
          delete pkg.scripts.build;
          delete pkg.scripts.typecheck;
          delete pkg.scripts.dev;
        }
        delete pkg.devDependencies;
        await fs.writeFile(path.join(stagingDir, 'package.json'), JSON.stringify(pkg, null, 2));

        // Create zip from staging
        await execAsync(`cd "${stagingDir}" && zip -r "${sourceZipPath}" .`, { timeout: 60000 });

        // Clean up staging
        await fs.rm(stagingDir, { recursive: true, force: true });
      } else {
        // Plain JS project - zip everything except node_modules
        await execAsync(`cd "${sourceDir}" && zip -r "${sourceZipPath}" . -x "*.git*" -x "node_modules/*"`, { timeout: 60000 });
      }

      sourceZips.push({ name: fnName, zipPath: sourceZipPath });
    }

    // Note: Container builds are deferred until after Terraform creates the Artifact Registry
    // See the container build section after the first Terraform apply below
    const containersToBuild = !preview && containerResources.length > 0;

    // Build and push GCP Kernel image if configured (skip during preview)
    if (!preview && gcpKernelResources.length > 0) {
      // Configure Docker authentication for GCR (kernel uses gcr.io)
      log(`Configuring Docker authentication for gcr.io...`);
      try {
        await execAsync(`gcloud auth configure-docker gcr.io --quiet`, { timeout: 30000 });
      } catch (error) {
        log(`Warning: Failed to configure Docker auth for GCR: ${error instanceof Error ? error.message : error}`);
      }

      for (const kernelResource of gcpKernelResources) {
        const kernelProjectId = kernelResource.config.projectId as string || config.project.gcpProjectId;
        const kernelImage = `gcr.io/${kernelProjectId}/stacksolo-gcp-kernel:latest`;

        log(`Building GCP Kernel service...`);

        // Find the kernel service source in monorepo or node_modules
        const { getServiceSourcePath, getPluginService } = await import('./plugin-loader.service');
        const kernelService = getPluginService('gcp-kernel-service');
        let kernelSourceDir: string | null = null;

        if (kernelService) {
          kernelSourceDir = getServiceSourcePath(kernelService);
        }

        // Fall back to monorepo path if not found via plugin
        if (!kernelSourceDir) {
          const monorepoKernelPath = path.resolve(process.cwd(), '../stacksolo/plugins/gcp-kernel/service');
          try {
            await fs.access(path.join(monorepoKernelPath, 'Dockerfile'));
            kernelSourceDir = monorepoKernelPath;
          } catch {
            // Try relative to stacksolo install
            const nodeModulesPath = path.resolve(process.cwd(), 'node_modules/@stacksolo/plugin-gcp-kernel/service');
            try {
              await fs.access(path.join(nodeModulesPath, 'Dockerfile'));
              kernelSourceDir = nodeModulesPath;
            } catch {
              log(`Warning: Could not find GCP Kernel service source. Skipping build.`);
              log(`Expected at: ${monorepoKernelPath} or ${nodeModulesPath}`);
              continue;
            }
          }
        }

        log(`Found kernel service at: ${kernelSourceDir}`);

        // Build TypeScript
        const packageJsonPath = path.join(kernelSourceDir, 'package.json');
        try {
          const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
          const pkg = JSON.parse(packageJsonContent);

          // Install dependencies
          const nodeModulesPath = path.join(kernelSourceDir, 'node_modules');
          try {
            await fs.access(nodeModulesPath);
          } catch {
            log(`Installing dependencies for GCP Kernel...`);
            await execAsync('npm install', { cwd: kernelSourceDir, timeout: 120000 });
          }

          // Run build if script exists
          if (pkg.scripts?.build) {
            log(`Building GCP Kernel TypeScript...`);
            await execAsync('npm run build', { cwd: kernelSourceDir, timeout: 60000 });
          }
        } catch (buildError) {
          log(`Warning: Could not build kernel TypeScript: ${buildError instanceof Error ? buildError.message : buildError}`);
        }

        // Build Docker image with platform flag for Apple Silicon compatibility
        log(`Building Docker image: ${kernelImage}`);
        if (verbose) {
          const buildResult = await execStreaming(
            `docker build --platform linux/amd64 -t "${kernelImage}" .`,
            { cwd: kernelSourceDir, onOutput: verboseLog, timeout: 300000 }
          );
          if (buildResult.exitCode !== 0) {
            throw new Error(buildResult.stderr || 'Docker build failed');
          }
        } else {
          await execAsync(`docker build --platform linux/amd64 -t "${kernelImage}" .`, { cwd: kernelSourceDir, timeout: 300000 });
        }

        // Push to GCR
        log(`Pushing Docker image: ${kernelImage}`);
        if (verbose) {
          const pushResult = await execStreaming(`docker push "${kernelImage}"`, {
            onOutput: verboseLog,
            timeout: 300000,
          });
          if (pushResult.exitCode !== 0) {
            throw new Error(pushResult.stderr || 'Docker push failed');
          }
        } else {
          await execAsync(`docker push "${kernelImage}"`, { timeout: 300000 });
        }

        log(`GCP Kernel built and pushed successfully`);
      }
    }

    // State directory for Terraform (also in .stacksolo)
    const tfStateDir = path.join(
      stacksoloDir,
      'terraform-state'
    );
    await fs.mkdir(tfStateDir, { recursive: true });

    // Generate main.ts with CDKTF code
    const mainTs = generateCdktfMain(config, generated);
    await fs.writeFile(path.join(workDir, 'main.ts'), mainTs);

    // Generate cdktf.json
    const cdktfJson = {
      language: 'typescript',
      app: 'npx ts-node main.ts',
      terraformProviders: ['hashicorp/google@~> 5.0'],
      output: 'cdktf.out',
    };
    await fs.writeFile(path.join(workDir, 'cdktf.json'), JSON.stringify(cdktfJson, null, 2));

    // Generate package.json
    const packageJson = {
      name: config.project.name,
      version: '1.0.0',
      main: 'main.ts',
      dependencies: {
        cdktf: '^0.20.0',
        'cdktf-cli': '^0.20.0',
        constructs: '^10.0.0',
        '@cdktf/provider-google': '^14.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
        'ts-node': '^10.9.0',
        '@types/node': '^20.0.0',
      },
    };
    await fs.writeFile(path.join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Generate tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: './dist',
      },
    };
    await fs.writeFile(path.join(workDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    // Install dependencies
    log('Installing npm dependencies...');
    await execAsync('npm install', { cwd: workDir, timeout: 120000 });

    // Synthesize CDKTF by running the main.ts directly
    // This uses the App.synth() call in main.ts to generate Terraform JSON
    log('Synthesizing Terraform configuration...');
    await execAsync('npx ts-node main.ts', { cwd: workDir, timeout: 60000 });

    // Run Terraform
    const stackDir = path.join(workDir, 'cdktf.out', 'stacks', 'main');

    // Copy source zips to the terraform stack directory (one per function)
    for (const { name, zipPath } of sourceZips) {
      await fs.copyFile(zipPath, path.join(stackDir, `${name}-source.zip`));
    }

    // Configure backend
    const backendTf = `
terraform {
  backend "local" {
    path = "${tfStateDir}/terraform.tfstate"
  }
}
`;
    await fs.writeFile(path.join(stackDir, 'backend_override.tf'), backendTf);

    // Init
    log('Initializing Terraform...');
    if (verbose) {
      await execStreaming('terraform init', { cwd: stackDir, onOutput: verboseLog });
    } else {
      await execAsync('terraform init', { cwd: stackDir });
    }

    if (destroy) {
      log('Destroying resources...');
      if (verbose) {
        const result = await execStreaming('terraform destroy -auto-approve', {
          cwd: stackDir,
          onOutput: verboseLog,
          timeout: 600000,
        });
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || 'Terraform destroy failed');
        }
      } else {
        await execAsync('terraform destroy -auto-approve', { cwd: stackDir });
      }

      return {
        success: true,
        outputs: {},
        logs,
      };
    }

    if (preview) {
      log('Running terraform plan...');
      if (verbose) {
        await execStreaming('terraform plan', { cwd: stackDir, onOutput: verboseLog });
      } else {
        const { stdout } = await execAsync('terraform plan', { cwd: stackDir });
        log(stdout);
      }

      return {
        success: true,
        outputs: {},
        logs,
      };
    }

    // ==========================================================================
    // TWO-PHASE TERRAFORM APPLY FOR FRESH DEPLOYS
    // ==========================================================================
    // CRITICAL ORDERING: Container images need Artifact Registry to exist before
    // they can be pushed, but Cloud Run needs images to exist before it can start.
    //
    // Solution for fresh deploys:
    // 1. First terraform apply - Creates Artifact Registry (and other infra)
    //    - This may fail on Cloud Run with "Image not found" error
    // 2. Build and push container images to the now-existing registry
    // 3. Second terraform apply - Updates Cloud Run with the available images
    //
    // Error patterns to catch (allow first apply to continue):
    // - "Image 'xxx' not found" - Image doesn't exist yet in registry
    // - "Revision 'xxx' is not ready" - Cloud Run can't start without image
    // ==========================================================================

    log('Applying Terraform...');
    let firstApplyFailed = false;
    try {
      if (verbose) {
        const result = await execStreaming('terraform apply -auto-approve', {
          cwd: stackDir,
          onOutput: verboseLog,
          timeout: 600000,
        });
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || 'Terraform apply failed');
        }
      } else {
        await execAsync('terraform apply -auto-approve', { cwd: stackDir });
      }
    } catch (applyError) {
      // First apply may fail if Cloud Run references container images that don't exist yet
      // This is expected for fresh deploys - we'll build containers and apply again
      const errorStr = String(applyError);
      const isImageNotFoundError =
        (errorStr.includes('Image') && errorStr.includes('not found')) ||
        (errorStr.includes('Revision') && errorStr.includes('is not ready'));

      if (containersToBuild && isImageNotFoundError) {
        log('First apply partially completed - container images needed');
        firstApplyFailed = true;
      } else {
        throw applyError;
      }
    }

    // Build and push Docker images for each container (after registry exists)
    if (containersToBuild) {
      // Configure Docker authentication for Artifact Registry
      const region = config.project.region;
      log(`Configuring Docker authentication for ${region}-docker.pkg.dev...`);
      try {
        await execAsync(`gcloud auth configure-docker ${region}-docker.pkg.dev --quiet`, { timeout: 30000 });
      } catch (error) {
        log(`Warning: Failed to configure Docker auth: ${error instanceof Error ? error.message : error}`);
        log('You may need to run: gcloud auth configure-docker ' + region + '-docker.pkg.dev');
      }

      for (const containerResource of containerResources) {
        const containerName = containerResource.config.name as string;
        const image = containerResource.config.image as string;

        // Extract registry info from image URL
        // Format: {region}-docker.pkg.dev/{project}/{registry}/{image}:{tag}
        const imageMatch = image.match(/^(.+-docker\.pkg\.dev\/[^/]+\/[^/]+)\//);
        if (!imageMatch) {
          log(`Skipping container ${containerName} - using pre-built image: ${image}`);
          continue;
        }

        // Find the source directory for the container
        // Default to containers/{short-name} where short-name is the name without project prefix
        const shortName = containerName.replace(`${config.project.name}-`, '');
        const sourceDir = path.resolve(process.cwd(), `containers/${shortName}`);

        // Check if source directory and Dockerfile exist
        try {
          await fs.access(path.join(sourceDir, 'Dockerfile'));
        } catch {
          log(`Skipping container ${containerName} - no Dockerfile found at ${sourceDir}`);
          continue;
        }

        log(`Building Docker image for ${containerName}...`);

        // Build the TypeScript code first
        const packageJsonPath = path.join(sourceDir, 'package.json');
        try {
          const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
          const pkg = JSON.parse(packageJsonContent);

          // Install dependencies
          const nodeModulesPath = path.join(sourceDir, 'node_modules');
          try {
            await fs.access(nodeModulesPath);
          } catch {
            log(`Installing dependencies for ${containerName}...`);
            await execAsync('npm install', { cwd: sourceDir, timeout: 120000 });
          }

          // Run build if script exists
          if (pkg.scripts?.build) {
            log(`Building ${containerName}...`);
            await execAsync('npm run build', { cwd: sourceDir, timeout: 60000 });
          }
        } catch {
          // No package.json - continue with Docker build
        }

        // Build Docker image
        log(`Building Docker image: ${image}`);
        if (verbose) {
          const buildResult = await execStreaming(`docker build -t "${image}" .`, {
            cwd: sourceDir,
            onOutput: verboseLog,
            timeout: 300000,
          });
          if (buildResult.exitCode !== 0) {
            throw new Error(buildResult.stderr || 'Docker build failed');
          }
        } else {
          await execAsync(`docker build -t "${image}" .`, { cwd: sourceDir, timeout: 300000 });
        }

        // Push to Artifact Registry
        log(`Pushing Docker image: ${image}`);
        if (verbose) {
          const pushResult = await execStreaming(`docker push "${image}"`, {
            onOutput: verboseLog,
            timeout: 300000,
          });
          if (pushResult.exitCode !== 0) {
            throw new Error(pushResult.stderr || 'Docker push failed');
          }
        } else {
          await execAsync(`docker push "${image}"`, { timeout: 300000 });
        }

        log(`Container ${containerName} built and pushed successfully`);
      }

      // Apply Terraform again to update Cloud Run with the new images
      if (firstApplyFailed) {
        log('Re-applying Terraform with container images...');
        if (verbose) {
          const result = await execStreaming('terraform apply -auto-approve', {
            cwd: stackDir,
            onOutput: verboseLog,
            timeout: 600000,
          });
          if (result.exitCode !== 0) {
            throw new Error(result.stderr || 'Terraform re-apply failed');
          }
        } else {
          await execAsync('terraform apply -auto-approve', { cwd: stackDir });
        }
      }
    }

    // Get outputs
    const { stdout: outputJson } = await execAsync('terraform output -json', { cwd: stackDir });
    const outputs = JSON.parse(outputJson || '{}');

    const outputValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(outputs)) {
      outputValues[key] = (value as { value: unknown }).value;
    }

    // Build and upload UI assets to GCS buckets
    if (uiResources.length > 0) {
      log('Building and uploading UI assets...');

      for (const uiResource of uiResources) {
        const uiName = uiResource.config.name as string;
        const sourceDir = path.resolve(process.cwd(), uiResource.config.sourceDir as string || `apps/${uiName}`);
        const framework = uiResource.config.framework as string | undefined;
        const buildCommand = uiResource.config.buildCommand as string || 'npm run build';
        const buildOutputDir = uiResource.config.buildOutputDir as string;

        log(`Processing UI: ${uiName}`);

        // Check if source directory exists
        try {
          await fs.access(sourceDir);
        } catch {
          throw new Error(`UI source directory not found: ${sourceDir}`);
        }

        // Detect framework if not specified
        let detectedFramework = framework;
        if (!detectedFramework) {
          const packageJsonPath = path.join(sourceDir, 'package.json');
          try {
            const pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(pkgContent);
            if (pkg.dependencies?.['@sveltejs/kit'] || pkg.devDependencies?.['@sveltejs/kit']) {
              detectedFramework = 'sveltekit';
            } else if (pkg.dependencies?.vue || pkg.devDependencies?.vue) {
              detectedFramework = 'vue';
            } else if (pkg.dependencies?.react || pkg.devDependencies?.react) {
              detectedFramework = 'react';
            }
          } catch {
            // No package.json - assume plain HTML
            detectedFramework = 'html';
          }
        }

        // Determine build output directory based on framework
        let distPath: string;
        if (buildOutputDir) {
          distPath = path.join(sourceDir, buildOutputDir);
        } else if (detectedFramework === 'sveltekit') {
          distPath = path.join(sourceDir, 'build');
        } else {
          distPath = path.join(sourceDir, 'dist');
        }

        // Skip build for plain HTML
        if (detectedFramework !== 'html') {
          // Install dependencies
          const nodeModulesPath = path.join(sourceDir, 'node_modules');
          try {
            await fs.access(nodeModulesPath);
          } catch {
            log(`Installing dependencies for ${uiName}...`);
            await execAsync('npm install', { cwd: sourceDir, timeout: 120000 });
          }

          // Build the UI
          log(`Building ${uiName} (${detectedFramework})...`);
          await execAsync(buildCommand, { cwd: sourceDir, timeout: 120000 });
        } else {
          // For plain HTML, the source dir is the dist dir
          distPath = sourceDir;
        }

        // Get bucket name from Terraform output
        // The output name follows pattern: {varName}BucketName
        const varName = uiName.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
        const bucketOutputKey = `${varName}BucketName`;
        const bucketName = outputValues[bucketOutputKey] as string;

        if (!bucketName) {
          log(`Warning: Could not find bucket name for ${uiName}, skipping upload`);
          continue;
        }

        // Upload to GCS using gsutil
        log(`Uploading ${uiName} to gs://${bucketName}...`);
        await execAsync(`gsutil -m rsync -r -d "${distPath}" gs://${bucketName}`, { timeout: 300000 });

        log(`UI ${uiName} deployed to gs://${bucketName}`);
      }
    }

    // Auto-enable IAP and set IAM bindings on backend services if zeroTrust is configured
    const iapResources = resolved.resources.filter(r => r.type === 'zero-trust:iap_web_backend');
    if (iapResources.length > 0) {
      log('Configuring IAP on backend services...');
      const gcpProjectId = config.project.gcpProjectId;

      // Step 0: Provision IAP service agent identity (required for IAP to invoke Cloud Run)
      // This creates service-{PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com
      log('Provisioning IAP service agent...');
      let iapServiceAccount: string | null = null;
      try {
        const { stdout: identityOutput } = await execAsync(
          `gcloud beta services identity create --service=iap.googleapis.com --project=${gcpProjectId} 2>&1`,
          { timeout: 60000 }
        );
        // Extract service account from output: "Service identity created: service-xxx@gcp-sa-iap.iam.gserviceaccount.com"
        const match = identityOutput.match(/service-\d+@gcp-sa-iap\.iam\.gserviceaccount\.com/);
        if (match) {
          iapServiceAccount = match[0];
          log(`IAP service agent: ${iapServiceAccount}`);
        }
      } catch (identityError) {
        const errMsg = identityError instanceof Error ? identityError.message : String(identityError);
        // Service account might already exist - try to extract from error or fetch project number
        if (errMsg.includes('already exists') || errMsg.includes('service-')) {
          const match = errMsg.match(/service-\d+@gcp-sa-iap\.iam\.gserviceaccount\.com/);
          if (match) {
            iapServiceAccount = match[0];
            log(`IAP service agent (existing): ${iapServiceAccount}`);
          }
        } else {
          log(`Warning: Failed to provision IAP service agent: ${errMsg}`);
        }
      }

      for (const iapResource of iapResources) {
        const backendServiceName = iapResource.config.backendService as string;
        const allowedMembers = iapResource.config.allowedMembers as string[];

        // Determine if this IAP config protects a Cloud Run service
        // The backend name follows pattern: {projectName}-lb-{projectName}-{serviceName}-backend
        // We need to extract the service name and check if it's a Cloud Run container
        const backendMatch = backendServiceName.match(/-([^-]+)-backend$/);
        const serviceName = backendMatch ? backendMatch[1] : null;
        const cloudRunService = serviceName
          ? containerResources.find(r => (r.config.name as string).endsWith(`-${serviceName}`))
          : null;

        // Grant IAP service account Cloud Run Invoker role if this protects a Cloud Run service
        if (iapServiceAccount && cloudRunService) {
          const cloudRunServiceName = cloudRunService.config.name as string;
          const region = config.project.region;
          log(`Granting IAP service account invoker role on Cloud Run: ${cloudRunServiceName}`);
          try {
            await execAsync(
              `gcloud run services add-iam-policy-binding ${cloudRunServiceName} --region=${region} --project=${gcpProjectId} --member="serviceAccount:${iapServiceAccount}" --role="roles/run.invoker"`,
              { timeout: 60000 }
            );
          } catch (invokerError) {
            const invokerErrMsg = invokerError instanceof Error ? invokerError.message : String(invokerError);
            if (!invokerErrMsg.includes('already exists')) {
              log(`Warning: Failed to grant invoker role: ${invokerErrMsg}`);
            }
          }
        }

        log(`Enabling IAP on backend: ${backendServiceName}`);

        try {
          // Step 1: Enable IAP on the backend service
          await execAsync(
            `gcloud compute backend-services update ${backendServiceName} --global --project=${gcpProjectId} --iap=enabled`,
            { timeout: 60000 }
          );
          log(`IAP enabled on ${backendServiceName}`);

          // Step 2: Set IAM policy for who can access via IAP
          // We need to add the IAP accessor role to each allowed member
          for (const member of allowedMembers) {
            log(`Granting IAP access to: ${member}`);
            try {
              await execAsync(
                `gcloud iap web add-iam-policy-binding --resource-type=backend-services --service=${backendServiceName} --project=${gcpProjectId} --member="${member}" --role="roles/iap.httpsResourceAccessor"`,
                { timeout: 60000 }
              );
            } catch (iamError) {
              // Try alternative approach - this handles both new and existing bindings
              const iamErrorMsg = iamError instanceof Error ? iamError.message : String(iamError);
              if (!iamErrorMsg.includes('already exists')) {
                log(`Warning: Failed to add IAP access for ${member}: ${iamErrorMsg}`);
              }
            }
          }
          log(`IAP configured on ${backendServiceName}`);
        } catch (iapError) {
          // Log warning but don't fail deployment - IAP can be enabled manually
          const iapErrorMsg = iapError instanceof Error ? iapError.message : String(iapError);
          log(`Warning: Failed to enable IAP on ${backendServiceName}: ${iapErrorMsg}`);
          log(`You can manually enable IAP: gcloud compute backend-services update ${backendServiceName} --global --iap=enabled`);
        }
      }
    }

    log('Deployment complete!');

    return {
      success: true,
      outputs: outputValues,
      logs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error: ${errorMessage}`);

    return {
      success: false,
      outputs: {},
      logs,
      error: errorMessage,
    };
  }
}

/**
 * Generate CDKTF main.ts file
 */
function generateCdktfMain(
  config: StackSoloConfig,
  generated: { imports: string[]; code: string; outputs?: string[] }
): string {
  const lines: string[] = [];

  // Imports
  lines.push("import { App, TerraformStack, TerraformOutput } from 'cdktf';");
  lines.push("import { Construct } from 'constructs';");
  lines.push("import { GoogleProvider } from '@cdktf/provider-google/lib/provider';");
  for (const imp of generated.imports) {
    lines.push(imp);
  }
  lines.push('');

  // Stack class
  lines.push('class MainStack extends TerraformStack {');
  lines.push('  constructor(scope: Construct, id: string) {');
  lines.push('    super(scope, id);');
  lines.push('');
  lines.push('    // Configure Google provider');
  lines.push(`    new GoogleProvider(this, 'google', {`);
  lines.push(`      project: '${config.project.gcpProjectId}',`);
  lines.push(`      region: '${config.project.region}',`);
  lines.push('    });');
  lines.push('');
  lines.push('    // Resources (each function references its own source zip via __dirname)');
  lines.push(generated.code);
  lines.push('');

  // Outputs
  if (generated.outputs && generated.outputs.length > 0) {
    lines.push('    // Outputs');
    for (const output of generated.outputs) {
      // Convert Pulumi export to CDKTF TerraformOutput
      const match = output.match(/export const (\w+) = (.+);/);
      if (match) {
        const [, name, value] = match;
        lines.push(`    new TerraformOutput(this, '${name}', { value: ${value} });`);
      }
    }
  }

  lines.push('  }');
  lines.push('}');
  lines.push('');

  // App initialization
  lines.push("const app = new App();");
  lines.push("new MainStack(app, 'main');");
  lines.push("app.synth();");
  lines.push('');

  return lines.join('\n');
}
