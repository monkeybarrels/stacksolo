/**
 * stacksolo clone
 *
 * Bootstrap a new StackSolo project from:
 * 1. A remote stack (e.g., `stacksolo clone rag-platform my-project`)
 * 2. An existing local project (e.g., `stacksolo clone ../other-project`)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import { loadConfig, type StackSoloConfig } from '@stacksolo/blueprint';
import {
  createStacksoloDir,
  createConfigFile,
} from '../../templates';
import { getRegistry } from '@stacksolo/registry';
import {
  fetchJson,
  downloadDirectory,
  substituteVariablesInDirectory,
  parseRepo,
} from '../../services/github.service';

// GitHub repository configuration
const REPO = parseRepo('monkeybarrels/stacksolo-architectures', 'main');

/**
 * Stack metadata from stack.json
 */
interface StackMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  difficulty: string;
  variables: Record<string, {
    description: string;
    required?: boolean;
    default?: string;
  }>;
}

/**
 * Stacks index structure
 */
interface StacksIndex {
  version: string;
  stacks: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    difficulty: string;
    path: string;
  }>;
}

/**
 * Fetch the stacks index from the repository
 */
async function fetchStacksIndex(): Promise<StacksIndex> {
  return fetchJson<StacksIndex>('stacks.json', REPO);
}

/**
 * Check if the source is a known remote stack by looking up in the index
 * then fetching its stack.json for full metadata
 */
async function fetchStackMetadata(stackId: string): Promise<StackMetadata | null> {
  try {
    // First check if it's in the index
    const index = await fetchStacksIndex();
    const stackInfo = index.stacks.find(s => s.id === stackId);

    if (!stackInfo) {
      return null;
    }

    // Fetch the full metadata from stack.json
    const metadata = await fetchJson<StackMetadata>(`${stackInfo.path}/stack.json`, REPO);
    return metadata;
  } catch {
    return null;
  }
}

/**
 * Download and extract a stack from the GitHub repository
 * Uses the unified GitHub service for tarball download
 */
async function cloneRemoteStack(
  stackId: string,
  outputDir: string,
  spinner: ReturnType<typeof ora>
): Promise<boolean> {
  try {
    // Get the stack path from the index
    const index = await fetchStacksIndex();
    const stackInfo = index.stacks.find(s => s.id === stackId);

    if (!stackInfo) {
      spinner.fail(`Stack "${stackId}" not found in repository`);
      return false;
    }

    // Use the unified download service
    await downloadDirectory(stackInfo.path, outputDir, REPO, {
      onProgress: (msg) => { spinner.text = msg; },
    });

    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Clone a remote stack to the local filesystem
 */
async function cloneStack(
  stackId: string,
  destination: string | undefined,
  metadata: StackMetadata,
  options: { name?: string; yes?: boolean },
  cwd: string
): Promise<void> {
  console.log(chalk.cyan.bold('\n  StackSolo Stack Clone\n'));
  console.log(chalk.gray(`  ${metadata.description}\n`));
  console.log(chalk.gray('─'.repeat(60)));

  // Determine output directory
  let projectName = destination || options.name;

  if (!projectName && !options.yes) {
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project directory name:',
        default: stackId,
        validate: (input: string) => {
          if (!input) return 'Directory name is required';
          if (!/^[a-z][a-z0-9-]*$/.test(input)) {
            return 'Must start with letter, only lowercase, numbers, hyphens';
          }
          return true;
        },
      },
    ]);
    projectName = name;
  }

  projectName = projectName || stackId;
  const outputDir = path.join(cwd, projectName);

  // Check if directory exists
  try {
    await fs.access(outputDir);
    console.log(chalk.red(`\n  Error: Directory "${projectName}" already exists.\n`));
    return;
  } catch {
    // Directory doesn't exist, good to proceed
  }

  // Collect variable values
  console.log(chalk.cyan.bold('\n  Configuration\n'));

  const variables: Record<string, string> = {};
  const varEntries = Object.entries(metadata.variables || {});

  if (varEntries.length > 0 && !options.yes) {
    for (const [key, spec] of varEntries) {
      let defaultValue = spec.default || '';

      // Smart defaults
      if (key === 'projectName') defaultValue = projectName;

      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: `${spec.description}:`,
          default: defaultValue,
          validate: (input: string) => {
            if (spec.required && !input) return `${key} is required`;
            return true;
          },
        },
      ]);
      variables[key] = value;
    }
  } else {
    // Use defaults
    for (const [key, spec] of varEntries) {
      if (key === 'projectName') {
        variables[key] = projectName;
      } else if (spec.default) {
        variables[key] = spec.default;
      }
    }
  }

  // Clone the stack
  console.log(chalk.cyan.bold('\n  Cloning Stack\n'));
  const cloneSpinner = ora('Cloning stack...').start();

  try {
    await fs.mkdir(outputDir, { recursive: true });
    const success = await cloneRemoteStack(stackId, outputDir, cloneSpinner);

    if (!success) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
      return;
    }

    cloneSpinner.succeed('Stack cloned successfully');

    // Apply variable substitutions across all files in the project
    if (Object.keys(variables).length > 0) {
      const varSpinner = ora('Applying variable substitutions...').start();
      try {
        await substituteVariablesInDirectory(outputDir, variables);
        varSpinner.succeed('Variables substituted in all files');
      } catch (err) {
        varSpinner.warn(`Could not substitute all variables: ${err}`);
      }
    }

    // Ensure .stacksolo directory has the config
    const stacksoloConfigPath = path.join(outputDir, '.stacksolo', 'stacksolo.config.json');
    try {
      await fs.access(stacksoloConfigPath);
      console.log(chalk.green('  ✓ Configuration ready'));
    } catch {
      // Try legacy path
      const legacyPath = path.join(outputDir, 'infrastructure', 'config.json');
      try {
        const configContent = await fs.readFile(legacyPath, 'utf-8');
        const stacksoloDir = path.join(outputDir, '.stacksolo');
        await fs.mkdir(stacksoloDir, { recursive: true });
        await fs.writeFile(stacksoloConfigPath, configContent);
        console.log(chalk.green('  ✓ Configuration migrated to .stacksolo/'));
      } catch {
        console.log(chalk.yellow('  ⚠ No config found (create .stacksolo/stacksolo.config.json manually)'));
      }
    }

    // Summary
    console.log(chalk.gray('\n─'.repeat(60)));
    console.log(chalk.bold.green('\n  Done! Stack cloned successfully.\n'));
    console.log(chalk.gray('  Location: ') + chalk.white(outputDir));
    console.log(chalk.gray('  Stack: ') + chalk.white(`${metadata.name} v${metadata.version}`));

    console.log(chalk.gray('\n  Next steps:\n'));
    console.log(chalk.white(`    cd ${projectName}`));
    console.log(chalk.white('    npm install'));
    console.log(chalk.white('    npm run dev'));
    console.log('');
    console.log(chalk.gray('  To deploy:'));
    console.log(chalk.cyan('    stacksolo deploy'));
    console.log('');

  } catch (error) {
    cloneSpinner.fail('Failed to clone stack');
    console.log(chalk.red(`\n  ${error instanceof Error ? error.message : error}\n`));
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

interface SharedResources {
  vpc?: {
    name: string;
    subnets?: Array<{ name: string; ipCidrRange: string }>;
  };
  buckets?: Array<{ name: string; storageClass?: string }>;
  registry?: {
    name: string;
    format?: string;
  };
}

/**
 * Extract shared resources from a source config.
 * These will be marked with existing: true in the new project.
 */
function extractSharedResources(config: StackSoloConfig): SharedResources {
  const shared: SharedResources = {};
  const project = config.project;

  // Extract VPC from first network (the main shared infrastructure)
  if (project.networks && project.networks.length > 0) {
    const network = project.networks[0];
    shared.vpc = {
      name: network.name,
      subnets: network.subnets?.map(s => ({
        name: s.name,
        ipCidrRange: s.ipCidrRange,
      })),
    };
  }

  // Extract buckets (globally unique, so we reference by name)
  if (project.buckets && project.buckets.length > 0) {
    shared.buckets = project.buckets.map(b => ({
      name: b.name,
      storageClass: b.storageClass,
    }));
  }

  // Extract artifact registry
  if (project.artifactRegistry) {
    shared.registry = {
      name: project.artifactRegistry.name,
      format: project.artifactRegistry.format,
    };
  }

  return shared;
}

/**
 * Generate a new config that references shared resources with existing: true
 */
function generateClonedConfig(
  newProjectName: string,
  sourceConfig: StackSoloConfig,
  shared: SharedResources,
  options: {
    shareBuckets: boolean;
    shareRegistry: boolean;
  }
): StackSoloConfig {
  const source = sourceConfig.project;

  const newConfig: StackSoloConfig = {
    project: {
      name: newProjectName,
      region: source.region,
      gcpProjectId: source.gcpProjectId,
      backend: source.backend,
      // Empty network with shared VPC
      networks: [],
    },
  };

  // Add shared VPC with existing: true
  if (shared.vpc) {
    newConfig.project.networks = [{
      name: shared.vpc.name,
      existing: true,
      // Subnets are part of the existing VPC
      subnets: shared.vpc.subnets,
      // Empty arrays for user to add their own resources
      functions: [],
      containers: [],
      uis: [],
    }];
  }

  // Add shared buckets with existing: true
  if (options.shareBuckets && shared.buckets && shared.buckets.length > 0) {
    newConfig.project.buckets = shared.buckets.map(b => ({
      ...b,
      existing: true,
    }));
  }

  // Add shared artifact registry with existing: true
  if (options.shareRegistry && shared.registry) {
    newConfig.project.artifactRegistry = {
      ...shared.registry,
      existing: true,
    };
  }

  return newConfig;
}

export const cloneCommand = new Command('clone')
  .description('Clone a stack or project (e.g., stacksolo clone rag-platform my-app)')
  .argument('[source]', 'Stack ID (e.g., rag-platform) or path to local project')
  .argument('[destination]', 'Directory name for new project')
  .option('-n, --name <name>', 'Name for the new project')
  .option('-o, --output <dir>', 'Output directory (default: current directory)')
  .option('--no-vpc', 'Do not share the VPC (local clone only)')
  .option('--no-buckets', 'Do not share storage buckets (local clone only)')
  .option('--no-registry', 'Do not share artifact registry (local clone only)')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--list', 'List available stacks')
  .action(async (source, destination, options) => {
    const cwd = process.cwd();

    // Handle --list flag or no source provided
    if (options.list || !source) {
      console.log(chalk.cyan.bold('\n  Available Stacks\n'));
      console.log(chalk.gray('  Fetching from stacksolo-architectures...\n'));

      const spinner = ora('Loading stacks...').start();

      try {
        // Fetch from the stacks index
        const index = await fetchStacksIndex();
        spinner.stop();

        if (index.stacks.length === 0) {
          console.log(chalk.yellow('  No stacks available yet.\n'));
        } else {
          for (const stack of index.stacks) {
            console.log(chalk.green(`  ${stack.id}`));
            console.log(chalk.gray(`    ${stack.description}`));
            console.log(chalk.gray(`    Tags: ${stack.tags.join(', ')}`));
            console.log('');
          }
        }
      } catch (error) {
        spinner.fail('Failed to fetch stacks');
        console.log(chalk.red(`  ${error instanceof Error ? error.message : error}\n`));
      }

      console.log(chalk.gray('  Usage: stacksolo clone <stack-id> <project-name>\n'));
      return;
    }

    // =========================================
    // Check if source is a remote stack
    // =========================================
    const stackSpinner = ora('Checking for remote stack...').start();
    const stackMetadata = await fetchStackMetadata(source);

    if (stackMetadata) {
      // This is a remote stack - clone it
      stackSpinner.succeed(`Found stack: ${chalk.green(stackMetadata.name)}`);
      await cloneStack(source, destination, stackMetadata, options, cwd);
      return;
    }

    stackSpinner.text = 'Not a remote stack, checking local path...';

    // =========================================
    // Fall back to local project clone
    // =========================================
    const outputDir = options.output ? path.resolve(cwd, options.output) : cwd;

    console.log(chalk.cyan.bold('\n  StackSolo Clone\n'));
    console.log(chalk.gray('  Bootstrap a new project from an existing one.\n'));
    console.log(chalk.gray('─'.repeat(60)));

    // =========================================
    // Step 1: Load source project config
    // =========================================
    console.log(chalk.cyan.bold('\n  Step 1: Load Source Project\n'));

    const sourceSpinner = ora('Loading source project...').start();
    stackSpinner.stop();

    // Resolve source path
    let sourcePath = path.resolve(cwd, source);
    let configPath: string;

    try {
      const stat = await fs.stat(sourcePath);
      if (stat.isDirectory()) {
        // Look for config in .stacksolo directory
        configPath = path.join(sourcePath, '.stacksolo', 'stacksolo.config.json');
      } else {
        configPath = sourcePath;
      }
    } catch {
      sourceSpinner.fail(`Source not found: ${source}`);
      console.log(chalk.gray('\n  Hint: Use --list to see available remote stacks\n'));
      return;
    }

    // Load and validate config
    let sourceConfig: StackSoloConfig;
    try {
      const result = loadConfig(configPath);
      if (!result.success || !result.config) {
        sourceSpinner.fail('Invalid source config');
        if (result.errors) {
          for (const err of result.errors) {
            console.log(chalk.red(`  - ${err.message}`));
          }
        }
        return;
      }
      sourceConfig = result.config;
    } catch (error) {
      sourceSpinner.fail(`Failed to load config: ${configPath}`);
      console.log(chalk.red(`  ${error}`));
      return;
    }

    sourceSpinner.succeed(`Loaded: ${chalk.green(sourceConfig.project.name)}`);

    // =========================================
    // Step 2: Extract shared resources
    // =========================================
    console.log(chalk.cyan.bold('\n  Step 2: Identify Shared Resources\n'));

    const shared = extractSharedResources(sourceConfig);

    console.log('  Found shareable resources:');
    if (shared.vpc) {
      console.log(chalk.green(`  ✓ VPC: ${shared.vpc.name}`));
      if (shared.vpc.subnets) {
        for (const subnet of shared.vpc.subnets) {
          console.log(chalk.gray(`      Subnet: ${subnet.name} (${subnet.ipCidrRange})`));
        }
      }
    }
    if (shared.buckets && shared.buckets.length > 0) {
      for (const bucket of shared.buckets) {
        console.log(chalk.green(`  ✓ Bucket: ${bucket.name}`));
      }
    }
    if (shared.registry) {
      console.log(chalk.green(`  ✓ Artifact Registry: ${shared.registry.name}`));
    }

    if (!shared.vpc && !shared.buckets?.length && !shared.registry) {
      console.log(chalk.yellow('  No shareable resources found in source project.'));
      console.log(chalk.gray('  Consider running stacksolo init instead.\n'));
      return;
    }

    // =========================================
    // Step 3: Configure new project
    // =========================================
    console.log(chalk.gray('\n─'.repeat(60)));
    console.log(chalk.cyan.bold('\n  Step 3: Configure New Project\n'));

    let projectName = options.name;
    let shareBuckets = options.buckets !== false;
    let shareRegistry = options.registry !== false;
    let shareVpc = options.vpc !== false;

    if (!options.yes) {
      // Get project name
      if (!projectName) {
        const defaultName = path.basename(outputDir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const { name } = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'New project name:',
            default: defaultName,
            validate: (input: string) => {
              if (!input) return 'Project name is required';
              if (!/^[a-z][a-z0-9-]*$/.test(input)) {
                return 'Must start with letter, only lowercase, numbers, hyphens';
              }
              if (input === sourceConfig.project.name) {
                return 'New project must have a different name';
              }
              return true;
            },
          },
        ]);
        projectName = name;
      }

      // Select which resources to share
      const resourceChoices = [];
      if (shared.vpc) {
        resourceChoices.push({ name: `VPC: ${shared.vpc.name}`, value: 'vpc', checked: true });
      }
      if (shared.buckets && shared.buckets.length > 0) {
        resourceChoices.push({
          name: `Buckets: ${shared.buckets.map(b => b.name).join(', ')}`,
          value: 'buckets',
          checked: true,
        });
      }
      if (shared.registry) {
        resourceChoices.push({
          name: `Artifact Registry: ${shared.registry.name}`,
          value: 'registry',
          checked: true,
        });
      }

      if (resourceChoices.length > 1) {
        const { selectedResources } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedResources',
            message: 'Which resources should the new project share?',
            choices: resourceChoices,
          },
        ]);

        shareVpc = selectedResources.includes('vpc');
        shareBuckets = selectedResources.includes('buckets');
        shareRegistry = selectedResources.includes('registry');
      }
    }

    projectName = projectName || `${sourceConfig.project.name}-clone`;

    if (!shareVpc) {
      console.log(chalk.yellow('\n  Warning: Not sharing VPC. A new VPC will be created.'));
      console.log(chalk.gray('  This counts against your VPC quota (default: 5 per project).\n'));
    }

    // =========================================
    // Step 4: Generate new project config
    // =========================================
    console.log(chalk.gray('\n─'.repeat(60)));
    console.log(chalk.cyan.bold('\n  Step 4: Generate Project Files\n'));

    const generateSpinner = ora('Generating configuration...').start();

    // Generate config with shared resources
    const newConfig = generateClonedConfig(
      projectName,
      sourceConfig,
      shareVpc ? shared : { ...shared, vpc: undefined },
      { shareBuckets, shareRegistry }
    );

    // If not sharing VPC, create an empty network
    if (!shareVpc) {
      newConfig.project.networks = [{
        name: 'main',
        subnets: [{
          name: 'private',
          ipCidrRange: '10.0.1.0/24',
        }],
        functions: [],
        containers: [],
        uis: [],
      }];
    }

    // Create output directory if needed
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch {
      // Directory exists
    }

    // Create .stacksolo directory
    await createStacksoloDir(outputDir, {
      gcpProjectId: sourceConfig.project.gcpProjectId,
      clonedFrom: sourceConfig.project.name,
    });
    generateSpinner.text = 'Created .stacksolo/';

    // Write config file
    await createConfigFile(outputDir, newConfig);
    generateSpinner.succeed('Project files created');

    // =========================================
    // Step 5: Register in global registry
    // =========================================
    const registrySpinner = ora('Registering project...').start();
    try {
      const registry = getRegistry();
      const newConfigPath = path.join(outputDir, '.stacksolo', 'stacksolo.config.json');

      const existing = await registry.findProjectByName(projectName);
      if (existing) {
        await registry.updateProject(existing.id, {
          gcpProjectId: sourceConfig.project.gcpProjectId,
          region: sourceConfig.project.region,
          configPath: newConfigPath,
        });
        registrySpinner.succeed('Updated project in registry');
      } else {
        await registry.registerProject({
          name: projectName,
          gcpProjectId: sourceConfig.project.gcpProjectId,
          region: sourceConfig.project.region,
          configPath: newConfigPath,
        });
        registrySpinner.succeed('Registered project in global registry');
      }
    } catch {
      registrySpinner.warn('Could not register in global registry (non-blocking)');
    }

    // =========================================
    // Summary
    // =========================================
    console.log(chalk.gray('\n─'.repeat(60)));
    console.log(chalk.bold.green('\n  Done! New project created.\n'));

    console.log(chalk.gray('  Project: ') + chalk.white(projectName));
    console.log(chalk.gray('  Location: ') + chalk.white(outputDir));
    console.log(chalk.gray('  GCP Project: ') + chalk.white(sourceConfig.project.gcpProjectId));
    console.log(chalk.gray('  Region: ') + chalk.white(sourceConfig.project.region));

    console.log(chalk.gray('\n  Shared resources (existing: true):'));
    if (shareVpc && shared.vpc) {
      console.log(chalk.green(`    ✓ VPC: ${shared.vpc.name}`));
    }
    if (shareBuckets && shared.buckets?.length) {
      for (const b of shared.buckets) {
        console.log(chalk.green(`    ✓ Bucket: ${b.name}`));
      }
    }
    if (shareRegistry && shared.registry) {
      console.log(chalk.green(`    ✓ Registry: ${shared.registry.name}`));
    }

    console.log(chalk.gray('\n  Next steps:\n'));
    console.log(chalk.white('    1. Add your functions, containers, or UIs to the config'));
    console.log(chalk.white('    2. Run: ') + chalk.cyan('stacksolo scaffold'));
    console.log(chalk.white('    3. Write your code'));
    console.log(chalk.white('    4. Run: ') + chalk.cyan('stacksolo deploy'));
    console.log('');

    // Show example of adding a function
    console.log(chalk.gray('  Example - add a function to .stacksolo/stacksolo.config.json:'));
    console.log(chalk.gray(''));
    console.log(chalk.cyan('    "functions": ['));
    console.log(chalk.cyan('      {'));
    console.log(chalk.cyan('        "name": "api",'));
    console.log(chalk.cyan('        "runtime": "nodejs20",'));
    console.log(chalk.cyan('        "entryPoint": "handler"'));
    console.log(chalk.cyan('      }'));
    console.log(chalk.cyan('    ]'));
    console.log('');
  });
