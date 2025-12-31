/**
 * stacksolo env
 *
 * Generate environment configuration files from deployed resources.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { api, checkApiConnection } from '../../api-client';

interface LocalConfig {
  projectId: string;
  patternId: string;
  gcpProject: string;
  region: string;
}

export const envCommand = new Command('env')
  .description('Generate environment configuration files')
  .option('--stdout', 'Print to stdout instead of writing files')
  .option('--format <format>', 'Output format: dotenv, json, typescript', 'dotenv')
  .action(async (options) => {
    const cwd = process.cwd();
    console.log(chalk.bold('\n  StackSolo Env\n'));

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

    // Check deployment status
    const spinner = ora('Checking deployment...').start();
    const statusResult = await api.deployments.status(config.projectId);

    if (!statusResult.success || !statusResult.data) {
      spinner.fail('Could not get deployment status');
      console.log(chalk.gray('\n  Deploy first with: stacksolo deploy\n'));
      return;
    }

    if (statusResult.data.status !== 'succeeded') {
      spinner.fail('No successful deployment');
      console.log(chalk.gray(`\n  Current status: ${statusResult.data.status}`));
      console.log(chalk.gray('  Deploy first with: stacksolo deploy\n'));
      return;
    }

    spinner.text = 'Generating configuration...';

    // Generate config via API
    const configResult = await api.deployments.generateConfig(config.projectId);

    if (!configResult.success || !configResult.data) {
      spinner.fail('Failed to generate config');
      console.log(chalk.red(`  ${configResult.error}\n`));
      return;
    }

    spinner.succeed('Configuration generated');

    // Read generated files
    const envPath = configResult.data.envPath;
    const tsConfigPath = configResult.data.configPath;

    if (options.stdout) {
      // Print to stdout
      try {
        console.log(chalk.gray('\n  .env.local:'));
        const envContent = await fs.readFile(envPath, 'utf-8');
        console.log(envContent);

        console.log(chalk.gray('\n  stacksolo.config.ts:'));
        const tsContent = await fs.readFile(tsConfigPath, 'utf-8');
        console.log(tsContent);
      } catch (error) {
        console.log(chalk.red(`  Error reading files: ${error}\n`));
      }
    } else {
      console.log(chalk.green('\n  Files generated:'));
      console.log(chalk.gray(`    ${envPath}`));
      console.log(chalk.gray(`    ${tsConfigPath}`));
      console.log('');

      // Show usage hint
      console.log(chalk.gray('  Add to .gitignore:'));
      console.log(chalk.gray('    .env.local'));
      console.log('');

      console.log(chalk.gray('  Usage in your app:'));
      console.log(chalk.gray("    import { config } from './stacksolo.config';"));
      console.log(chalk.gray('    const dbUrl = config.database?.url;\n'));
    }
  });
