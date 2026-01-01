/**
 * stacksolo dev
 *
 * Start a local Kubernetes development environment via OrbStack
 * that mirrors the production GCP stack.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { StackSoloConfig } from '@stacksolo/blueprint';
import { generateK8sManifests, writeK8sManifests } from '../../generators/k8s';
import { sanitizeNamespaceName } from '../../generators/k8s/namespace';

// Track port-forward processes for cleanup
const portForwardProcesses: ChildProcess[] = [];

const K8S_OUTPUT_DIR = '.stacksolo/k8s';
const CONFIG_FILE = '.stacksolo/stacksolo.config.json';

export const devCommand = new Command('dev')
  .description('Start local Kubernetes development environment')
  .option('--stop', 'Stop and tear down the environment')
  .option('--status', 'Show status of running pods')
  .option('--routes', 'Show gateway routes and services')
  .option('--describe [resource]', 'Describe K8s resources (pods, services, all)')
  .option('--logs [service]', 'Tail logs (all pods or specific service)')
  .option('--rebuild', 'Force regenerate manifests before starting')
  .option('--no-emulators', 'Skip Firebase/Pub/Sub emulators')
  .action(async (options) => {
    try {
      // Handle subcommands
      if (options.stop) {
        await stopEnvironment();
        return;
      }

      if (options.status) {
        await showStatus();
        return;
      }

      if (options.routes) {
        await showRoutes();
        return;
      }

      if (options.describe !== undefined) {
        const resource = typeof options.describe === 'string' ? options.describe : 'all';
        await describeResources(resource);
        return;
      }

      if (options.logs !== undefined) {
        const service = typeof options.logs === 'string' ? options.logs : undefined;
        await tailLogs(service);
        return;
      }

      // Start the environment
      await startEnvironment({
        rebuild: options.rebuild,
        includeEmulators: options.emulators !== false,
      });
    } catch (error) {
      console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
      process.exit(1);
    }
  });

/**
 * Check if required tools are available
 */
async function checkPrerequisites(): Promise<void> {
  const spinner = ora('Checking prerequisites...').start();

  // Check kubectl
  try {
    execSync('kubectl version --client --short 2>/dev/null || kubectl version --client', {
      stdio: 'pipe',
    });
  } catch {
    spinner.fail('kubectl not found');
    console.log(chalk.gray('\n  Install OrbStack: brew install orbstack'));
    console.log(chalk.gray('  Or install kubectl: brew install kubectl\n'));
    throw new Error('kubectl is required but not found');
  }

  // Check if Kubernetes is available (OrbStack or other)
  try {
    execSync('kubectl cluster-info 2>/dev/null', { stdio: 'pipe' });
  } catch {
    spinner.fail('Kubernetes cluster not available');
    console.log(chalk.gray('\n  If using OrbStack, enable Kubernetes in preferences'));
    console.log(chalk.gray('  Settings → Kubernetes → Enable Kubernetes\n'));
    throw new Error('Kubernetes cluster not available');
  }

  spinner.succeed('Prerequisites met');
}

/**
 * Load and validate config
 */
async function loadConfig(): Promise<StackSoloConfig> {
  const configPath = path.resolve(process.cwd(), CONFIG_FILE);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as StackSoloConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Config not found: ${CONFIG_FILE}\n  Run 'stacksolo init' first.`);
    }
    throw new Error(`Failed to parse config: ${error}`);
  }
}

/**
 * Validate source directories exist
 */
async function validateSourceDirs(config: StackSoloConfig): Promise<string[]> {
  const warnings: string[] = [];
  const projectRoot = process.cwd();

  // Check kernel directory if configured
  if (config.project.kernel) {
    const kernelDir = path.join(projectRoot, 'containers', config.project.kernel.name);
    try {
      await fs.access(kernelDir);
    } catch {
      warnings.push(`Kernel directory not found: containers/${config.project.kernel.name}/`);
    }
  }

  for (const network of config.project.networks || []) {
    // Check function directories
    for (const func of network.functions || []) {
      const funcDir = path.join(projectRoot, 'functions', func.name);
      try {
        await fs.access(funcDir);
      } catch {
        warnings.push(`Function directory not found: functions/${func.name}/`);
      }
    }

    // Check UI directories
    for (const ui of network.uis || []) {
      const uiDir = path.join(projectRoot, 'ui', ui.name);
      try {
        await fs.access(uiDir);
      } catch {
        warnings.push(`UI directory not found: ui/${ui.name}/`);
      }
    }
  }

  return warnings;
}

/**
 * Build kernel Docker image from containers/kernel
 */
async function buildKernelImage(config: StackSoloConfig): Promise<boolean> {
  if (!config.project.kernel) {
    return false;
  }

  const kernelName = config.project.kernel.name;
  const kernelDir = path.join(process.cwd(), 'containers', kernelName);

  // Check if kernel directory exists
  try {
    await fs.access(kernelDir);
  } catch {
    return false;
  }

  const spinner = ora(`Building kernel image from containers/${kernelName}...`).start();

  try {
    // Install dependencies first
    execSync('npm install', { cwd: kernelDir, stdio: 'pipe' });

    // Build TypeScript
    execSync('npm run build', { cwd: kernelDir, stdio: 'pipe' });

    // Build Docker image
    execSync(`docker build -t ${kernelName}:dev .`, { cwd: kernelDir, stdio: 'pipe' });

    // Load into Kubernetes (OrbStack automatically shares Docker images)
    spinner.succeed(`Kernel image built: ${kernelName}:dev`);
    return true;
  } catch (error) {
    spinner.fail(`Failed to build kernel image`);
    console.log(chalk.gray(`    Error: ${error instanceof Error ? error.message : error}`));
    return false;
  }
}

/**
 * Start the development environment
 */
async function startEnvironment(options: {
  rebuild?: boolean;
  includeEmulators?: boolean;
}): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev Environment\n'));

  // 1. Check prerequisites
  await checkPrerequisites();

  // 2. Load config
  const spinner = ora('Loading configuration...').start();
  const config = await loadConfig();
  const projectName = config.project.name;
  const namespace = sanitizeNamespaceName(projectName);
  spinner.succeed(`Project: ${projectName}`);

  // 3. Validate source directories
  const warnings = await validateSourceDirs(config);
  if (warnings.length > 0) {
    console.log(chalk.yellow('\n  Warnings:'));
    for (const warning of warnings) {
      console.log(chalk.yellow(`    • ${warning}`));
    }
    console.log('');
  }

  // 4. Build kernel image if configured
  await buildKernelImage(config);

  // 5. Generate K8s manifests
  const genSpinner = ora('Generating Kubernetes manifests...').start();
  const outputDir = path.resolve(process.cwd(), K8S_OUTPUT_DIR);

  const result = generateK8sManifests({
    config,
    projectRoot: process.cwd(),
    includeEmulators: options.includeEmulators,
  });

  await writeK8sManifests(result.manifests, outputDir);
  genSpinner.succeed(`Generated ${result.manifests.length} manifests to ${K8S_OUTPUT_DIR}/`);

  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`    ⚠ ${warning}`));
    }
  }

  // 5. Apply manifests (namespace first, then everything else)
  const applySpinner = ora('Applying Kubernetes manifests...').start();
  try {
    // Apply namespace first to ensure it exists
    execSync(`kubectl apply -f ${outputDir}/namespace.yaml`, { stdio: 'pipe' });
    // Then apply all other manifests
    execSync(`kubectl apply -f ${outputDir}`, { stdio: 'pipe' });
    applySpinner.succeed('Manifests applied');
  } catch (error) {
    applySpinner.fail('Failed to apply manifests');
    throw error;
  }

  // 6. Wait for pods to be ready
  const readySpinner = ora('Waiting for pods to be ready...').start();
  try {
    execSync(
      `kubectl wait --for=condition=ready pod --all -n ${namespace} --timeout=120s`,
      { stdio: 'pipe' }
    );
    readySpinner.succeed('All pods ready');
  } catch {
    readySpinner.warn('Some pods may not be ready yet');
  }

  // 7. Set up port forwarding
  const portForwardSpinner = ora('Setting up port forwarding...').start();
  const portMappings = await setupPortForwarding(namespace, config);
  portForwardSpinner.succeed('Port forwarding active');

  // 8. Print access information
  console.log(chalk.bold('\n  Services running:\n'));

  // Get pod status
  try {
    const podStatus = execSync(
      `kubectl get pods -n ${namespace} -o wide --no-headers`,
      { encoding: 'utf-8' }
    );

    for (const line of podStatus.trim().split('\n')) {
      const parts = line.split(/\s+/);
      const name = parts[0];
      const status = parts[2];
      const statusColor = status === 'Running' ? chalk.green : chalk.yellow;
      console.log(`    ${statusColor('●')} ${name.padEnd(30)} ${statusColor(status)}`);
    }
  } catch {
    console.log(chalk.gray('    Unable to get pod status'));
  }

  // Print access URLs
  console.log(chalk.bold('\n  Access:\n'));
  for (const mapping of portMappings) {
    const url = mapping.protocol === 'http'
      ? `http://localhost:${mapping.localPort}`
      : `localhost:${mapping.localPort}`;
    console.log(`    ${chalk.cyan(mapping.name.padEnd(20))} ${url}`);
  }

  console.log(chalk.bold('\n  Commands:\n'));
  console.log(chalk.gray('    stacksolo dev --logs       Tail all logs'));
  console.log(chalk.gray('    stacksolo dev --status     Show pod status'));
  console.log(chalk.gray('    stacksolo dev --stop       Stop environment'));

  console.log('');

  // Setup graceful shutdown
  const cleanup = async () => {
    console.log(chalk.gray('\n  Shutting down...\n'));

    // Kill all port-forward processes
    for (const proc of portForwardProcesses) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Ignore
      }
    }

    try {
      execSync(`kubectl delete namespace ${namespace}`, { stdio: 'pipe' });
      console.log(chalk.green('  Environment stopped\n'));
    } catch {
      // Ignore errors on cleanup
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep process running
  console.log(chalk.gray('  Press Ctrl+C to stop\n'));
  await new Promise(() => {
    // Keep alive
  });
}

interface PortMapping {
  name: string;
  service: string;
  localPort: number;
  targetPort: number;
  protocol: 'http' | 'tcp';
}

/**
 * Set up port forwarding for all services
 */
async function setupPortForwarding(
  namespace: string,
  config: StackSoloConfig
): Promise<PortMapping[]> {
  const portMappings: PortMapping[] = [];

  // Firebase emulator ports
  portMappings.push(
    { name: 'Firebase UI', service: 'firebase-emulator', localPort: 4000, targetPort: 4000, protocol: 'http' },
    { name: 'Firestore', service: 'firebase-emulator', localPort: 8080, targetPort: 8080, protocol: 'tcp' },
    { name: 'Firebase Auth', service: 'firebase-emulator', localPort: 9099, targetPort: 9099, protocol: 'tcp' }
  );

  // Pub/Sub emulator
  portMappings.push(
    { name: 'Pub/Sub', service: 'pubsub-emulator', localPort: 8085, targetPort: 8085, protocol: 'tcp' }
  );

  // Kernel ports (if configured)
  if (config.project.kernel) {
    const kernelName = config.project.kernel.name;
    portMappings.push(
      { name: 'Kernel HTTP', service: kernelName, localPort: 8090, targetPort: 8090, protocol: 'http' },
      { name: 'Kernel NATS', service: kernelName, localPort: 4222, targetPort: 4222, protocol: 'tcp' }
    );
  }

  // Dynamic ports for functions and UIs from config
  let functionPort = 8081;
  let uiPort = 3000;

  for (const network of config.project.networks || []) {
    for (const func of network.functions || []) {
      portMappings.push({
        name: `Function: ${func.name}`,
        service: func.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        localPort: functionPort,
        targetPort: functionPort,
        protocol: 'http',
      });
      functionPort++;
    }

    for (const ui of network.uis || []) {
      portMappings.push({
        name: `UI: ${ui.name}`,
        service: ui.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        localPort: uiPort,
        targetPort: uiPort,
        protocol: 'http',
      });
      uiPort++;
    }
  }

  // Start port-forward for each service
  for (const mapping of portMappings) {
    try {
      const proc = spawn(
        'kubectl',
        ['port-forward', '-n', namespace, `svc/${mapping.service}`, `${mapping.localPort}:${mapping.targetPort}`],
        { stdio: 'pipe', detached: false }
      );

      portForwardProcesses.push(proc);

      // Handle errors silently (service might not exist)
      proc.on('error', () => {});
    } catch {
      // Ignore errors for individual port forwards
    }
  }

  // Port-forward gateway for unified load balancer access
  const hasGateway = config.project.networks?.some((n) => n.loadBalancer?.routes);
  if (hasGateway) {
    try {
      const gatewayProc = spawn(
        'kubectl',
        ['port-forward', '-n', namespace, 'svc/gateway', '8000:8000'],
        { stdio: 'pipe', detached: false }
      );
      portForwardProcesses.push(gatewayProc);

      // Log stderr for debugging port-forward failures
      gatewayProc.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('Forwarding from')) {
          console.log(chalk.yellow(`    Gateway port-forward: ${msg}`));
        }
      });
      gatewayProc.on('error', (err) => {
        console.log(chalk.yellow(`    Gateway port-forward error: ${err.message}`));
      });

      // Add gateway to the mappings for display
      portMappings.unshift({
        name: 'Load Balancer',
        service: 'gateway',
        localPort: 8000,
        targetPort: 8000,
        protocol: 'http',
      });
    } catch {
      // Gateway may not exist
    }
  }

  // Give port forwards a moment to establish
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return portMappings;
}

/**
 * Stop and tear down the environment
 */
async function stopEnvironment(): Promise<void> {
  console.log(chalk.bold('\n  Stopping StackSolo Dev Environment\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  const spinner = ora(`Deleting namespace ${namespace}...`).start();
  try {
    execSync(`kubectl delete namespace ${namespace}`, { stdio: 'pipe' });
    spinner.succeed('Environment stopped');
  } catch {
    spinner.warn('Namespace may not exist or already deleted');
  }

  console.log('');
}

/**
 * Show status of running pods
 */
async function showStatus(): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev Status\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  try {
    // Pods
    console.log(chalk.bold('  Pods:\n'));
    const pods = execSync(`kubectl get pods -n ${namespace} -o wide`, { encoding: 'utf-8' });
    console.log(pods.split('\n').map((l) => '    ' + l).join('\n'));

    // Services
    console.log(chalk.bold('\n  Services:\n'));
    const services = execSync(`kubectl get services -n ${namespace}`, { encoding: 'utf-8' });
    console.log(services.split('\n').map((l) => '    ' + l).join('\n'));

    // Ingress
    console.log(chalk.bold('\n  Ingress:\n'));
    const ingress = execSync(`kubectl get ingress -n ${namespace}`, { encoding: 'utf-8' });
    console.log(ingress.split('\n').map((l) => '    ' + l).join('\n'));
  } catch {
    console.log(chalk.yellow(`  No resources found in namespace ${namespace}`));
    console.log(chalk.gray('  Run "stacksolo dev" to start the environment\n'));
  }

  console.log('');
}

/**
 * Show gateway routes and services from config
 */
async function showRoutes(): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Gateway Routes\n'));

  const config = await loadConfig();

  // Show kernel if configured
  if (config.project.kernel) {
    console.log(chalk.bold('  Kernel:\n'));
    console.log(`    ${chalk.cyan('●')} ${config.project.kernel.name}`);
    console.log(chalk.gray(`      Source: containers/${config.project.kernel.name}/`));
    console.log('');
  }

  // Show networks with their routes
  for (const network of config.project.networks || []) {
    console.log(chalk.bold(`  Network: ${network.name}\n`));

    // Functions
    if (network.functions && network.functions.length > 0) {
      console.log(chalk.bold('    Functions:'));
      for (const func of network.functions) {
        console.log(`      ${chalk.green('λ')} ${func.name}`);
        console.log(chalk.gray(`        Source: functions/${func.name}/`));
      }
      console.log('');
    }

    // Containers
    if (network.containers && network.containers.length > 0) {
      console.log(chalk.bold('    Containers:'));
      for (const container of network.containers) {
        console.log(`      ${chalk.blue('◼')} ${container.name}`);
        console.log(chalk.gray(`        Source: containers/${container.name}/`));
      }
      console.log('');
    }

    // UIs
    if (network.uis && network.uis.length > 0) {
      console.log(chalk.bold('    UIs:'));
      for (const ui of network.uis) {
        console.log(`      ${chalk.magenta('◆')} ${ui.name}`);
        console.log(chalk.gray(`        Source: ui/${ui.name}/`));
      }
      console.log('');
    }

    // Load balancer routes
    if (network.loadBalancer?.routes && network.loadBalancer.routes.length > 0) {
      console.log(chalk.bold('    Gateway Routes:'));
      console.log(chalk.gray('      Path                    → Backend'));
      console.log(chalk.gray('      ' + '─'.repeat(50)));
      for (const route of network.loadBalancer.routes) {
        const pathPadded = route.path.padEnd(24);
        console.log(`      ${chalk.yellow(pathPadded)} → ${route.backend}`);
      }
      console.log('');
    }
  }

  console.log(chalk.bold('  Local Access:\n'));
  console.log(`    ${chalk.cyan('Gateway:')}        http://localhost:8000`);
  console.log('');
}

/**
 * Describe K8s resources in detail
 */
async function describeResources(resource: string): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev - Resource Details\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  try {
    const indent = (text: string) => text.split('\n').map((l) => '    ' + l).join('\n');

    if (resource === 'all' || resource === 'pods') {
      console.log(chalk.bold.cyan('  ═══ Pods ═══\n'));
      const pods = execSync(`kubectl describe pods -n ${namespace}`, { encoding: 'utf-8' });
      console.log(indent(pods));
    }

    if (resource === 'all' || resource === 'services') {
      console.log(chalk.bold.cyan('\n  ═══ Services ═══\n'));
      const services = execSync(`kubectl describe services -n ${namespace}`, { encoding: 'utf-8' });
      console.log(indent(services));
    }

    if (resource === 'all' || resource === 'deployments') {
      console.log(chalk.bold.cyan('\n  ═══ Deployments ═══\n'));
      const deployments = execSync(`kubectl describe deployments -n ${namespace}`, { encoding: 'utf-8' });
      console.log(indent(deployments));
    }

    if (resource === 'all' || resource === 'ingress') {
      console.log(chalk.bold.cyan('\n  ═══ Ingress ═══\n'));
      try {
        const ingress = execSync(`kubectl describe ingress -n ${namespace}`, { encoding: 'utf-8' });
        console.log(indent(ingress));
      } catch {
        console.log(chalk.gray('    No ingress resources found'));
      }
    }

    if (resource === 'all' || resource === 'configmaps') {
      console.log(chalk.bold.cyan('\n  ═══ ConfigMaps ═══\n'));
      const configmaps = execSync(`kubectl describe configmaps -n ${namespace}`, { encoding: 'utf-8' });
      console.log(indent(configmaps));
    }

    // If a specific pod/service name was given
    if (!['all', 'pods', 'services', 'deployments', 'ingress', 'configmaps'].includes(resource)) {
      console.log(chalk.bold.cyan(`  ═══ ${resource} ═══\n`));
      try {
        // Try as pod first
        const podDesc = execSync(`kubectl describe pod/${resource} -n ${namespace} 2>/dev/null || kubectl describe deployment/${resource} -n ${namespace} 2>/dev/null || kubectl describe service/${resource} -n ${namespace}`, { encoding: 'utf-8' });
        console.log(indent(podDesc));
      } catch {
        console.log(chalk.yellow(`    Resource '${resource}' not found`));
        console.log(chalk.gray('\n    Available options: all, pods, services, deployments, ingress, configmaps'));
        console.log(chalk.gray('    Or specify a resource name like: --describe api'));
      }
    }
  } catch {
    console.log(chalk.yellow(`  No resources found in namespace ${namespace}`));
    console.log(chalk.gray('  Run "stacksolo dev" to start the environment\n'));
  }

  console.log('');
}

/**
 * Tail logs from pods
 */
async function tailLogs(service?: string): Promise<void> {
  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  console.log(chalk.bold('\n  StackSolo Dev Logs\n'));
  console.log(chalk.gray('  Press Ctrl+C to stop\n'));

  const args = service
    ? ['logs', '-f', '-n', namespace, '-l', `app.kubernetes.io/name=${service}`]
    : ['logs', '-f', '-n', namespace, '--all-containers', '-l', 'app.kubernetes.io/managed-by=stacksolo'];

  const child = spawn('kubectl', args, { stdio: 'inherit' });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
