/**
 * CLI Deploy Service
 *
 * Standalone deployment using Pulumi Automation API.
 * No API server required.
 */

import * as pulumi from '@pulumi/pulumi/automation/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { StackSoloConfig, ResolvedResource } from '@stacksolo/blueprint';
import { resolveConfig, topologicalSort } from '@stacksolo/blueprint';
import { registry } from '@stacksolo/core';
import { gcpProvider } from '@stacksolo/plugin-gcp';
import { gcpCdktfProvider } from '@stacksolo/plugin-gcp-cdktf';

const execAsync = promisify(exec);

// Register providers
registry.registerProvider(gcpProvider);
registry.registerProvider(gcpCdktfProvider);

export interface DeployResult {
  success: boolean;
  outputs: Record<string, unknown>;
  logs: string[];
  error?: string;
}

export interface DeployOptions {
  onLog?: (message: string) => void;
  preview?: boolean;
  destroy?: boolean;
}

/**
 * Deploy infrastructure from a StackSolo config
 */
export async function deployConfig(
  config: StackSoloConfig,
  stateDir: string,
  options: DeployOptions = {}
): Promise<DeployResult> {
  // Route to CDKTF deployment if backend is cdktf
  if (config.project.backend === 'cdktf') {
    return deployCdktfConfig(config, stateDir, options);
  }

  return deployPulumiConfig(config, stateDir, options);
}

/**
 * Deploy infrastructure using Pulumi (default backend)
 */
async function deployPulumiConfig(
  config: StackSoloConfig,
  stateDir: string,
  options: DeployOptions = {}
): Promise<DeployResult> {
  const { onLog = console.log, preview = false, destroy = false } = options;
  const logs: string[] = [];

  const log = (msg: string) => {
    logs.push(msg);
    onLog(msg);
  };

  try {
    // Resolve config to get resources
    const resolved = resolveConfig(config);
    const resourceOrder = topologicalSort(resolved.resources);

    log(`Resolved ${resolved.resources.length} resources`);

    // Generate Pulumi code
    const workDir = await prepareWorkDir(config, resolved.resources);
    log(`Generated Pulumi project at ${workDir}`);

    // Ensure state directory exists
    await fs.mkdir(stateDir, { recursive: true });

    // Create Pulumi stack
    // Include GCP project ID in the Pulumi project name to prevent state conflicts
    // when the same project name is used with different GCP projects
    const stackName = 'dev';
    const projectName = `${config.project.name}-${config.project.gcpProjectId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    log('Creating Pulumi stack...');
    const stack = await pulumi.LocalWorkspace.createOrSelectStack(
      {
        stackName,
        workDir,
      },
      {
        projectSettings: {
          name: projectName,
          runtime: 'nodejs',
        },
        envVars: {
          PULUMI_BACKEND_URL: `file://${stateDir}`,
          PULUMI_CONFIG_PASSPHRASE: '',
        },
      }
    );

    // Set GCP config
    log('Configuring GCP project and region...');
    await stack.setConfig('gcp:project', { value: config.project.gcpProjectId });
    await stack.setConfig('gcp:region', { value: config.project.region });

    // Install GCP plugin
    log('Installing Pulumi GCP plugin...');
    await stack.workspace.installPlugin('gcp', 'v7.0.0');

    // Install npm dependencies
    log('Installing npm dependencies...');
    await execAsync('npm install', { cwd: workDir });

    if (destroy) {
      // Destroy resources
      log('Destroying resources...');
      await stack.destroy({
        onOutput: (msg) => log(msg.trim()),
      });

      return {
        success: true,
        outputs: {},
        logs,
      };
    }

    if (preview) {
      // Preview only
      log('Running preview...');
      const previewResult = await stack.preview({
        onOutput: (msg) => log(msg.trim()),
      });

      return {
        success: true,
        outputs: {},
        logs,
      };
    }

    // Deploy
    log('Deploying resources...');
    const upResult = await stack.up({
      onOutput: (msg) => log(msg.trim()),
    });

    // Extract outputs
    const outputs = upResult.outputs || {};
    const outputValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(outputs)) {
      outputValues[key] = value.value;
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
 * Generate Pulumi project files
 */
async function prepareWorkDir(
  config: StackSoloConfig,
  resources: ResolvedResource[]
): Promise<string> {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `stacksolo-${config.project.name}-`)
  );

  // Generate index.ts
  const indexContent = generatePulumiCode(config, resources);
  await fs.writeFile(path.join(tmpDir, 'index.ts'), indexContent);

  // Generate Pulumi.yaml
  const pulumiYaml = `name: ${config.project.name}
runtime: nodejs
description: Infrastructure for ${config.project.name} - generated by StackSolo
`;
  await fs.writeFile(path.join(tmpDir, 'Pulumi.yaml'), pulumiYaml);

  // Generate package.json
  const packageJson = {
    name: config.project.name,
    main: 'index.ts',
    dependencies: {
      '@pulumi/pulumi': '^3.0.0',
      '@pulumi/gcp': '^7.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
      '@types/node': '^20.0.0',
    },
  };
  await fs.writeFile(
    path.join(tmpDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Generate tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  };
  await fs.writeFile(
    path.join(tmpDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  );

  return tmpDir;
}

/**
 * Generate Pulumi TypeScript code from resolved resources
 */
function generatePulumiCode(
  config: StackSoloConfig,
  resources: ResolvedResource[]
): string {
  const imports = new Set<string>();
  imports.add("import * as pulumi from '@pulumi/pulumi';");
  imports.add("import * as gcp from '@pulumi/gcp';");

  const lines: string[] = [];
  lines.push('// Configuration');
  lines.push('const config = new pulumi.Config();');
  lines.push(`const gcpProject = config.get("gcp:project") || "${config.project.gcpProjectId}";`);
  lines.push(`const region = config.get("gcp:region") || "${config.project.region}";`);
  lines.push('');

  // Generate resources
  const outputs: string[] = [];

  for (const resource of resources) {
    const resourceDef = registry.getResource(resource.type);
    if (!resourceDef) {
      lines.push(`// TODO: Unknown resource type: ${resource.type}`);
      continue;
    }

    const generated = resourceDef.generatePulumi(resource.config);

    // Add imports
    for (const imp of generated.imports || []) {
      imports.add(imp);
    }

    // Add code
    lines.push(`// ${resource.type}: ${resource.name}`);
    lines.push(generated.code);
    lines.push('');

    // Collect outputs
    if (generated.outputs) {
      outputs.push(...generated.outputs);
    }
  }

  // Add exports
  if (outputs.length > 0) {
    lines.push('// Outputs');
    for (const output of outputs) {
      lines.push(output);
    }
  }

  return [...imports, '', ...lines].join('\n');
}

// =============================================================================
// CDKTF Backend Deployment
// =============================================================================

/**
 * Deploy infrastructure using CDKTF/Terraform
 */
async function deployCdktfConfig(
  config: StackSoloConfig,
  _stateDir: string, // Not used - CDKTF manages its own state
  options: DeployOptions = {}
): Promise<DeployResult> {
  const { onLog = console.log, preview = false, destroy = false } = options;
  const logs: string[] = [];

  const log = (msg: string) => {
    logs.push(msg);
    onLog(msg);
  };

  try {
    // Resolve config to get resources
    const resolved = resolveConfig(config);

    log(`Resolved ${resolved.resources.length} resources (CDKTF backend)`);

    // CDKTF uses individual resources: vpc_network, vpc_connector, cloud_function, load_balancer
    // Find all cloud function resources
    const functionResources = resolved.resources.filter(r => r.type === 'gcp-cdktf:cloud_function');
    if (functionResources.length === 0) {
      throw new Error('CDKTF backend requires at least one cloud_function resource');
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

      const generated = resourceDef.generatePulumi(resource.config as { name: string; [key: string]: unknown });

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
      const sourceDir = path.resolve(process.cwd(), fnResource.config.sourceDir as string || 'api');
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
    await execAsync('terraform init', { cwd: stackDir });

    if (destroy) {
      log('Destroying resources...');
      await execAsync('terraform destroy -auto-approve', { cwd: stackDir });

      return {
        success: true,
        outputs: {},
        logs,
      };
    }

    if (preview) {
      log('Running terraform plan...');
      const { stdout } = await execAsync('terraform plan', { cwd: stackDir });
      log(stdout);

      return {
        success: true,
        outputs: {},
        logs,
      };
    }

    // Apply
    log('Applying Terraform...');
    await execAsync('terraform apply -auto-approve', { cwd: stackDir });

    // Get outputs
    const { stdout: outputJson } = await execAsync('terraform output -json', { cwd: stackDir });
    const outputs = JSON.parse(outputJson || '{}');

    const outputValues: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(outputs)) {
      outputValues[key] = (value as { value: unknown }).value;
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
