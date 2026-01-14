/**
 * stacksolo add
 *
 * Add template resources to an existing StackSolo project.
 * Merges template config and copies source files without re-initializing the project.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { StackSoloConfig, NetworkConfig, FunctionConfig } from '@stacksolo/blueprint';
import {
  listTemplates,
  getTemplateMetadata,
  getTemplateConfig,
  type TemplateInfo,
  type TemplateVariables,
} from '../../services/template.service';
import {
  downloadDirectory,
  substituteVariables,
  substituteVariablesInDirectory,
  parseRepo,
} from '../../services/github.service';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';
const REPO = parseRepo('monkeybarrels/stacksolo-architectures', 'main');

interface MergeResult {
  config: StackSoloConfig;
  addedResources: string[];
  conflicts: string[];
}

interface AddedFile {
  type: 'function' | 'container' | 'ui';
  name: string;
  path: string;
}

/**
 * Find and parse existing config
 */
async function loadExistingConfig(cwd: string): Promise<{ config: StackSoloConfig; configPath: string } | null> {
  const configPath = path.join(cwd, STACKSOLO_DIR, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as StackSoloConfig;
    return { config, configPath };
  } catch {
    return null;
  }
}

/**
 * Merge template config into existing config
 */
function mergeTemplateIntoConfig(
  existingConfig: StackSoloConfig,
  templateConfig: StackSoloConfig,
  namePrefix?: string
): MergeResult {
  // Deep clone existing config
  const result: StackSoloConfig = JSON.parse(JSON.stringify(existingConfig));
  const addedResources: string[] = [];
  const conflicts: string[] = [];

  // Ensure networks array exists
  if (!result.project.networks) {
    result.project.networks = [];
  }

  // Get target network (first one, or create 'main')
  let targetNetwork: NetworkConfig;
  if (result.project.networks.length === 0) {
    targetNetwork = { name: 'main' };
    result.project.networks.push(targetNetwork);
  } else {
    targetNetwork = result.project.networks[0];
  }

  const templateNetwork = templateConfig.project?.networks?.[0];
  if (!templateNetwork) {
    return { config: result, addedResources, conflicts };
  }

  // Merge storage buckets
  if (templateNetwork.storageBuckets) {
    if (!targetNetwork.storageBuckets) {
      targetNetwork.storageBuckets = [];
    }

    for (const bucket of templateNetwork.storageBuckets) {
      const bucketName = applyPrefix(bucket.name, namePrefix);
      const existingBucket = targetNetwork.storageBuckets.find((b) => b.name === bucketName);

      if (existingBucket) {
        conflicts.push(`Bucket "${bucketName}" already exists`);
      } else {
        targetNetwork.storageBuckets.push({ ...bucket, name: bucketName });
        addedResources.push(`storage-bucket: ${bucketName}`);
      }
    }
  }

  // Merge functions
  if (templateNetwork.functions) {
    if (!targetNetwork.functions) {
      targetNetwork.functions = [];
    }

    for (const fn of templateNetwork.functions) {
      const fnName = applyPrefix(fn.name, namePrefix);
      const existingFn = targetNetwork.functions.find((f) => f.name === fnName);

      if (existingFn) {
        conflicts.push(`Function "${fnName}" already exists`);
      } else {
        // Clone and update the function config
        const updatedFn: FunctionConfig = JSON.parse(JSON.stringify(fn));
        updatedFn.name = fnName;

        // Update trigger bucket reference if exists
        if (updatedFn.trigger?.bucket && namePrefix) {
          updatedFn.trigger.bucket = applyPrefix(updatedFn.trigger.bucket, namePrefix);
        }

        // Update env bucket references
        if (updatedFn.env) {
          for (const [key, value] of Object.entries(updatedFn.env)) {
            if (typeof value === 'string' && namePrefix) {
              // Check if it looks like a bucket name from template
              if (key.toLowerCase().includes('bucket')) {
                updatedFn.env[key] = applyPrefix(value, namePrefix);
              }
            }
          }
        }

        // Update sourceDir if needed
        if (updatedFn.sourceDir && namePrefix) {
          updatedFn.sourceDir = updatedFn.sourceDir.replace(fn.name, fnName);
        }

        targetNetwork.functions.push(updatedFn);

        // Determine trigger type for display
        let triggerInfo = 'HTTP';
        if (updatedFn.trigger?.type === 'storage') {
          triggerInfo = `GCS trigger: ${updatedFn.trigger.bucket}`;
        } else if (updatedFn.trigger?.type === 'pubsub') {
          triggerInfo = `Pub/Sub: ${updatedFn.trigger.topic}`;
        }
        addedResources.push(`function: ${fnName} (${triggerInfo})`);
      }
    }
  }

  // Merge containers
  if (templateNetwork.containers) {
    if (!targetNetwork.containers) {
      targetNetwork.containers = [];
    }

    for (const container of templateNetwork.containers) {
      const containerName = applyPrefix(container.name, namePrefix);
      const existingContainer = targetNetwork.containers.find((c) => c.name === containerName);

      if (existingContainer) {
        conflicts.push(`Container "${containerName}" already exists`);
      } else {
        const updatedContainer = { ...container, name: containerName };
        if (updatedContainer.sourceDir && namePrefix) {
          updatedContainer.sourceDir = updatedContainer.sourceDir.replace(container.name, containerName);
        }
        targetNetwork.containers.push(updatedContainer);
        addedResources.push(`container: ${containerName}`);
      }
    }
  }

  // Merge UIs
  if (templateNetwork.uis) {
    if (!targetNetwork.uis) {
      targetNetwork.uis = [];
    }

    for (const ui of templateNetwork.uis) {
      const uiName = applyPrefix(ui.name, namePrefix);
      const existingUi = targetNetwork.uis.find((u) => u.name === uiName);

      if (existingUi) {
        conflicts.push(`UI "${uiName}" already exists`);
      } else {
        const updatedUi = { ...ui, name: uiName };
        if (updatedUi.sourceDir && namePrefix) {
          updatedUi.sourceDir = updatedUi.sourceDir.replace(ui.name, uiName);
        }
        targetNetwork.uis.push(updatedUi);
        addedResources.push(`ui: ${uiName}`);
      }
    }
  }

  return { config: result, addedResources, conflicts };
}

/**
 * Apply name prefix if provided
 */
function applyPrefix(name: string, prefix?: string): string {
  if (!prefix) return name;
  return `${prefix}-${name}`;
}

/**
 * Copy template source files to project
 */
async function copyTemplateFiles(
  templateId: string,
  targetDir: string,
  variables: Record<string, string>,
  namePrefix?: string,
  onProgress?: (message: string) => void
): Promise<AddedFile[]> {
  const log = onProgress || (() => {});
  const addedFiles: AddedFile[] = [];

  // Get template info
  const templates = await listTemplates();
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  // Download to temp directory
  const tempDir = path.join(targetDir, '.stacksolo-temp-' + Date.now());

  try {
    log('Downloading template files...');
    await downloadDirectory(`${template.path}/files`, tempDir, REPO, {
      onProgress: log,
    });

    // Apply variable substitutions
    log('Applying variable substitutions...');
    await substituteVariablesInDirectory(tempDir, variables);

    // Copy functions
    const functionsDir = path.join(tempDir, 'functions');
    if (existsSync(functionsDir)) {
      const fnDirs = await fs.readdir(functionsDir, { withFileTypes: true });

      for (const fnDir of fnDirs) {
        if (fnDir.isDirectory()) {
          const sourceName = fnDir.name;
          const targetName = applyPrefix(sourceName, namePrefix);
          const sourcePath = path.join(functionsDir, sourceName);
          const targetPath = path.join(targetDir, 'functions', targetName);

          // Check if already exists
          if (existsSync(targetPath)) {
            log(`Skipping functions/${targetName}/ (already exists)`);
            continue;
          }

          log(`Copying functions/${targetName}/...`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await copyDirectoryRecursive(sourcePath, targetPath);

          addedFiles.push({
            type: 'function',
            name: targetName,
            path: `functions/${targetName}/`,
          });
        }
      }
    }

    // Copy containers
    const containersDir = path.join(tempDir, 'containers');
    if (existsSync(containersDir)) {
      const containerDirs = await fs.readdir(containersDir, { withFileTypes: true });

      for (const containerDir of containerDirs) {
        if (containerDir.isDirectory()) {
          const sourceName = containerDir.name;
          const targetName = applyPrefix(sourceName, namePrefix);
          const sourcePath = path.join(containersDir, sourceName);
          const targetPath = path.join(targetDir, 'containers', targetName);

          if (existsSync(targetPath)) {
            log(`Skipping containers/${targetName}/ (already exists)`);
            continue;
          }

          log(`Copying containers/${targetName}/...`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await copyDirectoryRecursive(sourcePath, targetPath);

          addedFiles.push({
            type: 'container',
            name: targetName,
            path: `containers/${targetName}/`,
          });
        }
      }
    }

    // Copy apps/uis
    const appsDir = path.join(tempDir, 'apps');
    if (existsSync(appsDir)) {
      const appDirs = await fs.readdir(appsDir, { withFileTypes: true });

      for (const appDir of appDirs) {
        if (appDir.isDirectory()) {
          const sourceName = appDir.name;
          const targetName = applyPrefix(sourceName, namePrefix);
          const sourcePath = path.join(appsDir, sourceName);
          const targetPath = path.join(targetDir, 'apps', targetName);

          if (existsSync(targetPath)) {
            log(`Skipping apps/${targetName}/ (already exists)`);
            continue;
          }

          log(`Copying apps/${targetName}/...`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await copyDirectoryRecursive(sourcePath, targetPath);

          addedFiles.push({
            type: 'ui',
            name: targetName,
            path: `apps/${targetName}/`,
          });
        }
      }
    }
  } finally {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  return addedFiles;
}

/**
 * Recursively copy a directory
 */
async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Display available templates
 */
async function displayTemplates(templates: TemplateInfo[]): Promise<void> {
  console.log(chalk.cyan('\nAvailable templates:\n'));

  for (const template of templates) {
    const difficultyColor =
      template.difficulty === 'beginner'
        ? chalk.green
        : template.difficulty === 'intermediate'
          ? chalk.yellow
          : chalk.red;

    console.log(`  ${chalk.white(template.id)}`);
    console.log(`    ${chalk.gray(template.description)}`);
    console.log(`    ${difficultyColor(template.difficulty)} | ${chalk.gray(template.tags.join(', '))}`);
    console.log();
  }
}

export const addCommand = new Command('add')
  .description('Add template resources to an existing project')
  .argument('[template]', 'Template ID to add (e.g., pdf-extractor)')
  .option('--name <prefix>', 'Prefix for added resource names (avoids conflicts)')
  .option('--dry-run', 'Preview changes without applying')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--list', 'List available templates')
  .action(async (templateId: string | undefined, options) => {
    const cwd = process.cwd();
    const spinner = ora();

    try {
      // List templates if requested or no template specified
      if (options.list || !templateId) {
        spinner.start('Fetching available templates...');
        const templates = await listTemplates();
        spinner.stop();

        if (templates.length === 0) {
          console.log(chalk.yellow('No templates available.'));
          return;
        }

        await displayTemplates(templates);

        if (!templateId) {
          console.log(chalk.gray('Usage: stacksolo add <template-id> [--name <prefix>]\n'));
          return;
        }
      }

      // Load existing config
      spinner.start('Loading project configuration...');
      const existing = await loadExistingConfig(cwd);
      spinner.stop();

      if (!existing) {
        console.log(chalk.red('\n✗ No StackSolo project found in current directory.'));
        console.log(chalk.gray('  Run `stacksolo init` first to create a project.\n'));
        process.exit(1);
      }

      const { config: existingConfig, configPath } = existing;

      // Fetch template
      spinner.start(`Fetching template: ${templateId}...`);
      const templates = await listTemplates();
      const template = templates.find((t) => t.id === templateId);

      if (!template) {
        spinner.fail(`Template not found: ${templateId}`);
        console.log(chalk.gray('\n  Run `stacksolo add --list` to see available templates.\n'));
        process.exit(1);
      }

      const templateConfig = await getTemplateConfig(templateId);
      if (!templateConfig) {
        spinner.fail(`Could not fetch template configuration`);
        process.exit(1);
      }

      spinner.succeed(`Found template: ${template.name}`);

      // Get variables from existing config
      const variables: TemplateVariables = {
        projectName: existingConfig.project.name,
        gcpProjectId: existingConfig.project.gcpProjectId,
        region: existingConfig.project.region,
      };

      // Apply variable substitutions to template config
      const templateConfigStr = substituteVariables(JSON.stringify(templateConfig), variables);
      const processedTemplateConfig = JSON.parse(templateConfigStr) as StackSoloConfig;

      // Merge configs
      const namePrefix = options.name;
      const mergeResult = mergeTemplateIntoConfig(existingConfig, processedTemplateConfig, namePrefix);

      // Display what will be added
      console.log(chalk.cyan(`\nAdding template: ${template.name}`));
      console.log(chalk.gray('━'.repeat(50)));

      if (mergeResult.addedResources.length > 0) {
        console.log(chalk.white('\nResources to add:'));
        for (const resource of mergeResult.addedResources) {
          console.log(chalk.green(`  + ${resource}`));
        }
      }

      if (mergeResult.conflicts.length > 0) {
        console.log(chalk.yellow('\nConflicts detected:'));
        for (const conflict of mergeResult.conflicts) {
          console.log(chalk.yellow(`  ⚠ ${conflict}`));
        }
      }

      // Determine which files will be copied
      const templateMetadata = await getTemplateMetadata(templateId);
      console.log(chalk.white('\nSource files to copy:'));

      // Preview files from template network
      const templateNetwork = processedTemplateConfig.project?.networks?.[0];
      if (templateNetwork?.functions) {
        for (const fn of templateNetwork.functions) {
          const fnName = applyPrefix(fn.name, namePrefix);
          console.log(chalk.green(`  + functions/${fnName}/`));
        }
      }
      if (templateNetwork?.containers) {
        for (const container of templateNetwork.containers) {
          const containerName = applyPrefix(container.name, namePrefix);
          console.log(chalk.green(`  + containers/${containerName}/`));
        }
      }
      if (templateNetwork?.uis) {
        for (const ui of templateNetwork.uis) {
          const uiName = applyPrefix(ui.name, namePrefix);
          console.log(chalk.green(`  + apps/${uiName}/`));
        }
      }

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.yellow('\n[Dry run] No changes applied.\n'));
        return;
      }

      // Confirm unless --yes
      if (!options.yes) {
        console.log();
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed with adding these resources?',
            default: true,
          },
        ]);

        if (!proceed) {
          console.log(chalk.gray('\nCancelled.\n'));
          return;
        }
      }

      // Copy source files
      console.log();
      const addedFiles = await copyTemplateFiles(templateId, cwd, variables, namePrefix, (msg) => {
        spinner.text = msg;
        spinner.start();
      });
      spinner.stop();

      // Write updated config
      spinner.start('Updating configuration...');
      await fs.writeFile(configPath, JSON.stringify(mergeResult.config, null, 2) + '\n');
      spinner.succeed('Updated stacksolo.config.json');

      // Success message
      console.log(chalk.green('\n✓ Template added successfully!\n'));

      // Show next steps
      console.log(chalk.white('Next steps:'));

      // Template-specific hints
      if (templateId === 'pdf-extractor') {
        const fnName = applyPrefix('pdf-processor', namePrefix);
        console.log(chalk.gray(`  1. Edit functions/${fnName}/extraction.prompt to customize extraction`));
        console.log(chalk.gray('  2. Run: stacksolo deploy'));
      } else {
        if (addedFiles.length > 0) {
          console.log(chalk.gray(`  1. Review the added files in ${addedFiles.map((f) => f.path).join(', ')}`));
        }
        console.log(chalk.gray('  2. Run: stacksolo deploy'));
      }
      console.log();
    } catch (error) {
      spinner.fail('Error adding template');
      console.error(chalk.red(`\n${(error as Error).message}\n`));
      process.exit(1);
    }
  });
