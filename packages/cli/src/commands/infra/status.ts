/**
 * stacksolo status
 *
 * Show the status of the current project's deployment.
 * Uses the global registry at ~/.stacksolo/registry.db
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { getRegistry } from '@stacksolo/registry';
import type { RegistryProject, RegistryResource, ProjectStatus, ResourceStatus } from '@stacksolo/registry';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

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
  return date.toLocaleString();
}

export const statusCommand = new Command('status')
  .description('Show deployment status for the current project')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const configPath = getConfigPath();
    const registry = getRegistry();

    if (!options.json) {
      console.log(chalk.bold('\n  StackSolo Status\n'));
    }

    // Find project by config path
    let project: RegistryProject | null = await registry.findProjectByPath(configPath);

    if (!project) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Project not registered' }));
      } else {
        console.log(chalk.yellow('  Project not registered in global registry.\n'));
        console.log(chalk.gray('  Register with: stacksolo register'));
        console.log(chalk.gray('  Or deploy with: stacksolo deploy\n'));
      }
      return;
    }

    // Get resources
    const resources: RegistryResource[] = await registry.findResourcesByProject(project.id);

    // Get latest deployment
    const latestDeployment = await registry.findLatestDeployment(project.id);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            project: {
              id: project.id,
              name: project.name,
              gcpProjectId: project.gcpProjectId,
              region: project.region,
              status: project.status,
              lastDeployedAt: project.lastDeployedAt,
              createdAt: project.createdAt,
            },
            resources: resources.map((r) => ({
              id: r.id,
              type: r.type,
              name: r.name,
              network: r.network,
              resourceType: r.resourceType,
              status: r.status,
              outputs: r.outputs,
            })),
            deployment: latestDeployment
              ? {
                  id: latestDeployment.id,
                  action: latestDeployment.action,
                  status: latestDeployment.status,
                  startedAt: latestDeployment.startedAt,
                  completedAt: latestDeployment.completedAt,
                  error: latestDeployment.error,
                }
              : null,
          },
          null,
          2
        )
      );
      return;
    }

    // Display project info
    console.log(chalk.gray('  Project'));
    console.log(`    Name:         ${chalk.white(project.name)}`);
    console.log(`    GCP Project:  ${chalk.white(project.gcpProjectId)}`);
    console.log(`    Region:       ${chalk.white(project.region)}`);
    console.log(`    Status:       ${formatStatus(project.status)}`);
    console.log(`    Last Deploy:  ${formatDate(project.lastDeployedAt)}`);
    console.log(`    Config:       ${chalk.gray(project.configPath || 'N/A')}`);

    console.log('');

    // Display resources
    if (resources.length > 0) {
      console.log(chalk.gray('  Resources'));
      console.log(
        chalk.gray('    ') +
          chalk.gray('TYPE'.padEnd(12)) +
          chalk.gray('NAME'.padEnd(25)) +
          chalk.gray('STATUS')
      );
      console.log(chalk.gray('    ' + '-'.repeat(50)));

      for (const resource of resources) {
        const network = resource.network ? `${resource.network}/` : '';
        console.log(
          chalk.white('    ') +
            chalk.cyan(resource.type.padEnd(12)) +
            chalk.white((network + resource.name).padEnd(25)) +
            formatStatus(resource.status)
        );

        // Show URL output if available
        if (resource.outputs?.url) {
          console.log(chalk.gray('          ') + chalk.gray('url: ') + chalk.white(resource.outputs.url));
        }
      }
    } else {
      console.log(chalk.gray('  Resources'));
      console.log(chalk.gray('    No resources deployed yet.'));
    }

    console.log('');

    // Display latest deployment
    if (latestDeployment) {
      console.log(chalk.gray('  Latest Deployment'));
      console.log(`    Action:       ${chalk.cyan(latestDeployment.action)}`);
      console.log(`    Status:       ${formatStatus(latestDeployment.status as ProjectStatus)}`);
      console.log(`    Started:      ${formatDate(latestDeployment.startedAt)}`);
      if (latestDeployment.completedAt) {
        console.log(`    Completed:    ${formatDate(latestDeployment.completedAt)}`);
      }
      if (latestDeployment.error) {
        console.log(`    Error:        ${chalk.red(latestDeployment.error)}`);
      }
    }

    console.log('');
  });
