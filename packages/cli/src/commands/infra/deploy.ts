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
import {
  getRegistry,
  initRegistry,
  startSession,
  endSession,
  logPhaseStart,
  logPhaseEnd,
  logConflictDetected,
  logUserPrompt,
  logUserResponse,
  logTerraformEvent,
  logEvent,
} from '@stacksolo/registry';
import { deployConfig } from '../../services/deploy.service';
import {
  deployToKubernetes,
  buildAndPushImages,
  checkKubernetesConnection,
} from '../../services/k8s-deploy.service';
import { createCommandLogger, logFullError, getLogPath } from '../../logger';
import {
  runPreflightCheck,
  promptConflictResolution as promptPreflightResolution,
  executeResolution,
  PreflightResult,
  runKernelPreflightCheck,
  displayKernelPreflightResults,
  ensureCloudFunctionsPrerequisites,
  ensureStorageTriggerPrerequisites,
  extractGeminiModels,
  validateGeminiModels,
  displayGeminiValidationResults,
} from '../../services/preflight.service';
import { getPluginFormatter, loadPlugins } from '../../services/plugin-loader.service';
import {
  checkSecrets,
  createMissingSecrets,
  SecretReference,
} from '../../services/secret-manager.service';

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
  .option('--skip-preflight', 'Skip pre-flight conflict detection')
  .option('--import-conflicts', 'Automatically import conflicting resources')
  .option('--delete-conflicts', 'Automatically delete conflicting resources')
  .option('-v, --verbose', 'Show real-time Terraform and Docker output')
  .option('--helm', 'Generate Helm chart instead of raw K8s manifests (kubernetes backend only)')
  .option('--skip-secrets', 'Skip secret validation and auto-creation')
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
  skipPreflight?: boolean;
  importConflicts?: boolean;
  deleteConflicts?: boolean;
  verbose?: boolean;
  helm?: boolean;
  skipSecrets?: boolean;
}

interface RetryContext {
  grantedBuildPermissions?: boolean;
  grantedGcfArtifactsPermissions?: boolean;
  deletedResource?: string;
  deletedResources?: string[];
  refreshedState?: boolean;
}

/**
 * Phase progress tracker for deploy operations
 */
class DeployProgress {
  private currentStep = 0;
  private totalSteps = 0;
  private phases: string[] = [];

  configure(phases: string[]) {
    this.phases = phases;
    this.totalSteps = phases.length;
    this.currentStep = 0;
  }

  next(): string {
    this.currentStep++;
    const phase = this.phases[this.currentStep - 1] || 'Processing';
    return chalk.cyan(`  [${this.currentStep}/${this.totalSteps}] ${phase}`);
  }

  stepLabel(): string {
    return `[${this.currentStep}/${this.totalSteps}]`;
  }
}

interface ConflictingResource {
  type: string;
  name: string;
  fullPath: string;
}

/**
 * Parse conflicting resources from Pulumi/Terraform error output
 * Handles various GCP resource types and their error message formats
 */
function parseConflictingResources(error: string): ConflictingResource[] {
  const conflicts: ConflictingResource[] = [];
  const seen = new Set<string>();

  // Extract from error diagnostics sections
  // Patterns handled:
  // 1. projects/PROJECT/locations/LOCATION/TYPE/NAME already exists
  // 2. projects/PROJECT/global/TYPE/NAME already exists
  // 3. the repository already exists (artifact registry)
  // 4. Service account NAME already exists
  // 5. Terraform: google_compute_url_map.NAME: Error 409
  // 6. Terraform: bucket already exists
  const lines = error.split('\n');
  for (const line of lines) {
    // Match: gcp:TYPE (NAME) - handles multi-line format with \n in name (Pulumi format)
    const pulumiMatch = line.match(/gcp:([^:]+):([^\s]+)\s+\(([^)]+)\)/);
    if (pulumiMatch) {
      const [, provider, resourceType, name] = pulumiMatch;
      const cleanName = name.replace(/\\n/g, '').trim();
      if (!seen.has(cleanName) && line.includes('409')) {
        seen.add(cleanName);
        conflicts.push({
          type: `${provider}/${resourceType}`,
          name: cleanName,
          fullPath: cleanName,
        });
      }
    }

    // Match: gcp:provider:Type (name): followed by 409 error on same or nearby line
    // This catches cases like "gcp:vpcaccess:Connector (main-connector):"
    if (line.includes('409') || line.includes('already exists')) {
      const resourceMatch = error.match(/gcp:([^:]+):([^\s]+)\s+\(([^)]+)\)/);
      if (resourceMatch) {
        const [, provider, resourceType, name] = resourceMatch;
        const cleanName = name.replace(/\\n/g, '').trim();
        if (!seen.has(cleanName)) {
          seen.add(cleanName);
          conflicts.push({
            type: `${provider}/${resourceType}`,
            name: cleanName,
            fullPath: cleanName,
          });
        }
      }
    }

    // Match: 'projects/xxx/global/addresses/yyy' already exists
    const pathMatch = line.match(/['"]?(projects\/[^'"]+)['"]?\s+already exists/i);
    if (pathMatch) {
      const fullPath = pathMatch[1];
      const parts = fullPath.split('/');
      const name = parts[parts.length - 1];
      const type = parts[parts.length - 2];
      if (!seen.has(name)) {
        seen.add(name);
        conflicts.push({
          type: type,
          name: name,
          fullPath: fullPath,
        });
      }
    }

    // Match: Service account xxx already exists
    const saMatch = line.match(/Service account ([^\s]+) already exists/);
    if (saMatch) {
      const name = saMatch[1];
      if (!seen.has(name)) {
        seen.add(name);
        conflicts.push({
          type: 'serviceAccounts',
          name: name,
          fullPath: name,
        });
      }
    }

    // Match: the repository already exists (for artifact registry)
    if (line.includes('repository already exists') && line.includes('artifactregistry')) {
      const repoMatch = line.match(/Repository \(([^)]+)\)/);
      if (repoMatch) {
        const name = repoMatch[1].replace(/\\n/g, '').trim();
        if (!seen.has(name)) {
          seen.add(name);
          conflicts.push({
            type: 'repositories',
            name: name,
            fullPath: name,
          });
        }
      }
    }

    // Match: bucket already exists (Storage buckets)
    if (line.includes('already own it') || line.includes('bucket succeeded')) {
      // Look for google_storage_bucket resource name in nearby context
      const bucketResourceMatch = error.match(/google_storage_bucket\.([a-zA-Z0-9_-]+)/);
      if (bucketResourceMatch) {
        const resourceName = bucketResourceMatch[1];
        if (!seen.has(resourceName)) {
          seen.add(resourceName);
          conflicts.push({
            type: 'buckets',
            name: resourceName,
            fullPath: resourceName,
          });
        }
      }
    }
  }

  // Also parse Terraform-specific resource conflict patterns from the full error
  // Terraform errors look like: with google_compute_url_map.solo-project-lb-urlmap
  const terraformResourceMatches = error.matchAll(/with\s+google_([a-z_]+)\.([a-zA-Z0-9_-]+)/g);
  for (const match of terraformResourceMatches) {
    const [, resourceType, name] = match;
    // Check if this resource has a 409 error nearby
    const resourceSection = error.slice(Math.max(0, error.indexOf(match[0]) - 200), error.indexOf(match[0]) + 200);
    if (resourceSection.includes('409') || resourceSection.includes('already exists')) {
      if (!seen.has(name)) {
        seen.add(name);
        // Map terraform resource types to our types
        const typeMap: Record<string, string> = {
          'compute_url_map': 'urlMaps',
          'compute_target_http_proxy': 'targetHttpProxies',
          'compute_target_https_proxy': 'targetHttpsProxies',
          'compute_global_forwarding_rule': 'forwardingRules',
          'compute_forwarding_rule': 'forwardingRules',
          'compute_backend_service': 'backendServices',
          'compute_backend_bucket': 'backendBuckets',
          'compute_health_check': 'healthChecks',
          'compute_global_address': 'addresses',
          'compute_network_endpoint_group': 'networkEndpointGroups',
          'compute_region_network_endpoint_group': 'networkEndpointGroups',
          'compute_network': 'networks',
          'cloudfunctions2_function': 'functions',
          'cloud_run_service': 'services',
          'storage_bucket': 'buckets',
          'vpc_access_connector': 'connectors',
          'pubsub_topic': 'topics',
        };
        conflicts.push({
          type: typeMap[resourceType] || resourceType,
          name: name,
          fullPath: name,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Sort resources for deletion in reverse dependency order
 * Load balancer resources have complex dependencies:
 *   forwarding-rule → target-proxy → url-map → backend-service
 */
function sortResourcesForDeletion(resources: ConflictingResource[]): ConflictingResource[] {
  // Define deletion priority (higher = delete first)
  const deletionPriority: Record<string, number> = {
    // Forwarding rules must be deleted first
    'forwardingRules': 100,
    'globalForwardingRules': 100,
    // Then proxies
    'targetHttpProxies': 90,
    'targetHttpsProxies': 90,
    // Then SSL certificates (after proxies that use them)
    'sslCertificates': 85,
    // Then URL maps
    'urlMaps': 80,
    // Then backend services/buckets (before NEGs that they depend on)
    'backendServices': 70,
    'backendBuckets': 70,
    'compute/BackendService': 70,
    'compute/BackendBucket': 70,
    // Then health checks
    'healthChecks': 60,
    // Then network endpoint groups
    'networkEndpointGroups': 50,
    // Then functions (depend on NEGs)
    'functions': 45,
    // VPC Connectors (can have dependent functions/Cloud Run)
    'connectors': 42,
    'vpcaccess/Connector': 42,
    // Addresses can be deleted whenever
    'addresses': 40,
    'globalAddresses': 40,
    // Service accounts
    'serviceAccounts': 30,
    // Artifact registry
    'repositories': 20,
    // Everything else
    'default': 10,
  };

  return [...resources].sort((a, b) => {
    const priorityA = deletionPriority[a.type] || deletionPriority['default'];
    const priorityB = deletionPriority[b.type] || deletionPriority['default'];
    return priorityB - priorityA; // Higher priority first
  });
}

async function runDeploy(
  options: DeployOptions,
  retryCount = 0,
  retryContext: RetryContext = {},
  sessionId?: string
): Promise<void> {
  const MAX_RETRIES = 3;
  const log = createCommandLogger('deploy');

  log.info('Starting deploy', { options, retryCount, retryContext });

  // Initialize event logging on first attempt
  if (retryCount === 0) {
    await initRegistry();
    const command = options.destroy ? 'destroy' : options.preview ? 'preview' : 'deploy';
    sessionId = await startSession({
      command,
      args: JSON.stringify(options),
    });
  }

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
    log.info('Config loaded', { configPath, project: config.project });

    // Update session with project info
    if (sessionId) {
      await logEvent({
        sessionId,
        category: 'internal',
        eventType: 'session_start',
        data: {
          projectName: config.project.name,
          gcpProjectId: config.project.gcpProjectId,
          region: config.project.region,
        },
      });
    }
  } catch (error) {
    logFullError('config-parse', error, { configPath });
    console.log(chalk.red(`  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
    console.log(chalk.gray(`  ${error}`));
    console.log(chalk.gray(`\n  Run 'stacksolo init' to create a project first.\n`));
    if (sessionId) await endSession(sessionId, 1);
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

  // Calculate phases for progress tracking (only on first attempt)
  const progress = new DeployProgress();
  if (retryCount === 0) {
    const phases: string[] = [];
    const hasCloudFunctions = resolved.resources.some((r) => r.type === 'gcp-cdktf:cloud_function');
    const hasContainers = resolved.resources.some((r) => r.type === 'gcp:cloud_run');
    const hasGcpKernel = resolved.resources.some((r) => r.type === 'gcp-kernel:gcp_kernel');

    // Check for @secret/ references in config
    const hasSecretRefs = (config.project.networks || []).some(network =>
      (network.functions || []).some(fn =>
        Object.values(fn.env || {}).some(v => typeof v === 'string' && v.startsWith('@secret/'))
      ) ||
      (network.containers || []).some(c =>
        Object.values(c.env || {}).some(v => typeof v === 'string' && v.startsWith('@secret/')) ||
        Object.values(c.secrets || {}).some(v => typeof v === 'string' && v.startsWith('@secret/'))
      )
    );

    if (hasSecretRefs && !options.destroy && !options.skipSecrets) {
      phases.push('Checking secrets');
    }
    if (!options.destroy && !options.skipPreflight && !options.force) {
      phases.push('Pre-flight checks');
    }
    if (hasCloudFunctions && !options.destroy && !options.preview && !options.skipPreflight) {
      phases.push('Cloud Functions setup');
    }
    if ((hasContainers || hasGcpKernel) && !options.preview && !options.destroy && !options.skipBuild) {
      phases.push('Building containers');
    }
    phases.push(options.destroy ? 'Destroying infrastructure' : options.preview ? 'Previewing changes' : 'Deploying infrastructure');

    progress.configure(phases);
  }

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

  // Secret validation and auto-creation (only on first attempt, not destroy)
  if (!options.destroy && !options.skipSecrets && retryCount === 0) {
    const secretCheck = await checkSecrets(config, config.project.gcpProjectId);

    if (secretCheck.required.length > 0) {
      console.log(progress.next());
      const secretSpinner = ora('Checking secrets in Secret Manager...').start();

      if (secretCheck.missing.length === 0) {
        secretSpinner.succeed(`All ${secretCheck.required.length} required secret(s) exist`);
      } else {
        secretSpinner.warn(`${secretCheck.missing.length} of ${secretCheck.required.length} secret(s) missing`);

        // Show which secrets are missing
        console.log(chalk.yellow('\n  Missing secrets:'));
        for (const secret of secretCheck.missing) {
          console.log(chalk.gray(`    - ${secret.secretName} (${secret.envKey} in ${secret.source})`));
        }
        console.log('');

        // Interactive prompt for missing secrets
        const inquirer = await import('inquirer');
        const { createSecrets } = await inquirer.default.prompt([
          {
            type: 'confirm',
            name: 'createSecrets',
            message: 'Create missing secrets now?',
            default: true,
          },
        ]);

        if (createSecrets) {
          // Read .env.production for potential values
          const { readEnvProductionFile } = await import('../../services/secret-manager.service');
          const envValues = await readEnvProductionFile(process.cwd());

          // Prompt user for each missing secret
          const promptForValue = async (envKey: string, secretName: string): Promise<string | null> => {
            // Check if value exists in .env.production
            if (envValues[envKey]) {
              const { useEnvValue } = await inquirer.default.prompt([
                {
                  type: 'confirm',
                  name: 'useEnvValue',
                  message: `Found ${envKey} in .env.production. Use this value?`,
                  default: true,
                },
              ]);

              if (useEnvValue) {
                return envValues[envKey];
              }
            }

            // Prompt for manual entry
            const { secretValue } = await inquirer.default.prompt([
              {
                type: 'password',
                name: 'secretValue',
                message: `Enter value for ${envKey} (${secretName}):`,
                mask: '*',
              },
            ]);

            return secretValue || null;
          };

          const createResult = await createMissingSecrets(
            secretCheck.missing,
            config.project.gcpProjectId,
            process.cwd(),
            {
              onLog: (msg) => console.log(chalk.gray(msg)),
              promptForValue,
            }
          );

          if (createResult.created.length > 0) {
            console.log(chalk.green(`\n  Created ${createResult.created.length} secret(s) successfully`));
          }
          if (createResult.skipped.length > 0) {
            console.log(chalk.yellow(`  Skipped ${createResult.skipped.length} secret(s) (no value provided)`));
          }
          if (createResult.failed.length > 0) {
            console.log(chalk.red(`  Failed to create ${createResult.failed.length} secret(s)`));
            console.log(chalk.gray('\n  Deployment may fail if these secrets are required.'));
          }
          console.log('');
        } else {
          console.log(chalk.yellow('\n  Skipping secret creation.'));
          console.log(chalk.gray('  Deployment may fail if these secrets are required.\n'));
        }
      }
    }
  }

  // Pre-flight conflict detection (only on first attempt, not destroy, not force)
  if (!options.destroy && !options.skipPreflight && !options.force && retryCount === 0) {
    console.log(progress.next());
    if (sessionId) await logPhaseStart(sessionId, 'preflight', { project: config.project.name });
    const preflightSpinner = ora('Checking for resource conflicts...').start();

    try {
      const preflightResult = await runPreflightCheck(
        {
          project: {
            name: config.project.name,
            gcpProjectId: config.project.gcpProjectId,
            region: config.project.region,
          },
        },
        process.cwd()
      );

      if (preflightResult.hasConflicts) {
        preflightSpinner.warn(`Found ${preflightResult.conflicts.length} resource conflict(s)`);

        // Log conflicts
        if (sessionId) {
          await logConflictDetected(
            sessionId,
            preflightResult.conflicts.map((c: { resourceType: string; resourceName: string; address?: string }) => ({
              type: c.resourceType,
              name: c.resourceName,
              address: c.address,
            }))
          );
        }

        // Handle auto-import or auto-delete options
        if (options.importConflicts) {
          const importResult = await executeResolution(
            { action: 'import_all' },
            preflightResult.conflicts,
            {
              project: {
                name: config.project.name,
                gcpProjectId: config.project.gcpProjectId,
                region: config.project.region,
              },
            },
            process.cwd()
          );
          if (!importResult.success) {
            console.log(chalk.yellow(`\n  ${importResult.message}\n`));
            console.log(chalk.gray('  Continuing with deploy anyway...\n'));
          }
        } else if (options.deleteConflicts) {
          console.log(chalk.yellow('\n  Auto-delete requires --force flag for safety.\n'));
          console.log(chalk.gray('  Use: stacksolo deploy --force --delete-conflicts\n'));
          return;
        } else {
          // Interactive prompt
          const resolution = await promptPreflightResolution(preflightResult.conflicts);

          if (resolution.action === 'cancel') {
            console.log(chalk.gray('\n  Deploy cancelled.\n'));
            return;
          }

          if (resolution.action === 'list_details') {
            // Show details and re-prompt
            await executeResolution(
              resolution,
              preflightResult.conflicts,
              {
                project: {
                  name: config.project.name,
                  gcpProjectId: config.project.gcpProjectId,
                  region: config.project.region,
                },
              },
              process.cwd()
            );
            const newResolution = await promptPreflightResolution(preflightResult.conflicts);
            if (newResolution.action === 'cancel') {
              console.log(chalk.gray('\n  Deploy cancelled.\n'));
              return;
            }
            if (newResolution.action === 'change_prefix') {
              await executeResolution(
                newResolution,
                preflightResult.conflicts,
                {
                  project: {
                    name: config.project.name,
                    gcpProjectId: config.project.gcpProjectId,
                    region: config.project.region,
                  },
                },
                process.cwd()
              );
              return;
            }
            await executeResolution(
              newResolution,
              preflightResult.conflicts,
              {
                project: {
                  name: config.project.name,
                  gcpProjectId: config.project.gcpProjectId,
                  region: config.project.region,
                },
              },
              process.cwd()
            );
          } else if (resolution.action === 'change_prefix') {
            await executeResolution(
              resolution,
              preflightResult.conflicts,
              {
                project: {
                  name: config.project.name,
                  gcpProjectId: config.project.gcpProjectId,
                  region: config.project.region,
                },
              },
              process.cwd()
            );
            return;
          } else {
            // import_all or delete_all
            const result = await executeResolution(
              resolution,
              preflightResult.conflicts,
              {
                project: {
                  name: config.project.name,
                  gcpProjectId: config.project.gcpProjectId,
                  region: config.project.region,
                },
              },
              process.cwd()
            );
            if (!result.success && resolution.action !== 'import_all') {
              console.log(chalk.red(`\n  ${result.message}\n`));
              return;
            }
          }
        }
      } else {
        preflightSpinner.succeed('No resource conflicts detected');
      }

      // Show any scan errors as warnings
      if (preflightResult.errors.length > 0) {
        console.log(chalk.yellow('\n  Some resource scans failed (non-critical):'));
        for (const err of preflightResult.errors) {
          console.log(chalk.gray(`    - ${err}`));
        }
        console.log();
      }
    } catch (error) {
      preflightSpinner.warn('Could not complete pre-flight check (continuing anyway)');
      console.log(chalk.gray(`    ${error}\n`));
    }

    if (sessionId) await logPhaseEnd(sessionId, 'preflight', { project: config.project.name });
  }

  // GCP Kernel preflight checks (only on first attempt, not destroy, not preview)
  const hasGcpKernel = resolved.resources.some((r) => r.type === 'gcp-kernel:gcp_kernel');
  if (hasGcpKernel && !options.destroy && !options.preview && !options.skipPreflight && retryCount === 0) {
    const kernelSpinner = ora('Running GCP Kernel preflight checks...').start();

    try {
      const kernelResult = await runKernelPreflightCheck(
        config.project.gcpProjectId,
        process.cwd()
      );

      if (kernelResult.success) {
        kernelSpinner.succeed('GCP Kernel preflight checks passed');
      } else {
        kernelSpinner.fail('GCP Kernel preflight checks failed');
        displayKernelPreflightResults(kernelResult);

        // Ask if user wants to continue despite failures
        const inquirer = await import('inquirer');
        const { continueAnyway } = await inquirer.default.prompt([
          {
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Continue with deploy anyway? (may fail)',
            default: false,
          },
        ]);

        if (!continueAnyway) {
          console.log(chalk.gray('\n  Deploy cancelled. Fix the issues above and try again.\n'));
          return;
        }
      }

      // Show warnings even on success
      if (kernelResult.warnings.length > 0 && kernelResult.success) {
        console.log(chalk.yellow('  Warnings (will attempt auto-fix during deploy):'));
        for (const warning of kernelResult.warnings) {
          console.log(chalk.gray(`    - ${warning}`));
        }
        console.log();
      }
    } catch (error) {
      kernelSpinner.warn('Could not complete GCP Kernel preflight check (continuing anyway)');
      console.log(chalk.gray(`    ${error}\n`));
    }
  }

  // Cloud Functions Gen2 preflight setup (only on first attempt, not destroy, not preview)
  const hasCloudFunctions = resolved.resources.some((r) => r.type === 'gcp-cdktf:cloud_function');
  if (hasCloudFunctions && !options.destroy && !options.preview && !options.skipPreflight && retryCount === 0) {
    console.log(progress.next());
    const cfSpinner = ora('Setting up Cloud Functions prerequisites...').start();

    try {
      const cfResult = await ensureCloudFunctionsPrerequisites(
        config.project.gcpProjectId,
        config.project.region
      );

      if (cfResult.success) {
        if (cfResult.actionsPerformed.length > 0) {
          cfSpinner.succeed(`Cloud Functions setup complete (${cfResult.actionsPerformed.length} actions)`);
        } else {
          cfSpinner.succeed('Cloud Functions prerequisites already configured');
        }
      } else {
        cfSpinner.warn('Some Cloud Functions setup steps had issues (continuing anyway)');
        for (const error of cfResult.errors) {
          console.log(chalk.yellow(`    - ${error}`));
        }
      }
    } catch (error) {
      cfSpinner.warn('Could not complete Cloud Functions setup (continuing anyway)');
      console.log(chalk.gray(`    ${error}\n`));
    }
  }

  // Storage trigger preflight setup (only on first attempt, not destroy, not preview)
  // Extract storage-triggered functions and their trigger buckets
  const storageTriggerBuckets: string[] = [];
  const functionsWithTriggers: Array<{ name: string; env?: Record<string, string> }> = [];

  for (const network of config.project.networks || []) {
    for (const fn of network.functions || []) {
      functionsWithTriggers.push(fn);
      if (fn.trigger?.type === 'storage' && fn.trigger.bucket) {
        storageTriggerBuckets.push(fn.trigger.bucket);
      }
    }
  }

  if (storageTriggerBuckets.length > 0 && !options.destroy && !options.preview && !options.skipPreflight && retryCount === 0) {
    console.log(progress.next());
    const storageSpinner = ora('Setting up storage trigger prerequisites...').start();

    try {
      const storageResult = await ensureStorageTriggerPrerequisites(
        config.project.gcpProjectId,
        config.project.region,
        storageTriggerBuckets
      );

      if (storageResult.success) {
        if (storageResult.actionsPerformed.length > 0) {
          storageSpinner.succeed(`Storage trigger setup complete (${storageResult.actionsPerformed.length} actions)`);
        } else {
          storageSpinner.succeed('Storage trigger prerequisites already configured');
        }
        // Show warnings if any
        for (const warning of storageResult.warnings) {
          console.log(chalk.yellow(`    ⚠ ${warning}`));
        }
      } else {
        storageSpinner.warn('Some storage trigger setup steps had issues (continuing anyway)');
        for (const error of storageResult.errors) {
          console.log(chalk.yellow(`    - ${error}`));
        }
      }
    } catch (error) {
      storageSpinner.warn('Could not complete storage trigger setup (continuing anyway)');
      console.log(chalk.gray(`    ${error}\n`));
    }
  }

  // Gemini model validation (only on first attempt, not destroy, not preview)
  if (functionsWithTriggers.length > 0 && !options.destroy && !options.preview && retryCount === 0) {
    const geminiModels = extractGeminiModels(functionsWithTriggers);

    if (geminiModels.length > 0) {
      const geminiResult = validateGeminiModels(geminiModels, config.project.region);

      // Display results
      displayGeminiValidationResults(geminiResult);

      // Fail if there are errors (model not available in region)
      if (!geminiResult.valid) {
        console.log(chalk.red('\n  Gemini model validation failed:'));
        for (const error of geminiResult.errors) {
          console.log(chalk.red(`    - ${error}`));
        }
        console.log(chalk.yellow('\n  Fix the model configuration and try again.\n'));

        if (!options.yes) {
          const inquirer = await import('inquirer');
          const { continueAnyway } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'continueAnyway',
              message: 'Continue deployment anyway?',
              default: false,
            },
          ]);

          if (!continueAnyway) {
            console.log(chalk.gray('\n  Cancelled.\n'));
            return;
          }
        }
      }
    }
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
      console.log(progress.next());

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
        const sourceDir = (container.config.sourceDir as string) || `containers/${container.name}`;
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
  const phase = options.destroy ? 'destroy' : options.preview ? 'preview' : 'apply';
  const projectName = config.project.name;

  // Show progress step (only on first attempt)
  if (retryCount === 0) {
    console.log(progress.next());
  }

  if (sessionId) await logPhaseStart(sessionId, phase, { project: projectName });

  // In verbose mode, we don't use a spinner - we show real-time output
  const spinner = options.verbose ? null : ora(`${action} infrastructure...`).start();
  const startTime = Date.now();
  const logs: string[] = [];

  if (options.verbose) {
    console.log(chalk.cyan(`\n  ${action} infrastructure (verbose mode)...\n`));
  }

  // Log terraform start
  if (sessionId) {
    await logTerraformEvent(sessionId, 'apply_start', {
      preview: options.preview,
      destroy: options.destroy,
      resourceCount: resolved.resources.length,
    }, { project: projectName });
  }

  // Handle Kubernetes backend
  if (config.project.backend === 'kubernetes') {
    const k8sConfig = config.project.kubernetes!;

    // Handle --helm flag: generate Helm chart instead of raw manifests
    if (options.helm) {
      if (spinner) spinner.text = 'Loading Helm plugin...';

      // Load plugins including helm
      const plugins = config.project.plugins || [];
      if (!plugins.includes('@stacksolo/plugin-helm')) {
        plugins.push('@stacksolo/plugin-helm');
      }
      await loadPlugins(plugins);

      // Get the helm formatter
      const helmFormatter = getPluginFormatter('helm');
      if (!helmFormatter) {
        if (spinner) spinner.fail('Helm plugin not found');
        console.log(chalk.red('\n  Error: @stacksolo/plugin-helm not installed'));
        console.log(chalk.gray('  Add "@stacksolo/plugin-helm" to your plugins array in stacksolo.config.json\n'));
        if (sessionId) await endSession(sessionId, 1);
        return;
      }

      if (spinner) spinner.text = 'Generating Helm chart...';

      // Generate helm chart
      const helmOutputDir = path.join(process.cwd(), '.stacksolo', 'helm-chart');
      const helmConfig = k8sConfig.helm || {};

      const helmFiles = helmFormatter.generate({
        projectName: config.project.name,
        resources: resolved.resources.map(r => ({
          id: r.id,
          type: r.type,
          name: r.name,
          config: r.config,
          dependsOn: r.dependsOn,
          network: r.network,
        })),
        config: {
          chartVersion: helmConfig.chartVersion || '0.1.0',
          appVersion: options.tag || helmConfig.appVersion || 'latest',
          ...helmConfig.values,
        },
        outputDir: helmOutputDir,
      });

      // Create output directories
      await fs.mkdir(path.join(helmOutputDir, 'templates'), { recursive: true });

      // Write all helm files
      for (const file of helmFiles) {
        const filePath = path.join(helmOutputDir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content);
      }

      if (spinner) spinner.succeed('Helm chart generated');

      console.log(chalk.cyan('\n  Chart:'), config.project.name);
      console.log(chalk.cyan('  Location:'), '.stacksolo/helm-chart/');
      console.log(chalk.cyan('  Files:'), helmFiles.length);

      if (!options.preview) {
        // Deploy with helm
        if (spinner) spinner.text = 'Deploying with Helm...';
        const namespace = k8sConfig.namespace || config.project.name;
        const releaseName = config.project.name;

        try {
          await execAsync(
            `helm upgrade --install ${releaseName} ${helmOutputDir} --namespace ${namespace} --create-namespace`
          );
          console.log(chalk.green('\n  Deployed successfully with Helm!'));
          console.log(chalk.gray(`\n  Release: ${releaseName}`));
          console.log(chalk.gray(`  Namespace: ${namespace}\n`));
        } catch (error) {
          console.log(chalk.red(`\n  Helm deployment failed: ${error}`));
          if (sessionId) await endSession(sessionId, 1);
          return;
        }
      } else {
        console.log(chalk.gray('\n  Preview mode - chart generated but not deployed'));
        console.log(chalk.gray('\n  To deploy manually:'));
        console.log(chalk.cyan(`    helm install ${config.project.name} .stacksolo/helm-chart -n ${k8sConfig.namespace || config.project.name}`));
        console.log(chalk.gray('\n  For different environments:'));
        console.log(chalk.cyan(`    helm install ${config.project.name}-dev .stacksolo/helm-chart -f values-dev.yaml`));
        console.log(chalk.cyan(`    helm install ${config.project.name}-staging .stacksolo/helm-chart -f values-staging.yaml`));
        console.log(chalk.cyan(`    helm install ${config.project.name}-prod .stacksolo/helm-chart -f values-prod.yaml\n`));
      }

      if (sessionId) {
        await logPhaseEnd(sessionId, phase, { project: projectName });
        await endSession(sessionId, 0);
      }

      return;
    }

    // Check kubernetes connection (skip for preview - just generate manifests)
    if (!options.preview) {
      const connCheck = await checkKubernetesConnection(k8sConfig.context, k8sConfig.kubeconfig);
      if (!connCheck.connected) {
        if (spinner) spinner.fail('Cannot connect to Kubernetes cluster');
        console.log(chalk.red(`\n  Error: ${connCheck.error}`));
        console.log(chalk.gray('\n  Make sure kubectl is configured and can access your cluster.\n'));
        if (sessionId) await endSession(sessionId, 1);
        return;
      }
    }

    // Build and push images (unless preview or skip-build)
    if (!options.preview && !options.skipBuild && !options.destroy) {
      if (spinner) spinner.text = 'Building container images...';
      const buildResult = await buildAndPushImages(
        config,
        resolved.resources,
        options.tag || 'latest',
        {
          onLog: (msg) => {
            logs.push(msg);
            if (options.verbose) console.log(chalk.gray(`  ${msg}`));
          },
          onVerbose: (msg) => {
            if (options.verbose) console.log(chalk.gray(`  ${msg}`));
          },
          verbose: options.verbose,
        }
      );

      if (!buildResult.success) {
        if (spinner) spinner.fail('Image build failed');
        console.log(chalk.red(`\n  Error: ${buildResult.error}`));
        if (sessionId) await endSession(sessionId, 1);
        return;
      }

      if (buildResult.images.length > 0) {
        logs.push(`Built ${buildResult.images.length} images`);
      }
    }

    // Deploy to Kubernetes
    if (spinner) spinner.text = `${action} to Kubernetes...`;
    const k8sResult = await deployToKubernetes({
      config,
      resources: resolved.resources,
      imageTag: options.tag || 'latest',
      dryRun: options.preview,
      verbose: options.verbose,
      onLog: (msg) => {
        logs.push(msg);
        if (options.verbose) console.log(chalk.gray(`  ${msg}`));
      },
      onVerbose: (msg) => {
        if (options.verbose) console.log(chalk.gray(`  ${msg}`));
      },
    });

    if (k8sResult.success) {
      const successMsg = options.preview ? 'Preview complete' : 'Deployed to Kubernetes successfully';
      if (spinner) {
        spinner.succeed(successMsg);
      } else {
        console.log(chalk.green(`\n  ✓ ${successMsg}`));
      }

      // Show outputs
      console.log(chalk.cyan('\n  Namespace:'), k8sResult.outputs.namespace);
      if (k8sResult.outputs.ingressUrl) {
        console.log(chalk.cyan('  Ingress URL:'), k8sResult.outputs.ingressUrl);
      }
      console.log(chalk.cyan('  Services:'), Object.keys(k8sResult.outputs.services).length);

      if (sessionId) {
        await logPhaseEnd(sessionId, phase, { project: projectName });
        await endSession(sessionId, 0);
      }

      console.log(chalk.gray(`\n  Manifests written to: .stacksolo/k8s-prod/\n`));
    } else {
      if (spinner) spinner.fail('Kubernetes deployment failed');
      console.log(chalk.red(`\n  Error: ${k8sResult.error}`));
      if (sessionId) await endSession(sessionId, 1);
    }

    return;
  }

  // CDKTF/Terraform deploy (existing logic)
  const result = await deployConfig(config, STATE_DIR, {
    preview: options.preview,
    destroy: options.destroy,
    verbose: options.verbose,
    onLog: (msg) => {
      logs.push(msg);
      // Update spinner with elapsed time (only if not verbose)
      if (spinner) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        spinner.text = `${action} infrastructure... (${elapsed}s)`;
      }
    },
    onVerbose: (msg) => {
      // Show real-time Terraform output in verbose mode
      console.log(chalk.gray(`  ${msg}`));
    },
  });

  if (result.success) {
    const successMsg = `${options.destroy ? 'Destroyed' : options.preview ? 'Preview complete' : 'Deployed'} successfully`;
    if (spinner) {
      spinner.succeed(successMsg);
    } else {
      console.log(chalk.green(`\n  ✓ ${successMsg}`));
    }

    // Log success
    const durationMs = Date.now() - startTime;
    if (sessionId) {
      await logTerraformEvent(sessionId, 'apply_end', {
        exitCode: 0,
        durationMs,
        resourceCount: resolved.resources.length,
      }, { project: projectName });
      await logPhaseEnd(sessionId, phase, { project: projectName });
      await endSession(sessionId, 0);
    }

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
    const failMsg = `${action} failed`;
    if (spinner) {
      spinner.fail(failMsg);
    } else {
      console.log(chalk.red(`\n  ✗ ${failMsg}`));
    }
    console.log(chalk.red(`\n  ${result.error}\n`));

    // Log failure
    const durationMs = Date.now() - startTime;
    if (sessionId) {
      await logTerraformEvent(sessionId, 'apply_end', {
        exitCode: 1,
        durationMs,
        error: result.error?.slice(0, 500), // Truncate long errors
      }, { project: projectName });
      await logPhaseEnd(sessionId, phase, { project: projectName });
    }

    // Log the full error for debugging
    logFullError('deploy', result.error, {
      action,
      projectName: config.project.name,
      gcpProjectId: config.project.gcpProjectId,
      region: config.project.region,
      logs: logs.slice(-50), // Last 50 log lines
    });
    log.info(`Full debug log available at: ${getLogPath()}`);

    // Check for GCP auth errors
    if (result.error?.includes('invalid_grant') || result.error?.includes('reauth related error')) {
      console.log(chalk.yellow('  GCP authentication has expired.\n'));
      const shouldReauth = await promptReauth();
      if (shouldReauth) {
        const success = await runGcloudAuth();
        if (success) {
          console.log(chalk.green('\n  Authentication successful!'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy(options, retryCount + 1, retryContext, sessionId);
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
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, retryContext, sessionId);
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

      // Check if permissions already exist (might just be propagating)
      const permissionsExist = await checkCloudBuildPermissions(config.project.gcpProjectId);

      if (permissionsExist) {
        // Permissions exist but aren't propagated yet - just wait and retry
        console.log(chalk.gray('  Permissions are already configured but still propagating.\n'));
        console.log(chalk.gray('  Waiting 60 seconds for IAM changes to take effect...\n'));
        await sleep(60000);
        if (retryCount < MAX_RETRIES) {
          return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, grantedBuildPermissions: true }, sessionId);
        }
        console.log(chalk.yellow('  Still failing after waiting. Please try again in a minute.\n'));
        return;
      }

      // Check if we already granted permissions in this session (shouldn't happen but safety check)
      if (retryContext.grantedBuildPermissions) {
        console.log(chalk.gray('  Waiting 60 seconds for IAM changes to propagate...\n'));
        await sleep(60000);
        if (retryCount < MAX_RETRIES) {
          return runDeploy({ ...options, skipBuild: true }, retryCount + 1, retryContext, sessionId);
        }
        console.log(chalk.yellow('  Still failing after waiting. Please try again in a minute.\n'));
        return;
      }

      const shouldFix = await promptFixBuildPermissions();
      if (shouldFix) {
        const success = await grantCloudBuildPermissions(config.project.gcpProjectId, config.project.region);
        if (success) {
          console.log(chalk.green('\n  Permissions granted!'));
          console.log(chalk.gray('  Waiting 45 seconds for IAM changes to propagate...\n'));
          await sleep(45000);
          console.log(chalk.cyan('  Continuing deploy...\n'));
          if (retryCount < MAX_RETRIES) {
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, grantedBuildPermissions: true }, sessionId);
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
            return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, grantedGcfArtifactsPermissions: true }, sessionId);
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
      // Parse all conflicting resources from the error
      const conflicts = parseConflictingResources(result.error);

      if (conflicts.length === 0) {
        console.log(chalk.yellow('  Resource conflict detected but could not parse resource names.\n'));
        console.log(chalk.gray('  Check the error above for details.\n'));
      } else {
        console.log(chalk.yellow(`  ${conflicts.length} resource conflict(s) detected.\n`));
        console.log(chalk.gray('  These resources exist in GCP but not in Pulumi state:\n'));
        for (const conflict of conflicts) {
          console.log(chalk.gray(`    - ${conflict.type}: ${conflict.name}`));
        }
        console.log('');

        // Check if we already handled these in this session
        const alreadyHandled = conflicts.every((c: ConflictingResource) => retryContext.deletedResources?.includes(c.name));
        if (alreadyHandled) {
          console.log(chalk.yellow('  Resources were already deleted but GCP is still propagating.\n'));
          console.log(chalk.gray('  Some resources can take 1-2 minutes to fully delete.\n'));
          console.log(chalk.gray('  Please wait a moment and run `stacksolo deploy` again.\n'));
          return;
        }

        const resolution = await promptConflictResolution();
        if (resolution === 'force') {
          // Delete from GCP and remove from state
          console.log(chalk.gray('\n  Deleting conflicting resources in GCP...\n'));

          const deletedResources: string[] = [...(retryContext.deletedResources || [])];
          let allDeleted = true;

          // Delete in reverse dependency order (forwarding rules → proxies → url maps, etc.)
          const sortedConflicts = sortResourcesForDeletion(conflicts);

          for (const conflict of sortedConflicts) {
            const success = await forceDeleteResource(conflict, config.project.gcpProjectId);
            if (success) {
              deletedResources.push(conflict.name);
            } else {
              allDeleted = false;
            }
          }

          // Also remove from state
          const projectName = `${config.project.name}-${config.project.gcpProjectId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          for (const conflict of conflicts) {
            await refreshPulumiState(projectName, conflict.name);
          }

          if (allDeleted || deletedResources.length > 0) {
            console.log(chalk.green(`\n  Deleted ${deletedResources.length} resource(s)!`));

            // Wait longer if we deleted a Cloud Function (they take 60-120 seconds to fully delete)
            const deletedFunction = sortedConflicts.some(c => c.type === 'functions' || c.type.includes('Function'));
            const waitTime = deletedFunction ? 60000 : 15000;
            const waitSeconds = waitTime / 1000;

            console.log(chalk.gray(`  Waiting ${waitSeconds} seconds for deletion to propagate...\n`));
            await sleep(waitTime);
            console.log(chalk.cyan('  Continuing deploy...\n'));
            if (retryCount < MAX_RETRIES) {
              return runDeploy({ ...options, skipBuild: true }, retryCount + 1, { ...retryContext, deletedResources }, sessionId);
            }
          }
        } else {
          console.log(chalk.gray('\n  To fix manually, delete the resources in GCP Console'));
          console.log(chalk.gray('  or run `stacksolo destroy` first, then redeploy.\n'));
        }
      }
    } else if (logs.length > 0) {
      console.log(chalk.gray('  Recent logs:'));
      // Show last 10 log lines
      const recentLogs = logs.slice(-10);
      for (const logLine of recentLogs) {
        console.log(chalk.gray(`    ${logLine}`));
      }
      console.log('');
    }

    // Always show where to find the full debug log
    console.log(chalk.gray(`  Full debug log: ${getLogPath()}\n`));

    // End session with failure if we didn't already (via retry)
    if (sessionId) await endSession(sessionId, 1);
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

/**
 * Check if Cloud Build permissions are already configured
 * Returns true if the key permissions exist (even if still propagating)
 */
async function checkCloudBuildPermissions(gcpProjectId: string): Promise<boolean> {
  try {
    // Get project number
    const { stdout: projectNumber } = await execAsync(
      `gcloud projects describe ${gcpProjectId} --format="value(projectNumber)"`
    );
    const trimmedProjectNumber = projectNumber.trim();

    // Check if Cloud Build SA has storage.objectViewer role
    const { stdout: policy } = await execAsync(
      `gcloud projects get-iam-policy ${gcpProjectId} --format="json" --flatten="bindings[].members" --filter="bindings.members:${trimmedProjectNumber}@cloudbuild.gserviceaccount.com AND bindings.role:roles/storage.objectViewer"`
    );

    // If we get output, the permission exists
    return policy.trim().length > 10;
  } catch {
    return false;
  }
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

async function promptConflictResolution(): Promise<'force' | 'skip'> {
  const inquirer = await import('inquirer');
  const { resolution } = await inquirer.default.prompt([
    {
      type: 'list',
      name: 'resolution',
      message: 'How would you like to resolve this conflict?',
      choices: [
        {
          name: 'Delete and recreate (delete resources in GCP, let Pulumi recreate them)',
          value: 'force',
        },
        {
          name: 'Skip (show manual instructions)',
          value: 'skip',
        },
      ],
      default: 'force',
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

async function forceDeleteResource(resource: ConflictingResource, gcpProjectId: string): Promise<boolean> {
  const spinner = ora(`Deleting ${resource.type}: ${resource.name}...`).start();
  const { type, name, fullPath } = resource;

  try {
    // Handle based on resource type
    switch (type) {
      // Artifact Registry
      case 'repositories':
      case 'artifactregistry/Repository': {
        // Get region from config or default
        const regionMatch = fullPath.match(/locations\/([^/]+)/);
        const region = regionMatch ? regionMatch[1] : 'us-east1';
        spinner.text = `Deleting Artifact Registry ${name}...`;
        await execAsync(
          `gcloud artifacts repositories delete ${name} --location=${region} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Artifact Registry ${name}`);
        return true;
      }

      // Service Accounts
      case 'serviceAccounts':
      case 'serviceaccount/Account': {
        spinner.text = `Deleting Service Account ${name}...`;
        const email = name.includes('@') ? name : `${name}@${gcpProjectId}.iam.gserviceaccount.com`;
        await execAsync(
          `gcloud iam service-accounts delete ${email} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Service Account ${name}`);
        return true;
      }

      // Global Addresses
      case 'addresses':
      case 'globalAddresses':
      case 'compute/GlobalAddress': {
        spinner.text = `Deleting Global Address ${name}...`;
        await execAsync(
          `gcloud compute addresses delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Global Address ${name}`);
        return true;
      }

      // URL Maps
      case 'urlMaps':
      case 'compute/URLMap': {
        spinner.text = `Deleting URL Map ${name}...`;
        // First check if there are dependent proxies
        const dependentProxies = await findDependentResources(name, 'url-map', gcpProjectId);
        if (dependentProxies.length > 0) {
          spinner.warn(`URL Map ${name} has dependencies that must be deleted first`);
          for (const dep of dependentProxies) {
            await forceDeleteResource(dep, gcpProjectId);
          }
          spinner.text = `Deleting URL Map ${name}...`;
        }
        await execAsync(
          `gcloud compute url-maps delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted URL Map ${name}`);
        return true;
      }

      // Target HTTP Proxies
      case 'targetHttpProxies':
      case 'compute/TargetHttpProxy': {
        spinner.text = `Deleting Target HTTP Proxy ${name}...`;
        // First check if there are dependent forwarding rules
        const dependentRules = await findDependentResources(name, 'http-proxy', gcpProjectId);
        if (dependentRules.length > 0) {
          spinner.warn(`Target HTTP Proxy ${name} has dependencies that must be deleted first`);
          for (const dep of dependentRules) {
            await forceDeleteResource(dep, gcpProjectId);
          }
          spinner.text = `Deleting Target HTTP Proxy ${name}...`;
        }
        await execAsync(
          `gcloud compute target-http-proxies delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Target HTTP Proxy ${name}`);
        return true;
      }

      // Target HTTPS Proxies
      case 'targetHttpsProxies':
      case 'compute/TargetHttpsProxy': {
        spinner.text = `Deleting Target HTTPS Proxy ${name}...`;
        const dependentRules = await findDependentResources(name, 'https-proxy', gcpProjectId);
        if (dependentRules.length > 0) {
          for (const dep of dependentRules) {
            await forceDeleteResource(dep, gcpProjectId);
          }
          spinner.text = `Deleting Target HTTPS Proxy ${name}...`;
        }
        await execAsync(
          `gcloud compute target-https-proxies delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Target HTTPS Proxy ${name}`);
        return true;
      }

      // Forwarding Rules
      case 'forwardingRules':
      case 'globalForwardingRules':
      case 'compute/GlobalForwardingRule': {
        spinner.text = `Deleting Forwarding Rule ${name}...`;
        await execAsync(
          `gcloud compute forwarding-rules delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Forwarding Rule ${name}`);
        return true;
      }

      // Backend Services
      case 'backendServices':
      case 'compute/BackendService': {
        spinner.text = `Deleting Backend Service ${name}...`;
        await execAsync(
          `gcloud compute backend-services delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Backend Service ${name}`);
        return true;
      }

      // Backend Buckets (for CDN)
      case 'backendBuckets':
      case 'compute/BackendBucket': {
        spinner.text = `Deleting Backend Bucket ${name}...`;
        await execAsync(
          `gcloud compute backend-buckets delete ${name} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Backend Bucket ${name}`);
        return true;
      }

      // Health Checks
      case 'healthChecks':
      case 'compute/HealthCheck': {
        spinner.text = `Deleting Health Check ${name}...`;
        await execAsync(
          `gcloud compute health-checks delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Health Check ${name}`);
        return true;
      }

      // Network Endpoint Groups
      case 'networkEndpointGroups':
      case 'compute/RegionNetworkEndpointGroup': {
        const regionMatch = fullPath.match(/regions\/([^/]+)/);
        const region = regionMatch ? regionMatch[1] : 'us-east1';
        spinner.text = `Deleting Network Endpoint Group ${name}...`;
        await execAsync(
          `gcloud compute network-endpoint-groups delete ${name} --region=${region} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Network Endpoint Group ${name}`);
        return true;
      }

      // VPC Networks
      case 'networks':
      case 'compute/Network': {
        spinner.text = `Deleting VPC Network ${name}...`;
        await execAsync(
          `gcloud compute networks delete ${name} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted VPC Network ${name}`);
        return true;
      }

      // Cloud Functions
      case 'functions':
      case 'cloudfunctions/Function': {
        const locationMatch = fullPath.match(/locations\/([^/]+)/);
        const location = locationMatch ? locationMatch[1] : 'us-east1';
        spinner.text = `Deleting Cloud Function ${name}...`;
        await execAsync(
          `gcloud functions delete ${name} --region=${location} --project=${gcpProjectId} --gen2 --quiet`
        );
        spinner.succeed(`Deleted Cloud Function ${name}`);
        return true;
      }

      // Cloud Run Services
      case 'services':
      case 'run/Service': {
        const locationMatch = fullPath.match(/locations\/([^/]+)/);
        const location = locationMatch ? locationMatch[1] : 'us-east1';
        spinner.text = `Deleting Cloud Run service ${name}...`;
        await execAsync(
          `gcloud run services delete ${name} --region=${location} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted Cloud Run service ${name}`);
        return true;
      }

      // Pub/Sub Topics
      case 'topics':
      case 'pubsub/Topic': {
        spinner.text = `Deleting Pub/Sub topic ${name}...`;
        await execAsync(`gcloud pubsub topics delete ${name} --project=${gcpProjectId} --quiet`);
        spinner.succeed(`Deleted Pub/Sub topic ${name}`);
        return true;
      }

      // SSL Certificates
      case 'sslCertificates':
      case 'compute/ManagedSslCertificate': {
        spinner.text = `Deleting SSL Certificate ${name}...`;
        // Check if there are dependent HTTPS proxies
        const dependentHttpsProxies = await findDependentResources(name, 'ssl-cert', gcpProjectId);
        if (dependentHttpsProxies.length > 0) {
          spinner.warn(`SSL Certificate ${name} has dependencies that must be deleted first`);
          for (const dep of dependentHttpsProxies) {
            await forceDeleteResource(dep, gcpProjectId);
          }
          spinner.text = `Deleting SSL Certificate ${name}...`;
        }
        await execAsync(
          `gcloud compute ssl-certificates delete ${name} --global --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted SSL Certificate ${name}`);
        return true;
      }

      // Storage Buckets
      case 'buckets':
      case 'storage/Bucket': {
        spinner.text = `Deleting Storage Bucket ${name}...`;
        await execAsync(`gcloud storage rm -r gs://${name} --project=${gcpProjectId}`);
        spinner.succeed(`Deleted Storage Bucket ${name}`);
        return true;
      }

      // VPC Access Connectors
      case 'connectors':
      case 'vpcaccess/Connector': {
        const regionMatch = fullPath.match(/locations\/([^/]+)/);
        const region = regionMatch ? regionMatch[1] : 'us-east1';
        spinner.text = `Deleting VPC Connector ${name}...`;
        await execAsync(
          `gcloud compute networks vpc-access connectors delete ${name} --region=${region} --project=${gcpProjectId} --quiet`
        );
        spinner.succeed(`Deleted VPC Connector ${name}`);
        return true;
      }

      default: {
        // Try to infer from fullPath if type didn't match
        if (fullPath.includes('/functions/')) {
          return forceDeleteResource({ ...resource, type: 'functions' }, gcpProjectId);
        } else if (fullPath.includes('/services/')) {
          return forceDeleteResource({ ...resource, type: 'services' }, gcpProjectId);
        } else if (fullPath.includes('/topics/')) {
          return forceDeleteResource({ ...resource, type: 'topics' }, gcpProjectId);
        } else if (fullPath.includes('/buckets/')) {
          return forceDeleteResource({ ...resource, type: 'buckets' }, gcpProjectId);
        } else if (fullPath.includes('/addresses/')) {
          return forceDeleteResource({ ...resource, type: 'addresses' }, gcpProjectId);
        } else if (fullPath.includes('/urlMaps/')) {
          return forceDeleteResource({ ...resource, type: 'urlMaps' }, gcpProjectId);
        } else if (fullPath.includes('/targetHttpProxies/')) {
          return forceDeleteResource({ ...resource, type: 'targetHttpProxies' }, gcpProjectId);
        } else if (fullPath.includes('/forwardingRules/')) {
          return forceDeleteResource({ ...resource, type: 'forwardingRules' }, gcpProjectId);
        } else if (fullPath.includes('/connectors/') || type.includes('Connector')) {
          return forceDeleteResource({ ...resource, type: 'connectors' }, gcpProjectId);
        }

        spinner.fail(`Unknown resource type: ${type}`);
        console.log(chalk.yellow(`\n  Could not determine how to delete: ${name} (type: ${type})\n`));
        console.log(chalk.gray('  Please delete the resource manually in the GCP Console.\n'));
        return false;
      }
    }
  } catch (error) {
    spinner.fail(`Failed to delete ${name}`);
    const errorStr = String(error);

    // Check if resource is being used by another resource
    if (errorStr.includes('being used by')) {
      const usedByMatch = errorStr.match(/being used by '([^']+)'/);
      if (usedByMatch) {
        const dependency = usedByMatch[1];
        const depParts = dependency.split('/');
        const depName = depParts[depParts.length - 1];
        const depType = depParts[depParts.length - 2];

        console.log(chalk.yellow(`\n  ${name} is being used by ${depName}. Deleting dependency first...\n`));

        const depResource: ConflictingResource = {
          type: depType,
          name: depName,
          fullPath: dependency,
        };

        const depSuccess = await forceDeleteResource(depResource, gcpProjectId);
        if (depSuccess) {
          // Retry deleting the original resource
          return forceDeleteResource(resource, gcpProjectId);
        }
      }
    }

    // Check for permission denied errors
    if (errorStr.includes('Permission') && errorStr.includes('denied')) {
      console.log(chalk.yellow('\n  Permission denied. Your account needs additional IAM roles.\n'));

      const shouldFix = await promptFixIamPermissions();
      if (shouldFix) {
        const success = await grantResourceDeletePermissions(fullPath, gcpProjectId);
        if (success) {
          console.log(chalk.green('\n  Permissions granted! Retrying delete...\n'));
          return forceDeleteResource(resource, gcpProjectId);
        }
      } else {
        console.log(chalk.gray('  Please delete the resource manually in the GCP Console.\n'));
      }
    } else if (!errorStr.includes('being used by')) {
      console.log(chalk.red(`\n  ${error}\n`));
      console.log(chalk.gray('  Please delete the resource manually in the GCP Console.\n'));
    }
    return false;
  }
}

/**
 * Find resources that depend on a given resource
 * Used to handle deletion dependencies (forwarding rules → proxies → url maps)
 */
async function findDependentResources(
  resourceName: string,
  resourceType: 'url-map' | 'http-proxy' | 'https-proxy' | 'ssl-cert',
  gcpProjectId: string
): Promise<ConflictingResource[]> {
  const dependencies: ConflictingResource[] = [];

  try {
    if (resourceType === 'url-map') {
      // Find HTTP proxies using this URL map
      const { stdout: httpProxies } = await execAsync(
        `gcloud compute target-http-proxies list --project=${gcpProjectId} --format="json" 2>/dev/null || echo "[]"`
      );
      const proxies = JSON.parse(httpProxies);
      for (const proxy of proxies) {
        if (proxy.urlMap?.includes(resourceName)) {
          dependencies.push({
            type: 'targetHttpProxies',
            name: proxy.name,
            fullPath: proxy.selfLink || proxy.name,
          });
        }
      }

      // Find HTTPS proxies using this URL map
      const { stdout: httpsProxies } = await execAsync(
        `gcloud compute target-https-proxies list --project=${gcpProjectId} --format="json" 2>/dev/null || echo "[]"`
      );
      const httpsProxyList = JSON.parse(httpsProxies);
      for (const proxy of httpsProxyList) {
        if (proxy.urlMap?.includes(resourceName)) {
          dependencies.push({
            type: 'targetHttpsProxies',
            name: proxy.name,
            fullPath: proxy.selfLink || proxy.name,
          });
        }
      }
    } else if (resourceType === 'http-proxy' || resourceType === 'https-proxy') {
      // Find forwarding rules using this proxy
      const { stdout: rules } = await execAsync(
        `gcloud compute forwarding-rules list --global --project=${gcpProjectId} --format="json" 2>/dev/null || echo "[]"`
      );
      const ruleList = JSON.parse(rules);
      for (const rule of ruleList) {
        if (rule.target?.includes(resourceName)) {
          dependencies.push({
            type: 'forwardingRules',
            name: rule.name,
            fullPath: rule.selfLink || rule.name,
          });
        }
      }
    } else if (resourceType === 'ssl-cert') {
      // Find HTTPS proxies using this SSL certificate
      const { stdout: httpsProxies } = await execAsync(
        `gcloud compute target-https-proxies list --project=${gcpProjectId} --format="json" 2>/dev/null || echo "[]"`
      );
      const proxyList = JSON.parse(httpsProxies);
      for (const proxy of proxyList) {
        // sslCertificates is an array of certificate URLs
        const certs = proxy.sslCertificates || [];
        if (certs.some((cert: string) => cert.includes(resourceName))) {
          dependencies.push({
            type: 'targetHttpsProxies',
            name: proxy.name,
            fullPath: proxy.selfLink || proxy.name,
          });
        }
      }
    }
  } catch {
    // Ignore errors when listing - we'll discover dependencies during deletion
  }

  return dependencies;
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
