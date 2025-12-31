/**
 * stacksolo unregister
 *
 * Remove a project from the global registry
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getRegistry } from '@stacksolo/registry';

export const unregisterCommand = new Command('unregister')
  .description('Remove a project from the global registry')
  .argument('<project>', 'Project name to unregister')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (projectName, options) => {
    const registry = getRegistry();

    // Find the project
    const project = await registry.findProjectByName(projectName);
    if (!project) {
      console.log(chalk.red(`\n  Error: Project "${projectName}" not found.\n`));
      console.log(chalk.gray('  Run `stacksolo list` to see registered projects.\n'));
      process.exit(1);
    }

    // Get resource count for warning
    const resources = await registry.findResourcesByProject(project.id);

    // Confirm unless --yes
    if (!options.yes) {
      console.log(chalk.yellow(`\n  Warning: This will remove "${projectName}" from the registry.`));

      if (resources.length > 0) {
        console.log(chalk.yellow(`  This project has ${resources.length} registered resource(s).`));
      }

      console.log(chalk.gray('\n  Note: This does NOT destroy deployed cloud resources.'));
      console.log(chalk.gray('  To destroy resources, run `stacksolo destroy` first.\n'));

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Continue with unregistration?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log(chalk.gray('\n  Cancelled.\n'));
        return;
      }
    }

    // Unregister
    await registry.unregisterProject(project.id);

    console.log(chalk.green(`\n  ✓ Project "${projectName}" removed from registry.\n`));

    if (project.configPath) {
      console.log(chalk.gray(`  Config file still exists at: ${project.configPath}`));
      console.log(chalk.gray('  Run `stacksolo register` to re-register this project.\n'));
    }
  });
