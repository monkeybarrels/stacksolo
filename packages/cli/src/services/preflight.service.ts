import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
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
