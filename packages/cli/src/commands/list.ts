/**
 * stacksolo list
 *
 * List all registered projects and their resources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getRegistry, getRegistryDbPath } from '@stacksolo/registry';
import type { RegistryProject, RegistryResource, ProjectStatus, ResourceStatus } from '@stacksolo/registry';

/**
 * Format project status with color
 */
function formatStatus(status: ProjectStatus | ResourceStatus): string {
  switch (status) {
    case 'deployed':
    case 'ready':
      return chalk.green(status);
    case 'deploying':
    case 'creating':
      return chalk.yellow(status);
    case 'failed':
      return chalk.red(status);
    case 'destroyed':
      return chalk.gray(status);
    case 'pending':
    default:
      return chalk.gray(status);
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date | null): string {
  if (!date) return chalk.gray('never');
  return chalk.gray(date.toLocaleDateString());
}

/**
 * List all projects
 */
async function listProjects(options: { json?: boolean }): Promise<void> {
  const registry = getRegistry();
  const projects = await registry.listProjects();

  if (options.json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  if (projects.length === 0) {
    console.log(chalk.gray('\n  No projects registered.\n'));
    console.log(chalk.cyan('  To register a project:'));
    console.log(chalk.gray('    cd /path/to/project'));
    console.log(chalk.gray('    stacksolo register\n'));
    return;
  }

  console.log(chalk.bold('\n  Registered Projects\n'));

  // Table header
  console.log(
    chalk.gray('  ') +
      chalk.gray('NAME'.padEnd(20)) +
      chalk.gray('GCP PROJECT'.padEnd(20)) +
      chalk.gray('STATUS'.padEnd(12)) +
      chalk.gray('DEPLOYED')
  );
  console.log(chalk.gray('  ' + '-'.repeat(60)));

  for (const project of projects) {
    const resources = await registry.findResourcesByProject(project.id);
    const resourceCount = resources.length;

    console.log(
      chalk.white('  ') +
        chalk.white(project.name.padEnd(20)) +
        chalk.gray(project.gcpProjectId.padEnd(20)) +
        formatStatus(project.status).padEnd(21) +
        formatDate(project.lastDeployedAt) +
        (resourceCount > 0 ? chalk.gray(` (${resourceCount} resources)`) : '')
    );
  }

  console.log('');
}

/**
 * List resources for a specific project
 */
async function listProjectResources(
  projectName: string,
  options: { json?: boolean }
): Promise<void> {
  const registry = getRegistry();
  const project = await registry.findProjectByName(projectName);

  if (!project) {
    console.log(chalk.red(`\n  Error: Project "${projectName}" not found.\n`));
    console.log(chalk.gray('  Run `stacksolo list` to see registered projects.\n'));
    process.exit(1);
  }

  const resources = await registry.findResourcesByProject(project.id);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          project,
          resources,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.bold(`\n  Project: ${project.name}\n`));
  console.log(chalk.gray(`  GCP Project: ${project.gcpProjectId}`));
  console.log(chalk.gray(`  Region:      ${project.region}`));
  console.log(chalk.gray(`  Status:      `) + formatStatus(project.status));
  console.log(chalk.gray(`  Config:      ${project.configPath || 'N/A'}`));

  if (resources.length === 0) {
    console.log(chalk.gray('\n  No resources registered.\n'));
    return;
  }

  console.log(chalk.bold('\n  Resources:\n'));

  // Table header
  console.log(
    chalk.gray('  ') +
      chalk.gray('TYPE'.padEnd(12)) +
      chalk.gray('NAME'.padEnd(20)) +
      chalk.gray('RESOURCE TYPE'.padEnd(20)) +
      chalk.gray('STATUS')
  );
  console.log(chalk.gray('  ' + '-'.repeat(60)));

  for (const resource of resources) {
    const network = resource.network ? `${resource.network}/` : '';

    console.log(
      chalk.white('  ') +
        chalk.cyan(resource.type.padEnd(12)) +
        chalk.white((network + resource.name).padEnd(20)) +
        chalk.gray(resource.resourceType.padEnd(20)) +
        formatStatus(resource.status)
    );

    // Show key outputs if available
    if (resource.outputs && Object.keys(resource.outputs).length > 0) {
      const outputKeys = Object.keys(resource.outputs).slice(0, 3);
      outputKeys.forEach((key) => {
        const value = String(resource.outputs![key]);
        const displayValue =
          value.length > 40 ? value.substring(0, 37) + '...' : value;
        console.log(
          chalk.gray('       ') +
            chalk.gray(`${key}: `) +
            chalk.white(displayValue)
        );
      });
    }
  }

  console.log('');
}

export const listCommand = new Command('list')
  .description('List all registered projects and resources')
  .argument('[project]', 'Project name to show details for')
  .option('--json', 'Output as JSON')
  .option('--path', 'Show registry database path')
  .action(async (projectName, options) => {
    if (options.path) {
      console.log(getRegistryDbPath());
      return;
    }

    if (projectName) {
      await listProjectResources(projectName, options);
    } else {
      await listProjects(options);
    }
  });
