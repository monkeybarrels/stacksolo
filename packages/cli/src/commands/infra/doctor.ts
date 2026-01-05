/**
 * stacksolo doctor
 *
 * Run health checks to verify your development environment and GCP setup.
 * Identifies issues before they cause deploy failures.
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

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

export const doctorCommand = new Command('doctor')
  .description('Check system prerequisites and GCP configuration')
  .option('--fix', 'Attempt to fix issues automatically')
  .option('--verbose', 'Show detailed output for each check')
  .action(async (options) => {
    await runDoctor(options);
  });

interface DoctorOptions {
  fix?: boolean;
  verbose?: boolean;
}

async function runDoctor(options: DoctorOptions): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Doctor\n'));
  console.log(chalk.gray('  Checking your development environment...\n'));

  const results: CheckResult[] = [];

  // 1. Check Node.js version
  const nodeResult = await checkNode(options);
  results.push(nodeResult);
  displayResult(nodeResult, options.verbose);

  // 2. Check Terraform
  const terraformResult = await checkTerraform(options);
  results.push(terraformResult);
  displayResult(terraformResult, options.verbose);

  // 3. Check Docker
  const dockerResult = await checkDocker(options);
  results.push(dockerResult);
  displayResult(dockerResult, options.verbose);

  // 4. Check gcloud CLI
  const gcloudResult = await checkGcloud(options);
  results.push(gcloudResult);
  displayResult(gcloudResult, options.verbose);

  // 5. Check GCP authentication
  const gcpAuthResult = await checkGcpAuth(options);
  results.push(gcpAuthResult);
  displayResult(gcpAuthResult, options.verbose);

  // 6. Check project config (if exists)
  const configResult = await checkConfig(options);
  if (configResult) {
    results.push(configResult);
    displayResult(configResult, options.verbose);

    // 7. Check GCP project access (only if config exists)
    const projectAccessResult = await checkGcpProjectAccess(options);
    if (projectAccessResult) {
      results.push(projectAccessResult);
      displayResult(projectAccessResult, options.verbose);
    }

    // 8. Check required APIs (only if config exists)
    const apisResult = await checkRequiredApis(options);
    if (apisResult) {
      results.push(apisResult);
      displayResult(apisResult, options.verbose);
    }
  }

  // Summary
  console.log(chalk.bold('\n  Summary\n'));

  const passed = results.filter((r) => r.status === 'ok').length;
  const warnings = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(chalk.green(`  ✓ ${passed} checks passed`));
  if (warnings > 0) {
    console.log(chalk.yellow(`  ⚠ ${warnings} warnings`));
  }
  if (failed > 0) {
    console.log(chalk.red(`  ✗ ${failed} checks failed`));
  }

  // Show fixes if there are issues
  if (failed > 0 || warnings > 0) {
    console.log(chalk.bold('\n  Recommended Actions\n'));

    for (const result of results) {
      if ((result.status === 'fail' || result.status === 'warn') && result.fix) {
        console.log(chalk.gray(`  ${result.name}:`));
        console.log(chalk.cyan(`    ${result.fix}\n`));
      }
    }
  }

  if (failed === 0) {
    console.log(chalk.green('\n  Your environment is ready for StackSolo!\n'));
  } else {
    console.log(chalk.yellow('\n  Please fix the issues above before deploying.\n'));
    process.exit(1);
  }
}

function displayResult(result: CheckResult, verbose?: boolean): void {
  const icon =
    result.status === 'ok' ? chalk.green('✓') :
    result.status === 'warn' ? chalk.yellow('⚠') :
    chalk.red('✗');

  const color =
    result.status === 'ok' ? chalk.white :
    result.status === 'warn' ? chalk.yellow :
    chalk.red;

  console.log(`  ${icon} ${color(result.name)}`);

  if (verbose || result.status !== 'ok') {
    console.log(chalk.gray(`    ${result.message}`));
  }
}

async function checkNode(_options: DoctorOptions): Promise<CheckResult> {
  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim().replace('v', '');
    const major = parseInt(version.split('.')[0], 10);

    if (major >= 18) {
      return {
        name: 'Node.js',
        status: 'ok',
        message: `Version ${version} installed`,
      };
    } else if (major >= 16) {
      return {
        name: 'Node.js',
        status: 'warn',
        message: `Version ${version} - recommend 18+`,
        fix: 'nvm install 18 && nvm use 18',
      };
    } else {
      return {
        name: 'Node.js',
        status: 'fail',
        message: `Version ${version} - requires 18+`,
        fix: 'nvm install 18 && nvm use 18',
      };
    }
  } catch {
    return {
      name: 'Node.js',
      status: 'fail',
      message: 'Not installed',
      fix: 'Install Node.js 18+ from https://nodejs.org',
    };
  }
}

async function checkTerraform(_options: DoctorOptions): Promise<CheckResult> {
  try {
    const { stdout } = await execAsync('terraform version -json');
    const data = JSON.parse(stdout);
    const version = data.terraform_version;

    return {
      name: 'Terraform',
      status: 'ok',
      message: `Version ${version} installed`,
    };
  } catch {
    try {
      // Try non-JSON format for older versions
      const { stdout } = await execAsync('terraform version');
      const match = stdout.match(/Terraform v(\d+\.\d+\.\d+)/);
      if (match) {
        return {
          name: 'Terraform',
          status: 'ok',
          message: `Version ${match[1]} installed`,
        };
      }
    } catch {
      // Fall through to fail
    }

    return {
      name: 'Terraform',
      status: 'fail',
      message: 'Not installed',
      fix: 'brew install terraform  # or https://terraform.io/downloads',
    };
  }
}

async function checkDocker(_options: DoctorOptions): Promise<CheckResult> {
  try {
    const { stdout } = await execAsync('docker --version');
    const match = stdout.match(/Docker version (\d+\.\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';

    // Check if Docker daemon is running
    try {
      await execAsync('docker info', { timeout: 5000 });
      return {
        name: 'Docker',
        status: 'ok',
        message: `Version ${version} installed and running`,
      };
    } catch {
      return {
        name: 'Docker',
        status: 'warn',
        message: `Version ${version} installed but daemon not running`,
        fix: 'Start Docker Desktop or run: sudo systemctl start docker',
      };
    }
  } catch {
    return {
      name: 'Docker',
      status: 'warn',
      message: 'Not installed (required for container deployments)',
      fix: 'Install Docker from https://docker.com',
    };
  }
}

async function checkGcloud(_options: DoctorOptions): Promise<CheckResult> {
  try {
    const { stdout } = await execAsync('gcloud version --format=json');
    const data = JSON.parse(stdout);
    const version = data['Google Cloud SDK'];

    return {
      name: 'gcloud CLI',
      status: 'ok',
      message: `Version ${version} installed`,
    };
  } catch {
    return {
      name: 'gcloud CLI',
      status: 'fail',
      message: 'Not installed',
      fix: 'Install from https://cloud.google.com/sdk/docs/install',
    };
  }
}

async function checkGcpAuth(_options: DoctorOptions): Promise<CheckResult> {
  try {
    // Check if authenticated
    const { stdout } = await execAsync('gcloud auth list --format=json');
    const accounts = JSON.parse(stdout);

    if (accounts.length === 0) {
      return {
        name: 'GCP Authentication',
        status: 'fail',
        message: 'No accounts authenticated',
        fix: 'gcloud auth login',
      };
    }

    const active = accounts.find((a: { status: string }) => a.status === 'ACTIVE');
    if (!active) {
      return {
        name: 'GCP Authentication',
        status: 'fail',
        message: 'No active account',
        fix: 'gcloud auth login',
      };
    }

    // Check application-default credentials
    try {
      await execAsync('gcloud auth application-default print-access-token', { timeout: 5000 });
      return {
        name: 'GCP Authentication',
        status: 'ok',
        message: `Authenticated as ${active.account}`,
      };
    } catch {
      return {
        name: 'GCP Authentication',
        status: 'warn',
        message: `Logged in as ${active.account} but missing application-default credentials`,
        fix: 'gcloud auth application-default login',
      };
    }
  } catch {
    return {
      name: 'GCP Authentication',
      status: 'fail',
      message: 'Could not check authentication status',
      fix: 'gcloud auth login',
    };
  }
}

async function checkConfig(_options: DoctorOptions): Promise<CheckResult | null> {
  const configPath = path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);

  try {
    await fs.access(configPath);
    const config = parseConfig(configPath);

    return {
      name: 'Project Config',
      status: 'ok',
      message: `Project: ${config.project.name} (${config.project.gcpProjectId})`,
    };
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('ENOENT')) {
      return {
        name: 'Project Config',
        status: 'warn',
        message: 'No stacksolo.config.json found (run from project directory)',
        fix: 'cd <project-dir> && stacksolo init',
      };
    }

    return {
      name: 'Project Config',
      status: 'fail',
      message: `Config parse error: ${errorStr.slice(0, 100)}`,
      fix: 'Check .stacksolo/stacksolo.config.json syntax',
    };
  }
}

async function checkGcpProjectAccess(_options: DoctorOptions): Promise<CheckResult | null> {
  const configPath = path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);

  try {
    const config = parseConfig(configPath);
    const projectId = config.project.gcpProjectId;

    // Check if we can access the project
    const { stdout } = await execAsync(
      `gcloud projects describe ${projectId} --format="value(projectId)"`,
      { timeout: 10000 }
    );

    if (stdout.trim() === projectId) {
      return {
        name: 'GCP Project Access',
        status: 'ok',
        message: `Access to ${projectId} confirmed`,
      };
    }

    return {
      name: 'GCP Project Access',
      status: 'fail',
      message: `Cannot access project ${projectId}`,
      fix: `Verify project exists and you have access: gcloud projects describe ${projectId}`,
    };
  } catch (error) {
    const errorStr = String(error);

    if (errorStr.includes('not found') || errorStr.includes('403')) {
      return {
        name: 'GCP Project Access',
        status: 'fail',
        message: 'Project not found or access denied',
        fix: 'Check the gcpProjectId in your config and ensure you have access',
      };
    }

    return null;
  }
}

async function checkRequiredApis(_options: DoctorOptions): Promise<CheckResult | null> {
  const configPath = path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);

  try {
    const config = parseConfig(configPath);
    const projectId = config.project.gcpProjectId;

    // Core APIs that should be enabled
    const requiredApis = [
      'cloudfunctions.googleapis.com',
      'run.googleapis.com',
      'cloudbuild.googleapis.com',
      'artifactregistry.googleapis.com',
    ];

    // Get list of enabled APIs
    const { stdout } = await execAsync(
      `gcloud services list --project=${projectId} --enabled --format="value(NAME)"`,
      { timeout: 30000 }
    );

    const enabledApis = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    const missingApis = requiredApis.filter((api) => !enabledApis.includes(api));

    if (missingApis.length === 0) {
      return {
        name: 'GCP APIs',
        status: 'ok',
        message: 'Required APIs are enabled',
      };
    }

    return {
      name: 'GCP APIs',
      status: 'warn',
      message: `Missing APIs: ${missingApis.join(', ')}`,
      fix: `gcloud services enable ${missingApis.join(' ')} --project=${projectId}`,
    };
  } catch {
    return null;
  }
}
