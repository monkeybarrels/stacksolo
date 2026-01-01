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

export const initCommand = new Command('init')
  .description('Initialize a new StackSolo project')
  .option('-n, --name <name>', 'Project name')
  .option('--project-id <id>', 'GCP project ID')
  .option('-r, --region <region>', 'Region')
  .option('-t, --template <template>', 'Project template (function-api, container-api, function-cron, static-api)')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--skip-org-policy', 'Skip org policy check and fix')
  .option('--skip-apis', 'Skip enabling GCP APIs')
  .action(async (options) => {
    const cwd = process.cwd();

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
