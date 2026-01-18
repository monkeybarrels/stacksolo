/**
 * stacksolo init
 *
 * Initialize a new StackSolo project with full GCP setup:
 * 1. Validate GCP authentication
 * 2. Select/validate GCP project
 * 3. Check and fix org policy restrictions
 * 4. Enable required APIs
 * 5. Select project type and details
 * 6. Generate config and scaffold templates
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as path from 'path';
import { getRegionsForProvider } from '../../regions';
import {
  isGcloudInstalled,
  checkGcloudAuth,
  listProjects,
  getCurrentProject,
  setActiveProject,
  createProject,
  linkBillingAccount,
  listBillingAccounts,
  REQUIRED_APIS,
  checkApis,
  enableApis,
  checkOrgPolicy,
  fixOrgPolicy,
  checkAndFixCloudBuildPermissions,
  isFirebaseInstalled,
  checkFirebaseAuth,
  addFirebaseToProject,
  getFirebaseAuthConsoleUrl,
  getBillingConsoleUrl,
  isBillingEnabled,
  generateProjectId,
  isValidProjectId,
} from '../../gcp';
import {
  generateConfig,
  createStacksoloDir,
  createConfigFile,
  scaffoldTemplates,
  type ProjectType,
  type UIFramework,
} from '../../templates';
import { getRegistry } from '@stacksolo/registry';
import {
  listTemplates,
  getTemplateMetadata,
  initFromTemplate,
  isRemoteTemplate,
  type TemplateInfo,
  type TemplateVariables,
} from '../../services/template.service';
import {
  listMicroTemplates,
  getMicroTemplateMetadata,
  type MicroTemplateInfo,
  type MicroTemplateMetadata,
} from '../../services/micro-template.service';
import {
  downloadDirectory,
  substituteVariablesInDirectory,
  parseRepo,
} from '../../services/github.service';

const BANNER = `
  ███████╗████████╗ █████╗  ██████╗██╗  ██╗███████╗ ██████╗ ██╗      ██████╗
  ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔═══██╗██║     ██╔═══██╗
  ███████╗   ██║   ███████║██║     █████╔╝ ███████╗██║   ██║██║     ██║   ██║
  ╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ╚════██║██║   ██║██║     ██║   ██║
  ███████║   ██║   ██║  ██║╚██████╗██║  ██╗███████║╚██████╔╝███████╗╚██████╔╝
  ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝ ╚═════╝
`;

const PROJECT_TYPES: Array<{
  value: ProjectType;
  name: string;
  description: string;
}> = [
  {
    value: 'function-api',
    name: 'Function API',
    description: 'Serverless API using Cloud Functions behind a load balancer',
  },
  {
    value: 'ui-api',
    name: 'UI + API',
    description: 'Static UI (React/Vue/Svelte) + Cloud Function API behind a load balancer',
  },
  {
    value: 'ui-only',
    name: 'UI Only',
    description: 'Static UI site served via Cloud Storage + CDN',
  },
  {
    value: 'container-api',
    name: 'Container API',
    description: 'Containerized API using Cloud Run behind a load balancer',
  },
  {
    value: 'function-cron',
    name: 'Function Cron',
    description: 'Scheduled Cloud Function triggered by Cloud Scheduler',
  },
  {
    value: 'static-api',
    name: 'Static Site + API (Container)',
    description: 'Static frontend container with serverless API backend',
  },
];

const UI_FRAMEWORKS: Array<{
  value: UIFramework;
  name: string;
  description: string;
}> = [
  {
    value: 'react',
    name: 'React',
    description: 'React with Vite and TypeScript',
  },
  {
    value: 'vue',
    name: 'Vue',
    description: 'Vue 3 with Vite and TypeScript',
  },
  {
    value: 'sveltekit',
    name: 'SvelteKit',
    description: 'SvelteKit with static adapter',
  },
  {
    value: 'html',
    name: 'Plain HTML',
    description: 'Simple HTML/CSS/JS - no build step',
  },
];

/**
 * Wait for user to complete a manual step
 * Returns true if user wants to continue, false if they want to quit
 */
async function waitForManualStep(
  description: string,
  url: string,
  instruction: string
): Promise<{ continue: boolean; retry: boolean }> {
  console.log(chalk.yellow(`\n  ${description}\n`));
  console.log(chalk.white(`  ${url}\n`));
  console.log(chalk.gray(`  ${instruction}\n`));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Continue (I\'ve completed this step)', value: 'continue' },
        { name: 'Open URL and wait', value: 'open' },
        { name: 'Quit and resume later', value: 'quit' },
      ],
    },
  ]);

  if (action === 'open') {
    // Try to open URL in browser
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        await execAsync(`open "${url}"`);
      } else if (platform === 'win32') {
        await execAsync(`start "${url}"`);
      } else {
        await execAsync(`xdg-open "${url}"`);
      }
      console.log(chalk.gray('\n  Opened in browser. Complete the step and press Enter.\n'));
    } catch {
      console.log(chalk.gray('\n  Could not open browser. Please open the URL manually.\n'));
    }

    // Wait for user to press enter
    await inquirer.prompt([
      {
        type: 'input',
        name: 'done',
        message: 'Press Enter when done...',
      },
    ]);

    return { continue: true, retry: false };
  }

  if (action === 'quit') {
    return { continue: false, retry: false };
  }

  return { continue: true, retry: false };
}

/**
 * Handle --create-project flow
 * Creates a new GCP project with Firebase enabled
 */
async function handleCreateProject(
  cwd: string,
  options: {
    name?: string;
    region?: string;
    template?: string;
  }
): Promise<void> {
  // Print banner
  console.log(chalk.cyan(BANNER));
  console.log(chalk.bold('  Create a new GCP + Firebase project\n'));
  console.log(chalk.gray('─'.repeat(75)));

  // =========================================
  // Step 1: Check CLIs
  // =========================================
  console.log(chalk.cyan.bold('\n  Step 1: Prerequisites\n'));

  // Check gcloud
  const gcloudSpinner = ora('Checking gcloud CLI...').start();
  if (!(await isGcloudInstalled())) {
    gcloudSpinner.fail('gcloud CLI not found');
    console.log(chalk.red('\n  gcloud CLI is required.\n'));
    console.log(chalk.gray('  Install: https://cloud.google.com/sdk/docs/install\n'));
    return;
  }

  const authInfo = await checkGcloudAuth();
  if (!authInfo) {
    gcloudSpinner.fail('Not authenticated to GCP');
    console.log(chalk.red('\n  Please authenticate first:\n'));
    console.log(chalk.white('    gcloud auth login'));
    console.log(chalk.white('    gcloud auth application-default login\n'));
    return;
  }
  gcloudSpinner.succeed(`gcloud authenticated as ${chalk.green(authInfo.account)}`);

  // Check firebase
  const firebaseSpinner = ora('Checking Firebase CLI...').start();
  if (!(await isFirebaseInstalled())) {
    firebaseSpinner.fail('Firebase CLI not found');
    console.log(chalk.red('\n  Firebase CLI is required for --create-project.\n'));
    console.log(chalk.gray('  Install: npm install -g firebase-tools'));
    console.log(chalk.gray('  Then run: firebase login\n'));
    return;
  }

  const firebaseAuth = await checkFirebaseAuth();
  if (!firebaseAuth) {
    firebaseSpinner.fail('Not authenticated to Firebase');
    console.log(chalk.red('\n  Please authenticate first:\n'));
    console.log(chalk.white('    firebase login\n'));
    return;
  }
  firebaseSpinner.succeed('Firebase CLI authenticated');

  // =========================================
  // Step 2: Project Details
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 2: Project Details\n'));

  // Get project name
  let projectName = options.name;
  if (!projectName) {
    const defaultName = path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: defaultName,
        validate: (input: string) => {
          if (!input) return 'Project name is required';
          if (!/^[a-z][a-z0-9-]*$/.test(input)) {
            return 'Must start with letter, only lowercase, numbers, hyphens';
          }
          return true;
        },
      },
    ]);
    projectName = name;
  }

  // Generate or get project ID
  const suggestedId = generateProjectId(projectName);
  const { projectId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectId',
      message: 'GCP Project ID:',
      default: suggestedId,
      validate: (input: string) => {
        const result = isValidProjectId(input);
        return result.valid || result.error || 'Invalid project ID';
      },
    },
  ]);

  // Get region
  let region = options.region;
  if (!region) {
    const regions = getRegionsForProvider('gcp');
    const { selectedRegion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedRegion',
        message: 'Region:',
        choices: regions.map((r) => ({ name: r.name, value: r.value })),
        default: 'us-central1',
      },
    ]);
    region = selectedRegion;
  }

  console.log(chalk.gray(`\n  Project: ${chalk.white(projectName)}`));
  console.log(chalk.gray(`  GCP ID:  ${chalk.white(projectId)}`));
  console.log(chalk.gray(`  Region:  ${chalk.white(region)}`));

  // =========================================
  // Step 3: Create GCP Project
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 3: Create GCP Project\n'));

  const createSpinner = ora('Creating GCP project...').start();
  const createResult = await createProject(projectId, projectName);

  if (!createResult.success) {
    createSpinner.fail('Failed to create project');
    console.log(chalk.red(`\n  ${createResult.error}\n`));
    return;
  }
  createSpinner.succeed(`Created GCP project: ${chalk.green(projectId)}`);

  // Set as active project
  await setActiveProject(projectId);

  // =========================================
  // Step 4: Enable Billing (Manual Step)
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 4: Enable Billing\n'));

  // Check if billing is already enabled
  const billingSpinner = ora('Checking billing status...').start();
  let billingEnabled = await isBillingEnabled(projectId);

  if (billingEnabled) {
    billingSpinner.succeed('Billing is already enabled');
  } else {
    billingSpinner.stop();

    // Try to auto-link billing
    const billingAccounts = await listBillingAccounts();

    if (billingAccounts.length > 0) {
      const { billingAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'billingAction',
          message: 'Link a billing account:',
          choices: [
            ...billingAccounts.map((b) => ({
              name: `${b.name} (${b.id})`,
              value: b.id,
            })),
            new inquirer.Separator(),
            { name: 'Configure manually in GCP Console', value: '__manual__' },
          ],
        },
      ]);

      if (billingAction !== '__manual__') {
        const linkSpinner = ora('Linking billing account...').start();
        const linked = await linkBillingAccount(projectId, billingAction);
        if (linked) {
          linkSpinner.succeed('Billing account linked');
          billingEnabled = true;
        } else {
          linkSpinner.warn('Could not link billing account automatically');
        }
      }
    }

    // If still not enabled, manual step
    if (!billingEnabled) {
      const billingUrl = getBillingConsoleUrl(projectId);
      const result = await waitForManualStep(
        'Billing must be enabled to use GCP services.',
        billingUrl,
        'Link a billing account in the GCP Console, then continue.'
      );

      if (!result.continue) {
        console.log(chalk.yellow('\n  Project created but billing not enabled.'));
        console.log(chalk.gray(`  Resume setup later by running: stacksolo init --project-id ${projectId}\n`));
        return;
      }
    }
  }

  // =========================================
  // Step 5: Enable APIs
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 5: Enable GCP APIs\n'));

  const apisSpinner = ora('Enabling required APIs...').start();
  const apiResult = await enableApis(projectId, REQUIRED_APIS, (api, success) => {
    if (success) {
      apisSpinner.text = `Enabled ${api}`;
    }
  });

  if (apiResult.failed.length === 0) {
    apisSpinner.succeed(`Enabled ${apiResult.enabled.length} APIs`);
  } else {
    apisSpinner.warn(`Enabled ${apiResult.enabled.length} APIs, ${apiResult.failed.length} failed`);
    console.log(chalk.yellow('  Failed APIs (may need billing):'));
    for (const api of apiResult.failed) {
      console.log(chalk.gray(`    - ${api}`));
    }
  }

  // =========================================
  // Step 6: Add Firebase
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 6: Add Firebase\n'));

  const firebaseAddSpinner = ora('Adding Firebase to project...').start();
  const firebaseResult = await addFirebaseToProject(projectId);

  if (!firebaseResult.success) {
    firebaseAddSpinner.fail('Failed to add Firebase');
    console.log(chalk.red(`\n  ${firebaseResult.error}\n`));
    console.log(chalk.gray('  You can add Firebase manually later:'));
    console.log(chalk.white(`    firebase projects:addfirebase ${projectId}\n`));
  } else {
    firebaseAddSpinner.succeed('Firebase added to project');
  }

  // =========================================
  // Step 7: Configure Firebase Auth (Manual Step)
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 7: Configure Firebase Authentication\n'));

  const authUrl = getFirebaseAuthConsoleUrl(projectId);
  const { needsAuth } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'needsAuth',
      message: 'Do you need Firebase Authentication?',
      default: true,
    },
  ]);

  if (needsAuth) {
    const authResult = await waitForManualStep(
      'Enable authentication providers in Firebase Console.',
      authUrl,
      'Click "Get Started", then enable Email/Password, Google, or other providers.'
    );

    if (!authResult.continue) {
      console.log(chalk.yellow('\n  You can configure auth later at:'));
      console.log(chalk.gray(`  ${authUrl}\n`));
    }
  }

  // =========================================
  // Step 8: Fix Org Policy & Cloud Build
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 8: Configure Permissions\n'));

  // Check org policy
  const policySpinner = ora('Checking org policy...').start();
  const policyStatus = await checkOrgPolicy(projectId);

  if (policyStatus.hasRestriction && policyStatus.canOverride) {
    policySpinner.text = 'Fixing org policy...';
    const fixed = await fixOrgPolicy(projectId);
    if (fixed) {
      policySpinner.succeed('Org policy configured for public access');
    } else {
      policySpinner.warn('Could not update org policy - some features may be limited');
    }
  } else if (policyStatus.hasRestriction) {
    policySpinner.warn('Org policy restricts public access - contact your admin');
  } else {
    policySpinner.succeed('No org policy restrictions');
  }

  // Fix Cloud Build permissions
  const iamSpinner = ora('Configuring Cloud Build permissions...').start();
  const iamResult = await checkAndFixCloudBuildPermissions(projectId);
  if (iamResult.failed.length === 0) {
    iamSpinner.succeed('Cloud Build permissions configured');
  } else {
    iamSpinner.warn('Some permissions could not be set');
  }

  // =========================================
  // Step 9: Generate Config
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 9: Generate Project Files\n'));

  // Select project type
  const { projectType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'projectType',
      message: 'What are you building?',
      choices: PROJECT_TYPES.map((t) => ({
        name: `${t.name}\n      ${chalk.gray(t.description)}`,
        value: t.value,
        short: t.name,
      })),
      default: 'ui-api',
    },
  ]);

  let uiFramework: UIFramework | undefined;
  if (projectType === 'ui-api' || projectType === 'ui-only') {
    const { selectedFramework } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedFramework',
        message: 'Which UI framework?',
        choices: UI_FRAMEWORKS.map((f) => ({
          name: `${f.name}\n      ${chalk.gray(f.description)}`,
          value: f.value,
          short: f.name,
        })),
        default: 'react',
      },
    ]);
    uiFramework = selectedFramework;
  }

  // Generate config with Firebase/kernel settings
  const generateSpinner = ora('Generating configuration...').start();

  const config = generateConfig({
    projectName,
    gcpProjectId: projectId,
    region,
    projectType,
    uiFramework,
    needsDatabase: false,
    needsBucket: false,
  });

  // Add gcpKernel config for Firebase Auth support
  if (needsAuth) {
    (config.project as Record<string, unknown>).gcpKernel = {
      name: 'kernel',
      firebaseProjectId: projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
    };
    // Add plugin
    if (!config.project.plugins) {
      config.project.plugins = [];
    }
    if (!config.project.plugins.includes('@stacksolo/plugin-gcp-kernel')) {
      config.project.plugins.push('@stacksolo/plugin-gcp-kernel');
    }
  }

  // Create .stacksolo directory
  await createStacksoloDir(cwd, {
    gcpProjectId: projectId,
    orgPolicyFixed: !policyStatus.hasRestriction || policyStatus.canOverride,
    apisEnabled: REQUIRED_APIS,
  });

  // Write config
  await createConfigFile(cwd, config);

  // Scaffold templates
  const scaffoldedFiles = await scaffoldTemplates(cwd, projectType, uiFramework);
  generateSpinner.succeed('Project files created');

  // Register in global registry
  try {
    const registry = getRegistry();
    const configPath = path.join(cwd, '.stacksolo', 'stacksolo.config.json');
    await registry.registerProject({
      name: projectName,
      gcpProjectId: projectId,
      region,
      configPath,
    });
  } catch {
    // Non-blocking
  }

  // =========================================
  // Done!
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.bold.green('\n  Success! Your project is ready.\n'));

  console.log(chalk.white('  Created:'));
  console.log(chalk.green(`    ✓ GCP Project: ${projectId}`));
  console.log(chalk.green(`    ✓ Firebase Project: ${projectId}`));
  if (needsAuth) {
    console.log(chalk.green('    ✓ Firebase Auth enabled'));
  }
  console.log(chalk.green('    ✓ .stacksolo/stacksolo.config.json'));

  console.log(chalk.gray('\n  Next steps:\n'));
  console.log(chalk.white('    1. Review your config:'));
  console.log(chalk.cyan('       cat .stacksolo/stacksolo.config.json'));
  console.log(chalk.white('    2. Install dependencies:'));
  console.log(chalk.cyan('       npm install'));
  console.log(chalk.white('    3. Start development:'));
  console.log(chalk.cyan('       stacksolo dev'));
  console.log(chalk.white('    4. Deploy to GCP:'));
  console.log(chalk.cyan('       stacksolo deploy'));
  console.log('');
}

const SHELL_REPO = parseRepo('monkeybarrels/stacksolo-architectures', 'main');

/**
 * Handle shell micro-template initialization (e.g., app-shell monorepo)
 * These create monorepo foundations without requiring GCP setup
 */
async function handleShellTemplate(
  cwd: string,
  shellTemplate: MicroTemplateInfo,
  options: {
    template: string;
    name?: string;
    yes?: boolean;
    framework?: 'vue' | 'react';
  }
): Promise<void> {
  const framework = options.framework || 'vue';

  // Print banner
  console.log(chalk.cyan(BANNER));
  console.log(chalk.bold(`  Initializing shell: ${shellTemplate.name} (${framework})\n`));
  console.log(chalk.gray('─'.repeat(75)));
  console.log(chalk.gray(`  ${shellTemplate.description}\n`));

  const spinner = ora('Fetching template metadata...').start();

  const metadata = await getMicroTemplateMetadata(shellTemplate.id);
  if (!metadata) {
    spinner.fail('Could not fetch template metadata');
    return;
  }

  spinner.succeed('Template metadata loaded');

  // Collect variables from user
  const variables: Record<string, string> = {};

  // Get org name (required for package scoping)
  if (!options.yes) {
    const { org } = await inquirer.prompt([
      {
        type: 'input',
        name: 'org',
        message: 'npm organization scope (without @):',
        default: 'myorg',
        validate: (input: string) => {
          if (!input) return 'Required';
          if (!/^[a-z0-9-]+$/.test(input)) return 'Must be lowercase letters, numbers, and hyphens';
          return true;
        },
      },
    ]);
    variables.org = org;
  } else {
    variables.org = options.name || 'myorg';
  }

  // Download template files
  spinner.start(`Downloading ${framework} template files...`);

  try {
    // Download the framework-specific files directory
    // Structure: micro-templates/app-shell/files/vue/ or micro-templates/app-shell/files/react/
    const filesPath = `${shellTemplate.path}/files/${framework}`;
    await downloadDirectory(filesPath, cwd, SHELL_REPO, {
      overwrite: false,
      exclude: [],
    });

    spinner.succeed('Template files downloaded');

    // Apply variable substitutions
    spinner.start('Applying variable substitutions...');
    await substituteVariablesInDirectory(cwd, variables);
    spinner.succeed('Variables applied');

    // Show success message
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.green.bold(`\n  ✓ ${framework === 'react' ? 'React' : 'Vue'} shell monorepo created!\n`));

    console.log(chalk.white('Next steps:'));
    console.log(chalk.gray('  1. Run: ') + chalk.cyan('pnpm install'));
    console.log(chalk.gray('  2. Configure Firebase in ') + chalk.cyan('packages/shell/src/core/lib/firebase.ts'));
    console.log(chalk.gray('  3. Run: ') + chalk.cyan('pnpm --filter shell dev'));
    console.log(chalk.gray('  4. Add features with: ') + chalk.cyan('stacksolo add feature-module --name <name>'));
    console.log();
  } catch (error) {
    spinner.fail('Failed to create shell project');
    console.error(chalk.red(`\n  ${error instanceof Error ? error.message : String(error)}\n`));
  }
}

/**
 * Handle remote template initialization
 */
async function handleRemoteTemplate(
  cwd: string,
  options: {
    template: string;
    name?: string;
    projectId?: string;
    region?: string;
    yes?: boolean;
    skipOrgPolicy?: boolean;
    skipApis?: boolean;
  }
): Promise<void> {
  // Print banner
  console.log(chalk.cyan(BANNER));
  console.log(chalk.bold(`  Initializing from template: ${options.template}\n`));
  console.log(chalk.gray('─'.repeat(75)));

  // Fetch template metadata
  const spinner = ora('Fetching template info...').start();
  const metadata = await getTemplateMetadata(options.template);

  if (!metadata) {
    spinner.fail(`Template not found: ${options.template}`);
    console.log(chalk.yellow('\n  Run ') + chalk.white('stacksolo init --list-templates') + chalk.yellow(' to see available templates.\n'));
    return;
  }

  spinner.succeed(`Found template: ${metadata.name}`);

  // =========================================
  // Step 1: Check gcloud CLI
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 1: GCP Authentication\n'));

  const gcloudSpinner = ora('Checking gcloud CLI...').start();

  if (!(await isGcloudInstalled())) {
    gcloudSpinner.fail('gcloud CLI not found');
    console.log(chalk.red('\n  gcloud CLI is not installed.\n'));
    console.log(chalk.gray('  Install it from: https://cloud.google.com/sdk/docs/install\n'));
    return;
  }

  const authInfo = await checkGcloudAuth();
  if (!authInfo) {
    gcloudSpinner.fail('Not authenticated to GCP');
    console.log(chalk.red('\n  gcloud CLI is not authenticated.\n'));
    console.log(chalk.gray('  Run these commands:'));
    console.log(chalk.white('    gcloud auth login'));
    console.log(chalk.white('    gcloud auth application-default login\n'));
    return;
  }

  gcloudSpinner.succeed(`Authenticated as ${chalk.green(authInfo.account)}`);

  // =========================================
  // Step 2: Select GCP Project
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 2: Select GCP Project\n'));

  let projectId = options.projectId;

  if (!projectId && !options.yes) {
    const projectsSpinner = ora('Loading accessible projects...').start();
    const projects = await listProjects();
    const currentProject = await getCurrentProject();
    projectsSpinner.stop();

    const projectChoices = projects.map((p) => ({
      name: `${p.name} (${p.projectId})`,
      value: p.projectId,
    }));

    const { selectedProject } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProject',
        message: 'Select a GCP project:',
        choices: [
          ...projectChoices,
          new inquirer.Separator(),
          { name: 'Enter manually', value: '__manual__' },
        ],
        default: currentProject || projects[0]?.projectId,
        pageSize: 15,
      },
    ]);

    if (selectedProject === '__manual__') {
      const { manualId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'manualId',
          message: 'Enter GCP Project ID:',
          validate: (input: string) => input.length > 0 || 'Required',
        },
      ]);
      projectId = manualId;
    } else {
      projectId = selectedProject;
    }
  }

  projectId = projectId || authInfo.project;

  if (!projectId) {
    console.log(chalk.red('\n  Project ID is required. Use --project-id or run interactively.\n'));
    return;
  }

  console.log(chalk.gray(`  Using project: ${chalk.white(projectId)}`));

  // =========================================
  // Step 3: Select Framework Variant
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 3: Select Framework\n'));

  let selectedVariant = metadata.variants[0];

  if (metadata.variants.length > 1 && !options.yes) {
    const { variant } = await inquirer.prompt([
      {
        type: 'list',
        name: 'variant',
        message: 'Which framework?',
        choices: metadata.variants.map((v) => ({
          name: `${v.name}\n      ${chalk.gray(v.description)}`,
          value: v.id,
          short: v.name,
        })),
        default: metadata.variants[0].id,
      },
    ]);

    selectedVariant = metadata.variants.find((v) => v.id === variant) || metadata.variants[0];
  }

  console.log(chalk.gray(`  Using: ${chalk.white(selectedVariant.name)}`));

  // =========================================
  // Step 4: Project Details
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 4: Project Details\n'));

  // Get project name
  let projectName = options.name;
  if (!projectName && !options.yes) {
    const defaultName = path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: defaultName,
        validate: (input: string) => {
          if (!input) return 'Project name is required';
          if (!/^[a-z][a-z0-9-]*$/.test(input)) {
            return 'Must start with letter, only lowercase, numbers, hyphens';
          }
          return true;
        },
      },
    ]);
    projectName = name;
  }
  projectName = projectName || path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Get region
  let region = options.region;
  if (!region && !options.yes) {
    const regions = getRegionsForProvider('gcp');
    const { selectedRegion } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedRegion',
        message: 'Region:',
        choices: regions.map((r) => ({ name: r.name, value: r.value })),
        default: 'us-central1',
      },
    ]);
    region = selectedRegion;
  }
  region = region || 'us-central1';

  // =========================================
  // Step 5: Apply Template
  // =========================================
  console.log(chalk.gray('\n─'.repeat(75)));
  console.log(chalk.cyan.bold('\n  Step 5: Creating project files...\n'));

  const variables: TemplateVariables = {
    projectName,
    gcpProjectId: projectId,
    region,
    uiFramework: selectedVariant.id,
  };

  const applySpinner = ora('Downloading template...').start();

  try {
    const result = await initFromTemplate(
      cwd,
      options.template,
      selectedVariant.id,
      variables,
      (message) => {
        applySpinner.text = message;
      }
    );

    applySpinner.succeed('Template applied successfully');

    console.log(chalk.green('\n  Created files:'));
    console.log(chalk.green('  ✓ .stacksolo/stacksolo.config.json'));

    // Group files by directory for cleaner output
    const dirs = new Set<string>();
    for (const file of result.filesCreated) {
      const dir = path.dirname(file).split('/')[0];
      dirs.add(dir);
    }

    for (const dir of dirs) {
      const count = result.filesCreated.filter((f) => f.startsWith(dir)).length;
      console.log(chalk.green(`  ✓ ${dir}/ (${count} files)`));
    }

    // Register project
    const registrySpinner = ora('Registering project...').start();
    try {
      const registry = getRegistry();
      const configPath = path.join(cwd, '.stacksolo', 'stacksolo.config.json');

      const existing = await registry.findProjectByName(projectName);
      if (existing) {
        await registry.updateProject(existing.id, {
          gcpProjectId: projectId,
          region,
          configPath,
        });
        registrySpinner.succeed('Updated project in registry');
      } else {
        await registry.registerProject({
          name: projectName,
          gcpProjectId: projectId,
          region,
          configPath,
        });
        registrySpinner.succeed('Registered project in global registry');
      }
    } catch {
      registrySpinner.warn('Could not register in global registry (non-blocking)');
    }

    // Done
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.bold.green('\n  Done! Your Firebase app is ready.\n'));

    console.log(chalk.gray('  Next steps:\n'));
    console.log(chalk.white('    1. cd into the project and install dependencies:'));
    console.log(chalk.cyan('       npm install'));
    console.log(chalk.white('    2. Start local development:'));
    console.log(chalk.cyan('       stacksolo dev'));
    console.log(chalk.white('    3. Deploy to GCP:'));
    console.log(chalk.cyan('       stacksolo deploy'));
    console.log('');
  } catch (error) {
    applySpinner.fail('Failed to apply template');
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`\n  ${message}\n`));
  }
}

export const initCommand = new Command('init')
  .description('Initialize a new StackSolo project')
  .option('-n, --name <name>', 'Project name')
  .option('--project-id <id>', 'GCP project ID')
  .option('-r, --region <region>', 'Region')
  .option('-t, --template <template>', 'Project template (function-api, container-api, firebase-app, etc.)')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--skip-org-policy', 'Skip org policy check and fix')
  .option('--skip-apis', 'Skip enabling GCP APIs')
  .option('--list-templates', 'List available remote templates')
  .option('--create-project', 'Create a new GCP + Firebase project')
  .option('--react', 'Use React framework for shell templates')
  .option('--vue', 'Use Vue framework for shell templates (default)')
  .action(async (options) => {
    const cwd = process.cwd();

    // =========================================
    // Handle --create-project
    // =========================================
    if (options.createProject) {
      return await handleCreateProject(cwd, options);
    }

    // =========================================
    // Handle --list-templates
    // =========================================
    if (options.listTemplates) {
      const spinner = ora('Fetching available templates...').start();
      try {
        const [templates, microTemplates] = await Promise.all([
          listTemplates(),
          listMicroTemplates(),
        ]);
        spinner.stop();

        const shellTemplates = microTemplates.filter((t) => t.type === 'shell');

        if (templates.length === 0 && shellTemplates.length === 0) {
          console.log(chalk.yellow('\n  No remote templates available yet.\n'));
          console.log(chalk.gray('  Use built-in templates: function-api, container-api, ui-api, ui-only\n'));
          return;
        }

        console.log(chalk.bold('\n  Available Templates\n'));
        console.log(chalk.gray('─'.repeat(75)));

        // Show shell templates first (monorepo foundations)
        if (shellTemplates.length > 0) {
          console.log(chalk.magenta.bold('\n  Shells (Monorepo Foundations)'));
          for (const template of shellTemplates) {
            console.log('');
            console.log(chalk.magenta(`  ${template.name}`) + chalk.gray(` (${template.id})`));
            console.log(chalk.white(`    ${template.description}`));
            console.log(chalk.gray(`    Tags: ${template.tags.join(', ')}`));
          }
        }

        // Show full templates
        if (templates.length > 0) {
          console.log(chalk.cyan.bold('\n  Full Stack Templates'));
          for (const template of templates) {
            console.log('');
            console.log(chalk.cyan(`  ${template.name}`) + chalk.gray(` (${template.id})`));
            console.log(chalk.white(`    ${template.description}`));
            console.log(chalk.gray(`    Difficulty: ${template.difficulty} | Tags: ${template.tags.join(', ')}`));
          }
        }

        console.log(chalk.gray('\n─'.repeat(75)));
        console.log(chalk.gray('\n  Usage: ') + chalk.white('stacksolo init --template <template-id>\n'));
      } catch (error) {
        spinner.fail('Failed to fetch templates');
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.red(`\n  ${message}\n`));
      }
      return;
    }

    // =========================================
    // Handle shell micro-templates (app-shell, etc.)
    // =========================================
    if (options.template) {
      const microTemplates = await listMicroTemplates();
      const shellTemplate = microTemplates.find(
        (t) => t.id === options.template && t.type === 'shell'
      );

      if (shellTemplate) {
        // Determine framework: --react flag, --vue flag, or default to 'vue'
        const framework: 'vue' | 'react' = options.react ? 'react' : 'vue';
        return await handleShellTemplate(cwd, shellTemplate, { ...options, framework });
      }
    }

    // =========================================
    // Handle remote templates (firebase-app, etc.)
    // =========================================
    if (options.template && isRemoteTemplate(options.template)) {
      return await handleRemoteTemplate(cwd, options);
    }

    // Print banner
    console.log(chalk.cyan(BANNER));
    console.log(chalk.bold('  Let\'s set up your project.\n'));
    console.log(chalk.gray('─'.repeat(75)));

    // =========================================
    // Step 0: Check gcloud CLI
    // =========================================
    const gcloudSpinner = ora('Checking gcloud CLI...').start();

    if (!(await isGcloudInstalled())) {
      gcloudSpinner.fail('gcloud CLI not found');
      console.log(chalk.red('\n  gcloud CLI is not installed.\n'));
      console.log(chalk.gray('  Install it from: https://cloud.google.com/sdk/docs/install\n'));
      return;
    }

    const authInfo = await checkGcloudAuth();
    if (!authInfo) {
      gcloudSpinner.fail('Not authenticated to GCP');
      console.log(chalk.red('\n  gcloud CLI is not authenticated.\n'));
      console.log(chalk.gray('  Run these commands:'));
      console.log(chalk.white('    gcloud auth login'));
      console.log(chalk.white('    gcloud auth application-default login\n'));
      return;
    }

    gcloudSpinner.succeed(`Authenticated as ${chalk.green(authInfo.account)}`);

    // =========================================
    // Step 1: Select GCP Project
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.cyan.bold('\n  Step 1: Select GCP Project\n'));

    let projectId = options.projectId;

    if (!projectId && !options.yes) {
      const projectsSpinner = ora('Loading accessible projects...').start();
      const projects = await listProjects();
      const currentProject = await getCurrentProject();
      projectsSpinner.stop();

      const projectChoices = projects.map((p) => ({
        name: `${p.name} (${p.projectId})`,
        value: p.projectId,
      }));

      const { selectedProject } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedProject',
          message: 'Select a GCP project:',
          choices: [
            ...projectChoices,
            new inquirer.Separator(),
            { name: '+ Create new project', value: '__create__' },
            { name: 'Enter manually', value: '__manual__' },
          ],
          default: currentProject || projects[0]?.projectId,
          pageSize: 15,
        },
      ]);

      if (selectedProject === '__create__') {
        // Create new project flow
        const { newProjectId, newProjectName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newProjectId',
            message: 'New project ID:',
            validate: (input: string) => {
              if (!input) return 'Required';
              if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(input)) {
                return 'Must be 6-30 chars: lowercase letters, digits, hyphens. Start with letter, end with letter/digit.';
              }
              return true;
            },
          },
          {
            type: 'input',
            name: 'newProjectName',
            message: 'Project display name:',
            default: (answers: { newProjectId: string }) => answers.newProjectId,
          },
        ]);

        const createSpinner = ora('Creating GCP project...').start();
        const result = await createProject(newProjectId, newProjectName);

        if (!result.success) {
          createSpinner.fail('Failed to create project');
          console.log(chalk.red(`\n  ${result.error}\n`));
          return;
        }

        createSpinner.succeed(`Created project: ${newProjectId}`);
        projectId = newProjectId;

        // Link billing account
        const billingSpinner = ora('Checking billing accounts...').start();
        const billingAccounts = await listBillingAccounts();
        billingSpinner.stop();

        if (billingAccounts.length > 0) {
          console.log(chalk.yellow('\n  A billing account is required to use most GCP services.\n'));

          const { billingAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'billingAction',
              message: 'Link a billing account?',
              choices: [
                ...billingAccounts.map((b) => ({
                  name: `${b.name} (${b.id})`,
                  value: b.id,
                })),
                new inquirer.Separator(),
                { name: 'Skip (link later in GCP Console)', value: '__skip__' },
              ],
            },
          ]);

          if (billingAction !== '__skip__') {
            const linkSpinner = ora('Linking billing account...').start();
            const linked = await linkBillingAccount(projectId, billingAction);
            if (linked) {
              linkSpinner.succeed('Billing account linked');
            } else {
              linkSpinner.warn('Could not link billing account. Link it manually in GCP Console.');
            }
          }
        } else {
          console.log(chalk.yellow('\n  No billing accounts found. You may need to set up billing in GCP Console.\n'));
        }
      } else if (selectedProject === '__manual__') {
        const { manualId } = await inquirer.prompt([
          {
            type: 'input',
            name: 'manualId',
            message: 'Enter GCP Project ID:',
            validate: (input: string) => input.length > 0 || 'Required',
          },
        ]);
        projectId = manualId;
      } else {
        projectId = selectedProject;
      }
    }

    projectId = projectId || authInfo.project;

    if (!projectId) {
      console.log(chalk.red('\n  Project ID is required. Use --project-id or run interactively.\n'));
      return;
    }

    // Set the active project in gcloud config
    const currentProject = await getCurrentProject();
    if (currentProject !== projectId) {
      const setProjectSpinner = ora('Setting active project...').start();
      const projectSet = await setActiveProject(projectId);
      if (projectSet) {
        setProjectSpinner.succeed(`Active project set to ${chalk.green(projectId)}`);
      } else {
        setProjectSpinner.warn(`Could not set active project. Run: gcloud config set project ${projectId}`);
      }
    } else {
      console.log(chalk.gray(`\n  Using project: ${chalk.white(projectId)}`));
    }

    // =========================================
    // Step 2: Check & Enable APIs
    // =========================================
    if (!options.skipApis) {
      console.log(chalk.gray('\n─'.repeat(75)));
      console.log(chalk.cyan.bold('\n  Step 2: Project Permissions\n'));

      const apisSpinner = ora('Checking required APIs...').start();
      const apiStatus = await checkApis(projectId, REQUIRED_APIS);
      const missingApis = apiStatus.filter((a) => !a.enabled);
      apisSpinner.stop();

      console.log('  Required APIs:');
      for (const api of apiStatus) {
        if (api.enabled) {
          console.log(chalk.green(`  ✓ ${api.name}`));
        } else {
          console.log(chalk.red(`  ✗ ${api.name}`));
        }
      }

      if (missingApis.length > 0) {
        console.log('');
        const { shouldEnable } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldEnable',
            message: 'Enable missing APIs?',
            default: true,
          },
        ]);

        if (shouldEnable) {
          console.log('');
          const enableSpinner = ora('Enabling APIs...').start();
          const result = await enableApis(projectId, missingApis.map((a) => a.api), (api, success) => {
            if (success) {
              enableSpinner.text = `Enabled ${api}`;
            }
          });

          if (result.failed.length === 0) {
            enableSpinner.succeed(`Enabled ${result.enabled.length} APIs`);
          } else {
            enableSpinner.warn(`Enabled ${result.enabled.length} APIs, ${result.failed.length} failed`);
            console.log(chalk.yellow('  Failed to enable:'));
            for (const api of result.failed) {
              console.log(chalk.gray(`    - ${api}`));
            }
          }
        } else {
          console.log(chalk.yellow('\n  Some features may not work without required APIs.\n'));
        }
      } else {
        console.log(chalk.green('\n  All required APIs are enabled.'));
      }
    }

    // =========================================
    // Step 3: Check & Fix Org Policy
    // =========================================
    let orgPolicyFixed = false;

    if (!options.skipOrgPolicy) {
      console.log(chalk.gray('\n─'.repeat(75)));
      console.log(chalk.cyan.bold('\n  Step 3: Organization Policy\n'));

      const policySpinner = ora('Checking org policy...').start();
      const policyStatus = await checkOrgPolicy(projectId);

      if (policyStatus.hasRestriction) {
        policySpinner.warn('Organization policy restricts public access');

        console.log(chalk.yellow('\n  Your organization restricts allUsers IAM bindings.'));
        console.log(chalk.gray('  This is required for public load balancer access.\n'));

        if (!policyStatus.canOverride) {
          console.log(chalk.red('  You do not have permission to override this policy.'));
          console.log(chalk.gray('  Contact your GCP organization admin to either:'));
          console.log(chalk.gray('    1. Add an exception for this project'));
          console.log(chalk.gray('    2. Grant you the "Organization Policy Administrator" role\n'));

          const { continueAnyway } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueAnyway',
              message: 'Continue anyway? (Some features may not work)',
              default: false,
            },
          ]);

          if (!continueAnyway) {
            return;
          }
        } else {
          const { policyAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'policyAction',
              message: 'How do you want to handle this?',
              choices: [
                { name: 'Fix automatically (override policy for this project)', value: 'fix' },
                { name: 'Skip (I\'ll request an exception from my org admin)', value: 'skip' },
              ],
            },
          ]);

          if (policyAction === 'fix') {
            const fixSpinner = ora('Updating org policy...').start();
            const fixed = await fixOrgPolicy(projectId);

            if (fixed) {
              fixSpinner.succeed(`Policy updated. Public access enabled for ${projectId}.`);
              orgPolicyFixed = true;
            } else {
              fixSpinner.fail('Failed to update org policy');
              console.log(chalk.yellow('\n  Could not override the policy. Some features may not work.\n'));
            }
          }
        }
      } else {
        policySpinner.succeed('No org policy restrictions detected');
        orgPolicyFixed = true;
      }
    }

    // =========================================
    // Step 4: Check Cloud Build Permissions
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.cyan.bold('\n  Step 4: Cloud Build Permissions\n'));

    const iamSpinner = ora('Checking Cloud Build service account permissions...').start();
    const iamResult = await checkAndFixCloudBuildPermissions(projectId);

    if (iamResult.fixed.length > 0) {
      iamSpinner.succeed(`Granted permissions: ${iamResult.fixed.join(', ')}`);
    } else if (iamResult.failed.length > 0) {
      iamSpinner.warn('Could not grant some permissions');
      console.log(chalk.yellow('  You may need to manually grant these roles:'));
      for (const role of iamResult.failed) {
        console.log(chalk.gray(`    - ${role}`));
      }
    } else {
      iamSpinner.succeed('Cloud Build permissions are configured');
    }

    // =========================================
    // Step 5: Select Project Type
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.cyan.bold('\n  Step 5: Project Type\n'));

    let projectType: ProjectType = (options.template as ProjectType) || 'function-api';
    let uiFramework: UIFramework | undefined;

    if (!options.template && !options.yes) {
      const { selectedType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedType',
          message: 'What are you building?',
          choices: PROJECT_TYPES.map((t) => ({
            name: `${t.name}\n      ${chalk.gray(t.description)}`,
            value: t.value,
            short: t.name,
          })),
          default: 'function-api',
        },
      ]);
      projectType = selectedType;

      // Ask for UI framework if ui-api or ui-only
      if (projectType === 'ui-api' || projectType === 'ui-only') {
        const { selectedFramework } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedFramework',
            message: 'Which UI framework?',
            choices: UI_FRAMEWORKS.map((f) => ({
              name: `${f.name}\n      ${chalk.gray(f.description)}`,
              value: f.value,
              short: f.name,
            })),
            default: 'react',
          },
        ]);
        uiFramework = selectedFramework;
      }
    }

    // =========================================
    // Step 6: Project Details
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.cyan.bold('\n  Step 6: Project Details\n'));

    // Get project name
    let projectName = options.name;
    if (!projectName && !options.yes) {
      const defaultName = path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const { name } = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Project name:',
          default: defaultName,
          validate: (input: string) => {
            if (!input) return 'Project name is required';
            if (!/^[a-z][a-z0-9-]*$/.test(input)) {
              return 'Must start with letter, only lowercase, numbers, hyphens';
            }
            return true;
          },
        },
      ]);
      projectName = name;
    }
    projectName = projectName || path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Get region
    let region = options.region;
    if (!region && !options.yes) {
      const regions = getRegionsForProvider('gcp');
      const { selectedRegion } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedRegion',
          message: 'Region:',
          choices: regions.map((r) => ({ name: r.name, value: r.value })),
          default: 'us-central1',
        },
      ]);
      region = selectedRegion;
    }
    region = region || 'us-central1';

    // =========================================
    // Step 7: Optional Resources
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.cyan.bold('\n  Step 7: Optional Resources\n'));

    let needsDatabase = false;
    let databaseVersion: string | undefined;
    let needsBucket = false;

    if (!options.yes) {
      const { wantsDatabase } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wantsDatabase',
          message: 'Do you need a database?',
          default: false,
        },
      ]);

      if (wantsDatabase) {
        needsDatabase = true;
        const { dbType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'dbType',
            message: 'Database type:',
            choices: [
              { name: 'PostgreSQL 15', value: 'POSTGRES_15' },
              { name: 'PostgreSQL 14', value: 'POSTGRES_14' },
              { name: 'MySQL 8.0', value: 'MYSQL_8_0' },
            ],
          },
        ]);
        databaseVersion = dbType;
      }

      const { wantsBucket } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wantsBucket',
          message: 'Do you need file storage (bucket)?',
          default: false,
        },
      ]);
      needsBucket = wantsBucket;
    }

    // =========================================
    // Generate Files
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.cyan.bold('\n  Creating project files...\n'));

    const generateSpinner = ora('Generating configuration...').start();

    // Generate config
    const config = generateConfig({
      projectName,
      gcpProjectId: projectId,
      region,
      projectType,
      uiFramework,
      needsDatabase,
      databaseVersion,
      needsBucket,
    });

    // Create .stacksolo directory and state
    await createStacksoloDir(cwd, {
      gcpProjectId: projectId,
      orgPolicyFixed,
      apisEnabled: REQUIRED_APIS,
    });
    generateSpinner.text = 'Created .stacksolo/';

    // Write config file
    await createConfigFile(cwd, config);
    generateSpinner.text = 'Created stacksolo.config.json';

    // Scaffold templates
    const scaffoldedFiles = await scaffoldTemplates(cwd, projectType, uiFramework);
    generateSpinner.succeed('Project files created');

    // Register project in global registry
    const registrySpinner = ora('Registering project...').start();
    try {
      const registry = getRegistry();
      const configPath = path.join(cwd, '.stacksolo', 'stacksolo.config.json');

      // Check if already registered
      const existing = await registry.findProjectByName(projectName);
      if (existing) {
        // Update existing registration
        await registry.updateProject(existing.id, {
          gcpProjectId: projectId,
          region,
          configPath,
        });
        registrySpinner.succeed('Updated project in registry');
      } else {
        await registry.registerProject({
          name: projectName,
          gcpProjectId: projectId,
          region,
          configPath,
        });
        registrySpinner.succeed('Registered project in global registry');
      }
    } catch (error) {
      registrySpinner.warn('Could not register in global registry (non-blocking)');
    }

    // Determine the main directories created based on project type
    const createdDirs: string[] = [];
    if (projectType === 'function-api') {
      createdDirs.push('functions/api');
    } else if (projectType === 'container-api') {
      createdDirs.push('containers/api');
    } else if (projectType === 'function-cron') {
      createdDirs.push('functions/worker');
    } else if (projectType === 'static-api') {
      createdDirs.push('functions/api', 'containers/web');
    } else if (projectType === 'ui-api') {
      createdDirs.push('functions/api', 'apps/web');
    } else if (projectType === 'ui-only') {
      createdDirs.push('apps/web');
    }

    console.log(chalk.green('\n  ✓ Created .stacksolo/'));
    console.log(chalk.green('  ✓ Created stacksolo.config.json'));
    for (const dir of createdDirs) {
      console.log(chalk.green(`  ✓ Created ${dir}/ template`));
    }

    for (const file of scaffoldedFiles) {
      console.log(chalk.gray(`      ${file}`));
    }

    // =========================================
    // Done
    // =========================================
    console.log(chalk.gray('\n─'.repeat(75)));
    console.log(chalk.bold.green('\n  Done! Your project is ready.\n'));

    console.log(chalk.gray('  Next steps:\n'));
    const mainCodeDir = createdDirs[0];
    const mainCodeFile = mainCodeDir.startsWith('apps/') ? 'src/App.tsx' : 'index.ts';
    console.log(chalk.white(`    1. Edit ${mainCodeDir}/${mainCodeFile} with your code`));
    console.log(chalk.white('    2. Run: ') + chalk.cyan('stacksolo deploy'));
    console.log('');
  });
