/**
 * Local Development Service
 * Orchestrates running all services locally without Docker/K8s
 *
 * Usage: stacksolo dev --local
 */

import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { StackSoloConfig } from '@stacksolo/blueprint';

// Service color palette for log prefixes
const COLORS = [
  chalk.cyan,
  chalk.magenta,
  chalk.yellow,
  chalk.green,
  chalk.blue,
  chalk.red,
];

interface LocalService {
  name: string;
  type: 'function' | 'ui' | 'container';
  sourceDir: string;
  port: number;
  color: typeof chalk.cyan;
}

interface LocalProcessManager {
  processes: Map<string, ChildProcess>;
  services: LocalService[];
  isShuttingDown: boolean;
}

/**
 * Port allocator for local development
 * Functions start at 8081 to avoid conflict with Firestore emulator (8080)
 */
class LocalPortAllocator {
  private functionPort = 8081;
  private uiPort = 3000;
  private containerPort = 9000;

  nextFunctionPort(): number {
    return this.functionPort++;
  }

  nextUiPort(): number {
    return this.uiPort++;
  }

  nextContainerPort(): number {
    return this.containerPort++;
  }
}

/**
 * Collect all services from config
 */
export function collectServices(
  config: StackSoloConfig,
  projectRoot: string
): LocalService[] {
  const services: LocalService[] = [];
  const portAllocator = new LocalPortAllocator();
  let colorIndex = 0;

  for (const network of config.project.networks || []) {
    // Collect functions
    for (const func of network.functions || []) {
      const sourceDir = func.sourceDir?.replace(/^\.\//, '') || `functions/${func.name}`;
      services.push({
        name: func.name,
        type: 'function',
        sourceDir: path.join(projectRoot, sourceDir),
        port: portAllocator.nextFunctionPort(),
        color: COLORS[colorIndex++ % COLORS.length],
      });
    }

    // Collect UIs
    for (const ui of network.uis || []) {
      // Check common UI locations: apps/, ui/, or custom sourceDir
      const sourceDir = ui.sourceDir?.replace(/^\.\//, '') || `apps/${ui.name}`;
      services.push({
        name: ui.name,
        type: 'ui',
        sourceDir: path.join(projectRoot, sourceDir),
        port: portAllocator.nextUiPort(),
        color: COLORS[colorIndex++ % COLORS.length],
      });
    }

    // Collect containers
    for (const container of network.containers || []) {
      const sourceDir = (container as { sourceDir?: string }).sourceDir?.replace(/^\.\//, '')
        || `containers/${container.name}`;
      services.push({
        name: container.name,
        type: 'container',
        sourceDir: path.join(projectRoot, sourceDir),
        port: container.port || portAllocator.nextContainerPort(),
        color: COLORS[colorIndex++ % COLORS.length],
      });
    }
  }

  return services;
}

/**
 * Check if a service has package.json
 */
async function hasPackageJson(sourceDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(sourceDir, 'package.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if node_modules exists
 */
async function hasNodeModules(sourceDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(sourceDir, 'node_modules'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if package.json has a dev script
 */
async function hasDevScript(sourceDir: string): Promise<boolean> {
  try {
    const pkgPath = path.join(sourceDir, 'package.json');
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    return Boolean(pkg.scripts?.dev);
  } catch {
    return false;
  }
}

/**
 * Stream output with colored prefix
 */
function streamWithPrefix(
  stream: NodeJS.ReadableStream,
  prefix: string,
  color: typeof chalk.cyan
): void {
  stream.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      console.log(`${color(`[${prefix}]`)} ${line}`);
    }
  });
}

/**
 * Spawn a service process
 */
function spawnService(
  service: LocalService,
  manager: LocalProcessManager,
  firebaseProjectId?: string
): ChildProcess | null {
  // Start with process.env but override critical vars to ensure consistency
  const env: Record<string, string> = {
    ...process.env,
    PORT: String(service.port),
    NODE_ENV: 'development',
    // Firebase emulator connection vars
    FIRESTORE_EMULATOR_HOST: 'localhost:8080',
    FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
    PUBSUB_EMULATOR_HOST: 'localhost:8085',
    FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199',
    // Clear any existing project ID vars from shell that might conflict
    ...(firebaseProjectId ? {
      FIREBASE_PROJECT_ID: firebaseProjectId,
      GCLOUD_PROJECT: firebaseProjectId,
      GOOGLE_CLOUD_PROJECT: firebaseProjectId,
      GCP_PROJECT_ID: firebaseProjectId,
      VITE_FIREBASE_PROJECT_ID: firebaseProjectId,
    } : {}),
  };

  // For UIs, we need to pass port via CLI args since Vite doesn't use PORT env
  const args = service.type === 'ui'
    ? ['run', 'dev', '--', '--port', String(service.port)]
    : ['run', 'dev'];

  const proc = spawn('npm', args, {
    cwd: service.sourceDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  // Stream stdout with colored prefix
  if (proc.stdout) {
    streamWithPrefix(proc.stdout, service.name, service.color);
  }

  // Stream stderr with colored prefix
  if (proc.stderr) {
    streamWithPrefix(proc.stderr, service.name, service.color);
  }

  proc.on('error', (err) => {
    console.log(service.color(`[${service.name}]`), chalk.red(`Error: ${err.message}`));
  });

  proc.on('exit', (code) => {
    if (!manager.isShuttingDown) {
      console.log(
        service.color(`[${service.name}]`),
        code === 0 ? chalk.gray('Exited') : chalk.red(`Exited with code ${code}`)
      );
    }
    manager.processes.delete(service.name);
  });

  return proc;
}

/**
 * Check if a directory exists
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

interface FirebaseEmulatorOptions {
  projectId: string;
  exportOnExit?: string;
  importOnStart?: string;
}

/**
 * Start Firebase emulators
 */
async function startFirebaseEmulators(
  manager: LocalProcessManager,
  options: FirebaseEmulatorOptions
): Promise<ChildProcess | null> {
  const spinner = ora('Starting Firebase emulators...').start();

  try {
    // Build args array
    const args = ['emulators:start', '--only', 'firestore,auth,storage', '--project', options.projectId];

    // Add import flag if path exists
    if (options.importOnStart) {
      const importPath = path.resolve(process.cwd(), options.importOnStart);
      if (await directoryExists(importPath)) {
        args.push('--import', importPath);
        console.log(chalk.gray(`  Importing emulator data from: ${options.importOnStart}`));
      }
    }

    // Add export-on-exit flag
    if (options.exportOnExit) {
      const exportPath = path.resolve(process.cwd(), options.exportOnExit);
      args.push('--export-on-exit', exportPath);
      console.log(chalk.gray(`  Will export emulator data to: ${options.exportOnExit}`));
    }

    const proc = spawn(
      'firebase',
      args,
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }
    );

    const color = chalk.yellow;

    if (proc.stdout) {
      streamWithPrefix(proc.stdout, 'firebase', color);
    }
    if (proc.stderr) {
      streamWithPrefix(proc.stderr, 'firebase', color);
    }

    proc.on('error', () => {
      spinner.fail('Firebase CLI not found. Skipping emulators.');
    });

    // Give emulators time to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    spinner.succeed('Firebase emulators starting');
    return proc;
  } catch {
    spinner.warn('Firebase emulators not available');
    return null;
  }
}

/**
 * Graceful shutdown
 */
function shutdown(manager: LocalProcessManager): void {
  manager.isShuttingDown = true;
  console.log(chalk.gray('\n  Shutting down services...\n'));

  for (const [name, proc] of manager.processes) {
    try {
      console.log(chalk.gray(`  Stopping ${name}...`));
      proc.kill('SIGTERM');
    } catch {
      // Ignore errors during shutdown
    }
  }

  // Force kill after timeout
  setTimeout(() => {
    for (const [, proc] of manager.processes) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Ignore
      }
    }
    process.exit(0);
  }, 5000);
}

/**
 * Main entry point for local development
 */
export async function startLocalEnvironment(options: {
  includeEmulators?: boolean;
}): Promise<void> {
  console.log(chalk.bold('\n  StackSolo Local Development\n'));

  // Load config
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.stacksolo', 'stacksolo.config.json');

  let config: StackSoloConfig;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    console.log(chalk.red(`  Config not found: .stacksolo/stacksolo.config.json`));
    console.log(chalk.gray(`  Run 'stacksolo init' first.\n`));
    process.exit(1);
  }

  // Collect services
  const services = collectServices(config, projectRoot);

  if (services.length === 0) {
    console.log(chalk.yellow('  No services found in config.\n'));
    return;
  }

  // Filter to services with package.json and dev script
  const validServices: LocalService[] = [];
  const missingDeps: LocalService[] = [];
  const missingDevScript: LocalService[] = [];

  for (const service of services) {
    if (!(await hasPackageJson(service.sourceDir))) {
      console.log(chalk.yellow(`  Warning: ${service.name} has no package.json at ${service.sourceDir}, skipping`));
      continue;
    }

    if (!(await hasDevScript(service.sourceDir))) {
      missingDevScript.push(service);
      continue;
    }

    validServices.push(service);
    if (!(await hasNodeModules(service.sourceDir))) {
      missingDeps.push(service);
    }
  }

  // Error on missing dev scripts
  if (missingDevScript.length > 0) {
    console.log(chalk.red('\n  Error: Some services are missing "dev" script in package.json:\n'));
    for (const svc of missingDevScript) {
      console.log(chalk.red(`    ✗ ${svc.name}`));
      console.log(chalk.gray(`      Add a "dev" script to ${path.relative(projectRoot, svc.sourceDir)}/package.json`));
    }
    console.log(chalk.gray('\n  See: https://stacksolo.dev/reference/cli/#local-mode---local\n'));
  }

  if (validServices.length === 0) {
    console.log(chalk.yellow('  No runnable services found.\n'));
    console.log(chalk.gray('  Run `stacksolo scaffold` to generate service code.\n'));
    return;
  }

  // Warn about missing node_modules
  if (missingDeps.length > 0) {
    console.log(chalk.yellow('\n  Warning: Some services are missing node_modules:'));
    for (const svc of missingDeps) {
      console.log(chalk.yellow(`    • ${svc.name}: Run \`cd ${path.relative(projectRoot, svc.sourceDir)} && npm install\``));
    }
    console.log(chalk.gray('\n  Or run: stacksolo install\n'));
  }

  // Initialize process manager
  const manager: LocalProcessManager = {
    processes: new Map(),
    services: validServices,
    isShuttingDown: false,
  };

  // Get Firebase project ID from config (for token validation and emulators)
  const firebaseProjectId = config.project.gcpKernel?.firebaseProjectId
    || config.project.gcpProjectId;

  // Get Firebase emulator config
  const emulatorConfig = config.project.firebaseEmulators;

  // Start Firebase emulators if enabled
  if (options.includeEmulators !== false && emulatorConfig?.enabled !== false) {
    const emulatorProc = await startFirebaseEmulators(manager, {
      projectId: firebaseProjectId || 'demo-local',
      exportOnExit: emulatorConfig?.exportOnExit,
      importOnStart: emulatorConfig?.importOnStart,
    });
    if (emulatorProc) {
      manager.processes.set('firebase-emulator', emulatorProc);
    }
  }

  // Start all services
  const spinner = ora('Starting services...').start();

  for (const service of validServices) {
    const proc = spawnService(service, manager, firebaseProjectId);
    if (proc) {
      manager.processes.set(service.name, proc);
    }
  }

  spinner.succeed(`Started ${validServices.length} service(s)`);

  // Print access URLs
  console.log(chalk.bold('\n  Services running:\n'));

  for (const service of validServices) {
    const url = `http://localhost:${service.port}`;
    console.log(`    ${service.color('●')} ${service.name.padEnd(20)} ${chalk.cyan(url)}`);
  }

  if (options.includeEmulators !== false && emulatorConfig?.enabled !== false) {
    console.log(chalk.bold('\n  Emulators:\n'));
    console.log(`    ${chalk.yellow('●')} Firebase UI          ${chalk.cyan('http://localhost:4000')}`);
    console.log(`    ${chalk.yellow('●')} Firestore            ${chalk.gray('localhost:8080')}`);
    console.log(`    ${chalk.yellow('●')} Firebase Auth        ${chalk.gray('localhost:9099')}`);
    console.log(`    ${chalk.yellow('●')} Firebase Storage     ${chalk.gray('localhost:9199')}`);
    if (emulatorConfig?.exportOnExit) {
      console.log(chalk.bold('\n  Data Persistence:\n'));
      console.log(`    ${chalk.green('●')} Export on exit       ${chalk.gray(emulatorConfig.exportOnExit)}`);
      if (emulatorConfig.importOnStart) {
        console.log(`    ${chalk.green('●')} Import on start      ${chalk.gray(emulatorConfig.importOnStart)}`);
      }
    }
  }

  console.log(chalk.bold('\n  Commands:\n'));
  console.log(chalk.gray('    Press Ctrl+C to stop all services'));
  console.log('');

  // Setup signal handlers
  process.on('SIGINT', () => shutdown(manager));
  process.on('SIGTERM', () => shutdown(manager));

  // Keep process running
  await new Promise(() => {
    // Keep alive
  });
}
