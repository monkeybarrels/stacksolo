/**
 * stacksolo infra
 *
 * Display an ASCII diagram of the infrastructure and resource names.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';

interface FunctionConfig {
  name: string;
  sourceDir?: string;
  runtime?: string;
  memory?: string;
  entryPoint?: string;
}

interface LoadBalancerConfig {
  name: string;
  routes?: Array<{ path: string; backend: string }>;
}

interface NetworkConfig {
  name: string;
  existing?: boolean;
  loadBalancer?: LoadBalancerConfig;
  functions?: FunctionConfig[];
}

interface ProjectConfig {
  name: string;
  gcpProjectId: string;
  region: string;
  backend?: string;
  networks?: NetworkConfig[];
}

interface StackSoloConfig {
  project: ProjectConfig;
}

export const infraCommand = new Command('infra')
  .description('Display ASCII infrastructure diagram')
  .option('--json', 'Output resource list as JSON')
  .action(async (options) => {
    const cwd = process.cwd();

    // Try to find stacksolo.config.json
    const configPath = path.join(cwd, '.stacksolo', 'stacksolo.config.json');
    let config: StackSoloConfig;

    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(configData) as StackSoloConfig;
    } catch {
      console.log(chalk.red('\n  No stacksolo.config.json found.'));
      console.log(chalk.gray('  Run `stacksolo init` first.\n'));
      return;
    }

    const project = config.project;

    if (options.json) {
      // Output JSON list of resources
      const resources = extractResources(project);
      console.log(JSON.stringify(resources, null, 2));
      return;
    }

    // Print ASCII diagram
    console.log('');
    printInfraDiagram(project);
    console.log('');
  });

interface ResourceInfo {
  type: string;
  name: string;
  details?: string;
}

function extractResources(project: ProjectConfig): ResourceInfo[] {
  const resources: ResourceInfo[] = [];
  const prefix = project.name;

  for (const network of project.networks || []) {
    const networkName = network.existing ? network.name : `${prefix}-${network.name}`;

    // VPC Network
    if (!network.existing) {
      resources.push({
        type: 'vpc_network',
        name: networkName,
        details: 'VPC Network',
      });
    }

    // VPC Connector
    resources.push({
      type: 'vpc_connector',
      name: `${prefix}-connector`,
      details: `VPC Access Connector (${project.region})`,
    });

    // Functions
    for (const fn of network.functions || []) {
      resources.push({
        type: 'cloud_function',
        name: `${prefix}-${fn.name}`,
        details: `Cloud Function Gen2 (${fn.runtime || 'nodejs20'}, ${fn.memory || '256Mi'})`,
      });
    }

    // Load Balancer
    if (network.loadBalancer) {
      resources.push({
        type: 'load_balancer',
        name: `${prefix}-lb`,
        details: 'HTTP Load Balancer',
      });
    }
  }

  return resources;
}

function printInfraDiagram(project: ProjectConfig): void {
  const prefix = project.name;
  const region = project.region;
  const gcpProject = project.gcpProjectId;
  const backend = project.backend || 'pulumi';

  // Header
  console.log(chalk.bold.cyan('  Infrastructure Diagram'));
  console.log(chalk.gray(`  Project: ${prefix} | GCP: ${gcpProject} | Region: ${region} | Backend: ${backend}`));
  console.log('');

  for (const network of project.networks || []) {
    const networkName = network.existing ? network.name : `${prefix}-${network.name}`;
    const hasLb = !!network.loadBalancer;
    const functions = network.functions || [];

    // Internet / Users
    console.log(chalk.gray('                    ┌─────────────┐'));
    console.log(chalk.gray('                    │  ') + chalk.white('Internet') + chalk.gray('  │'));
    console.log(chalk.gray('                    └──────┬──────┘'));
    console.log(chalk.gray('                           │'));

    if (hasLb) {
      // Load Balancer
      const lbName = `${prefix}-lb`;
      console.log(chalk.gray('                           ▼'));
      console.log(chalk.yellow('              ┌────────────────────────┐'));
      console.log(chalk.yellow('              │  ') + chalk.white.bold('HTTP Load Balancer') + chalk.yellow('    │'));
      console.log(chalk.yellow('              │  ') + chalk.gray(lbName) + chalk.yellow(padRight('', 24 - lbName.length - 2) + '│'));
      console.log(chalk.yellow('              └───────────┬────────────┘'));
      console.log(chalk.gray('                          │'));
    }

    // VPC Network box (outer)
    console.log(chalk.blue('    ┌─────────────────────────────────────────────────┐'));
    if (network.existing) {
      console.log(chalk.blue('    │  ') + chalk.white.bold('VPC Network') + chalk.gray(' (existing)') + chalk.blue(padRight('', 24) + '│'));
    } else {
      console.log(chalk.blue('    │  ') + chalk.white.bold('VPC Network') + chalk.blue(padRight('', 35) + '│'));
    }
    console.log(chalk.blue('    │  ') + chalk.gray(networkName) + chalk.blue(padRight('', 47 - networkName.length - 2) + '│'));
    console.log(chalk.blue('    │') + padRight('', 49) + chalk.blue('│'));

    // VPC Connector inside VPC
    const connectorName = `${prefix}-connector`;
    console.log(chalk.blue('    │  ') + chalk.magenta('┌────────────────────────────────────────┐') + chalk.blue('  │'));
    console.log(chalk.blue('    │  ') + chalk.magenta('│  ') + chalk.white('VPC Access Connector') + chalk.magenta(padRight('', 18) + '│') + chalk.blue('  │'));
    console.log(chalk.blue('    │  ') + chalk.magenta('│  ') + chalk.gray(connectorName) + chalk.magenta(padRight('', 38 - connectorName.length - 2) + '│') + chalk.blue('  │'));
    console.log(chalk.blue('    │  ') + chalk.magenta('└───────────────────┬────────────────────┘') + chalk.blue('  │'));
    console.log(chalk.blue('    │') + chalk.gray(padRight('', 23) + '│' + padRight('', 25)) + chalk.blue('│'));

    // Cloud Functions inside VPC
    for (let i = 0; i < functions.length; i++) {
      const fn = functions[i];
      const fnName = `${prefix}-${fn.name}`;
      const runtime = fn.runtime || 'nodejs20';
      const memory = fn.memory || '256Mi';
      const sourceDir = fn.sourceDir || './api';

      if (i === 0) {
        console.log(chalk.blue('    │') + chalk.gray(padRight('', 23) + '▼' + padRight('', 25)) + chalk.blue('│'));
      }

      console.log(chalk.blue('    │  ') + chalk.green('┌────────────────────────────────────────┐') + chalk.blue('  │'));
      console.log(chalk.blue('    │  ') + chalk.green('│  ') + chalk.white.bold('Cloud Function') + chalk.gray(' (Gen2)') + chalk.green(padRight('', 17) + '│') + chalk.blue('  │'));
      console.log(chalk.blue('    │  ') + chalk.green('│  ') + chalk.gray(fnName) + chalk.green(padRight('', 38 - fnName.length - 2) + '│') + chalk.blue('  │'));
      console.log(chalk.blue('    │  ') + chalk.green('│  ') + chalk.gray(`${runtime} | ${memory} | ${sourceDir}`) + chalk.green(padRight('', 38 - `${runtime} | ${memory} | ${sourceDir}`.length - 2) + '│') + chalk.blue('  │'));
      console.log(chalk.blue('    │  ') + chalk.green('└────────────────────────────────────────┘') + chalk.blue('  │'));
    }

    console.log(chalk.blue('    │') + padRight('', 49) + chalk.blue('│'));
    console.log(chalk.blue('    └─────────────────────────────────────────────────┘'));
  }

  // Summary
  console.log('');
  console.log(chalk.gray('  Resources:'));

  const resources = extractResources(project);
  for (const r of resources) {
    const icon = getResourceIcon(r.type);
    console.log(chalk.gray(`    ${icon} ${r.name}`));
  }
}

function getResourceIcon(type: string): string {
  switch (type) {
    case 'vpc_network':
      return chalk.blue('◈');
    case 'vpc_connector':
      return chalk.magenta('◇');
    case 'cloud_function':
      return chalk.green('λ');
    case 'load_balancer':
      return chalk.yellow('⚡');
    default:
      return chalk.gray('•');
  }
}

function padRight(str: string, len: number): string {
  if (str.length >= len) return str;
  return str + ' '.repeat(len - str.length);
}
