/**
 * stacksolo deploy
 *
 * Deploy infrastructure directly using Pulumi Automation API.
 * No API server required.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import { homedir } from 'os';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { parseConfig, resolveConfig, topologicalSort } from '@stacksolo/blueprint';
import { getRegistry } from '@stacksolo/registry';
import { deployConfig } from '../services/deploy.service';

const execAsync = promisify(exec);

const STACKSOLO_DIR = '.stacksolo';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const CONFIG_FILENAME = 'stacksolo.config.json';
const STATE_DIR = path.join(homedir(), '.stacksolo', 'pulumi-state');

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

type ResourceLogicalType =
  | 'container'
  | 'function'
  | 'database'
  | 'cache'
  | 'bucket'
  | 'secret'
  | 'topic'
  | 'queue'
  | 'network'
  | 'cron';

/**
 * Map a resource type (e.g., gcp:cloud_run) to a logical type (e.g., container)
 */
function mapResourceTypeToLogical(resourceType: string): ResourceLogicalType {
  const typeMap: Record<string, ResourceLogicalType> = {
    'gcp:cloud_run': 'container',
    'gcp:cloud_run_job': 'container',
    'gcp:cloud_function': 'function',
    'gcp:cloud_sql': 'database',
    'gcp:firestore': 'database',
    'gcp:memorystore': 'cache',
    'gcp:storage_bucket': 'bucket',
    'gcp:artifact_registry': 'bucket',
    'gcp:secret_manager': 'secret',
    'gcp:pubsub_topic': 'topic',
    'gcp:pubsub_subscription': 'queue',
    'gcp:cloud_tasks': 'queue',
    'gcp:vpc_network': 'network',
    'gcp:vpc_subnet': 'network',
    'gcp:firewall': 'network',
    'gcp:scheduler_job': 'cron',
  };

  return typeMap[resourceType] || 'container';
}

export const deployCommand = new Command('deploy')
  .description('Deploy infrastructure for the current project')
  .option('--preview', 'Preview changes without deploying')
  .option('--destroy', 'Destroy deployed resources')
  .option('--skip-build', 'Skip building and pushing container images')
  .option('--tag <tag>', 'Image tag for containers', 'latest')
  .option('--refresh', 'Refresh Pulumi state and import existing resources')
  .option('--force', 'Force delete and recreate conflicting resources')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    await runDeploy(options);
  });

interface DeployOptions {
  preview?: boolean;
  destroy?: boolean;
  skipBuild?: boolean;
  tag?: string;
  refresh?: boolean;
  force?: boolean;
  yes?: boolean;
}

interface RetryContext {
  grantedBuildPermissions?: boolean;
  grantedGcfArtifactsPermissions?: boolean;
  deletedResource?: string;
  refreshedState?: boolean;
}

async function runDeploy(options: DeployOptions, retryCount = 0, retryContext: RetryContext = {}): Promise<void> {
  const MAX_RETRIES = 3;

  if (retryCount === 0) {
    console.log(chalk.bold('\n  StackSolo Deploy\n'));
  } else {
    console.log(chalk.cyan(`\n  Retrying deploy (attempt ${retryCount + 1})...\n`));
  }

  // Load config
  const configPath = getConfigPath();
  let config;

  try {
    config = parseConfig(configPath);
  } catch (error) {
    console.log(chalk.red(`  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
    console.log(chalk.gray(`  ${error}`));
    console.log(chalk.gray(`\n  Run 'stacksolo init' to create a project first.\n`));
    return;
  }

  // Show what we're about to deploy (only on first attempt)
  if (retryCount === 0) {
    console.log(chalk.cyan('  Project:'), config.project.name);
    console.log(chalk.cyan('  GCP Project:'), config.project.gcpProjectId);
    console.log(chalk.cyan('  Region:'), config.project.region);
  }

  // Resolve and show resources
  const resolved = resolveConfig(config);
  const order = topologicalSort(resolved.resources);

  if (retryCount === 0) {
    console.log(chalk.cyan('\n  Resources:'), `${resolved.resources.length} to ${options.destroy ? 'destroy' : options.preview ? 'preview' : 'deploy'}`);

    for (const id of order) {
      const resource = resolved.resources.find((r) => r.id === id);
      if (resource) {
        console.log(chalk.gray(`    - ${resource.type}: ${resource.name}`));
      }
    }

    console.log('');
  }

  // Confirm for destroy (only on first attempt)
  if (options.destroy && !options.yes && retryCount === 0) {
    const inquirer = await import('inquirer');
    const { confirm } = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to destroy all resources?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.gray('\n  Cancelled.\n'));
      return;
    }
  }

  // Build and push container images (unless skipped, preview, or destroy)
  // Only build on first attempt
  if (!options.skipBuild && !options.preview && !options.destroy && retryCount === 0) {
    const containers = resolved.resources.filter((r) => r.type === 'gcp:cloud_run');

    if (containers.length > 0) {
      console.log(chalk.cyan('  Building container images...\n'));

      // Configure Docker auth for Artifact Registry
      const authSpinner = ora('Configuring Docker authentication...').start();
      try {
        await execAsync(
          `gcloud auth configure-docker ${config.project.region}-docker.pkg.dev --quiet`
        );
        authSpinner.succeed('Docker authentication configured');
      } catch (error) {
        authSpinner.warn('Could not configure Docker auth (may already be configured)');
      }

      // Build and push each container
      for (const container of containers) {
        const networkName = container.network || 'default';
        const registryUrl = `${config.project.region}-docker.pkg.dev/${config.project.gcpProjectId}/${networkName}-registry`;
        const imageTag = `${registryUrl}/${container.name}:${options.tag}`;
        const sourceDir = (container.config.sourceDir as string) || process.cwd();
        const dockerfilePath = path.join(sourceDir, 'Dockerfile');

        // Check if Dockerfile exists
        try {
          await fs.access(dockerfilePath);
        } catch {
          console.log(chalk.yellow(`    Skipping ${container.name}: No Dockerfile found at ${dockerfilePath}`));
          continue;
        }

        // Build
        const buildSpinner = ora(`Building ${container.name}...`).start();
        try {
          await execAsync(`docker build -t "${imageTag}" "${sourceDir}"`, {
            maxBuffer: 50 * 1024 * 1024,
          });
          buildSpinner.succeed(`Built ${container.name}`);
        } catch (error) {
          buildSpinner.fail(`Failed to build ${container.name}`);
          console.log(chalk.red(`    ${error}\n`));
          console.log(chalk.gray('  Use --skip-build to deploy without building images.\n'));
          return;
        }

        // Push
        const pushSpinner = ora(`Pushing ${container.name}...`).start();
        try {
          await execAsync(`docker push "${imageTag}"`);
          pushSpinner.succeed(`Pushed ${container.name}`);
          console.log(chalk.gray(`    ${imageTag}\n`));
        } catch (error) {
          pushSpinner.fail(`Failed to push ${container.name}`);
          console.log(chalk.red(`    ${error}\n`));

          // Check if registry exists
          const errorStr = String(error);
          if (errorStr.includes('not found') || errorStr.includes('does not exist')) {
            console.log(chalk.yellow('  Registry may not exist yet. Running initial deploy to create it...\n'));
            // Continue with deploy - it will create the registry
          } else {
            console.log(chalk.gray('  Use --skip-build to deploy without pushing images.\n'));
            return;
          }
        }
      }

      console.log('');
    }
  }

  // Deploy
  const action = options.destroy ? 'Destroying' : options.preview ? 'Previewing' : 'Deploying';
  const spinner = ora(`${action} infrastructure...`).start();
  const startTime = Date.now();
  const logs: string[] = [];

  const result = await deployConfig(config, STATE_DIR, {
    preview: options.preview,
    destroy: options.destroy,
    onLog: (msg) => {
      logs.push(msg);
      // Update spinner with elapsed time
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      spinner.text = `${action} infrastructure... (${elapsed}s)`;
    },
  });

  if (result.success) {
    spinner.succeed(`${options.destroy ? 'Destroyed' : options.preview ? 'Preview complete' : 'Deployed'} successfully`);

    if (!options.preview && !options.destroy) {
      // Register/update in registry
      const registry = getRegistry();

      // Find or create project in registry
      let project = await registry.findProjectByPath(configPath);
      if (!project) {
        project = await registry.registerProject({
          name: config.project.name,
          gcpProjectId: config.project.gcpProjectId,
          region: config.project.region,
          configPath,
        });
      }

      // Update project status
      await registry.markProjectDeployed(project.id);

      // Register resources in registry
      for (const id of order) {
        const resource = resolved.resources.find((r) => r.id === id);
        if (resource) {
          // Map resource type to logical type
          const logicalType = mapResourceTypeToLogical(resource.type);

          // Check if resource already exists
          const existing = await registry.findResourceByRef(
            project.id,
            resource.name,
            resource.network ?? null
          );

          let resourceId: string;

          if (!existing) {
            const created = await registry.createResource({
              projectId: project.id,
              type: logicalType,
              name: resource.name,
              network: resource.network,
              resourceType: resource.type,
              config: resource.config,
            });
            resourceId = created.id;
          } else {
            resourceId = existing.id;
          }

          // Mark resource as ready and update outputs if we have them
          const resourceOutputKey = `${resource.name}`;
          const outputValue = result.outputs[resourceOutputKey];

          // For containers, include the image URL
          let imageUrl: string | undefined;
          if (resource.type === 'gcp:cloud_run') {
            const networkName = resource.network || 'default';
            const registryUrl = `${config.project.region}-docker.pkg.dev/${config.project.gcpProjectId}/${networkName}-registry`;
            imageUrl = `${registryUrl}/${resource.name}:${options.tag}`;
          }

          await registry.updateResourceOutputs(resourceId, {
            url: outputValue ? String(outputValue) : undefined,
            imageUrl,
          });
        }
      }

      // Store outputs in registry
      if (Object.keys(result.outputs).length > 0) {
        console.log(chalk.green('\n  Outputs:'));
        for (const [key, value] of Object.entries(result.outputs)) {
          console.log(chalk.gray(`    ${key}: `) + chalk.white(String(value)));
        }
      }

      console.log(chalk.green('\n  Infrastructure deployed successfully!\n'));
      console.log(chalk.gray('  Next steps:'));
      console.log(chalk.gray('    stacksolo list       - View registered projects'));
      console.log(chalk.gray('    stacksolo status     - View deployment status'));
      console.log(chalk.gray('    stacksolo scaffold   - Generate local dev environment\n'));
    }
  } else {
    spinner.fail(`${action} failed`);
    console.log(chalk.red(`\n  ${result.error}\n`));

    // Check for GCP auth errors
    if (result.error?.includes('invalid_grant') || result.error?.includes('reauth related error')) {
      console.log(chalk.yellow('  GCP authentication has expired.\n'));
      const shouldReauth = await promptReauth();
      if (shouldReauth) {
        const success = await runGcloudAuth();
        if (success) {
          console.log(chalk.green('\n  Authentication successful!'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy(options, retryCount + 1, retryContext);
          }
        }
      }
    } else if (result.error?.includes('has not been used in project') || result.error?.includes('SERVICE_DISABLED')) {
      // Extract the API name from the error
      // Match patterns like: eventarc.googleapis.com or API [cloudfunctions.googleapis.com]
      const apiUrlMatch = result.error.match(/apis\/api\/([^/]+)\/overview/);
      const apiBracketMatch = result.error.match(/API \[([^\]]+)\]/);

      const apiName = apiUrlMatch ? apiUrlMatch[1] : (apiBracketMatch ? apiBracketMatch[1] : null);

      if (apiName) {
        console.log(chalk.yellow(`  GCP API needs to be enabled: ${apiName}\n`));

        const spinner = ora(`Enabling ${apiName}...`).start();
        try {
          await execAsync(`gcloud services enable ${apiName} --project=${config.project.gcpProjectId}`);
          spinner.succeed(`Enabled ${apiName}`);
          console.log(chalk.gray('  Waiting 30 seconds for API to propagate...\n'));
          await sleep(30000);

          if (retryCount < MAX_RETRIES) {
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, retryContext);
          }
        } catch (error) {
          spinner.fail(`Failed to enable ${apiName}`);
          console.log(chalk.red(`\n  ${error}\n`));
          console.log(chalk.gray('  Enable it manually in the GCP Console and run `stacksolo deploy` again.\n'));
        }
      } else {
        console.log(chalk.yellow('  A GCP API needs to be enabled for this deployment.\n'));
        console.log(chalk.gray('  Check the error above and enable the required API in the GCP Console.\n'));
      }
    } else if (result.error?.includes('missing permission on the build service account')) {
      // Cloud Functions Gen2 build permission error
      console.log(chalk.yellow('  Cloud Build service account needs permissions.\n'));
      console.log(chalk.gray('  This is required for Cloud Functions Gen2 to build from source.\n'));

      // Check if we already granted permissions in this session
      if (retryContext.grantedBuildPermissions) {
        console.log(chalk.yellow('  Permissions were already granted but the error persists.\n'));
        console.log(chalk.gray('  This usually means IAM changes are still propagating (can take 1-2 minutes).\n'));
        console.log(chalk.gray('  Please wait a moment and run `stacksolo deploy` again.\n'));
        return;
      }

      const shouldFix = await promptFixBuildPermissions();
      if (shouldFix) {
        const success = await grantCloudBuildPermissions(config.project.gcpProjectId, config.project.region);
        if (success) {
          console.log(chalk.green('\n  Permissions granted!'));
          console.log(chalk.gray('  Waiting 30 seconds for IAM changes to propagate...\n'));
          await sleep(30000);
          console.log(chalk.cyan('  Continuing deploy...\n'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, grantedBuildPermissions: true });
          }
        }
      } else {
        console.log(chalk.gray('  To fix manually, run these commands:\n'));
        console.log(chalk.cyan(`  PROJECT_NUMBER=$(gcloud projects describe ${config.project.gcpProjectId} --format="value(projectNumber)")`));
        console.log(chalk.cyan(`  gcloud projects add-iam-policy-binding ${config.project.gcpProjectId} \\`));
        console.log(chalk.cyan(`    --member="serviceAccount:\${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \\`));
        console.log(chalk.cyan(`    --role="roles/storage.objectViewer"\n`));
        console.log(chalk.gray('  After granting, run `stacksolo deploy` again.\n'));
      }
    } else if (result.error?.includes('artifactregistry.repositories.downloadArtifacts') && result.error?.includes('gcf-artifacts')) {
      // gcf-artifacts permission error - need to grant permissions on the repository itself
      console.log(chalk.yellow('  Cloud Build needs permissions on the gcf-artifacts repository.\n'));
      console.log(chalk.gray('  This is required for Cloud Functions Gen2 to cache build artifacts.\n'));

      // Check if we already granted permissions in this session
      if (retryContext.grantedGcfArtifactsPermissions) {
        console.log(chalk.yellow('  Permissions were already granted but the error persists.\n'));
        console.log(chalk.gray('  This usually means IAM changes are still propagating (can take 1-2 minutes).\n'));
        console.log(chalk.gray('  Please wait a moment and run `stacksolo deploy` again.\n'));
        return;
      }

      const shouldFix = await promptFixBuildPermissions();
      if (shouldFix) {
        const success = await grantGcfArtifactsPermissions(config.project.gcpProjectId, config.project.region);
        if (success) {
          console.log(chalk.green('\n  Permissions granted!'));
          console.log(chalk.gray('  Waiting 30 seconds for IAM changes to propagate...\n'));
          await sleep(30000);
          console.log(chalk.cyan('  Continuing deploy...\n'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, grantedGcfArtifactsPermissions: true });
          }
        }
      } else {
        console.log(chalk.gray('  To fix manually, run these commands:\n'));
        console.log(chalk.cyan(`  PROJECT_NUMBER=$(gcloud projects describe ${config.project.gcpProjectId} --format="value(projectNumber)")`));
        console.log(chalk.cyan(`  gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \\`));
        console.log(chalk.cyan(`    --location=${config.project.region} --project=${config.project.gcpProjectId} \\`));
        console.log(chalk.cyan(`    --member="serviceAccount:\${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \\`));
        console.log(chalk.cyan(`    --role="roles/artifactregistry.writer"\n`));
        console.log(chalk.gray('  After granting, run `stacksolo deploy` again.\n'));
      }
    } else if (result.error?.includes('One or more users named in the policy do not belong to a permitted customer')) {
      // Organization policy blocks allUsers - this is expected in some orgs
      console.log(chalk.yellow('  Organization policy prevents public access.\n'));
      console.log(chalk.gray('  Your GCP organization has a policy that blocks granting access to "allUsers".\n'));
      console.log(chalk.gray('  This means Cloud Functions cannot be made publicly accessible.\n'));
      console.log(chalk.gray('\n  For Pub/Sub-triggered functions, this is not an issue.\n'));
      console.log(chalk.gray('  For HTTP-triggered functions, you\'ll need authenticated access or an org policy exception.\n'));
    } else if (result.error?.includes('already exists') || result.error?.includes('Error 409')) {
      // Resource already exists - state mismatch
      const resourceMatch = result.error.match(/Resource '([^']+)' already exists/);
      const resourceName = resourceMatch ? resourceMatch[1] : 'the resource';

      console.log(chalk.yellow('  Resource conflict detected.\n'));
      console.log(chalk.gray(`  ${resourceName} exists in GCP but not in Pulumi state.\n`));

      // Check if we already deleted this resource - if so, GCP is still propagating
      if (retryContext.deletedResource === resourceName) {
        console.log(chalk.yellow('  Resource was already deleted but GCP is still propagating the change.\n'));
        console.log(chalk.gray('  Cloud Functions can take 1-2 minutes to fully delete.\n'));
        console.log(chalk.gray('  Please wait a moment and run `stacksolo deploy` again.\n'));
        return;
      }

      const resolution = await promptConflictResolution();
      if (resolution === 'refresh') {
        // Remove the conflicting resource from Pulumi state so it can be recreated
        console.log(chalk.gray('\n  Removing resource from Pulumi state...\n'));

        // Extract just the resource name from the path
        const shortName = resourceName.split('/').pop() || resourceName;
        const success = await refreshPulumiState(config.project.name, shortName);
        if (success) {
          console.log(chalk.green('  State updated! Continuing deploy...\n'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, refreshedState: true });
          }
        }
      } else if (resolution === 'force') {
        // Delete from GCP and remove from state
        console.log(chalk.gray('\n  Force-deleting resource in GCP...\n'));
        const gcpSuccess = await forceDeleteResource(resourceName, config.project.gcpProjectId);

        // Also remove from state
        const shortName = resourceName.split('/').pop() || resourceName;
        await refreshPulumiState(config.project.name, shortName);

        if (gcpSuccess) {
          console.log(chalk.green('\n  Resource deleted!'));
          console.log(chalk.gray('  Waiting 30 seconds for deletion to propagate...\n'));
          await sleep(30000);
          console.log(chalk.cyan('  Continuing deploy...\n'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, deletedResource: resourceName });
          }
        }
      } else {
        console.log(chalk.gray('\n  To fix manually, you can either:\n'));
        console.log(chalk.gray('  1. Import the resource into Pulumi state:'));
        console.log(chalk.cyan(`     stacksolo deploy --refresh\n`));
        console.log(chalk.gray('  2. Delete the existing resource and let Pulumi recreate it:'));
        console.log(chalk.cyan(`     stacksolo deploy --force\n`));
      }
    } else if (logs.length > 0) {
      console.log(chalk.gray('  Recent logs:'));
      // Show last 10 log lines
      const recentLogs = logs.slice(-10);
      for (const log of recentLogs) {
        console.log(chalk.gray(`    ${log}`));
      }
      console.log('');
    }
  }
}

async function promptReauth(): Promise<boolean> {
  const inquirer = await import('inquirer');
  const { reauth } = await inquirer.default.prompt([
    {
      type: 'confirm',
      name: 'reauth',
      message: 'Re-authenticate with GCP now?',
      default: true,
    },
  ]);
  return reauth;
}

async function runGcloudAuth(): Promise<boolean> {
  console.log(chalk.gray('\n  Opening browser for GCP authentication...\n'));

  return new Promise((resolve) => {
    const child = spawn('gcloud', ['auth', 'application-default', 'login'], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      console.log(chalk.red('  Failed to run gcloud. Make sure gcloud CLI is installed.\n'));
      resolve(false);
    });
  });
}

async function promptFixBuildPermissions(): Promise<boolean> {
  const inquirer = await import('inquirer');
  const { fix } = await inquirer.default.prompt([
    {
      type: 'confirm',
      name: 'fix',
      message: 'Grant Cloud Build permissions now?',
      default: true,
    },
  ]);
  return fix;
}

async function grantCloudBuildPermissions(gcpProjectId: string, region: string): Promise<boolean> {
  const spinner = ora('Getting project number...').start();

  try {
    // Get project number
    const { stdout: projectNumber } = await execAsync(
      `gcloud projects describe ${gcpProjectId} --format="value(projectNumber)"`
    );
    const trimmedProjectNumber = projectNumber.trim();

    // Cloud Functions Gen2 requires permissions on BOTH:
    // 1. The Cloud Build service account (for building)
    // 2. The Cloud Functions service account (serverless-robot-prod) for deployment

    // Permissions for Cloud Build service account
    const cloudBuildRoles = [
      { role: 'roles/storage.objectViewer', name: 'Storage Object Viewer' },
      { role: 'roles/logging.logWriter', name: 'Logs Writer' },
      { role: 'roles/artifactregistry.writer', name: 'Artifact Registry Writer' },
    ];

    spinner.text = 'Granting permissions to Cloud Build service account...';
    for (const { role } of cloudBuildRoles) {
      await execAsync(
        `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
          `--member="serviceAccount:${trimmedProjectNumber}@cloudbuild.gserviceaccount.com" ` +
          `--role="${role}" --quiet`
      );
    }

    // Permissions for Cloud Functions service account (serverless-robot-prod)
    // This is the account that actually deploys the function
    const serverlessRobotRoles = [
      { role: 'roles/cloudbuild.builds.builder', name: 'Cloud Build Builder' },
      { role: 'roles/storage.objectAdmin', name: 'Storage Object Admin' },
      { role: 'roles/artifactregistry.reader', name: 'Artifact Registry Reader' },
    ];

    spinner.text = 'Granting permissions to Cloud Functions service account...';
    for (const { role } of serverlessRobotRoles) {
      await execAsync(
        `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
          `--member="serviceAccount:service-${trimmedProjectNumber}@serverless-robot-prod.iam.gserviceaccount.com" ` +
          `--role="${role}" --quiet`
      );
    }

    // Also grant permissions on gcf-artifacts if it exists
    spinner.text = 'Checking for gcf-artifacts repository...';
    try {
      await execAsync(`gcloud artifacts repositories describe gcf-artifacts --location=${region} --project=${gcpProjectId}`);
      // Repository exists, grant permissions
      await grantGcfArtifactsPermissions(gcpProjectId, region);
    } catch {
      // Repository doesn't exist yet, will be created on first function deploy
    }

    spinner.succeed('Permissions granted for Cloud Functions deployment');
    return true;
  } catch (error) {
    spinner.fail('Failed to grant permissions');
    console.log(chalk.red(`\n  ${error}\n`));
    console.log(chalk.gray('  You may need to grant this permission manually in the GCP Console.\n'));
    return false;
  }
}

async function grantGcfArtifactsPermissions(gcpProjectId: string, region: string): Promise<boolean> {
  const spinner = ora('Granting gcf-artifacts permissions...').start();

  try {
    // Get project number
    const { stdout: projectNumber } = await execAsync(
      `gcloud projects describe ${gcpProjectId} --format="value(projectNumber)"`
    );
    const trimmedProjectNumber = projectNumber.trim();

    // Service accounts that need access to gcf-artifacts
    const serviceAccounts = [
      `${trimmedProjectNumber}@cloudbuild.gserviceaccount.com`,
      `service-${trimmedProjectNumber}@serverless-robot-prod.iam.gserviceaccount.com`,
      `${trimmedProjectNumber}-compute@developer.gserviceaccount.com`,
    ];

    spinner.text = 'Granting artifactregistry.writer on gcf-artifacts...';
    for (const sa of serviceAccounts) {
      try {
        await execAsync(
          `gcloud artifacts repositories add-iam-policy-binding gcf-artifacts ` +
            `--location=${region} --project=${gcpProjectId} ` +
            `--member="serviceAccount:${sa}" ` +
            `--role="roles/artifactregistry.writer" --quiet`
        );
      } catch {
        // May fail if SA doesn't exist yet, continue with others
      }
    }

    spinner.succeed('Granted gcf-artifacts permissions');
    return true;
  } catch (error) {
    spinner.fail('Failed to grant gcf-artifacts permissions');
    console.log(chalk.red(`\n  ${error}\n`));
    return false;
  }
}

async function promptConflictResolution(): Promise<'refresh' | 'force' | 'skip'> {
  const inquirer = await import('inquirer');
  const { resolution } = await inquirer.default.prompt([
    {
      type: 'list',
      name: 'resolution',
      message: 'How would you like to resolve this conflict?',
      choices: [
        {
          name: 'Refresh state (import existing resource into Pulumi)',
          value: 'refresh',
        },
        {
          name: 'Force delete (delete resource in GCP and recreate)',
          value: 'force',
        },
        {
          name: 'Skip (show manual instructions)',
          value: 'skip',
        },
      ],
      default: 'refresh',
    },
  ]);
  return resolution;
}

async function refreshPulumiState(projectName: string, resourceName?: string): Promise<boolean> {
  const spinner = ora('Cleaning Pulumi state...').start();
  const stateFile = path.join(STATE_DIR, '.pulumi', 'stacks', projectName, 'dev.json');

  try {
    // Read the state file
    const stateContent = await fs.readFile(stateFile, 'utf-8');
    const state = JSON.parse(stateContent);

    const resources = state.checkpoint?.latest?.resources || [];
    const originalCount = resources.length;

    if (resourceName) {
      // Remove specific resource from state
      state.checkpoint.latest.resources = resources.filter((r: { urn?: string }) => {
        const urn = r.urn || '';
        return !urn.includes(resourceName);
      });
      spinner.text = `Removing ${resourceName} from state...`;
    } else {
      // Just refresh - nothing to do, state is already current
      spinner.succeed('State is current');
      return true;
    }

    const newCount = state.checkpoint.latest.resources.length;
    const removed = originalCount - newCount;

    if (removed > 0) {
      // Backup and write new state
      await fs.writeFile(`${stateFile}.backup`, stateContent);
      await fs.writeFile(stateFile, JSON.stringify(state, null, 4));
      spinner.succeed(`Removed ${removed} resource(s) from state`);
    } else {
      spinner.succeed('No matching resources found in state');
    }

    return true;
  } catch (error) {
    spinner.fail('Failed to clean state');
    console.log(chalk.red(`\n  ${error}\n`));
    return false;
  }
}

async function forceDeleteResource(resourcePath: string, gcpProjectId: string): Promise<boolean> {
  const spinner = ora('Detecting resource type...').start();

  try {
    // Parse the resource path to determine type and name
    // Example: projects/my-project/locations/us-central1/functions/processor
    if (resourcePath.includes('/functions/')) {
      const functionName = resourcePath.split('/functions/')[1];
      const locationMatch = resourcePath.match(/locations\/([^/]+)/);
      const location = locationMatch ? locationMatch[1] : 'us-central1';

      spinner.text = `Deleting Cloud Function ${functionName}...`;
      await execAsync(
        `gcloud functions delete ${functionName} --region=${location} --project=${gcpProjectId} --gen2 --quiet`
      );
      spinner.succeed(`Deleted Cloud Function ${functionName}`);
      return true;
    } else if (resourcePath.includes('/services/')) {
      const serviceName = resourcePath.split('/services/')[1];
      const locationMatch = resourcePath.match(/locations\/([^/]+)/);
      const location = locationMatch ? locationMatch[1] : 'us-central1';

      spinner.text = `Deleting Cloud Run service ${serviceName}...`;
      await execAsync(
        `gcloud run services delete ${serviceName} --region=${location} --project=${gcpProjectId} --quiet`
      );
      spinner.succeed(`Deleted Cloud Run service ${serviceName}`);
      return true;
    } else if (resourcePath.includes('/topics/')) {
      const topicName = resourcePath.split('/topics/')[1];

      spinner.text = `Deleting Pub/Sub topic ${topicName}...`;
      await execAsync(`gcloud pubsub topics delete ${topicName} --project=${gcpProjectId} --quiet`);
      spinner.succeed(`Deleted Pub/Sub topic ${topicName}`);
      return true;
    } else if (resourcePath.includes('/buckets/')) {
      const bucketName = resourcePath.split('/buckets/')[1];

      spinner.text = `Deleting storage bucket ${bucketName}...`;
      await execAsync(`gcloud storage rm -r gs://${bucketName} --project=${gcpProjectId}`);
      spinner.succeed(`Deleted storage bucket ${bucketName}`);
      return true;
    } else {
      spinner.fail('Unknown resource type');
      console.log(chalk.yellow(`\n  Could not determine how to delete: ${resourcePath}\n`));
      console.log(chalk.gray('  Please delete the resource manually in the GCP Console.\n'));
      return false;
    }
  } catch (error) {
    spinner.fail('Failed to delete resource');
    const errorStr = String(error);

    // Check for permission denied errors
    if (errorStr.includes('Permission') && errorStr.includes('denied')) {
      console.log(chalk.yellow('\n  Permission denied. Your account needs additional IAM roles.\n'));

      const shouldFix = await promptFixIamPermissions();
      if (shouldFix) {
        const success = await grantResourceDeletePermissions(resourcePath, gcpProjectId);
        if (success) {
          console.log(chalk.green('\n  Permissions granted! Retrying delete...\n'));
          // Retry the delete
          return forceDeleteResource(resourcePath, gcpProjectId);
        }
      } else {
        console.log(chalk.gray('  Please delete the resource manually in the GCP Console.\n'));
      }
    } else {
      console.log(chalk.red(`\n  ${error}\n`));
      console.log(chalk.gray('  Please delete the resource manually in the GCP Console.\n'));
    }
    return false;
  }
}

async function promptFixIamPermissions(): Promise<boolean> {
  const inquirer = await import('inquirer');
  const { fix } = await inquirer.default.prompt([
    {
      type: 'confirm',
      name: 'fix',
      message: 'Grant yourself the required IAM permissions?',
      default: true,
    },
  ]);
  return fix;
}

async function grantResourceDeletePermissions(resourcePath: string, gcpProjectId: string): Promise<boolean> {
  const inquirer = await import('inquirer');

  // Check current gcloud account
  let currentAccount = '';
  try {
    const { stdout } = await execAsync('gcloud config get-value account');
    currentAccount = stdout.trim();
  } catch {
    // Ignore
  }

  console.log(chalk.gray(`\n  Currently authenticated as: ${currentAccount || 'unknown'}\n`));

  // Ask what to do
  const { action } = await inquirer.default.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'How would you like to proceed?',
      choices: [
        {
          name: `Grant permissions to ${currentAccount || 'current account'}`,
          value: 'current',
        },
        {
          name: 'Switch to a different GCP account first',
          value: 'switch',
        },
        {
          name: 'Enter a different email to grant permissions to',
          value: 'other',
        },
        {
          name: 'Cancel',
          value: 'cancel',
        },
      ],
    },
  ]);

  if (action === 'cancel') {
    return false;
  }

  let email = currentAccount;

  if (action === 'switch') {
    console.log(chalk.gray('\n  Opening browser to switch GCP accounts...\n'));
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('gcloud', ['auth', 'login'], {
          stdio: 'inherit',
          shell: true,
        });
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error('Auth failed'));
        });
        child.on('error', reject);
      });

      // Get the new account
      const { stdout } = await execAsync('gcloud config get-value account');
      email = stdout.trim();
      console.log(chalk.green(`\n  Now authenticated as: ${email}\n`));
    } catch (error) {
      console.log(chalk.red('\n  Failed to switch accounts.\n'));
      return false;
    }
  } else if (action === 'other') {
    const { inputEmail } = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'inputEmail',
        message: 'Enter the GCP account email to grant permissions to:',
        validate: (input: string) => {
          if (!input.includes('@')) {
            return 'Please enter a valid email address';
          }
          return true;
        },
      },
    ]);
    email = inputEmail;
  }

  if (!email) {
    console.log(chalk.red('\n  No email specified.\n'));
    return false;
  }

  const spinner = ora('Granting IAM permissions...').start();

  try {
    // Determine which role to grant based on resource type
    let role: string;
    let roleName: string;

    if (resourcePath.includes('/functions/')) {
      role = 'roles/cloudfunctions.admin';
      roleName = 'Cloud Functions Admin';
    } else if (resourcePath.includes('/services/')) {
      role = 'roles/run.admin';
      roleName = 'Cloud Run Admin';
    } else if (resourcePath.includes('/topics/')) {
      role = 'roles/pubsub.admin';
      roleName = 'Pub/Sub Admin';
    } else if (resourcePath.includes('/buckets/')) {
      role = 'roles/storage.admin';
      roleName = 'Storage Admin';
    } else {
      role = 'roles/editor';
      roleName = 'Editor';
    }

    spinner.text = `Granting ${roleName} role to ${email}...`;

    await execAsync(
      `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
        `--member="user:${email}" ` +
        `--role="${role}" --quiet`
    );

    spinner.succeed(`Granted ${roleName} role to ${email}`);
    console.log(chalk.gray('\n  Note: It may take a minute for permissions to propagate.\n'));
    return true;
  } catch (error) {
    spinner.fail('Failed to grant permissions');
    const errorStr = String(error);

    if (errorStr.includes('does not have permission')) {
      console.log(chalk.yellow('\n  Your current GCP account does not have permission to modify IAM.\n'));
      console.log(chalk.gray('  You need to be a Project Owner or have the "Project IAM Admin" role.'));
      console.log(chalk.gray('  Ask a project owner to grant you permissions, or switch to an owner account.\n'));
    } else {
      console.log(chalk.red(`\n  ${error}\n`));
    }
    return false;
  }
}
