/**
 * stacksolo status
 *
 * Show the status of the current project's deployment.
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
  createdAt: string;
}

export const statusCommand = new Command('status')
  .description('Show deployment status for the current project')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const cwd = process.cwd();

    if (!options.json) {
      console.log(chalk.bold('\n  StackSolo Status\n'));
    }

    // Load local config
    const configPath = path.join(cwd, '.stacksolo', 'config.json');
    let config: LocalConfig;

    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(configData) as LocalConfig;
    } catch {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Not initialized' }));
      } else {
        console.log(chalk.red('  Not initialized. Run `stacksolo init` first.\n'));
      }
      return;
    }

    // Check API connection
    const apiConnected = await checkApiConnection();
    if (!apiConnected) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'API not connected' }));
      } else {
        console.log(chalk.red('  StackSolo API not running.'));
        console.log(chalk.gray('  Start with: stacksolo serve\n'));
      }
      return;
    }

    // Get project and deployment status
    const spinner = options.json ? null : ora('Fetching status...').start();

    const projectResult = await api.projects.get(config.projectId);
    const deploymentResult = await api.deployments.status(config.projectId);

    if (spinner) spinner.stop();

    if (!projectResult.success || !projectResult.data) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'Project not found' }));
      } else {
        console.log(chalk.red('  Project not found in API.\n'));
      }
      return;
    }

    const project = projectResult.data;
    const deployment = deploymentResult.data;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            project: {
              id: project.id,
              name: project.name,
              pattern: config.patternId,
              gcpProject: config.gcpProject,
              region: config.region,
            },
            deployment: deployment
              ? {
                  status: deployment.status,
                  startedAt: deployment.startedAt,
                  finishedAt: deployment.finishedAt,
                  error: deployment.error,
                }
              : null,
          },
          null,
          2
        )
      );
      return;
    }

    // Display status
    console.log(chalk.gray('  Project'));
    console.log(`    Name:       ${chalk.white(project.name)}`);
    console.log(`    Pattern:    ${chalk.cyan(config.patternId)}`);
    console.log(`    GCP:        ${chalk.white(config.gcpProject)}`);
    console.log(`    Region:     ${chalk.white(config.region)}`);
    console.log(`    Initialized:${chalk.gray(` ${formatDate(config.createdAt)}`)}`);

    console.log('');

    if (deployment) {
      console.log(chalk.gray('  Deployment'));
      console.log(`    Status:     ${formatStatus(deployment.status)}`);
      console.log(`    Started:    ${chalk.gray(formatDate(deployment.startedAt))}`);

      if (deployment.finishedAt) {
        console.log(`    Finished:   ${chalk.gray(formatDate(deployment.finishedAt))}`);
      }

      if (deployment.error) {
        console.log(`    Error:      ${chalk.red(deployment.error)}`);
      }
    } else {
      console.log(chalk.gray('  Deployment'));
      console.log(`    Status:     ${chalk.gray('Not deployed')}`);
    }

    console.log('');
  });

function formatStatus(status: string): string {
  switch (status) {
    case 'pending':
      return chalk.yellow('Pending');
    case 'running':
      return chalk.blue('Running');
    case 'succeeded':
      return chalk.green('Succeeded');
    case 'failed':
      return chalk.red('Failed');
    default:
      return chalk.gray(status);
  }
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}
