/**
 * stacksolo scaffold
 *
 * Generate local development environment from config
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import { parseConfig, validateConfig } from '@stacksolo/blueprint';
import {
  generateScaffold,
  writeScaffoldFiles,
  createLocalStorageDirs,
  updateGitignore,
} from '../scaffold/generators/index.js';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

export const scaffoldCommand = new Command('scaffold')
  .description('Generate local development environment from config')
  .option('--env-only', 'Generate only .env files')
  .option('--docker-only', 'Generate only docker-compose.yml')
  .option('--services-only', 'Generate only service directories')
  .option('-f, --force', 'Overwrite existing files')
  .option('-d, --dry-run', 'Preview what would be generated without writing files')
  .action(async (options) => {
    const configPath = getConfigPath();
    const targetDir = process.cwd();

    // Check for config file
    const spinner = ora('Reading configuration...').start();

    let config;
    try {
      config = parseConfig(configPath);
      spinner.succeed('Configuration loaded');
    } catch (error) {
      spinner.fail(`Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}`);
      console.log(chalk.gray(`\n  ${error}\n`));
      console.log(chalk.yellow('  Run `stacksolo init` to create a configuration file.\n'));
      process.exit(1);
    }

    // Validate config
    const validation = validateConfig(config);
    if (!validation.valid) {
      console.log(chalk.red('\n  Configuration has errors:\n'));
      validation.errors.forEach((err) => {
        console.log(chalk.red(`    - ${err.path}: ${err.message}`));
      });
      console.log(chalk.yellow('\n  Run `stacksolo config validate` for details.\n'));
      process.exit(1);
    }

    // Generate scaffold
    const scaffoldSpinner = ora('Generating scaffold...').start();

    const result = generateScaffold(config, {
      targetDir,
      force: options.force,
      envOnly: options.envOnly,
      dockerOnly: options.dockerOnly,
      servicesOnly: options.servicesOnly,
    });

    scaffoldSpinner.succeed('Scaffold generated');

    // Dry run - just show what would be created
    if (options.dryRun) {
      console.log(chalk.bold('\n  Files that would be created:\n'));

      result.files.forEach((file) => {
        console.log(chalk.white(`    ${file.path}`));
      });

      console.log(chalk.bold('\n  Summary:\n'));
      console.log(chalk.gray(`    Environment variables: ${result.summary.envVars}`));
      console.log(chalk.gray(`    Docker services: ${result.summary.dockerServices}`));
      console.log(chalk.gray(`    Service directories: ${result.summary.serviceDirectories}`));
      console.log('');
      return;
    }

    // Write files
    const writeSpinner = ora('Writing files...').start();

    try {
      const { written, skipped } = await writeScaffoldFiles(
        result.files,
        targetDir,
        options.force
      );

      // Create local storage directories for buckets
      const storageDirs = await createLocalStorageDirs(config, targetDir);

      // Update .gitignore
      await updateGitignore(targetDir);

      writeSpinner.succeed(`Created ${written.length} files`);

      // Show what was created
      console.log(chalk.bold('\n  Created:\n'));

      if (written.length > 0) {
        written.forEach((file) => {
          console.log(chalk.green(`    ✓ ${file}`));
        });
      }

      if (storageDirs.length > 0) {
        console.log(chalk.cyan('\n  Storage directories:\n'));
        storageDirs.forEach((dir) => {
          console.log(chalk.green(`    ✓ ${dir}/`));
        });
      }

      if (skipped.length > 0) {
        console.log(chalk.yellow('\n  Skipped (already exist):\n'));
        skipped.forEach((file) => {
          console.log(chalk.yellow(`    - ${file}`));
        });
        console.log(chalk.gray('\n  Use --force to overwrite existing files'));
      }

      // Show summary
      console.log(chalk.bold('\n  Summary:\n'));
      console.log(chalk.gray(`    Environment variables: ${result.summary.envVars}`));
      console.log(chalk.gray(`    Docker services: ${result.summary.dockerServices}`));
      console.log(chalk.gray(`    Service directories: ${result.summary.serviceDirectories}`));

      // Show next steps
      console.log(chalk.bold('\n  Next steps:\n'));

      if (result.summary.dockerServices > 0) {
        console.log(chalk.white('    1. Start local services:'));
        console.log(chalk.cyan('       docker-compose up -d\n'));
      }

      if (result.summary.serviceDirectories > 0) {
        console.log(chalk.white('    2. Install service dependencies:'));
        console.log(chalk.cyan('       cd services/<name> && npm install\n'));
      }

      console.log(chalk.white('    3. Update .env.local with real secret values\n'));

      if (result.summary.serviceDirectories > 0) {
        console.log(chalk.white('    4. Start developing:'));
        console.log(chalk.cyan('       cd services/<name> && npm run dev\n'));
      }

    } catch (error) {
      writeSpinner.fail('Failed to write files');
      console.log(chalk.red(`\n  Error: ${error}\n`));
      process.exit(1);
    }
  });
