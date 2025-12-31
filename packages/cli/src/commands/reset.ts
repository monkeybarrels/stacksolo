/**
 * stacksolo reset
 *
 * Reset/clear Pulumi state for the current project.
 * Useful when state becomes corrupted or references wrong GCP project.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { parseConfig } from '@stacksolo/blueprint';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';
const STATE_DIR = path.join(homedir(), '.stacksolo', 'pulumi-state');

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

export const resetCommand = new Command('reset')
  .description('Reset Pulumi state for the current project')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--all', 'Reset state for all projects (dangerous)')
  .action(async (options) => {
    console.log(chalk.bold('\n  StackSolo Reset\n'));

    if (options.all) {
      // Reset all state
      if (!options.yes) {
        const inquirer = await import('inquirer');
        const { confirm } = await inquirer.default.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: chalk.red('This will delete ALL Pulumi state for ALL projects. Continue?'),
            default: false,
          },
        ]);

        if (!confirm) {
          console.log(chalk.gray('\n  Cancelled.\n'));
          return;
        }
      }

      const spinner = ora('Deleting all Pulumi state...').start();
      try {
        const stacksDir = path.join(STATE_DIR, '.pulumi', 'stacks');
        await fs.rm(stacksDir, { recursive: true, force: true });
        spinner.succeed('All Pulumi state deleted');
        console.log(chalk.yellow('\n  Warning: You will need to redeploy all projects.\n'));
      } catch (error) {
        spinner.fail('Failed to delete state');
        console.log(chalk.red(`\n  ${error}\n`));
      }
      return;
    }

    // Load config to get project name
    const configPath = getConfigPath();
    let config;

    try {
      config = parseConfig(configPath);
    } catch {
      console.log(chalk.red(`  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
      console.log(chalk.gray(`  Run 'stacksolo init' to create a project first.\n`));
      return;
    }

    // Build the project name (must match deploy.service.ts logic)
    const projectName = `${config.project.name}-${config.project.gcpProjectId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const stateDir = path.join(STATE_DIR, '.pulumi', 'stacks', projectName);

    // Check if state exists
    try {
      await fs.access(stateDir);
    } catch {
      // Also check old-style project name (without GCP project ID)
      const oldProjectName = config.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const oldStateDir = path.join(STATE_DIR, '.pulumi', 'stacks', oldProjectName);

      try {
        await fs.access(oldStateDir);
        console.log(chalk.yellow(`  Found state at old location: ${oldProjectName}`));
        console.log(chalk.gray(`  This may be from before the GCP project ID was included in state path.\n`));

        if (!options.yes) {
          const inquirer = await import('inquirer');
          const { confirm } = await inquirer.default.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete old state for "${oldProjectName}"?`,
              default: true,
            },
          ]);

          if (!confirm) {
            console.log(chalk.gray('\n  Cancelled.\n'));
            return;
          }
        }

        const spinner = ora('Deleting old Pulumi state...').start();
        await fs.rm(oldStateDir, { recursive: true, force: true });
        spinner.succeed(`Deleted state for ${oldProjectName}`);
        console.log(chalk.green('\n  State reset complete. Run `stacksolo deploy` to redeploy.\n'));
        return;
      } catch {
        console.log(chalk.gray(`  No Pulumi state found for this project.\n`));
        console.log(chalk.gray(`  State directory: ${stateDir}\n`));
        return;
      }
    }

    console.log(chalk.cyan('  Project:'), config.project.name);
    console.log(chalk.cyan('  GCP Project:'), config.project.gcpProjectId);
    console.log(chalk.cyan('  State dir:'), stateDir);
    console.log('');

    if (!options.yes) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Delete Pulumi state for this project? (Resources in GCP will NOT be deleted)',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray('\n  Cancelled.\n'));
        return;
      }
    }

    const spinner = ora('Deleting Pulumi state...').start();
    try {
      await fs.rm(stateDir, { recursive: true, force: true });
      spinner.succeed(`Deleted state for ${projectName}`);
      console.log(chalk.green('\n  State reset complete!'));
      console.log(chalk.gray('\n  Note: Resources in GCP were NOT deleted.'));
      console.log(chalk.gray('  Run `stacksolo deploy` to recreate state from your config.'));
      console.log(chalk.gray('  Run `stacksolo destroy` if you want to remove GCP resources.\n'));
    } catch (error) {
      spinner.fail('Failed to delete state');
      console.log(chalk.red(`\n  ${error}\n`));
    }
  });
