/**
 * stacksolo init
 *
 * Initialize a new StackSolo project by creating stacksolo.config.json
 * Works standalone without requiring the API server.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PROVIDERS, getRegionsForProvider } from '../regions';
import type { StackSoloConfig } from '@stacksolo/blueprint';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

export const initCommand = new Command('init')
  .description('Initialize a new StackSolo project')
  .option('-n, --name <name>', 'Project name')
  .option('-p, --provider <provider>', 'Cloud provider (gcp)')
  .option('--project-id <id>', 'Provider project ID (e.g., GCP project ID)')
  .option('-r, --region <region>', 'Region')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(async (options) => {
    const cwd = process.cwd();
    console.log(chalk.bold('\n  StackSolo Init\n'));

    const stacksoloDir = path.join(cwd, STACKSOLO_DIR);
    const configPath = path.join(stacksoloDir, CONFIG_FILENAME);

    // Check if config already exists
    let existingConfig: StackSoloConfig | null = null;
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      existingConfig = JSON.parse(content) as StackSoloConfig;
    } catch {
      // No existing config
    }

    if (existingConfig) {
      console.log(chalk.yellow(`  ${STACKSOLO_DIR}/${CONFIG_FILENAME} already exists.\n`));

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'View existing config', value: 'view' },
            { name: 'Overwrite with new config', value: 'overwrite' },
            { name: 'Merge (update project settings)', value: 'merge' },
            { name: 'Cancel', value: 'cancel' },
          ],
        },
      ]);

      if (action === 'view') {
        console.log(chalk.gray('\n  Current configuration:\n'));
        console.log(chalk.white(JSON.stringify(existingConfig, null, 2)));
        console.log('');
        return;
      }

      if (action === 'cancel') {
        console.log(chalk.gray('  Cancelled.\n'));
        return;
      }

      // For merge, we'll use existing values as defaults
      if (action === 'merge') {
        options.name = options.name || existingConfig.project?.name;
        options.projectId = options.projectId || existingConfig.project?.gcpProjectId;
        options.region = options.region || existingConfig.project?.region;
      }
    }

    // Get project name
    let projectName = options.name;
    if (!projectName && !options.yes) {
      const defaultName = path.basename(cwd);
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Project name:',
          default: defaultName,
          validate: (input: string) => {
            if (!input) return 'Project name is required';
            if (!/^[a-z][a-z0-9-]*$/.test(input)) {
              return 'Must be lowercase, start with letter, only letters/numbers/hyphens';
            }
            return true;
          },
        },
      ]);
      projectName = answers.name;
    }
    projectName = projectName || path.basename(cwd);

    // Get cloud provider
    let provider = options.provider;
    if (!provider && !options.yes) {
      if (PROVIDERS.length === 1) {
        // Only one provider available, auto-select
        provider = PROVIDERS[0].value;
        console.log(chalk.gray(`  Using provider: ${PROVIDERS[0].name}\n`));
      } else {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'provider',
            message: 'Cloud provider:',
            choices: PROVIDERS.map((p) => ({ name: p.name, value: p.value })),
          },
        ]);
        provider = answers.provider;
      }
    }
    provider = provider || 'gcp';

    // Get provider project ID
    let projectId = options.projectId;
    if (!projectId && !options.yes) {
      const label = provider === 'gcp' ? 'GCP Project ID' : 'Project ID';
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectId',
          message: `${label}:`,
          validate: (input: string) => input.length > 0 || 'Required',
        },
      ]);
      projectId = answers.projectId;
    }

    if (!projectId) {
      console.log(chalk.red('\n  Project ID is required. Use --project-id or run interactively.\n'));
      return;
    }

    // Get region
    let region = options.region;
    if (!region && !options.yes) {
      const regions = getRegionsForProvider(provider);
      if (regions.length > 0) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'region',
            message: 'Region:',
            choices: regions.map((r) => ({ name: r.name, value: r.value })),
            default: 'us-central1',
          },
        ]);
        region = answers.region;
      }
    }
    region = region || 'us-central1';

    // Build config
    const config: StackSoloConfig = {
      project: {
        name: projectName,
        region,
        gcpProjectId: projectId,
      },
    };

    // Merge with existing if merging
    if (existingConfig && options.yes !== true) {
      // Preserve any additional config from existing (buckets, secrets, networks, etc.)
      config.project = {
        ...existingConfig.project,
        name: projectName,
        region,
        gcpProjectId: projectId,
      };
    }

    // Create .stacksolo directory if it doesn't exist
    await fs.mkdir(stacksoloDir, { recursive: true });

    // Write config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

    console.log(chalk.green(`\n  Created ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
    console.log(chalk.gray('  Configuration:'));
    console.log(chalk.white(`    Name:       ${projectName}`));
    console.log(chalk.white(`    Provider:   ${provider}`));
    console.log(chalk.white(`    Project ID: ${projectId}`));
    console.log(chalk.white(`    Region:     ${region}`));
    console.log('');

    console.log(chalk.gray('  Next steps:'));
    console.log(chalk.white(`    1. Edit ${STACKSOLO_DIR}/${CONFIG_FILENAME} to add resources`));
    console.log(chalk.white('    2. stacksolo generate    ') + chalk.gray('# Generate Pulumi code'));
    console.log(chalk.white('    3. stacksolo deploy      ') + chalk.gray('# Deploy to cloud'));
    console.log('');
  });
