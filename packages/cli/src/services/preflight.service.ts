import path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  GcpResource,
  TerraformState,
  findTerraformStatePath,
  parseTerraformState,
  isResourceInState,
} from './terraform-state.service';
import { scanGcpResources, ScanOptions } from './gcp-scanner.service';
import {
  ConflictResult,
  StackSoloConfig,
  importConflicts,
  getImportCommand,
} from './terraform-import.service';

const execAsync = promisify(exec);

export interface PreflightOptions {
  skipPreflight?: boolean;
  autoImport?: boolean;
  autoDelete?: boolean;
}

export interface PreflightResult {
  hasConflicts: boolean;
  conflicts: ConflictResult[];
  gcpResources: GcpResource[];
  terraformStateResources: string[];
  errors: string[];
}

export type ResolutionAction =
  | 'import_all'
  | 'delete_all'
  | 'change_prefix'
  | 'list_details'
  | 'cancel';

export interface ResolutionChoice {
  action: ResolutionAction;
  newPrefix?: string;
}

/**
 * Group conflicts by resource type for display
 */
function groupByType(
  conflicts: ConflictResult[]
): Record<string, ConflictResult[]> {
  const groups: Record<string, ConflictResult[]> = {};
  for (const conflict of conflicts) {
    const type = conflict.resource.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(conflict);
  }
  return groups;
}

/**
 * Get human-readable label for resource type
 */
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cloudfunctions: 'Cloud Functions',
    cloudrun: 'Cloud Run Services',
    storage: 'Storage Buckets',
    vpc_network: 'VPC Networks',
    vpc_connector: 'VPC Connectors',
    artifact_registry: 'Artifact Registries',
    global_address: 'Global Addresses',
    url_map: 'URL Maps',
    backend_service: 'Backend Services',
    backend_bucket: 'Backend Buckets',
    forwarding_rule: 'Forwarding Rules',
    target_http_proxy: 'HTTP Proxies',
    target_https_proxy: 'HTTPS Proxies',
    network_endpoint_group: 'Network Endpoint Groups',
    ssl_certificate: 'SSL Certificates',
  };
  return labels[type] || type;
}

/**
 * Run the complete pre-flight check
 */
export async function runPreflightCheck(
  config: StackSoloConfig,
  cwd: string = process.cwd()
): Promise<PreflightResult> {
  const projectName = config.project.name;
  const gcpProjectId = config.project.gcpProjectId;
  const region = config.project.region;

  // 1. Scan GCP for existing resources
  const scanOptions: ScanOptions = {
    projectId: gcpProjectId,
    region,
    projectName,
  };

  const scanResult = await scanGcpResources(scanOptions);

  // 2. Read Terraform state
  const statePath = findTerraformStatePath(cwd);
  const tfState: TerraformState | null = statePath
    ? parseTerraformState(statePath)
    : null;

  // 3. Compare GCP resources against Terraform state
  const conflicts: ConflictResult[] = [];

  for (const gcpResource of scanResult.resources) {
    const stateCheck = tfState
      ? isResourceInState(gcpResource, tfState)
      : { inState: false };

    if (!stateCheck.inState) {
      conflicts.push({
        resource: gcpResource,
        inTerraformState: false,
        terraformAddress: stateCheck.terraformAddress,
        expectedName: gcpResource.name,
        conflictType: 'exists_not_in_state',
      });
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    gcpResources: scanResult.resources,
    terraformStateResources: tfState?.resources.map((r) => r.address) || [],
    errors: scanResult.errors,
  };
}

/**
 * Display conflict summary
 */
export function displayConflictSummary(conflicts: ConflictResult[]): void {
  console.log(
    chalk.yellow(`\n  Found ${conflicts.length} existing GCP resource(s) not in Terraform state:\n`)
  );

  const byType = groupByType(conflicts);
  for (const [type, items] of Object.entries(byType)) {
    console.log(chalk.white(`    ${getTypeLabel(type)} (${items.length}):`));
    const displayItems = items.slice(0, 3);
    for (const item of displayItems) {
      console.log(chalk.gray(`      - ${item.resource.name}`));
    }
    if (items.length > 3) {
      console.log(chalk.gray(`      ... and ${items.length - 3} more`));
    }
  }
  console.log();
}

/**
 * Prompt user for conflict resolution strategy
 */
export async function promptConflictResolution(
  conflicts: ConflictResult[]
): Promise<ResolutionChoice> {
  displayConflictSummary(conflicts);

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'How would you like to resolve these conflicts?',
      choices: [
        {
          name: 'Import all (add existing resources to Terraform state)',
          value: 'import_all',
        },
        {
          name: 'Delete all (remove from GCP, let Terraform recreate)',
          value: 'delete_all',
        },
        {
          name: 'Change project prefix (deploy with new naming)',
          value: 'change_prefix',
        },
        {
          name: 'List details (show full resource info)',
          value: 'list_details',
        },
        {
          name: 'Cancel',
          value: 'cancel',
        },
      ],
    },
  ]);

  if (action === 'change_prefix') {
    const { newPrefix } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newPrefix',
        message: 'Enter new project prefix (e.g., "my-project-v2"):',
        validate: (input: string) => {
          if (!/^[a-z][a-z0-9-]{0,30}$/.test(input)) {
            return 'Must start with lowercase letter, contain only lowercase letters, numbers, and hyphens';
          }
          return true;
        },
      },
    ]);
    return { action: 'change_prefix', newPrefix };
  }

  return { action };
}

/**
 * Display detailed resource list
 */
export function displayResourceDetails(
  conflicts: ConflictResult[],
  config: StackSoloConfig
): void {
  console.log(chalk.white('\n  Resource Details:\n'));

  for (const conflict of conflicts) {
    console.log(
      chalk.cyan(`  ${getTypeLabel(conflict.resource.type)}: `) +
        chalk.white(conflict.resource.name)
    );
    if (conflict.resource.location) {
      console.log(chalk.gray(`    Location: ${conflict.resource.location}`));
    }
    if (conflict.resource.createdAt) {
      console.log(chalk.gray(`    Created: ${conflict.resource.createdAt}`));
    }
    console.log(chalk.gray(`    Import: ${getImportCommand(conflict.resource, config)}`));
    console.log();
  }
}

/**
 * Execute the chosen resolution strategy
 */
// =============================================================================
// GCP Kernel Preflight Checks
// =============================================================================

export interface KernelPreflightResult {
  success: boolean;
  checks: KernelPreflightCheck[];
  errors: string[];
  warnings: string[];
}

export interface KernelPreflightCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
}

/**
 * Run preflight checks specific to GCP Kernel deployment
 * Validates Docker, gcloud auth, and kernel source availability
 */
export async function runKernelPreflightCheck(
  gcpProjectId: string,
  cwd: string = process.cwd()
): Promise<KernelPreflightResult> {
  const checks: KernelPreflightCheck[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Docker installed and running
  try {
    await execAsync('docker info', { timeout: 10000 });
    checks.push({
      name: 'Docker',
      status: 'pass',
      message: 'Docker is installed and running',
    });
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('Cannot connect') || errorStr.includes('not running')) {
      checks.push({
        name: 'Docker',
        status: 'fail',
        message: 'Docker daemon is not running',
        fix: 'Start Docker Desktop or run: sudo systemctl start docker',
      });
      errors.push('Docker daemon is not running');
    } else if (errorStr.includes('command not found') || errorStr.includes('not recognized')) {
      checks.push({
        name: 'Docker',
        status: 'fail',
        message: 'Docker is not installed',
        fix: 'Install Docker from https://docs.docker.com/get-docker/',
      });
      errors.push('Docker is not installed');
    } else {
      checks.push({
        name: 'Docker',
        status: 'fail',
        message: `Docker check failed: ${errorStr.slice(0, 100)}`,
        fix: 'Ensure Docker is installed and running',
      });
      errors.push('Docker check failed');
    }
  }

  // Check 2: gcloud CLI installed
  try {
    await execAsync('gcloud --version', { timeout: 10000 });
    checks.push({
      name: 'gcloud CLI',
      status: 'pass',
      message: 'gcloud CLI is installed',
    });
  } catch {
    checks.push({
      name: 'gcloud CLI',
      status: 'fail',
      message: 'gcloud CLI is not installed',
      fix: 'Install from https://cloud.google.com/sdk/docs/install',
    });
    errors.push('gcloud CLI is not installed');
  }

  // Check 3: gcloud authenticated
  try {
    const { stdout } = await execAsync('gcloud auth list --filter=status:ACTIVE --format="value(account)"', { timeout: 10000 });
    if (stdout.trim()) {
      checks.push({
        name: 'GCP Authentication',
        status: 'pass',
        message: `Authenticated as ${stdout.trim()}`,
      });
    } else {
      checks.push({
        name: 'GCP Authentication',
        status: 'fail',
        message: 'Not authenticated with gcloud',
        fix: 'Run: gcloud auth login',
      });
      errors.push('Not authenticated with gcloud');
    }
  } catch {
    checks.push({
      name: 'GCP Authentication',
      status: 'warn',
      message: 'Could not verify gcloud authentication',
      fix: 'Run: gcloud auth login',
    });
    warnings.push('Could not verify gcloud authentication');
  }

  // Check 4: Docker auth for GCR configured
  try {
    // Check if gcr.io is in Docker config
    const dockerConfigPath = path.join(process.env.HOME || '~', '.docker', 'config.json');
    const configContent = await fs.readFile(dockerConfigPath, 'utf-8');
    const dockerConfig = JSON.parse(configContent);

    const hasGcr =
      dockerConfig.credHelpers?.['gcr.io'] === 'gcloud' ||
      dockerConfig.auths?.['gcr.io'] ||
      dockerConfig.auths?.['https://gcr.io'];

    if (hasGcr) {
      checks.push({
        name: 'Docker GCR Auth',
        status: 'pass',
        message: 'Docker is configured to authenticate with gcr.io',
      });
    } else {
      checks.push({
        name: 'Docker GCR Auth',
        status: 'warn',
        message: 'Docker may not be configured for gcr.io',
        fix: 'Run: gcloud auth configure-docker gcr.io',
      });
      warnings.push('Docker may not be configured for gcr.io (will be auto-configured during deploy)');
    }
  } catch {
    checks.push({
      name: 'Docker GCR Auth',
      status: 'warn',
      message: 'Could not verify Docker GCR configuration',
      fix: 'Run: gcloud auth configure-docker gcr.io',
    });
    warnings.push('Could not verify Docker GCR configuration (will be auto-configured during deploy)');
  }

  // Check 5: Kernel service source exists
  // Try multiple locations where the kernel service could be
  const possiblePaths = [
    path.resolve(cwd, '../stacksolo/plugins/gcp-kernel/service'),
    path.resolve(cwd, 'node_modules/@stacksolo/plugin-gcp-kernel/service'),
    path.resolve(cwd, 'plugins/gcp-kernel/service'),
  ];

  let kernelSourceFound = false;
  let foundPath = '';

  for (const sourcePath of possiblePaths) {
    try {
      await fs.access(path.join(sourcePath, 'Dockerfile'));
      await fs.access(path.join(sourcePath, 'package.json'));
      kernelSourceFound = true;
      foundPath = sourcePath;
      break;
    } catch {
      // Try next path
    }
  }

  if (kernelSourceFound) {
    checks.push({
      name: 'Kernel Source',
      status: 'pass',
      message: `Found kernel service at ${foundPath}`,
    });
  } else {
    checks.push({
      name: 'Kernel Source',
      status: 'fail',
      message: 'Could not find GCP Kernel service source',
      fix: 'Ensure @stacksolo/plugin-gcp-kernel is installed or kernel source is in plugins/gcp-kernel/service',
    });
    errors.push('Could not find GCP Kernel service source');
  }

  // Check 6: Project has required APIs enabled (best effort)
  if (gcpProjectId) {
    try {
      const { stdout } = await execAsync(
        `gcloud services list --project=${gcpProjectId} --format="value(config.name)" --filter="config.name:(run.googleapis.com OR cloudbuild.googleapis.com OR firestore.googleapis.com)"`,
        { timeout: 30000 }
      );

      const enabledApis = stdout.trim().split('\n').filter(Boolean);
      const requiredApis = ['run.googleapis.com', 'cloudbuild.googleapis.com', 'firestore.googleapis.com'];
      const missingApis = requiredApis.filter(api => !enabledApis.includes(api));

      if (missingApis.length === 0) {
        checks.push({
          name: 'GCP APIs',
          status: 'pass',
          message: 'Required GCP APIs are enabled',
        });
      } else {
        checks.push({
          name: 'GCP APIs',
          status: 'warn',
          message: `Missing APIs: ${missingApis.join(', ')}`,
          fix: `Run: gcloud services enable ${missingApis.join(' ')} --project=${gcpProjectId}`,
        });
        warnings.push(`Some GCP APIs may need to be enabled: ${missingApis.join(', ')}`);
      }
    } catch {
      checks.push({
        name: 'GCP APIs',
        status: 'warn',
        message: 'Could not verify GCP API status',
      });
      warnings.push('Could not verify GCP API status');
    }
  }

  return {
    success: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}

/**
 * Display kernel preflight results
 */
export function displayKernelPreflightResults(result: KernelPreflightResult): void {
  console.log(chalk.cyan('\n  GCP Kernel Preflight Checks:\n'));

  for (const check of result.checks) {
    const icon = check.status === 'pass' ? chalk.green('✓') :
                 check.status === 'warn' ? chalk.yellow('⚠') :
                 chalk.red('✗');

    console.log(`    ${icon} ${chalk.white(check.name)}: ${check.message}`);

    if (check.fix && check.status !== 'pass') {
      console.log(chalk.gray(`      Fix: ${check.fix}`));
    }
  }

  if (result.errors.length > 0) {
    console.log(chalk.red('\n  Errors that must be fixed before deploy:'));
    for (const error of result.errors) {
      console.log(chalk.red(`    - ${error}`));
    }
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow('\n  Warnings (may auto-resolve during deploy):'));
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`    - ${warning}`));
    }
  }

  console.log();
}

export async function executeResolution(
  resolution: ResolutionChoice,
  conflicts: ConflictResult[],
  config: StackSoloConfig,
  cwd: string = process.cwd(),
  deleteResourceFn?: (resource: GcpResource, config: StackSoloConfig) => Promise<boolean>
): Promise<{ success: boolean; message?: string }> {
  switch (resolution.action) {
    case 'import_all': {
      const stackDir = path.join(
        cwd,
        '.stacksolo',
        'cdktf',
        'cdktf.out',
        'stacks',
        'main'
      );

      console.log(chalk.gray('\n  Importing resources into Terraform state...\n'));

      const importResult = await importConflicts(conflicts, config, stackDir);

      if (importResult.success.length > 0) {
        console.log(
          chalk.green(`  ✓ Imported ${importResult.success.length} resource(s)`)
        );
      }

      if (importResult.failed.length > 0) {
        console.log(
          chalk.yellow(
            `  ⚠ Failed to import ${importResult.failed.length} resource(s):`
          )
        );
        for (const fail of importResult.failed) {
          console.log(chalk.gray(`    - ${fail.name}: ${fail.error}`));
        }
      }

      return {
        success: importResult.failed.length === 0,
        message:
          importResult.failed.length > 0
            ? `Failed to import ${importResult.failed.length} resource(s)`
            : undefined,
      };
    }

    case 'delete_all': {
      if (!deleteResourceFn) {
        console.log(
          chalk.yellow(
            '\n  Delete functionality requires integration with deploy command.\n'
          )
        );
        console.log(chalk.gray('  Use --force flag with deploy to delete and recreate.\n'));
        return { success: false, message: 'Delete not available in standalone mode' };
      }

      console.log(chalk.gray('\n  Deleting resources from GCP...\n'));

      let successCount = 0;
      let failCount = 0;

      for (const conflict of conflicts) {
        const deleted = await deleteResourceFn(conflict.resource, config);
        if (deleted) {
          successCount++;
          console.log(chalk.green(`  ✓ Deleted ${conflict.resource.name}`));
        } else {
          failCount++;
          console.log(chalk.red(`  ✗ Failed to delete ${conflict.resource.name}`));
        }
      }

      return {
        success: failCount === 0,
        message: failCount > 0 ? `Failed to delete ${failCount} resource(s)` : undefined,
      };
    }

    case 'change_prefix': {
      console.log(
        chalk.yellow(`\n  To use prefix "${resolution.newPrefix}", update your config:\n`)
      );
      console.log(chalk.white(`    .stacksolo/stacksolo.config.json:`));
      console.log(chalk.cyan(`      "name": "${resolution.newPrefix}"`));
      console.log();
      console.log(
        chalk.gray(
          '  After updating, run deploy again. Existing resources will remain unchanged.\n'
        )
      );
      return { success: false, message: 'Config update required' };
    }

    case 'list_details': {
      displayResourceDetails(conflicts, config);
      return { success: false, message: 'Showing details only' };
    }

    case 'cancel':
    default:
      return { success: false, message: 'Cancelled by user' };
  }
}

// =============================================================================
// Cloud Functions Gen2 Preflight Setup
// =============================================================================

export interface CloudFunctionsPreflightResult {
  success: boolean;
  actionsPerformed: string[];
  errors: string[];
}

/**
 * Ensure all required APIs and IAM permissions are configured for Cloud Functions Gen2.
 * This runs proactively before deploy to avoid permission errors during build.
 */
export async function ensureCloudFunctionsPrerequisites(
  gcpProjectId: string,
  region: string
): Promise<CloudFunctionsPreflightResult> {
  const actionsPerformed: string[] = [];
  const errors: string[] = [];

  // 1. Get project number
  let projectNumber: string;
  try {
    const { stdout } = await execAsync(
      `gcloud projects describe ${gcpProjectId} --format="value(projectNumber)"`
    );
    projectNumber = stdout.trim();
  } catch (error) {
    errors.push(`Failed to get project number: ${error}`);
    return { success: false, actionsPerformed, errors };
  }

  // 2. Enable required APIs
  const requiredApis = [
    'cloudfunctions.googleapis.com',
    'cloudbuild.googleapis.com',
    'run.googleapis.com',
    'artifactregistry.googleapis.com',
    'vpcaccess.googleapis.com',
    'compute.googleapis.com',
  ];

  for (const api of requiredApis) {
    try {
      await execAsync(
        `gcloud services enable ${api} --project=${gcpProjectId} --quiet`,
        { timeout: 60000 }
      );
      actionsPerformed.push(`Enabled API: ${api}`);
    } catch {
      // API might already be enabled, continue
    }
  }

  // 3. Grant required roles to all relevant service accounts
  // Based on: https://github.com/firebase/firebase-tools/issues/8431
  // The DEFAULT COMPUTE service account needs cloudbuild.builds.builder role
  const cloudBuildSa = `${projectNumber}@cloudbuild.gserviceaccount.com`;
  const serverlessRobotSa = `service-${projectNumber}@serverless-robot-prod.iam.gserviceaccount.com`;
  const gcfAdminSa = `service-${projectNumber}@gcf-admin-robot.iam.gserviceaccount.com`;
  const defaultComputeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

  // Roles needed for Cloud Build service account
  const cloudBuildRoles = [
    'roles/storage.objectViewer',
    'roles/logging.logWriter',
    'roles/artifactregistry.writer',
    'roles/artifactregistry.reader',
  ];

  for (const role of cloudBuildRoles) {
    try {
      await execAsync(
        `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
          `--member="serviceAccount:${cloudBuildSa}" ` +
          `--role="${role}" --condition=None --quiet`,
        { timeout: 30000 }
      );
      actionsPerformed.push(`Granted ${role} to Cloud Build SA`);
    } catch {
      // Role might already be granted
    }
  }

  // Roles needed for serverless robot
  const serverlessRoles = [
    'roles/cloudbuild.builds.builder',
    'roles/storage.objectAdmin',
    'roles/artifactregistry.reader',
    'roles/artifactregistry.writer',
  ];

  for (const role of serverlessRoles) {
    try {
      await execAsync(
        `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
          `--member="serviceAccount:${serverlessRobotSa}" ` +
          `--role="${role}" --condition=None --quiet`,
        { timeout: 30000 }
      );
      actionsPerformed.push(`Granted ${role} to Serverless Robot SA`);
    } catch {
      // Role might already be granted
    }
  }

  // CRITICAL: Default compute service account needs cloudbuild.builds.builder
  // This is the key fix from firebase-tools#8431
  const computeRoles = [
    'roles/cloudbuild.builds.builder',
    'roles/artifactregistry.reader',
    'roles/artifactregistry.writer',
  ];

  for (const role of computeRoles) {
    try {
      await execAsync(
        `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
          `--member="serviceAccount:${defaultComputeSa}" ` +
          `--role="${role}" --condition=None --quiet`,
        { timeout: 30000 }
      );
      actionsPerformed.push(`Granted ${role} to Default Compute SA`);
    } catch {
      // Role might already be granted
    }
  }

  // 4. Check if gcf-artifacts repository exists and configure permissions
  try {
    await execAsync(
      `gcloud artifacts repositories describe gcf-artifacts ` +
        `--location=${region} --project=${gcpProjectId}`,
      { timeout: 30000 }
    );

    // Repository exists, grant permissions (both reader and writer for full access)
    const serviceAccounts = [cloudBuildSa, serverlessRobotSa, gcfAdminSa, defaultComputeSa];
    const repoRoles = ['roles/artifactregistry.writer', 'roles/artifactregistry.reader'];

    for (const sa of serviceAccounts) {
      for (const role of repoRoles) {
        try {
          await execAsync(
            `gcloud artifacts repositories add-iam-policy-binding gcf-artifacts ` +
              `--location=${region} --project=${gcpProjectId} ` +
              `--member="serviceAccount:${sa}" ` +
              `--role="${role}" --quiet`,
            { timeout: 30000 }
          );
          actionsPerformed.push(`Granted ${role.split('/')[1]} on gcf-artifacts to ${sa.split('@')[0]}`);
        } catch {
          // Permission might already exist
        }
      }
    }
  } catch {
    // Repository doesn't exist yet - that's fine, GCP will create it on first function deploy
    // But we should create it proactively to avoid permission issues
    try {
      await execAsync(
        `gcloud artifacts repositories create gcf-artifacts ` +
          `--repository-format=docker ` +
          `--location=${region} ` +
          `--project=${gcpProjectId} ` +
          `--description="Cloud Functions artifacts" --quiet`,
        { timeout: 60000 }
      );
      actionsPerformed.push(`Created gcf-artifacts repository`);

      // Now grant permissions on the newly created repo (both reader and writer)
      const serviceAccounts = [cloudBuildSa, serverlessRobotSa, gcfAdminSa, defaultComputeSa];
      const repoRoles = ['roles/artifactregistry.writer', 'roles/artifactregistry.reader'];

      for (const sa of serviceAccounts) {
        for (const role of repoRoles) {
          try {
            await execAsync(
              `gcloud artifacts repositories add-iam-policy-binding gcf-artifacts ` +
                `--location=${region} --project=${gcpProjectId} ` +
                `--member="serviceAccount:${sa}" ` +
                `--role="${role}" --quiet`,
              { timeout: 30000 }
            );
          } catch {
            // Continue
          }
        }
      }
      actionsPerformed.push(`Configured gcf-artifacts permissions`);
    } catch (createError) {
      // Failed to create - might be a timing issue, continue anyway
      errors.push(`Note: gcf-artifacts repo creation deferred: ${createError}`);
    }
  }

  return {
    success: errors.length === 0,
    actionsPerformed,
    errors,
  };
}

// =============================================================================
// Storage Trigger Preflight Setup
// =============================================================================

export interface StorageTriggerPreflightResult {
  success: boolean;
  actionsPerformed: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Ensure all required APIs and IAM permissions are configured for storage-triggered functions.
 * This runs proactively before deploy to avoid permission errors.
 */
export async function ensureStorageTriggerPrerequisites(
  gcpProjectId: string,
  region: string,
  triggerBuckets: string[]
): Promise<StorageTriggerPreflightResult> {
  const actionsPerformed: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (triggerBuckets.length === 0) {
    return { success: true, actionsPerformed, warnings, errors };
  }

  // 1. Get project number
  let projectNumber: string;
  try {
    const { stdout } = await execAsync(
      `gcloud projects describe ${gcpProjectId} --format="value(projectNumber)"`
    );
    projectNumber = stdout.trim();
  } catch (error) {
    errors.push(`Failed to get project number: ${error}`);
    return { success: false, actionsPerformed, warnings, errors };
  }

  // 2. Enable Eventarc API
  try {
    await execAsync(
      `gcloud services enable eventarc.googleapis.com --project=${gcpProjectId} --quiet`,
      { timeout: 60000 }
    );
    actionsPerformed.push('Enabled API: eventarc.googleapis.com');
  } catch {
    // API might already be enabled
  }

  // 3. Service account references
  const gcsSa = `service-${projectNumber}@gs-project-accounts.iam.gserviceaccount.com`;
  const eventarcSa = `service-${projectNumber}@gcp-sa-eventarc.iam.gserviceaccount.com`;
  const computeSa = `${projectNumber}-compute@developer.gserviceaccount.com`;

  // 4. Grant GCS service account pubsub.publisher role
  try {
    await execAsync(
      `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
        `--member="serviceAccount:${gcsSa}" ` +
        `--role="roles/pubsub.publisher" --condition=None --quiet`,
      { timeout: 30000 }
    );
    actionsPerformed.push('Granted pubsub.publisher to GCS service account');
  } catch {
    // Role might already be granted
  }

  // 5. Grant Eventarc service agent eventReceiver role
  try {
    await execAsync(
      `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
        `--member="serviceAccount:${eventarcSa}" ` +
        `--role="roles/eventarc.eventReceiver" --condition=None --quiet`,
      { timeout: 30000 }
    );
    actionsPerformed.push('Granted eventarc.eventReceiver to Eventarc service agent');
  } catch {
    // Role might already be granted
  }

  // 6. Grant compute service account run.invoker (for Eventarc to invoke Cloud Run)
  try {
    await execAsync(
      `gcloud projects add-iam-policy-binding ${gcpProjectId} ` +
        `--member="serviceAccount:${computeSa}" ` +
        `--role="roles/run.invoker" --condition=None --quiet`,
      { timeout: 30000 }
    );
    actionsPerformed.push('Granted run.invoker to compute service account');
  } catch {
    // Role might already be granted
  }

  // 7. Verify trigger buckets exist (warning only)
  for (const bucket of triggerBuckets) {
    try {
      await execAsync(
        `gcloud storage buckets describe gs://${bucket} --project=${gcpProjectId}`,
        { timeout: 15000 }
      );
    } catch {
      warnings.push(`Trigger bucket '${bucket}' does not exist yet (will be created during deploy)`);
    }
  }

  return {
    success: errors.length === 0,
    actionsPerformed,
    warnings,
    errors,
  };
}

// =============================================================================
// Gemini Model Validation
// =============================================================================

export interface GeminiModelInfo {
  name: string;
  displayName: string;
  deprecated: boolean;
  deprecationDate?: string;
  replacement?: string;
  supportedRegions: string[];
}

// Gemini model registry with deprecation and region info
// Based on: https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini
const GEMINI_MODELS: Record<string, GeminiModelInfo> = {
  // Current models (as of Jan 2025)
  'gemini-2.0-flash': {
    name: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    deprecated: false,
    supportedRegions: ['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1', 'asia-southeast1'],
  },
  'gemini-2.0-pro': {
    name: 'gemini-2.0-pro',
    displayName: 'Gemini 2.0 Pro',
    deprecated: false,
    supportedRegions: ['us-central1', 'us-east1', 'europe-west1', 'asia-northeast1'],
  },
  'gemini-2.0-flash-exp': {
    name: 'gemini-2.0-flash-exp',
    displayName: 'Gemini 2.0 Flash (Experimental)',
    deprecated: false,
    supportedRegions: ['us-central1'],
  },

  // Deprecated models
  'gemini-1.5-flash': {
    name: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    deprecated: true,
    deprecationDate: '2025-01-01',
    replacement: 'gemini-2.0-flash',
    supportedRegions: ['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'europe-west4', 'asia-northeast1', 'asia-southeast1'],
  },
  'gemini-1.5-pro': {
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    deprecated: true,
    deprecationDate: '2025-01-01',
    replacement: 'gemini-2.0-pro',
    supportedRegions: ['us-central1', 'us-east1', 'europe-west1', 'asia-northeast1'],
  },
  'gemini-pro': {
    name: 'gemini-pro',
    displayName: 'Gemini Pro (Legacy)',
    deprecated: true,
    deprecationDate: '2024-06-01',
    replacement: 'gemini-2.0-pro',
    supportedRegions: ['us-central1'],
  },
  'gemini-pro-vision': {
    name: 'gemini-pro-vision',
    displayName: 'Gemini Pro Vision (Legacy)',
    deprecated: true,
    deprecationDate: '2024-06-01',
    replacement: 'gemini-2.0-flash',
    supportedRegions: ['us-central1'],
  },
};

export interface GeminiValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  models: Array<{
    model: string;
    region: string;
    status: 'ok' | 'deprecated' | 'unavailable' | 'unknown';
    message: string;
    suggestion?: string;
  }>;
}

/**
 * Validate Gemini model references in function environment variables.
 * Checks for deprecation and region availability.
 */
export function validateGeminiModels(
  envVars: Array<{ functionName: string; model: string }>,
  region: string
): GeminiValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const models: GeminiValidationResult['models'] = [];

  for (const { functionName, model } of envVars) {
    const modelInfo = GEMINI_MODELS[model];

    if (!modelInfo) {
      // Unknown model - might be valid, just warn
      models.push({
        model,
        region,
        status: 'unknown',
        message: `Unknown model '${model}' in function '${functionName}'`,
        suggestion: 'Verify model name at https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini',
      });
      warnings.push(`Function '${functionName}' uses unknown Gemini model '${model}'`);
      continue;
    }

    // Check if model is deprecated
    if (modelInfo.deprecated) {
      models.push({
        model,
        region,
        status: 'deprecated',
        message: `Model '${model}' is deprecated${modelInfo.deprecationDate ? ` (since ${modelInfo.deprecationDate})` : ''}`,
        suggestion: modelInfo.replacement ? `Use '${modelInfo.replacement}' instead` : undefined,
      });
      warnings.push(
        `Function '${functionName}' uses deprecated model '${model}'. ` +
        `${modelInfo.replacement ? `Consider using '${modelInfo.replacement}' instead.` : ''}`
      );
      continue;
    }

    // Check if model is available in the region
    if (!modelInfo.supportedRegions.includes(region)) {
      models.push({
        model,
        region,
        status: 'unavailable',
        message: `Model '${model}' is not available in region '${region}'`,
        suggestion: `Available regions: ${modelInfo.supportedRegions.join(', ')}`,
      });
      errors.push(
        `Function '${functionName}' uses model '${model}' which is not available in region '${region}'. ` +
        `Available regions: ${modelInfo.supportedRegions.join(', ')}`
      );
      continue;
    }

    // Model is valid and available
    models.push({
      model,
      region,
      status: 'ok',
      message: `Model '${model}' is available in region '${region}'`,
    });
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    models,
  };
}

/**
 * Extract Gemini model references from function configs
 */
export function extractGeminiModels(
  functions: Array<{ name: string; env?: Record<string, string> }>
): Array<{ functionName: string; model: string }> {
  const models: Array<{ functionName: string; model: string }> = [];

  for (const fn of functions) {
    if (!fn.env) continue;

    // Common env var names for Gemini models
    const modelEnvVars = ['GEMINI_MODEL', 'MODEL', 'LLM_MODEL', 'AI_MODEL', 'VERTEX_MODEL'];

    for (const envVar of modelEnvVars) {
      if (fn.env[envVar] && fn.env[envVar].toLowerCase().includes('gemini')) {
        models.push({
          functionName: fn.name,
          model: fn.env[envVar],
        });
      }
    }
  }

  return models;
}

/**
 * Display Gemini model validation results
 */
export function displayGeminiValidationResults(result: GeminiValidationResult): void {
  if (result.models.length === 0) {
    return; // No Gemini models to validate
  }

  console.log(chalk.cyan('\n  Gemini Model Validation:\n'));

  for (const model of result.models) {
    const icon = model.status === 'ok' ? chalk.green('✓') :
                 model.status === 'deprecated' ? chalk.yellow('⚠') :
                 model.status === 'unknown' ? chalk.gray('?') :
                 chalk.red('✗');

    console.log(`    ${icon} ${chalk.white(model.model)}: ${model.message}`);

    if (model.suggestion) {
      console.log(chalk.gray(`      → ${model.suggestion}`));
    }
  }

  console.log();
}
