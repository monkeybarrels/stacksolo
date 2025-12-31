/**
 * stacksolo install
 *
 * Install dependencies for all resources in the project
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { parseConfig } from '@stacksolo/blueprint';

const execAsync = promisify(exec);

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

export const installCommand = new Command('install')
  .description('Install dependencies for all resources')
  .option('-p, --parallel', 'Install dependencies in parallel')
  .action(async (options) => {
    const cwd = process.cwd();

    console.log(chalk.cyan('\n  StackSolo Install\n'));

    // Load config
    const configPath = path.join(cwd, STACKSOLO_DIR, CONFIG_FILENAME);
    let config;
    try {
      config = parseConfig(configPath);
    } catch {
      console.log(chalk.red('  No config found. Run `stacksolo init` first.\n'));
      return;
    }

    // Collect all resource directories
    const directories: { name: string; path: string; type: string }[] = [];

    for (const network of config.project.networks || []) {
      // Functions
      for (const fn of network.functions || []) {
        const sourceDir = fn.sourceDir?.replace(/^\.\//, '') || `functions/${fn.name}`;
        directories.push({
          name: fn.name,
          path: path.join(cwd, sourceDir),
          type: 'function',
        });
      }

      // Containers
      for (const container of network.containers || []) {
        const sourceDir = (container as { sourceDir?: string }).sourceDir?.replace(/^\.\//, '') || `containers/${container.name}`;
        directories.push({
          name: container.name,
          path: path.join(cwd, sourceDir),
          type: 'container',
        });
      }

      // UIs
      for (const ui of network.uis || []) {
        const sourceDir = ui.sourceDir?.replace(/^\.\//, '') || `apps/${ui.name}`;
        directories.push({
          name: ui.name,
          path: path.join(cwd, sourceDir),
          type: 'ui',
        });
      }
    }

    if (directories.length === 0) {
      console.log(chalk.yellow('  No resources found in config.\n'));
      return;
    }

    console.log(chalk.gray(`  Found ${directories.length} resource(s) to install:\n`));

    // Filter to only directories with package.json
    const validDirs: typeof directories = [];
    for (const dir of directories) {
      try {
        await fs.access(path.join(dir.path, 'package.json'));
        validDirs.push(dir);
        console.log(chalk.gray(`    - ${dir.name} (${dir.type})`));
      } catch {
        // No package.json, skip
      }
    }

    if (validDirs.length === 0) {
      console.log(chalk.yellow('  No resources with package.json found.\n'));
      return;
    }

    console.log('');

    // Install dependencies
    const installDir = async (dir: typeof directories[0]) => {
      const spinner = ora(`Installing ${dir.name}...`).start();
      try {
        await execAsync('npm install', { cwd: dir.path, timeout: 120000 });
        spinner.succeed(`Installed ${dir.name}`);
        return { success: true, name: dir.name };
      } catch (error) {
        spinner.fail(`Failed to install ${dir.name}`);
        return { success: false, name: dir.name, error };
      }
    };

    let results: { success: boolean; name: string; error?: unknown }[];

    if (options.parallel) {
      // Install in parallel
      results = await Promise.all(validDirs.map(installDir));
    } else {
      // Install sequentially
      results = [];
      for (const dir of validDirs) {
        results.push(await installDir(dir));
      }
    }

    // Summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log('');
    if (failed === 0) {
      console.log(chalk.green(`  ✓ Installed dependencies for ${succeeded} resource(s)\n`));
    } else {
      console.log(chalk.yellow(`  Installed ${succeeded}, failed ${failed}\n`));
    }
  });
