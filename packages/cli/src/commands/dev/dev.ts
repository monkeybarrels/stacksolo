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
import { loadPlugins, getPluginService, getServiceSourcePath } from '../../services/plugin-loader.service';

// =============================================================================
// Kernel Configuration Helper
// =============================================================================

interface KernelDevConfig {
  name: string;
  type: 'nats' | 'gcp';
  serviceName: string;  // Plugin service name for getPluginService()
  httpPort: number;
  natsPort?: number;    // Only for NATS kernel
  healthPath: string;
}

/**
 * Get unified kernel configuration from either kernel or gcpKernel config.
 * Returns null if no kernel is configured.
 */
function getKernelConfig(config: StackSoloConfig): KernelDevConfig | null {
  if (config.project.kernel) {
    return {
      name: config.project.kernel.name,
      type: 'nats',
      serviceName: 'kernel',
      httpPort: 8090,
      natsPort: 4222,
      healthPath: '/health',
    };
  }

  if (config.project.gcpKernel) {
    return {
      name: config.project.gcpKernel.name,
      type: 'gcp',
      serviceName: 'gcp-kernel',
      httpPort: 8080,
      healthPath: '/health',
    };
  }

  return null;
}

// Track port-forward processes for cleanup
const portForwardProcesses: ChildProcess[] = [];

// Track web admin process
let webAdminProcess: ChildProcess | null = null;

// Flag to prevent restart during shutdown
let isShuttingDown = false;

const K8S_OUTPUT_DIR = '.stacksolo/k8s';
const CONFIG_FILE = '.stacksolo/stacksolo.config.json';

export const devCommand = new Command('dev')
  .description('Start local Kubernetes development environment')
  .option('--stop', 'Stop and tear down the environment')
  .option('--status', 'Show status of running pods with health')
  .option('--health', 'Check health of all services')
  .option('--ports', 'Show port-forward status')
  .option('--restart [service]', 'Restart port-forwards or specific service pod')
  .option('--service-names', 'List service names for use with other commands')
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

      if (options.health) {
        await checkHealth();
        return;
      }

      if (options.ports) {
        await showPorts();
        return;
      }

      if (options.restart !== undefined) {
        const service = typeof options.restart === 'string' ? options.restart : undefined;
        await restartService(service);
        return;
      }

      if (options.serviceNames) {
        await showServiceNames();
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

  // Check kernel directory if configured (only for local containers, plugins handle their own source)
  const validateKernelConfig = getKernelConfig(config);
  if (validateKernelConfig) {
    // Only warn for containers dir if plugin service doesn't provide the source
    const kernelService = getPluginService(validateKernelConfig.serviceName);
    const pluginSourcePath = kernelService ? getServiceSourcePath(kernelService) : null;
    if (!pluginSourcePath) {
      const kernelDir = path.join(projectRoot, 'containers', validateKernelConfig.name);
      try {
        await fs.access(kernelDir);
      } catch {
        warnings.push(`Kernel directory not found: containers/${validateKernelConfig.name}/`);
      }
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
 * Start the web admin UI if enabled in config
 */
async function startWebAdmin(config: StackSoloConfig): Promise<number | null> {
  const webAdmin = config.project.webAdmin;
  if (!webAdmin?.enabled) {
    return null;
  }

  const port = webAdmin.port || 3000;
  const spinner = ora(`Starting web admin on port ${port}...`).start();

  try {
    // Try to find the web-admin app in the plugin
    const webAdminService = getPluginService('web-admin');
    let appDir: string | null = null;

    if (webAdminService) {
      const sourcePath = getServiceSourcePath(webAdminService);
      if (sourcePath) {
        appDir = sourcePath;
      }
    }

    // Fall back to node_modules if not found in plugin
    if (!appDir) {
      // Try to find in node_modules
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', '@stacksolo', 'plugin-web-admin', 'app');
      try {
        await fs.access(nodeModulesPath);
        appDir = nodeModulesPath;
      } catch {
        // Not installed
      }
    }

    if (!appDir) {
      spinner.warn('Web admin not found - install @stacksolo/plugin-web-admin or add to plugins');
      return null;
    }

    // Check if app is built
    const buildDir = path.join(appDir, 'build');
    let useDevMode = false;
    try {
      await fs.access(buildDir);
    } catch {
      // No build, use dev mode
      useDevMode = true;
    }

    const projectPath = process.cwd();

    if (useDevMode) {
      // Run in dev mode
      webAdminProcess = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
        cwd: appDir,
        env: {
          ...process.env,
          STACKSOLO_PROJECT_PATH: projectPath,
          PORT: String(port),
        },
        stdio: 'pipe',
        detached: false,
      });
    } else {
      // Run production build
      webAdminProcess = spawn('node', ['build'], {
        cwd: appDir,
        env: {
          ...process.env,
          STACKSOLO_PROJECT_PATH: projectPath,
          PORT: String(port),
        },
        stdio: 'pipe',
        detached: false,
      });
    }

    // Wait a moment for startup
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (webAdminProcess.exitCode !== null) {
      spinner.fail('Web admin failed to start');
      return null;
    }

    spinner.succeed(`Web admin running at http://localhost:${port}`);
    return port;
  } catch (error) {
    spinner.fail(`Failed to start web admin: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Build kernel Docker image from plugin service source or containers directory
 * Works with both NATS and GCP kernels using unified config
 */
async function buildKernelImage(config: StackSoloConfig): Promise<boolean> {
  const kernelConfig = getKernelConfig(config);
  if (!kernelConfig) {
    return false;
  }

  const { name: kernelName, type: kernelType, serviceName } = kernelConfig;

  // Try to get kernel from plugin services (for monorepo dev)
  const kernelService = getPluginService(serviceName);
  let kernelDir: string;

  if (kernelService) {
    // Get source path from plugin for local development
    const sourcePath = getServiceSourcePath(kernelService);
    if (sourcePath) {
      kernelDir = sourcePath;
      console.log(chalk.gray(`  Using ${kernelType} kernel from plugin: ${kernelDir}`));
    } else {
      // Fall back to containers directory
      kernelDir = path.join(process.cwd(), 'containers', kernelName);
    }
  } else {
    // No plugin, use containers directory
    kernelDir = path.join(process.cwd(), 'containers', kernelName);
  }

  // Check if kernel directory exists
  try {
    await fs.access(kernelDir);
  } catch {
    console.log(chalk.gray(`  ${kernelType.toUpperCase()} kernel directory not found: ${kernelDir}`));
    return false;
  }

  const spinner = ora(`Building ${kernelType} kernel image from ${kernelDir}...`).start();

  try {
    // Install dependencies first
    execSync('npm install', { cwd: kernelDir, stdio: 'pipe' });

    // Build TypeScript
    execSync('npm run build', { cwd: kernelDir, stdio: 'pipe' });

    // Build Docker image
    execSync(`docker build -t ${kernelName}:dev .`, { cwd: kernelDir, stdio: 'pipe' });

    spinner.succeed(`${kernelType.toUpperCase()} kernel image built: ${kernelName}:dev`);
    return true;
  } catch (error) {
    spinner.fail(`Failed to build ${kernelType} kernel image`);
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

  // 3. Load plugins from config (registers providers/services)
  const pluginSpinner = ora('Loading plugins...').start();
  await loadPlugins(config.project.plugins);
  pluginSpinner.succeed('Plugins loaded');

  // 3. Validate source directories
  const warnings = await validateSourceDirs(config);
  if (warnings.length > 0) {
    console.log(chalk.yellow('\n  Warnings:'));
    for (const warning of warnings) {
      console.log(chalk.yellow(`    • ${warning}`));
    }
    console.log('');
  }

  // 4. Build kernel image if configured (NATS or GCP)
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

  // 8. Start web admin if enabled
  const webAdminPort = await startWebAdmin(config);
  if (webAdminPort) {
    portMappings.unshift({
      name: 'Web Admin',
      service: 'web-admin',
      localPort: webAdminPort,
      targetPort: webAdminPort,
      protocol: 'http',
    });
  }

  // 9. Print access information
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
    isShuttingDown = true;
    console.log(chalk.gray('\n  Shutting down...\n'));

    // Kill web admin process
    if (webAdminProcess) {
      try {
        webAdminProcess.kill('SIGTERM');
      } catch {
        // Ignore
      }
    }

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
 * Start a port-forward with auto-restart on failure
 */
function startPortForwardWithRestart(
  namespace: string,
  service: string,
  localPort: number,
  targetPort: number,
  _name: string
): ChildProcess {
  const startForward = (): ChildProcess => {
    const proc = spawn(
      'kubectl',
      ['port-forward', '-n', namespace, `svc/${service}`, `${localPort}:${targetPort}`],
      { stdio: 'pipe', detached: false }
    );

    proc.on('exit', (code) => {
      // Auto-restart if not shutting down and process exited unexpectedly
      if (!isShuttingDown && code !== 0) {
        // Wait a bit before restarting to avoid tight loops
        setTimeout(() => {
          if (!isShuttingDown) {
            const newProc = startForward();
            // Replace in the array
            const idx = portForwardProcesses.indexOf(proc);
            if (idx >= 0) {
              portForwardProcesses[idx] = newProc;
            } else {
              portForwardProcesses.push(newProc);
            }
          }
        }, 2000);
      }
    });

    proc.on('error', () => {
      // Errors are handled by exit handler
    });

    return proc;
  };

  return startForward();
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

  // Kernel ports (if configured) - works for both NATS and GCP kernels
  const kernelConfig = getKernelConfig(config);
  if (kernelConfig) {
    const label = kernelConfig.type === 'nats' ? 'Kernel' : 'GCP Kernel';
    portMappings.push({
      name: `${label} HTTP`,
      service: kernelConfig.name,
      localPort: kernelConfig.httpPort,
      targetPort: kernelConfig.httpPort,
      protocol: 'http',
    });
    if (kernelConfig.natsPort) {
      portMappings.push({
        name: `${label} NATS`,
        service: kernelConfig.name,
        localPort: kernelConfig.natsPort,
        targetPort: kernelConfig.natsPort,
        protocol: 'tcp',
      });
    }
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

  // Start port-forward for each service with auto-restart
  for (const mapping of portMappings) {
    try {
      const proc = startPortForwardWithRestart(
        namespace,
        mapping.service,
        mapping.localPort,
        mapping.targetPort,
        mapping.name
      );
      portForwardProcesses.push(proc);
    } catch {
      // Ignore errors for individual port forwards
    }
  }

  // Port-forward gateway for unified load balancer access with auto-restart
  const hasGateway = config.project.networks?.some((n) => n.loadBalancer?.routes);
  if (hasGateway) {
    try {
      const gatewayProc = startPortForwardWithRestart(
        namespace,
        'gateway',
        8000,
        8000,
        'Load Balancer'
      );
      portForwardProcesses.push(gatewayProc);

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
  const kernelConfig = getKernelConfig(config);
  if (kernelConfig) {
    const label = kernelConfig.type === 'nats' ? 'Kernel (NATS)' : 'Kernel (GCP)';
    const detail = kernelConfig.type === 'nats'
      ? `Source: containers/${kernelConfig.name}/`
      : 'Type: GCP-native (Cloud Run + Pub/Sub)';
    console.log(chalk.bold(`  ${label}:\n`));
    console.log(`    ${chalk.cyan('●')} ${kernelConfig.name}`);
    console.log(chalk.gray(`      ${detail}`));
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

  // Emulators section
  console.log(chalk.bold('  Emulators:\n'));
  console.log(`    ${chalk.yellow('Firebase UI')}      http://localhost:4000`);
  console.log(`    ${chalk.yellow('Firestore')}        localhost:8080`);
  console.log(`    ${chalk.yellow('Firebase Auth')}    localhost:9099`);
  console.log(`    ${chalk.yellow('Pub/Sub')}          localhost:8085`);
  console.log('');

  console.log(chalk.bold('  Local Access:\n'));
  console.log(`    ${chalk.cyan('Gateway:')}          http://localhost:8000`);
  const routesKernelConfig = getKernelConfig(config);
  if (routesKernelConfig) {
    const label = routesKernelConfig.type === 'nats' ? 'Kernel HTTP' : 'GCP Kernel';
    console.log(`    ${chalk.cyan(`${label}:`)}${' '.repeat(14 - label.length)}http://localhost:${routesKernelConfig.httpPort}`);
    if (routesKernelConfig.natsPort) {
      console.log(`    ${chalk.cyan('Kernel NATS:')}      localhost:${routesKernelConfig.natsPort}`);
    }
  }
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
 * Check health of all services by making HTTP requests
 */
async function checkHealth(): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev - Health Check\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  // Define services to check with their expected ports
  const healthChecks: Array<{ name: string; port: number; path: string }> = [];

  // Gateway
  const hasGateway = config.project.networks?.some((n) => n.loadBalancer?.routes);
  if (hasGateway) {
    healthChecks.push({ name: 'Gateway', port: 8000, path: '/health' });
  }

  // Kernel (NATS or GCP)
  const healthKernelConfig = getKernelConfig(config);
  if (healthKernelConfig) {
    const label = healthKernelConfig.type === 'nats' ? 'Kernel HTTP' : 'GCP Kernel';
    healthChecks.push({ name: label, port: healthKernelConfig.httpPort, path: healthKernelConfig.healthPath });
  }

  // Firebase emulator
  healthChecks.push({ name: 'Firebase UI', port: 4000, path: '/' });

  // Functions
  let functionPort = 8081;
  for (const network of config.project.networks || []) {
    for (const func of network.functions || []) {
      healthChecks.push({ name: `Function: ${func.name}`, port: functionPort, path: '/health' });
      functionPort++;
    }
  }

  // Get pod status from K8s
  console.log(chalk.bold('  Pod Status:\n'));
  try {
    const podOutput = execSync(
      `kubectl get pods -n ${namespace} -o jsonpath='{range .items[*]}{.metadata.name}|{.status.phase}|{.status.conditions[?(@.type=="Ready")].status}{\"\\n\"}{end}'`,
      { encoding: 'utf-8' }
    );

    for (const line of podOutput.trim().split('\n')) {
      if (!line) continue;
      const [name, phase, ready] = line.split('|');
      const isHealthy = phase === 'Running' && ready === 'True';
      const icon = isHealthy ? chalk.green('✓') : chalk.red('✗');
      const status = isHealthy ? chalk.green('Healthy') : chalk.yellow(phase);
      console.log(`    ${icon} ${name.padEnd(40)} ${status}`);
    }
  } catch {
    console.log(chalk.yellow('    Unable to get pod status'));
  }

  // Check HTTP endpoints
  console.log(chalk.bold('\n  HTTP Endpoints:\n'));

  for (const check of healthChecks) {
    const spinner = ora({ text: `Checking ${check.name}...`, indent: 4 }).start();

    try {
      const response = await Promise.race([
        fetch(`http://localhost:${check.port}${check.path}`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2000)
        ),
      ]) as Response;

      if (response.ok) {
        spinner.succeed(`${check.name.padEnd(25)} ${chalk.green('OK')} (port ${check.port})`);
      } else {
        spinner.warn(`${check.name.padEnd(25)} ${chalk.yellow(`HTTP ${response.status}`)} (port ${check.port})`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errMsg.includes('ECONNREFUSED')) {
        spinner.fail(`${check.name.padEnd(25)} ${chalk.red('Connection refused')} (port ${check.port})`);
      } else if (errMsg.includes('Timeout')) {
        spinner.fail(`${check.name.padEnd(25)} ${chalk.red('Timeout')} (port ${check.port})`);
      } else {
        spinner.fail(`${check.name.padEnd(25)} ${chalk.red(errMsg)} (port ${check.port})`);
      }
    }
  }

  console.log(chalk.bold('\n  Tip:\n'));
  console.log(chalk.gray('    If ports show "Connection refused", try: stacksolo dev --restart'));
  console.log(chalk.gray('    This will restart all port-forwards\n'));
}

/**
 * Show port-forward status
 */
async function showPorts(): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev - Port Forward Status\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  // Build expected port mappings
  const expectedPorts: Array<{ name: string; service: string; port: number }> = [];

  // Gateway
  const hasGateway = config.project.networks?.some((n) => n.loadBalancer?.routes);
  if (hasGateway) {
    expectedPorts.push({ name: 'Gateway', service: 'gateway', port: 8000 });
  }

  // Firebase emulator
  expectedPorts.push(
    { name: 'Firebase UI', service: 'firebase-emulator', port: 4000 },
    { name: 'Firestore', service: 'firebase-emulator', port: 8080 },
    { name: 'Firebase Auth', service: 'firebase-emulator', port: 9099 }
  );

  // Pub/Sub
  expectedPorts.push({ name: 'Pub/Sub', service: 'pubsub-emulator', port: 8085 });

  // Kernel (NATS or GCP)
  const portsKernelConfig = getKernelConfig(config);
  if (portsKernelConfig) {
    const label = portsKernelConfig.type === 'nats' ? 'Kernel' : 'GCP Kernel';
    expectedPorts.push({ name: `${label} HTTP`, service: portsKernelConfig.name, port: portsKernelConfig.httpPort });
    if (portsKernelConfig.natsPort) {
      expectedPorts.push({ name: `${label} NATS`, service: portsKernelConfig.name, port: portsKernelConfig.natsPort });
    }
  }

  // Functions and UIs
  let functionPort = 8081;
  let uiPort = 3000;
  for (const network of config.project.networks || []) {
    for (const func of network.functions || []) {
      const svcName = func.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      expectedPorts.push({ name: `Function: ${func.name}`, service: svcName, port: functionPort });
      functionPort++;
    }
    for (const ui of network.uis || []) {
      const svcName = ui.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      expectedPorts.push({ name: `UI: ${ui.name}`, service: svcName, port: uiPort });
      uiPort++;
    }
  }

  // Check which ports are actually listening
  console.log(chalk.bold('  Expected Port Forwards:\n'));
  console.log(chalk.gray('    Name                          Port     Service                Status'));
  console.log(chalk.gray('    ' + '─'.repeat(75)));

  for (const mapping of expectedPorts) {
    // Check if port is listening
    let status: string;
    try {
      await Promise.race([
        fetch(`http://localhost:${mapping.port}/`, { method: 'HEAD' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 500)
        ),
      ]);
      status = chalk.green('● Active');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('ECONNREFUSED')) {
        status = chalk.red('○ Not listening');
      } else if (errMsg.includes('Timeout')) {
        status = chalk.yellow('○ No response');
      } else {
        // Could be non-HTTP service (like NATS) that is actually listening
        status = chalk.blue('● TCP only');
      }
    }

    console.log(
      `    ${mapping.name.padEnd(30)} ${String(mapping.port).padEnd(8)} ${mapping.service.padEnd(22)} ${status}`
    );
  }

  // Check for any active kubectl port-forward processes
  console.log(chalk.bold('\n  Active Port-Forward Processes:\n'));
  try {
    const psOutput = execSync(`ps aux | grep 'kubectl port-forward' | grep -v grep | grep ${namespace}`, {
      encoding: 'utf-8',
    });
    if (psOutput.trim()) {
      for (const line of psOutput.trim().split('\n')) {
        // Extract service name and ports from the command
        const match = line.match(/port-forward.*svc\/([^\s]+)\s+(\d+:\d+)/);
        if (match) {
          console.log(chalk.gray(`    kubectl port-forward svc/${match[1]} ${match[2]}`));
        }
      }
    } else {
      console.log(chalk.yellow('    No active port-forward processes found'));
    }
  } catch {
    console.log(chalk.yellow('    No active port-forward processes found'));
  }

  console.log(chalk.bold('\n  Commands:\n'));
  console.log(chalk.gray('    stacksolo dev --restart       Restart all port-forwards'));
  console.log(chalk.gray('    stacksolo dev --health        Check endpoint health\n'));
}

/**
 * Show service names for use with other commands
 */
async function showServiceNames(): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev - Service Names\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  const services: Array<{ name: string; type: string; k8sName: string }> = [];

  // Kernel (NATS or GCP)
  const svcKernelConfig = getKernelConfig(config);
  if (svcKernelConfig) {
    services.push({
      name: svcKernelConfig.name,
      type: svcKernelConfig.type === 'nats' ? 'kernel' : 'gcp-kernel',
      k8sName: svcKernelConfig.name,
    });
  }

  // Functions, containers, and UIs from networks
  for (const network of config.project.networks || []) {
    for (const func of network.functions || []) {
      services.push({
        name: func.name,
        type: 'function',
        k8sName: func.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      });
    }

    for (const container of network.containers || []) {
      services.push({
        name: container.name,
        type: 'container',
        k8sName: container.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      });
    }

    for (const ui of network.uis || []) {
      services.push({
        name: ui.name,
        type: 'ui',
        k8sName: ui.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      });
    }
  }

  // Emulators
  services.push(
    { name: 'firebase-emulator', type: 'emulator', k8sName: 'firebase-emulator' },
    { name: 'pubsub-emulator', type: 'emulator', k8sName: 'pubsub-emulator' }
  );

  // Gateway
  const hasGateway = config.project.networks?.some((n) => n.loadBalancer?.routes);
  if (hasGateway) {
    services.push({ name: 'gateway', type: 'gateway', k8sName: 'gateway' });
  }

  console.log(chalk.gray('    Name                     Type         K8s Service Name'));
  console.log(chalk.gray('    ' + '─'.repeat(60)));

  for (const svc of services) {
    const typeColor =
      svc.type === 'kernel' ? chalk.magenta :
      svc.type === 'gcp-kernel' ? chalk.magenta :
      svc.type === 'function' ? chalk.green :
      svc.type === 'container' ? chalk.blue :
      svc.type === 'ui' ? chalk.cyan :
      svc.type === 'gateway' ? chalk.yellow :
      chalk.gray;

    console.log(
      `    ${svc.name.padEnd(25)} ${typeColor(svc.type.padEnd(12))} ${svc.k8sName}`
    );
  }

  // Show running pods
  console.log(chalk.bold('\n  Running Pods:\n'));
  try {
    const pods = execSync(`kubectl get pods -n ${namespace} --no-headers -o custom-columns=NAME:.metadata.name`, {
      encoding: 'utf-8',
    });
    for (const pod of pods.trim().split('\n')) {
      if (pod) {
        // Extract service name from pod name (remove deployment hash suffix)
        const serviceName = pod.replace(/-[a-z0-9]+-[a-z0-9]+$/, '');
        console.log(`    ${chalk.gray('●')} ${serviceName.padEnd(25)} ${chalk.gray(pod)}`);
      }
    }
  } catch {
    console.log(chalk.yellow('    No pods found'));
  }

  console.log(chalk.bold('\n  Usage:\n'));
  console.log(chalk.gray('    stacksolo dev --restart <name>    Restart a specific service'));
  console.log(chalk.gray('    stacksolo dev --logs <name>       Tail logs for a service'));
  console.log(chalk.gray('    stacksolo dev --describe <name>   Describe a service\n'));
}

/**
 * Restart port-forwards or specific service pod
 */
async function restartService(service?: string): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Dev - Restart\n'));

  const config = await loadConfig();
  const namespace = sanitizeNamespaceName(config.project.name);

  if (service) {
    // Restart specific service pod
    const spinner = ora(`Restarting pod: ${service}...`).start();
    try {
      // Find and delete the pod - K8s will recreate it
      execSync(
        `kubectl delete pod -n ${namespace} -l app.kubernetes.io/name=${service} --grace-period=5`,
        { stdio: 'pipe' }
      );
      spinner.succeed(`Pod ${service} restarted`);

      // Wait for new pod to be ready
      const waitSpinner = ora(`Waiting for ${service} to be ready...`).start();
      try {
        execSync(
          `kubectl wait --for=condition=ready pod -n ${namespace} -l app.kubernetes.io/name=${service} --timeout=60s`,
          { stdio: 'pipe' }
        );
        waitSpinner.succeed(`${service} is ready`);
      } catch {
        waitSpinner.warn(`${service} may not be fully ready yet`);
      }
    } catch (error) {
      spinner.fail(`Failed to restart ${service}`);
      console.log(chalk.gray(`    Error: ${error instanceof Error ? error.message : error}`));
      console.log(chalk.gray('\n    Available services:'));

      // List available pods
      try {
        const pods = execSync(`kubectl get pods -n ${namespace} -o name`, { encoding: 'utf-8' });
        for (const pod of pods.trim().split('\n')) {
          const podName = pod.replace('pod/', '').replace(/-[a-z0-9]+-[a-z0-9]+$/, '');
          console.log(chalk.gray(`      ${podName}`));
        }
      } catch {
        // Ignore
      }
    }
  } else {
    // Kill all existing port-forward processes for this namespace
    const killSpinner = ora('Stopping existing port-forwards...').start();
    try {
      execSync(`pkill -f "kubectl port-forward.*${namespace}"`, { stdio: 'pipe' });
      killSpinner.succeed('Port-forwards stopped');
    } catch {
      killSpinner.info('No existing port-forwards to stop');
    }

    // Wait a moment for processes to die
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Restart port-forwards by loading config and setting up new forwards
    console.log('');
    const spinner = ora('Restarting port-forwards...').start();

    // Clear the process array
    portForwardProcesses.length = 0;

    const portMappings = await setupPortForwarding(namespace, config);
    spinner.succeed('Port-forwards restarted');

    console.log(chalk.bold('\n  Active Forwards:\n'));
    for (const mapping of portMappings) {
      const url = mapping.protocol === 'http'
        ? `http://localhost:${mapping.localPort}`
        : `localhost:${mapping.localPort}`;
      console.log(`    ${chalk.cyan(mapping.name.padEnd(20))} ${url}`);
    }

    console.log(chalk.bold('\n  Tip:\n'));
    console.log(chalk.gray('    Run: stacksolo dev --health  to verify endpoints\n'));

    // Keep process running to maintain port-forwards
    console.log(chalk.gray('  Press Ctrl+C to stop\n'));

    // Setup graceful shutdown
    const cleanup = async () => {
      isShuttingDown = true;
      console.log(chalk.gray('\n  Stopping port-forwards...\n'));
      for (const proc of portForwardProcesses) {
        try {
          proc.kill('SIGTERM');
        } catch {
          // Ignore
        }
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep alive
    await new Promise(() => {});
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
