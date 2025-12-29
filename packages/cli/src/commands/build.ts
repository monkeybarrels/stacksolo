/**
 * stacksolo build
 *
 * Build Docker images and push to Artifact Registry.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { parseConfig, resolveConfig } from '@stacksolo/blueprint';

const execAsync = promisify(exec);

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

interface ContainerInfo {
  name: string;
  network: string;
  sourceDir?: string;
  registryUrl: string;
}

export const buildCommand = new Command('build')
  .description('Build and push container images to Artifact Registry')
  .argument('[service]', 'Service name to build (builds all if omitted)')
  .option('--tag <tag>', 'Image tag', 'latest')
  .option('--no-push', 'Skip pushing to registry')
  .option('--dockerfile <path>', 'Custom Dockerfile path')
  .action(async (service: string | undefined, options) => {
    console.log(chalk.bold('\n  StackSolo Build\n'));

    // Load config
    const configPath = getConfigPath();
    let config;

    try {
      config = parseConfig(configPath);
    } catch (error) {
      console.log(chalk.red(`  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
      console.log(chalk.gray(`  ${error}`));
      console.log(chalk.gray(`\n  Run 'stacksolo init' to create a project first.\n`));
      return;
    }

    // Check if Docker is available
    try {
      await execAsync('docker --version');
    } catch {
      console.log(chalk.red('  Docker CLI not found.\n'));
      console.log(chalk.gray('  Install Docker Desktop: https://www.docker.com/products/docker-desktop\n'));
      return;
    }

    // Resolve config to find containers
    const resolved = resolveConfig(config);
    const containers: ContainerInfo[] = [];

    // Find all containers and their registries
    for (const resource of resolved.resources) {
      if (resource.type === 'gcp:cloud_run') {
        const networkName = resource.network || 'default';
        const registryUrl = `${config.project.region}-docker.pkg.dev/${config.project.gcpProjectId}/${networkName}-registry`;

        containers.push({
          name: resource.name,
          network: networkName,
          sourceDir: resource.config.sourceDir as string | undefined,
          registryUrl,
        });
      }
    }

    if (containers.length === 0) {
      console.log(chalk.yellow('  No containers found in config.\n'));
      console.log(chalk.gray('  Add containers to your networks to use this command.\n'));
      return;
    }

    // Filter to specific service if provided
    const targetContainers = service
      ? containers.filter((c) => c.name === service)
      : containers;

    if (service && targetContainers.length === 0) {
      console.log(chalk.red(`  Container '${service}' not found.\n`));
      console.log(chalk.gray('  Available containers:'));
      for (const c of containers) {
        console.log(chalk.gray(`    - ${c.name} (${c.network})`));
      }
      console.log('');
      return;
    }

    // Configure Docker for Artifact Registry (once)
    if (options.push) {
      const authSpinner = ora('Configuring Docker authentication...').start();
      try {
        await execAsync(
          `gcloud auth configure-docker ${config.project.region}-docker.pkg.dev --quiet`
        );
        authSpinner.succeed('Docker authentication configured');
      } catch (error) {
        authSpinner.fail('Failed to configure Docker authentication');
        console.log(chalk.red(`\n  ${error}\n`));
        console.log(chalk.gray('  Make sure you are logged in to gcloud:'));
        console.log(chalk.cyan('  gcloud auth login\n'));
        return;
      }
    }

    // Build each container
    for (const container of targetContainers) {
      const imageTag = `${container.registryUrl}/${container.name}:${options.tag}`;
      const sourceDir = container.sourceDir
        ? path.resolve(process.cwd(), container.sourceDir)
        : process.cwd();

      // Find Dockerfile
      const dockerfilePath = options.dockerfile
        ? path.resolve(process.cwd(), options.dockerfile)
        : path.join(sourceDir, 'Dockerfile');

      try {
        await fs.access(dockerfilePath);
      } catch {
        console.log(chalk.yellow(`  Dockerfile not found for '${container.name}': ${dockerfilePath}`));
        console.log(chalk.gray(`  Skipping...\n`));
        continue;
      }

      // Build
      const buildSpinner = ora(`Building ${container.name}...`).start();
      try {
        const buildCmd = `docker build -f "${dockerfilePath}" -t "${imageTag}" "${sourceDir}"`;
        await execAsync(buildCmd, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer for build output
        buildSpinner.succeed(`Built ${container.name}`);
      } catch (error) {
        buildSpinner.fail(`Failed to build ${container.name}`);
        console.log(chalk.red(`\n  ${error}\n`));
        continue;
      }

      // Push
      if (options.push) {
        const pushSpinner = ora(`Pushing ${container.name}...`).start();
        try {
          await execAsync(`docker push "${imageTag}"`);
          pushSpinner.succeed(`Pushed ${container.name}`);
          console.log(chalk.gray(`    ${imageTag}\n`));
        } catch (error) {
          pushSpinner.fail(`Failed to push ${container.name}`);
          console.log(chalk.red(`\n  ${error}\n`));

          // Check for common errors
          const errorStr = String(error);
          if (errorStr.includes('denied') || errorStr.includes('unauthorized')) {
            console.log(chalk.yellow('  Authentication issue. Try:\n'));
            console.log(chalk.cyan(`  gcloud auth configure-docker ${config.project.region}-docker.pkg.dev\n`));
          } else if (errorStr.includes('not found')) {
            console.log(chalk.yellow('  Registry not found. Deploy infrastructure first:\n'));
            console.log(chalk.cyan('  stacksolo deploy\n'));
          }
          continue;
        }
      } else {
        console.log(chalk.gray(`    Built locally: ${imageTag}\n`));
      }
    }

    console.log(chalk.green('  Build complete!\n'));

    if (options.push) {
      console.log(chalk.gray('  Next steps:'));
      console.log(chalk.gray('    stacksolo deploy    - Update Cloud Run with new images\n'));
    } else {
      console.log(chalk.gray('  To push images, run without --no-push:\n'));
      console.log(chalk.cyan('    stacksolo build\n'));
    }
  });
