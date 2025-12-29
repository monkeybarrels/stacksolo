/**
 * stacksolo destroy
 *
 * Destroy the infrastructure for the current project.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { api, checkApiConnection } from '../api-client.js';

interface LocalConfig {
  projectId: string;
  patternId: string;
  gcpProject: string;
  region: string;
}

export const destroyCommand = new Command('destroy')
  .description('Destroy infrastructure for the current project')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    const cwd = process.cwd();
    console.log(chalk.bold('\n  StackSolo Destroy\n'));

    // Load local config
    const configPath = path.join(cwd, '.stacksolo', 'config.json');
    let config: LocalConfig;

    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(configData) as LocalConfig;
    } catch {
      console.log(chalk.red('  Not initialized. Run `stacksolo init` first.\n'));
      return;
    }

    // Check API connection
    const apiConnected = await checkApiConnection();
    if (!apiConnected) {
      console.log(chalk.red('  StackSolo API not running.'));
      console.log(chalk.gray('  Start with: stacksolo serve\n'));
      return;
    }

    // Confirm destruction
    if (!options.yes) {
      console.log(chalk.yellow('  Warning: This will destroy all infrastructure resources.'));
      console.log(chalk.yellow('  This action cannot be undone.\n'));

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to destroy?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray('\n  Cancelled.\n'));
        return;
      }
    }

    // Destroy infrastructure
    const destroySpinner = ora('Destroying infrastructure...').start();

    const destroyResult = await api.deployments.destroy(config.projectId);
    if (!destroyResult.success || !destroyResult.data) {
      destroySpinner.fail('Destroy failed to start');
      console.log(chalk.red(`  ${destroyResult.error}\n`));
      return;
    }

    // Poll for completion
    let deployment = destroyResult.data;
    const startTime = Date.now();

    while (deployment.status === 'pending' || deployment.status === 'running') {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      destroySpinner.text = `Destroying infrastructure... (${elapsed}s)`;

      await sleep(3000);
      const statusResult = await api.deployments.status(config.projectId);
      if (statusResult.success && statusResult.data) {
        deployment = statusResult.data;
      }
    }

    if (deployment.status === 'succeeded') {
      destroySpinner.succeed('Infrastructure destroyed');
      console.log(chalk.green('\n  All resources have been deleted.\n'));
    } else {
      destroySpinner.fail('Destroy failed');
      console.log(chalk.red(`\n  ${deployment.error || 'Unknown error'}\n`));

      if (deployment.logs) {
        console.log(chalk.gray('  Logs:'));
        console.log(chalk.gray(`  ${deployment.logs.split('\n').join('\n  ')}\n`));
      }
    }
  });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
