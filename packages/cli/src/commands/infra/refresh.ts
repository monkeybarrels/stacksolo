/**
 * stacksolo refresh
 *
 * Reconcile Terraform state with actual GCP resources.
 * Useful when state becomes out of sync with GCP (after failed deploys,
 * manual deletions, or imports from another environment).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { parseConfig } from '@stacksolo/blueprint';
import { scanGcpResources } from '../../services/gcp-scanner.service';
import {
  findTerraformStatePath,
  parseTerraformState,
  isResourceInState,
  GcpResource,
} from '../../services/terraform-state.service';
import {
  importConflicts,
  ConflictResult,
  getImportCommand,
} from '../../services/terraform-import.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

interface RefreshPlan {
  toImport: ConflictResult[];
  toRemove: { address: string; type: string; name: string }[];
}

export const refreshCommand = new Command('refresh')
  .description('Reconcile Terraform state with actual GCP resources')
  .option('--dry-run', 'Preview changes without applying')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    console.log(chalk.bold('\n  StackSolo Refresh\n'));

    // Load config
    const configPath = getConfigPath();
    let config;

    try {
      config = parseConfig(configPath);
    } catch {
      console.log(chalk.red(`  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
      console.log(chalk.gray(`  Run 'stacksolo init' to create a project first.\n`));
      return;
    }

    console.log(chalk.cyan('  Project:'), config.project.name);
    console.log(chalk.cyan('  GCP Project:'), config.project.gcpProjectId);
    console.log(chalk.cyan('  Region:'), config.project.region);
    console.log('');

    // Step 1: Scan GCP for existing resources
    const scanSpinner = ora('Scanning GCP for resources...').start();
    const scanResult = await scanGcpResources({
      projectId: config.project.gcpProjectId,
      region: config.project.region,
      projectName: config.project.name,
    });

    if (scanResult.errors.length > 0) {
      scanSpinner.warn('Scan completed with some errors');
      for (const err of scanResult.errors) {
        console.log(chalk.yellow(`    ! ${err}`));
      }
    } else {
      scanSpinner.succeed(`Found ${scanResult.resources.length} GCP resources matching project pattern`);
    }

    // Step 2: Parse Terraform state
    const stateSpinner = ora('Reading Terraform state...').start();
    const statePath = findTerraformStatePath(process.cwd());

    if (!statePath) {
      stateSpinner.warn('No Terraform state found');
      console.log(chalk.gray('  No state file exists. Run `stacksolo deploy` first.\n'));

      if (scanResult.resources.length > 0) {
        console.log(chalk.yellow('  Found GCP resources that could be imported:'));
        for (const resource of scanResult.resources) {
          console.log(chalk.gray(`    - ${resource.type}: ${resource.name}`));
        }
        console.log('');
        console.log(chalk.gray('  Run `stacksolo deploy` to create state, then `stacksolo refresh` to import.\n'));
      }
      return;
    }

    const state = parseTerraformState(statePath);
    if (!state) {
      stateSpinner.fail('Failed to parse Terraform state');
      console.log(chalk.red(`  Could not read: ${statePath}\n`));
      return;
    }

    stateSpinner.succeed(`Found ${state.resources.length} resources in Terraform state`);

    // Step 3: Find differences
    const diffSpinner = ora('Comparing GCP and Terraform state...').start();

    const plan: RefreshPlan = {
      toImport: [],
      toRemove: [],
    };

    // Resources in GCP but not in state (need import)
    for (const gcpResource of scanResult.resources) {
      const { inState } = isResourceInState(gcpResource, state);
      if (!inState) {
        plan.toImport.push({
          resource: gcpResource,
          inTerraformState: false,
          expectedName: gcpResource.name,
          conflictType: 'exists_not_in_state',
        });
      }
    }

    // Resources in state but not in GCP (orphaned)
    for (const stateResource of state.resources) {
      // Skip data sources and non-managed resources
      if (!stateResource.address.includes('.')) continue;

      const stateName = stateResource.attributes.name as string | undefined;
      if (!stateName) continue;

      // Check if this resource exists in our GCP scan
      const exists = scanResult.resources.some(
        (gcpRes) =>
          gcpRes.name === stateName ||
          gcpRes.name === stateResource.name ||
          gcpRes.name.replace(/[^a-zA-Z0-9]/g, '-') === stateResource.name
      );

      if (!exists) {
        plan.toRemove.push({
          address: stateResource.address,
          type: stateResource.type,
          name: stateName,
        });
      }
    }

    diffSpinner.succeed('Comparison complete');

    // Step 4: Display plan
    console.log('');

    if (plan.toImport.length === 0 && plan.toRemove.length === 0) {
      console.log(chalk.green('  ✓ State is in sync with GCP\n'));
      return;
    }

    console.log(chalk.bold('  Refresh Plan:\n'));

    if (plan.toImport.length > 0) {
      console.log(chalk.cyan('  Resources to import (exist in GCP, not in state):'));
      for (const conflict of plan.toImport) {
        console.log(chalk.green(`    + ${conflict.resource.type}: ${conflict.resource.name}`));
        if (options.dryRun) {
          const cmd = getImportCommand(conflict.resource, config);
          console.log(chalk.gray(`      ${cmd}`));
        }
      }
      console.log('');
    }

    if (plan.toRemove.length > 0) {
      console.log(chalk.yellow('  Resources to remove from state (in state, not in GCP):'));
      for (const resource of plan.toRemove) {
        console.log(chalk.red(`    - ${resource.type}: ${resource.name}`));
        if (options.dryRun) {
          console.log(chalk.gray(`      terraform state rm '${resource.address}'`));
        }
      }
      console.log('');
    }

    if (options.dryRun) {
      console.log(chalk.gray('  Dry run - no changes made.\n'));
      console.log(chalk.gray('  Run without --dry-run to apply changes.\n'));
      return;
    }

    // Step 5: Confirm and execute
    if (!options.yes) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Apply ${plan.toImport.length} imports and ${plan.toRemove.length} removals?`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray('\n  Cancelled.\n'));
        return;
      }
    }

    console.log('');

    // Execute imports
    if (plan.toImport.length > 0) {
      const importSpinner = ora('Importing resources into Terraform state...').start();

      const cdktfDir = path.join(process.cwd(), '.stacksolo', 'cdktf', 'cdktf.out', 'stacks', 'main');

      const importResult = await importConflicts(plan.toImport, config, cdktfDir);

      if (importResult.failed.length > 0) {
        importSpinner.warn(`Imported ${importResult.success.length}/${plan.toImport.length} resources`);
        for (const fail of importResult.failed) {
          console.log(chalk.red(`    ✗ ${fail.name}: ${fail.error}`));
        }
      } else {
        importSpinner.succeed(`Imported ${importResult.success.length} resources`);
      }
    }

    // Execute removals
    if (plan.toRemove.length > 0) {
      const removeSpinner = ora('Removing orphaned resources from state...').start();

      const cdktfDir = path.join(process.cwd(), '.stacksolo', 'cdktf', 'cdktf.out', 'stacks', 'main');
      let removeSuccess = 0;
      let removeFailed = 0;

      for (const resource of plan.toRemove) {
        try {
          await execAsync(`terraform state rm '${resource.address}'`, {
            cwd: cdktfDir,
            timeout: 30000,
          });
          removeSuccess++;
        } catch (error) {
          removeFailed++;
          console.log(chalk.red(`    ✗ ${resource.address}: ${error}`));
        }
      }

      if (removeFailed > 0) {
        removeSpinner.warn(`Removed ${removeSuccess}/${plan.toRemove.length} from state`);
      } else {
        removeSpinner.succeed(`Removed ${removeSuccess} orphaned resources from state`);
      }
    }

    console.log('');
    console.log(chalk.green('  Refresh complete!'));
    console.log(chalk.gray('  Run `stacksolo deploy` to apply any remaining changes.\n'));
  });
