/**
 * stacksolo register
 *
 * Register the current project in the global registry
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { parseConfig } from '@stacksolo/blueprint';
import { getRegistry } from '@stacksolo/registry';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

export const registerCommand = new Command('register')
  .description('Register the current project in the global registry')
  .option('-f, --force', 'Overwrite existing registration')
  .action(async (options) => {
    const configPath = getConfigPath();

    // Load config
    let config;
    try {
      config = parseConfig(configPath);
    } catch (error) {
      console.log(chalk.red(`\n  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
      console.log(chalk.gray(`  ${error}`));
      console.log(chalk.gray(`\n  Run 'stacksolo init' to create a project first.\n`));
      process.exit(1);
    }

    const registry = getRegistry();

    // Check if already registered
    const existingByPath = await registry.findProjectByPath(configPath);
    if (existingByPath) {
      if (options.force) {
        await registry.unregisterProject(existingByPath.id);
        console.log(chalk.yellow(`  Updating registration for "${existingByPath.name}"...`));
      } else {
        console.log(chalk.yellow(`\n  Project already registered as "${existingByPath.name}"`));
        console.log(chalk.gray(`  Use --force to update the registration.\n`));
        return;
      }
    }

    // Check if name is taken by another project
    const existingByName = await registry.findProjectByName(config.project.name);
    if (existingByName && existingByName.configPath !== configPath) {
      console.log(chalk.red(`\n  Error: Project name "${config.project.name}" is already registered`));
      console.log(chalk.gray(`  Registered path: ${existingByName.configPath}`));
      console.log(chalk.gray(`  Choose a different project name in stacksolo.config.json\n`));
      process.exit(1);
    }

    // Register the project
    const project = await registry.registerProject({
      name: config.project.name,
      gcpProjectId: config.project.gcpProjectId,
      region: config.project.region,
      configPath: configPath,
    });

    console.log(chalk.green(`\n  ✓ Project registered: ${project.name}\n`));
    console.log(chalk.gray(`  GCP Project: ${project.gcpProjectId}`));
    console.log(chalk.gray(`  Region:      ${project.region}`));
    console.log(chalk.gray(`  Config:      ${project.configPath}`));
    console.log('');

    console.log(chalk.cyan('  Next steps:'));
    console.log(chalk.gray('    stacksolo list           # View all registered projects'));
    console.log(chalk.gray('    stacksolo deploy         # Deploy the project'));
    console.log('');
  });
