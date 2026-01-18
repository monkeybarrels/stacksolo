/**
 * stacksolo add
 *
 * Add template or micro-template resources to an existing StackSolo project.
 * - Templates: Full feature sets (e.g., pdf-extractor adds multiple resources)
 * - Micro-templates: Single-purpose components (e.g., stripe-webhook, auth-pages)
 *
 * Merges config and copies source files without re-initializing the project.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { StackSoloConfig, NetworkConfig, FunctionConfig, UiConfig } from '@stacksolo/blueprint';
import {
  listTemplates,
  getTemplateMetadata,
  getTemplateConfig,
  type TemplateInfo,
  type TemplateVariables,
} from '../../services/template.service';
import {
  listMicroTemplates,
  getMicroTemplateMetadata,
  applyMicroTemplate,
  applyFeatureTemplate,
  type MicroTemplateInfo,
  type MicroTemplateConfig,
  type MicroTemplateMetadata,
} from '../../services/micro-template.service';
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
 * Merge micro-template config fragment into existing config
 */
function mergeMicroTemplateIntoConfig(
  existingConfig: StackSoloConfig,
  microConfig: MicroTemplateConfig,
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

  // Add function if present
  if (microConfig.function) {
    if (!targetNetwork.functions) {
      targetNetwork.functions = [];
    }

    const fnConfig = microConfig.function;
    const fnName = namePrefix ? `${namePrefix}-${fnConfig.name}` : fnConfig.name;
    const existingFn = targetNetwork.functions.find((f) => f.name === fnName);

    if (existingFn) {
      conflicts.push(`Function "${fnName}" already exists`);
    } else {
      const newFn: FunctionConfig = {
        name: fnName,
        runtime: fnConfig.runtime as FunctionConfig['runtime'],
        entryPoint: fnConfig.entryPoint,
        memory: fnConfig.memory as FunctionConfig['memory'],
        sourceDir: fnConfig.sourceDir
          ? namePrefix
            ? fnConfig.sourceDir.replace(fnConfig.name, fnName)
            : fnConfig.sourceDir
          : `./functions/${fnName}`,
      };

      if (fnConfig.env) {
        newFn.env = fnConfig.env;
      }

      if (fnConfig.trigger) {
        newFn.trigger = fnConfig.trigger as FunctionConfig['trigger'];
      }

      targetNetwork.functions.push(newFn);

      // Determine trigger type for display
      let triggerInfo = 'HTTP';
      if (fnConfig.trigger?.type === 'storage') {
        triggerInfo = `GCS trigger: ${fnConfig.trigger.bucket}`;
      } else if (fnConfig.trigger?.type === 'pubsub') {
        triggerInfo = `Pub/Sub: ${fnConfig.trigger.topic}`;
      }
      addedResources.push(`function: ${fnName} (${triggerInfo})`);
    }
  }

  // Add UI if present
  if (microConfig.ui) {
    if (!targetNetwork.uis) {
      targetNetwork.uis = [];
    }

    const uiConfig = microConfig.ui;
    const uiName = namePrefix ? `${namePrefix}-${uiConfig.name}` : uiConfig.name;
    const existingUi = targetNetwork.uis.find((u) => u.name === uiName);

    if (existingUi) {
      conflicts.push(`UI "${uiName}" already exists`);
    } else {
      const newUi: UiConfig = {
        name: uiName,
        framework: uiConfig.framework as UiConfig['framework'],
        sourceDir: uiConfig.sourceDir
          ? namePrefix
            ? uiConfig.sourceDir.replace(uiConfig.name, uiName)
            : uiConfig.sourceDir
          : `./apps/${uiName}`,
      };

      targetNetwork.uis.push(newUi);
      addedResources.push(`ui: ${uiName}`);
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
 * Display available templates and micro-templates
 */
async function displayAllTemplates(
  templates: TemplateInfo[],
  microTemplates: MicroTemplateInfo[]
): Promise<void> {
  // Display full templates
  if (templates.length > 0) {
    console.log(chalk.cyan('\nFull Templates (multi-resource):\n'));

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

  // Display micro-templates
  if (microTemplates.length > 0) {
    console.log(chalk.cyan('\nMicro-Templates (single component):\n'));

    // Group by type
    const shells = microTemplates.filter((t) => t.type === 'shell');
    const features = microTemplates.filter((t) => t.type === 'feature');
    const functions = microTemplates.filter((t) => t.type === 'function');
    const uis = microTemplates.filter((t) => t.type === 'ui');

    if (shells.length > 0) {
      console.log(chalk.white('  Shells (monorepo foundations):'));
      for (const mt of shells) {
        console.log(`    ${chalk.magenta(mt.id)}`);
        console.log(`      ${chalk.gray(mt.description)}`);
        console.log(`      ${chalk.gray(mt.tags.join(', '))}`);
        console.log();
      }
    }

    if (features.length > 0) {
      console.log(chalk.white('  Features (add to existing shell):'));
      for (const mt of features) {
        console.log(`    ${chalk.cyan(mt.id)}`);
        console.log(`      ${chalk.gray(mt.description)}`);
        console.log(`      ${chalk.gray(mt.tags.join(', '))}`);
        console.log();
      }
    }

    if (functions.length > 0) {
      console.log(chalk.white('  Functions:'));
      for (const mt of functions) {
        console.log(`    ${chalk.green(mt.id)}`);
        console.log(`      ${chalk.gray(mt.description)}`);
        console.log(`      ${chalk.gray(mt.tags.join(', '))}`);
        console.log();
      }
    }

    if (uis.length > 0) {
      console.log(chalk.white('  UIs:'));
      for (const mt of uis) {
        console.log(`    ${chalk.blue(mt.id)}`);
        console.log(`      ${chalk.gray(mt.description)}`);
        console.log(`      ${chalk.gray(mt.tags.join(', '))}`);
        console.log();
      }
    }
  }
}

export const addCommand = new Command('add')
  .description('Add template or micro-template resources to an existing project')
  .argument('[template]', 'Template or micro-template ID to add (e.g., stripe-webhook, auth-pages)')
  .option('--name <prefix>', 'Prefix for added resource names (avoids conflicts)')
  .option('--dry-run', 'Preview changes without applying')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--list', 'List available templates and micro-templates')
  .action(async (templateId: string | undefined, options) => {
    const cwd = process.cwd();
    const spinner = ora();

    try {
      // List templates if requested or no template specified
      if (options.list || !templateId) {
        spinner.start('Fetching available templates...');
        const [templates, microTemplates] = await Promise.all([listTemplates(), listMicroTemplates()]);
        spinner.stop();

        if (templates.length === 0 && microTemplates.length === 0) {
          console.log(chalk.yellow('No templates available.'));
          return;
        }

        await displayAllTemplates(templates, microTemplates);

        if (!templateId) {
          console.log(chalk.gray('Usage: stacksolo add <template-id> [--name <prefix>]\n'));
          return;
        }
      }

      // Load existing config
      spinner.start('Loading project configuration...');
      const existing = await loadExistingConfig(cwd);
      spinner.stop();

      // Check if it's a feature template (which needs packages/shell instead of stacksolo config)
      spinner.start(`Looking up: ${templateId}...`);
      const [templates, microTemplates] = await Promise.all([listTemplates(), listMicroTemplates()]);

      const microTemplate = microTemplates.find((t) => t.id === templateId);
      const fullTemplate = templates.find((t) => t.id === templateId);

      if (!microTemplate && !fullTemplate) {
        spinner.fail(`Template not found: ${templateId}`);
        console.log(chalk.gray('\n  Run `stacksolo add --list` to see available templates.\n'));
        process.exit(1);
      }

      // Feature templates require an existing shell monorepo (with packages/shell)
      if (microTemplate?.type === 'feature') {
        spinner.succeed(`Found feature template: ${microTemplate.name}`);
        const metadata = await getMicroTemplateMetadata(microTemplate.id);
        if (!metadata) {
          throw new Error(`Could not fetch micro-template metadata`);
        }
        await handleFeatureTemplate(microTemplate, metadata, cwd, options, spinner);
        return;
      }

      // Shell templates should be added via `stacksolo init --template app-shell`
      if (microTemplate?.type === 'shell') {
        spinner.fail(`Shell templates should be used with init, not add`);
        console.log(chalk.gray(`\n  Use: stacksolo init --template ${templateId}\n`));
        process.exit(1);
      }

      // All other templates require an existing StackSolo project
      if (!existing) {
        console.log(chalk.red('\n✗ No StackSolo project found in current directory.'));
        console.log(chalk.gray('  Run `stacksolo init` first to create a project.\n'));
        process.exit(1);
      }

      const { config: existingConfig, configPath } = existing;

      if (microTemplate) {
        // Handle micro-template
        spinner.succeed(`Found micro-template: ${microTemplate.name}`);
        await handleMicroTemplate(microTemplate, existingConfig, configPath, cwd, options, spinner);
      } else if (fullTemplate) {
        // Handle full template
        spinner.succeed(`Found template: ${fullTemplate.name}`);
        await handleFullTemplate(fullTemplate, existingConfig, configPath, cwd, options, spinner);
      }
    } catch (error) {
      spinner.fail('Error adding template');
      console.error(chalk.red(`\n${(error as Error).message}\n`));
      process.exit(1);
    }
  });

/**
 * Handle adding a micro-template
 */
async function handleMicroTemplate(
  microTemplate: MicroTemplateInfo,
  existingConfig: StackSoloConfig,
  configPath: string,
  cwd: string,
  options: { name?: string; dryRun?: boolean; yes?: boolean },
  spinner: ReturnType<typeof ora>
): Promise<void> {
  const metadata = await getMicroTemplateMetadata(microTemplate.id);
  if (!metadata) {
    throw new Error(`Could not fetch micro-template metadata`);
  }

  // Handle feature templates differently
  if (microTemplate.type === 'feature') {
    await handleFeatureTemplate(microTemplate, metadata, cwd, options, spinner);
    return;
  }

  // Handle shell templates (just copy files, no config merge needed)
  if (microTemplate.type === 'shell') {
    await handleShellTemplate(microTemplate, metadata, cwd, options, spinner);
    return;
  }

  // Get variables from existing config
  const variables: Record<string, string> = {
    projectName: existingConfig.project.name,
    gcpProjectId: existingConfig.project.gcpProjectId,
    region: existingConfig.project.region,
  };

  // Merge config
  const namePrefix = options.name;
  const mergeResult = mergeMicroTemplateIntoConfig(existingConfig, metadata.config, namePrefix);

  // Display what will be added
  console.log(chalk.cyan(`\nAdding micro-template: ${microTemplate.name}`));
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

  // Show files to copy
  console.log(chalk.white('\nSource files to copy:'));
  if (metadata.config.function) {
    const fnName = namePrefix ? `${namePrefix}-${metadata.config.function.name}` : metadata.config.function.name;
    console.log(chalk.green(`  + functions/${fnName}/`));
  }
  if (metadata.config.ui) {
    const uiName = namePrefix ? `${namePrefix}-${metadata.config.ui.name}` : metadata.config.ui.name;
    console.log(chalk.green(`  + apps/${uiName}/`));
  }

  // Show required secrets
  if (metadata.secrets && metadata.secrets.length > 0) {
    console.log(chalk.white('\nRequired secrets:'));
    for (const secret of metadata.secrets) {
      console.log(chalk.yellow(`  • ${secret}`));
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
        message: 'Proceed with adding this micro-template?',
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }
  }

  // Apply micro-template (download and copy files)
  console.log();
  const { filesAdded } = await applyMicroTemplate(microTemplate.id, cwd, variables, namePrefix, (msg) => {
    spinner.text = msg;
    spinner.start();
  });
  spinner.stop();

  // Write updated config
  spinner.start('Updating configuration...');
  await fs.writeFile(configPath, JSON.stringify(mergeResult.config, null, 2) + '\n');
  spinner.succeed('Updated stacksolo.config.json');

  // Success message
  console.log(chalk.green('\n✓ Micro-template added successfully!\n'));

  // Show next steps
  console.log(chalk.white('Next steps:'));
  if (filesAdded.length > 0) {
    console.log(chalk.gray(`  1. Review the added files in ${filesAdded.join(', ')}`));
  }
  if (metadata.secrets && metadata.secrets.length > 0) {
    console.log(chalk.gray(`  2. Set up required secrets: ${metadata.secrets.join(', ')}`));
    console.log(chalk.gray('  3. Run: stacksolo deploy'));
  } else {
    console.log(chalk.gray('  2. Run: stacksolo deploy'));
  }
  console.log();
}

/**
 * Handle adding a full template
 */
async function handleFullTemplate(
  template: TemplateInfo,
  existingConfig: StackSoloConfig,
  configPath: string,
  cwd: string,
  options: { name?: string; dryRun?: boolean; yes?: boolean },
  spinner: ReturnType<typeof ora>
): Promise<void> {
  const templateConfig = await getTemplateConfig(template.id);
  if (!templateConfig) {
    throw new Error(`Could not fetch template configuration`);
  }

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
  const addedFiles = await copyTemplateFiles(template.id, cwd, variables, namePrefix, (msg) => {
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
  if (template.id === 'pdf-extractor') {
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
}

/**
 * Handle adding a feature template to an app-shell monorepo
 */
async function handleFeatureTemplate(
  microTemplate: MicroTemplateInfo,
  metadata: MicroTemplateMetadata,
  cwd: string,
  options: { name?: string; dryRun?: boolean; yes?: boolean },
  spinner: ReturnType<typeof ora>
): Promise<void> {
  // Feature templates require --name option
  if (!options.name) {
    console.log(chalk.red('\n✗ Feature templates require --name option.'));
    console.log(chalk.gray('  Usage: stacksolo add feature-module --name <feature-name>\n'));
    console.log(chalk.gray('  Example: stacksolo add feature-module --name inventory\n'));
    process.exit(1);
  }

  const featureName = options.name;
  const FeatureName = featureName.charAt(0).toUpperCase() + featureName.slice(1);

  // Build variables
  const variables: Record<string, string> = {
    name: featureName,
    Name: FeatureName,
    org: 'myorg', // Default, could be made configurable
  };

  // Try to detect org from existing shell package.json
  const shellPackageJsonPath = path.join(cwd, 'packages/shell/package.json');
  if (existsSync(shellPackageJsonPath)) {
    try {
      const shellPkg = JSON.parse(await fs.readFile(shellPackageJsonPath, 'utf-8'));
      // Extract org from package name like "@myorg/shell"
      const match = shellPkg.name?.match(/^@([\w-]+)\//);
      if (match) {
        variables.org = match[1];
      }
    } catch {
      // Use default
    }
  }

  // Display what will be added
  console.log(chalk.cyan(`\nAdding feature: ${FeatureName}`));
  console.log(chalk.gray('━'.repeat(50)));

  const targetDir = `packages/feature-${featureName}`;
  console.log(chalk.white('\nFiles to create:'));
  console.log(chalk.green(`  + ${targetDir}/`));

  console.log(chalk.white('\nShell updates:'));
  console.log(chalk.green(`  + Add @${variables.org}/feature-${featureName} to shell dependencies`));
  console.log(chalk.green(`  + Import routes in shell router`));

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.yellow('\n[Dry run] No changes applied.\n'));
    return;
  }

  // Check if feature already exists
  const featurePath = path.join(cwd, targetDir);
  if (existsSync(featurePath)) {
    console.log(chalk.red(`\n✗ Feature already exists: ${targetDir}\n`));
    process.exit(1);
  }

  // Confirm unless --yes
  if (!options.yes) {
    console.log();
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `Create feature package ${featureName}?`,
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }
  }

  // Apply feature template
  console.log();
  spinner.start('Creating feature package...');

  const { filesAdded, shellUpdated } = await applyFeatureTemplate(
    cwd,
    microTemplate.id,
    variables,
    (msg) => {
      spinner.text = msg;
    }
  );
  spinner.stop();

  // Success message
  console.log(chalk.green('\n✓ Feature added successfully!\n'));

  if (filesAdded.length > 0) {
    console.log(chalk.white('Created:'));
    for (const file of filesAdded) {
      console.log(chalk.green(`  + ${file}`));
    }
  }

  if (shellUpdated) {
    console.log(chalk.white('\nShell updated:'));
    console.log(chalk.green(`  + Added dependency`));
    console.log(chalk.green(`  + Updated router imports`));
  }

  // Show next steps
  console.log(chalk.white('\nNext steps:'));
  console.log(chalk.gray('  1. Run: pnpm install'));
  console.log(chalk.gray('  2. Run: pnpm --filter shell dev'));
  console.log(chalk.gray(`  3. Visit /${featureName} in your app`));
  console.log();
}

