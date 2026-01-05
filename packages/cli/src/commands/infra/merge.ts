/**
 * stacksolo merge
 *
 * Merge multiple StackSolo projects into a single deployable stack.
 * Enables building products separately and combining them for deployment.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  parseConfig,
  mergeConfigs,
  formatConflicts,
  validateMergedConfig,
  validateCrossProjectReferences,
  type MergeInput,
  type StackSoloConfig,
} from '@stacksolo/blueprint';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

/**
 * Find the config file for a project directory
 */
async function findProjectConfig(projectPath: string): Promise<string | null> {
  const candidates = [
    path.join(projectPath, STACKSOLO_DIR, CONFIG_FILENAME),
    path.join(projectPath, CONFIG_FILENAME),
    path.join(projectPath, 'stacksolo.json'),
    path.join(projectPath, '.stacksolo.json'),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Load a project config from a path
 */
async function loadProject(projectPath: string): Promise<MergeInput | null> {
  const absolutePath = path.resolve(projectPath);

  // Check if it's a directory or a config file
  let configPath: string;
  try {
    const stat = await fs.stat(absolutePath);
    if (stat.isDirectory()) {
      const found = await findProjectConfig(absolutePath);
      if (!found) {
        console.log(chalk.red(`  No config file found in ${projectPath}`));
        return null;
      }
      configPath = found;
    } else {
      configPath = absolutePath;
    }
  } catch (err) {
    console.log(chalk.red(`  Path not found: ${projectPath}`));
    return null;
  }

  try {
    const config = parseConfig(configPath);
    return {
      name: config.project.name,
      path: path.dirname(configPath),
      config,
    };
  } catch (err) {
    console.log(chalk.red(`  Failed to parse config: ${configPath}`));
    console.log(chalk.gray(`  ${err instanceof Error ? err.message : String(err)}`));
    return null;
  }
}

export const mergeCommand = new Command('merge')
  .description('Merge multiple StackSolo projects into a single stack')
  .argument('<projects...>', 'Paths to project directories or config files')
  .requiredOption('--name <name>', 'Name for the merged project')
  .option('-o, --output <dir>', 'Output directory for merged config', '.stacksolo-merged')
  .option('--shared-vpc <name>', 'Use a shared VPC (name or "auto" to create)')
  .option('--shared-registry', 'Use a shared Artifact Registry')
  .option('--dry-run', 'Show what would be merged without writing files')
  .option('--validate', 'Only validate, do not generate output')
  .option('--json', 'Output merged config as JSON to stdout')
  .action(async (projectPaths: string[], options) => {
    console.log('');
    console.log(chalk.bold('  StackSolo Merge'));
    console.log(chalk.gray(`  Merging ${projectPaths.length} project(s) into "${options.name}"`));
    console.log('');

    // Load all project configs
    console.log(chalk.cyan('  Loading projects...'));
    const inputs: MergeInput[] = [];

    for (const projectPath of projectPaths) {
      const input = await loadProject(projectPath);
      if (input) {
        console.log(chalk.green(`    ✓ ${input.name}`), chalk.gray(`(${input.path})`));
        inputs.push(input);
      }
    }

    if (inputs.length === 0) {
      console.log(chalk.red('\n  No valid projects found.\n'));
      process.exit(1);
    }

    if (inputs.length < 2) {
      console.log(chalk.yellow('\n  Only one project provided. At least 2 projects are needed to merge.\n'));
      process.exit(1);
    }

    console.log('');

    // Merge configs
    console.log(chalk.cyan('  Merging configurations...'));
    const outputDir = path.resolve(options.output);

    const result = mergeConfigs(inputs, {
      name: options.name,
      outputDir,
      sharedVpc: options.sharedVpc,
      sharedRegistry: options.sharedRegistry,
      dryRun: options.dryRun,
    });

    // Show conflicts
    if (result.conflicts.conflicts.length > 0) {
      console.log('');
      console.log(formatConflicts(result.conflicts));
    }

    if (!result.success || !result.config) {
      console.log(chalk.red('\n  Merge failed due to conflicts.\n'));
      process.exit(1);
    }

    console.log(chalk.green('    ✓ Configurations merged'));

    // Validate merged config
    console.log('');
    console.log(chalk.cyan('  Validating merged config...'));

    const validation = validateMergedConfig(result.config);

    if (!validation.valid) {
      console.log(chalk.red('\n  Validation errors:'));
      for (const error of validation.errors) {
        console.log(chalk.red(`    - ${error.path}: ${error.message}`));
      }
      console.log('');
      process.exit(1);
    }

    if (validation.warnings.length > 0) {
      console.log(chalk.yellow('\n  Warnings:'));
      for (const warning of validation.warnings) {
        console.log(chalk.yellow(`    - ${warning}`));
      }
    }

    // Validate cross-project references
    const sourceProjects = inputs.map(i => i.name);
    const refErrors = validateCrossProjectReferences(result.config, sourceProjects);
    if (refErrors.length > 0) {
      console.log(chalk.red('\n  Reference errors:'));
      for (const error of refErrors) {
        console.log(chalk.red(`    - ${error}`));
      }
      console.log('');
      process.exit(1);
    }

    console.log(chalk.green('    ✓ Validation passed'));

    // If validate-only, exit here
    if (options.validate) {
      console.log(chalk.green('\n  Validation complete. No output generated.\n'));
      process.exit(0);
    }

    // If JSON output, print and exit
    if (options.json) {
      console.log('');
      console.log(JSON.stringify(result.config, null, 2));
      console.log('');
      process.exit(0);
    }

    // If dry-run, show what would be created
    if (options.dryRun) {
      console.log('');
      console.log(chalk.cyan('  Dry run - would create:'));
      console.log(chalk.gray(`    ${outputDir}/`));
      console.log(chalk.gray(`    ${outputDir}/${CONFIG_FILENAME}`));
      console.log('');
      console.log(chalk.cyan('  Merged resources:'));
      showMergedResources(result.config);
      console.log('');
      process.exit(0);
    }

    // Write output
    console.log('');
    console.log(chalk.cyan('  Writing merged config...'));

    try {
      await fs.mkdir(outputDir, { recursive: true });
      const configOutput = path.join(outputDir, CONFIG_FILENAME);
      await fs.writeFile(configOutput, JSON.stringify(result.config, null, 2));
      console.log(chalk.green(`    ✓ ${configOutput}`));
    } catch (err) {
      console.log(chalk.red(`    Failed to write output: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }

    // Summary
    console.log('');
    console.log(chalk.bold.green('  Merge complete!'));
    console.log('');
    showMergedResources(result.config);
    console.log('');
    console.log(chalk.gray('  To deploy the merged stack:'));
    console.log(chalk.cyan(`    cd ${options.output}`));
    console.log(chalk.cyan('    stacksolo deploy'));
    console.log('');
  });

/**
 * Display summary of merged resources
 */
function showMergedResources(config: StackSoloConfig & { _merge?: { sources: Array<{ name: string }> } }): void {
  const project = config.project;

  // Count resources
  const counts: Record<string, number> = {};

  counts['buckets'] = project.buckets?.length || 0;
  counts['secrets'] = project.secrets?.length || 0;
  counts['topics'] = project.topics?.length || 0;
  counts['queues'] = project.queues?.length || 0;
  counts['crons'] = project.crons?.length || 0;

  for (const network of project.networks || []) {
    counts['networks'] = (counts['networks'] || 0) + 1;
    counts['containers'] = (counts['containers'] || 0) + (network.containers?.length || 0);
    counts['functions'] = (counts['functions'] || 0) + (network.functions?.length || 0);
    counts['databases'] = (counts['databases'] || 0) + (network.databases?.length || 0);
    counts['caches'] = (counts['caches'] || 0) + (network.caches?.length || 0);
    counts['uis'] = (counts['uis'] || 0) + (network.uis?.length || 0);
  }

  console.log(chalk.gray('  Resources:'));
  for (const [type, count] of Object.entries(counts)) {
    if (count > 0) {
      console.log(chalk.gray(`    ${type}: ${count}`));
    }
  }

  if (config._merge?.sources) {
    console.log('');
    console.log(chalk.gray('  Source projects:'));
    for (const source of config._merge.sources) {
      console.log(chalk.gray(`    - ${source.name}`));
    }
  }
}
