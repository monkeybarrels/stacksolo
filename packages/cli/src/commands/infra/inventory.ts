/**
 * stacksolo inventory
 *
 * Scan GCP for all StackSolo-managed resources using labels
 * Shows resources grouped by project, identifies orphans and shared resources
 * Can also update labels on existing resources to mark them as shared
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getRegistry } from '@stacksolo/registry';

const execAsync = promisify(exec);

/**
 * Label update commands for different resource types
 */
const LABEL_UPDATE_COMMANDS: Record<string, (projectId: string, resourceName: string, labels: Record<string, string>) => string> = {
  'VPC Network': (projectId, name, labels) => {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `gcloud compute networks update ${name} --project=${projectId} --update-labels="${labelStr}"`;
  },
  'VPC Connector': (_projectId, _name, labels) => {
    // VPC connectors don't support labels directly via gcloud, need to use API
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `echo "VPC Connectors don't support label updates via gcloud. Labels: ${labelStr}"`;
  },
  'Storage Bucket': (_projectId, name, labels) => {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `gcloud storage buckets update gs://${name} --update-labels="${labelStr}"`;
  },
  'Cloud Run': (projectId, name, labels) => {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `gcloud run services update ${name} --project=${projectId} --update-labels="${labelStr}" --region=us-central1`;
  },
  'Cloud Function': (projectId, name, labels) => {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `gcloud functions deploy ${name} --project=${projectId} --update-labels="${labelStr}" --gen2 --region=us-central1`;
  },
  'Global Address': (projectId, name, labels) => {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `gcloud compute addresses update ${name} --global --project=${projectId} --update-labels="${labelStr}"`;
  },
  'Artifact Registry': (projectId, name, labels) => {
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(',');
    return `gcloud artifacts repositories update ${name} --project=${projectId} --update-labels="${labelStr}" --location=us-central1`;
  },
};

/**
 * Update labels on an existing GCP resource
 */
async function updateResourceLabels(
  projectId: string,
  resourceType: string,
  resourceName: string,
  labels: Record<string, string>,
  region?: string
): Promise<{ success: boolean; error?: string }> {
  const commandGenerator = LABEL_UPDATE_COMMANDS[resourceType];
  if (!commandGenerator) {
    return { success: false, error: `Unsupported resource type: ${resourceType}` };
  }

  let command = commandGenerator(projectId, resourceName, labels);

  // Replace region placeholder if needed
  if (region && command.includes('us-central1')) {
    command = command.replace(/us-central1/g, region);
  }

  try {
    await execAsync(command, { timeout: 60000 });
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

/**
 * Add StackSolo labels to an unmanaged resource
 */
async function adoptResource(
  projectId: string,
  resourceType: string,
  resourceName: string,
  stacksoloProjectName: string,
  region?: string
): Promise<{ success: boolean; error?: string }> {
  const labels = {
    stacksolo: 'true',
    'stacksolo-project': stacksoloProjectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    'stacksolo-resource': resourceType.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
  };

  return updateResourceLabels(projectId, resourceType, resourceName, labels, region);
}

/**
 * Mark a resource as shared by adding project to stacksolo-shared-with label
 */
async function shareResource(
  projectId: string,
  resourceType: string,
  resourceName: string,
  existingLabels: Record<string, string>,
  additionalProject: string,
  region?: string
): Promise<{ success: boolean; error?: string }> {
  const currentShared = existingLabels['stacksolo-shared-with'] || '';
  const sharedProjects = currentShared ? currentShared.split('_') : [];

  // Add the new project if not already shared
  const normalizedProject = additionalProject.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!sharedProjects.includes(normalizedProject)) {
    sharedProjects.push(normalizedProject);
  }

  const updatedLabels = {
    ...existingLabels,
    'stacksolo-shared-with': sharedProjects.join('_'),
  };

  return updateResourceLabels(projectId, resourceType, resourceName, updatedLabels, region);
}

interface GcpResourceWithLabels {
  name: string;
  type: string;
  location?: string;
  labels?: Record<string, string>;
  selfLink?: string;
  createdAt?: string;
}

interface InventoryResource extends GcpResourceWithLabels {
  stacksoloProject?: string;
  stacksoloResource?: string;
  isStacksolo: boolean;
  isOrphaned?: boolean;
  isShared?: boolean;
}

interface InventoryResult {
  managed: InventoryResource[];
  unmanaged: InventoryResource[];
  orphaned: InventoryResource[];
  errors: string[];
}

/**
 * Execute a gcloud command and parse JSON output
 */
async function runGcloudCommand<T>(command: string, timeoutMs = 30000): Promise<T[]> {
  try {
    const { stdout } = await execAsync(command, { timeout: timeoutMs });
    const trimmed = stdout.trim();
    if (!trimmed || trimmed === '[]') {
      return [];
    }
    return JSON.parse(trimmed) as T[];
  } catch {
    return [];
  }
}

/**
 * Parse StackSolo labels from a resource
 */
function parseStacksoloLabels(labels?: Record<string, string>): {
  isStacksolo: boolean;
  project?: string;
  resource?: string;
} {
  if (!labels) return { isStacksolo: false };

  const isStacksolo = labels['stacksolo'] === 'true';
  const project = labels['stacksolo-project'];
  const resource = labels['stacksolo-resource'];

  return { isStacksolo, project, resource };
}

/**
 * Scan VPC Networks
 */
async function scanVpcNetworks(projectId: string): Promise<InventoryResource[]> {
  interface VpcNetwork {
    name: string;
    selfLink?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  }

  const networks = await runGcloudCommand<VpcNetwork>(
    `gcloud compute networks list --project=${projectId} --format=json`
  );

  return networks.map((network) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(network.labels);
    return {
      name: network.name,
      type: 'VPC Network',
      selfLink: network.selfLink,
      createdAt: network.creationTimestamp,
      labels: network.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan Storage Buckets
 */
async function scanStorageBuckets(projectId: string): Promise<InventoryResource[]> {
  interface StorageBucket {
    name: string;
    timeCreated?: string;
    selfLink?: string;
    labels?: Record<string, string>;
  }

  const buckets = await runGcloudCommand<StorageBucket>(
    `gcloud storage buckets list --project=${projectId} --format=json`
  );

  return buckets.map((bucket) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(bucket.labels);
    return {
      name: bucket.name,
      type: 'Storage Bucket',
      selfLink: bucket.selfLink,
      createdAt: bucket.timeCreated,
      labels: bucket.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan Cloud Run Services
 */
async function scanCloudRunServices(projectId: string): Promise<InventoryResource[]> {
  interface CloudRunService {
    metadata?: {
      name: string;
      creationTimestamp?: string;
      labels?: Record<string, string>;
    };
  }

  const services = await runGcloudCommand<CloudRunService>(
    `gcloud run services list --project=${projectId} --format=json`
  );

  return services.map((svc) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(svc.metadata?.labels);
    return {
      name: svc.metadata?.name || '',
      type: 'Cloud Run',
      createdAt: svc.metadata?.creationTimestamp,
      labels: svc.metadata?.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan Cloud Functions (Gen2)
 */
async function scanCloudFunctions(projectId: string): Promise<InventoryResource[]> {
  interface CloudFunction {
    name: string;
    state?: string;
    createTime?: string;
    labels?: Record<string, string>;
  }

  const functions = await runGcloudCommand<CloudFunction>(
    `gcloud functions list --gen2 --project=${projectId} --format=json`
  );

  return functions.map((fn) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(fn.labels);
    return {
      name: fn.name.split('/').pop() || '',
      type: 'Cloud Function',
      location: fn.name.match(/locations\/([^/]+)/)?.[1],
      createdAt: fn.createTime,
      labels: fn.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan Global Addresses
 */
async function scanGlobalAddresses(projectId: string): Promise<InventoryResource[]> {
  interface GlobalAddress {
    name: string;
    address?: string;
    selfLink?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  }

  const addresses = await runGcloudCommand<GlobalAddress>(
    `gcloud compute addresses list --global --project=${projectId} --format=json`
  );

  return addresses.map((addr) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(addr.labels);
    return {
      name: addr.name,
      type: 'Global Address',
      selfLink: addr.selfLink,
      createdAt: addr.creationTimestamp,
      labels: addr.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan Artifact Registry
 */
async function scanArtifactRegistry(projectId: string): Promise<InventoryResource[]> {
  interface ArtifactRepo {
    name: string;
    createTime?: string;
    labels?: Record<string, string>;
  }

  const repos = await runGcloudCommand<ArtifactRepo>(
    `gcloud artifacts repositories list --project=${projectId} --format=json`
  );

  return repos.map((repo) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(repo.labels);
    return {
      name: repo.name.split('/').pop() || '',
      type: 'Artifact Registry',
      location: repo.name.match(/locations\/([^/]+)/)?.[1],
      createdAt: repo.createTime,
      labels: repo.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan VPC Access Connectors
 */
async function scanVpcConnectors(projectId: string, region: string): Promise<InventoryResource[]> {
  interface VpcConnector {
    name: string;
    state?: string;
    labels?: Record<string, string>;
  }

  const connectors = await runGcloudCommand<VpcConnector>(
    `gcloud compute networks vpc-access connectors list --region=${region} --project=${projectId} --format=json`
  );

  return connectors.map((connector) => {
    const { isStacksolo, project, resource } = parseStacksoloLabels(connector.labels);
    return {
      name: connector.name.split('/').pop() || '',
      type: 'VPC Connector',
      location: region,
      labels: connector.labels,
      isStacksolo,
      stacksoloProject: project,
      stacksoloResource: resource,
    };
  });
}

/**
 * Scan all GCP resources for StackSolo labels
 */
async function scanAllResources(
  projectId: string,
  region: string = 'us-central1'
): Promise<InventoryResult> {
  const scanners = [
    { name: 'VPC Networks', fn: () => scanVpcNetworks(projectId) },
    { name: 'Storage Buckets', fn: () => scanStorageBuckets(projectId) },
    { name: 'Cloud Run', fn: () => scanCloudRunServices(projectId) },
    { name: 'Cloud Functions', fn: () => scanCloudFunctions(projectId) },
    { name: 'Global Addresses', fn: () => scanGlobalAddresses(projectId) },
    { name: 'Artifact Registry', fn: () => scanArtifactRegistry(projectId) },
    { name: 'VPC Connectors', fn: () => scanVpcConnectors(projectId, region) },
  ];

  const results = await Promise.allSettled(scanners.map((s) => s.fn()));

  const allResources: InventoryResource[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allResources.push(...result.value);
    } else {
      errors.push(`${scanners[index].name}: ${result.reason}`);
    }
  });

  // Get registered projects from registry
  const registry = getRegistry();
  const registeredProjects = await registry.listProjects();
  const registeredProjectNames = new Set(registeredProjects.map((p) => p.name));

  // Categorize resources
  const managed: InventoryResource[] = [];
  const unmanaged: InventoryResource[] = [];
  const orphaned: InventoryResource[] = [];

  for (const resource of allResources) {
    if (resource.isStacksolo) {
      // Check if the project is still registered
      if (resource.stacksoloProject && !registeredProjectNames.has(resource.stacksoloProject)) {
        resource.isOrphaned = true;
        orphaned.push(resource);
      } else {
        managed.push(resource);
      }
    } else {
      unmanaged.push(resource);
    }
  }

  return { managed, unmanaged, orphaned, errors };
}

/**
 * Format resource type with color
 */
function formatType(type: string): string {
  const colors: Record<string, typeof chalk.blue> = {
    'VPC Network': chalk.cyan,
    'VPC Connector': chalk.cyan,
    'Storage Bucket': chalk.green,
    'Cloud Run': chalk.magenta,
    'Cloud Function': chalk.yellow,
    'Global Address': chalk.blue,
    'Artifact Registry': chalk.gray,
  };
  const colorFn = colors[type] || chalk.white;
  return colorFn(type.padEnd(18));
}

/**
 * Get GCP project ID from various sources
 */
async function getGcpProjectId(explicitProject?: string): Promise<string | null> {
  // 1. Explicit --project flag takes priority
  if (explicitProject) {
    return explicitProject;
  }

  // 2. Try to read from local stacksolo config
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const configPath = path.join(process.cwd(), '.stacksolo', 'stacksolo.config.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    if (config.project?.gcpProjectId) {
      return config.project.gcpProjectId;
    }
  } catch {
    // No local config, continue
  }

  // 3. Try gcloud default project
  try {
    const { stdout } = await execAsync('gcloud config get-value project 2>/dev/null');
    const gcloudProject = stdout.trim();
    if (gcloudProject && gcloudProject !== '(unset)') {
      return gcloudProject;
    }
  } catch {
    // gcloud not available or no default set
  }

  // 4. Fall back to environment variable
  if (process.env.GCP_PROJECT_ID) {
    return process.env.GCP_PROJECT_ID;
  }

  return null;
}

/**
 * List inventory (default action)
 */
async function listInventory(options: {
  project?: string;
  region: string;
  orphaned?: boolean;
  unmanaged?: boolean;
  json?: boolean;
}) {
  const projectId = await getGcpProjectId(options.project);

  if (!projectId) {
    console.log(chalk.red('\n  Error: No GCP project specified.\n'));
    console.log(chalk.gray('  Use --project <id>, set GCP_PROJECT_ID, or run from a StackSolo project directory.\n'));
    process.exit(1);
  }

  console.log(chalk.gray(`\n  Scanning GCP project: ${projectId}...\n`));

  const result = await scanAllResources(projectId, options.region);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Show errors if any
  if (result.errors.length > 0) {
    console.log(chalk.yellow('  Warnings:'));
    result.errors.forEach((err) => console.log(chalk.gray(`    - ${err}`)));
    console.log('');
  }

  // Show orphaned resources
  if (result.orphaned.length > 0) {
    console.log(chalk.red.bold(`  Orphaned Resources (${result.orphaned.length})`));
    console.log(chalk.gray('  These resources have StackSolo labels but no matching registered project.\n'));

    console.log(
      chalk.gray('  ') +
        chalk.gray('TYPE'.padEnd(18)) +
        chalk.gray('NAME'.padEnd(30)) +
        chalk.gray('PROJECT')
    );
    console.log(chalk.gray('  ' + '-'.repeat(70)));

    for (const resource of result.orphaned) {
      console.log(
        chalk.white('  ') +
          formatType(resource.type) +
          chalk.white(resource.name.padEnd(30)) +
          chalk.red(resource.stacksoloProject || 'unknown')
      );
    }
    console.log('');
  }

  if (options.orphaned) {
    return; // Only show orphaned
  }

  // Show managed resources grouped by project
  if (result.managed.length > 0) {
    console.log(chalk.green.bold(`  StackSolo Managed Resources (${result.managed.length})`));
    console.log('');

    // Group by project
    const byProject = new Map<string, InventoryResource[]>();
    for (const resource of result.managed) {
      const proj = resource.stacksoloProject || 'unknown';
      if (!byProject.has(proj)) {
        byProject.set(proj, []);
      }
      byProject.get(proj)!.push(resource);
    }

    for (const [projectName, resources] of byProject) {
      console.log(chalk.cyan(`  ${projectName}:`));

      for (const resource of resources) {
        // Show shared indicator
        const sharedWith = resource.labels?.['stacksolo-shared-with'];
        const sharedIndicator = sharedWith ? chalk.blue(` [shared: ${sharedWith.replace(/_/g, ', ')}]`) : '';
        console.log(
          chalk.gray('    ') +
            formatType(resource.type) +
            chalk.white(resource.name) +
            sharedIndicator
        );
      }
      console.log('');
    }
  }

  // Show unmanaged resources if requested
  if (options.unmanaged && result.unmanaged.length > 0) {
    console.log(chalk.gray.bold(`  Unmanaged Resources (${result.unmanaged.length})`));
    console.log(chalk.gray('  These resources do not have StackSolo labels.\n'));

    console.log(
      chalk.gray('  ') +
        chalk.gray('TYPE'.padEnd(18)) +
        chalk.gray('NAME')
    );
    console.log(chalk.gray('  ' + '-'.repeat(50)));

    for (const resource of result.unmanaged) {
      console.log(
        chalk.gray('  ') +
          formatType(resource.type) +
          chalk.gray(resource.name)
      );
    }
    console.log('');
  }

  // Summary
  console.log(chalk.bold('  Summary:'));
  console.log(chalk.green(`    Managed:   ${result.managed.length}`));
  if (result.orphaned.length > 0) {
    console.log(chalk.red(`    Orphaned:  ${result.orphaned.length}`));
  }
  console.log(chalk.gray(`    Unmanaged: ${result.unmanaged.length}`));
  console.log('');

  // Help message if nothing found
  const totalResources = result.managed.length + result.orphaned.length + result.unmanaged.length;
  if (totalResources === 0) {
    console.log(chalk.yellow('  No resources found. This could mean:'));
    console.log(chalk.gray('    - No resources have been deployed yet'));
    console.log(chalk.gray('    - Required GCP APIs are not enabled (Compute, Storage, Cloud Run, etc.)'));
    console.log(chalk.gray('    - The GCP project ID is incorrect'));
    console.log(chalk.gray('    - Your account lacks permission to list resources'));
    console.log('');
    console.log(chalk.gray('  To enable required APIs, run:'));
    console.log(chalk.cyan(`    gcloud services enable compute.googleapis.com --project=${projectId}`));
    console.log(chalk.cyan(`    gcloud services enable storage.googleapis.com --project=${projectId}`));
    console.log(chalk.cyan(`    gcloud services enable run.googleapis.com --project=${projectId}`));
    console.log(chalk.cyan(`    gcloud services enable cloudfunctions.googleapis.com --project=${projectId}`));
    console.log(chalk.cyan(`    gcloud services enable artifactregistry.googleapis.com --project=${projectId}`));
    console.log('');
  }
}

export const inventoryCommand = new Command('inventory')
  .description('Scan GCP for all StackSolo-managed resources')
  .option('--project <id>', 'GCP project ID to scan')
  .option('--region <region>', 'GCP region for regional resources', 'us-central1')
  .option('--orphaned', 'Show only orphaned resources')
  .option('--unmanaged', 'Show unmanaged resources')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await listInventory(options);
  });

// Subcommand: adopt an unmanaged resource
inventoryCommand
  .command('adopt <resourceType> <resourceName> <stacksoloProject>')
  .description('Add StackSolo labels to an unmanaged GCP resource')
  .option('--project <id>', 'GCP project ID')
  .option('--region <region>', 'GCP region for regional resources', 'us-central1')
  .action(async (resourceType: string, resourceName: string, stacksoloProject: string, options) => {
    const projectId = options.project || process.env.GCP_PROJECT_ID;

    if (!projectId) {
      console.log(chalk.red('\n  Error: No GCP project specified.\n'));
      console.log(chalk.gray('  Use --project <id> or set GCP_PROJECT_ID environment variable.\n'));
      process.exit(1);
    }

    console.log(chalk.gray(`\n  Adopting ${resourceType} "${resourceName}" for project "${stacksoloProject}"...\n`));

    const result = await adoptResource(projectId, resourceType, resourceName, stacksoloProject, options.region);

    if (result.success) {
      console.log(chalk.green(`  ✓ Successfully adopted ${resourceName}`));
      console.log(chalk.gray(`    Labels added: stacksolo=true, stacksolo-project=${stacksoloProject}\n`));
    } else {
      console.log(chalk.red(`  ✗ Failed to adopt ${resourceName}`));
      console.log(chalk.gray(`    Error: ${result.error}\n`));
      process.exit(1);
    }
  });

// Subcommand: share a resource with another project
inventoryCommand
  .command('share <resourceType> <resourceName> <additionalProject>')
  .description('Mark a StackSolo resource as shared with another project')
  .option('--project <id>', 'GCP project ID')
  .option('--region <region>', 'GCP region for regional resources', 'us-central1')
  .action(async (resourceType: string, resourceName: string, additionalProject: string, options) => {
    const projectId = options.project || process.env.GCP_PROJECT_ID;

    if (!projectId) {
      console.log(chalk.red('\n  Error: No GCP project specified.\n'));
      console.log(chalk.gray('  Use --project <id> or set GCP_PROJECT_ID environment variable.\n'));
      process.exit(1);
    }

    console.log(chalk.gray(`\n  Scanning for ${resourceType} "${resourceName}"...\n`));

    // First, find the resource to get its current labels
    const result = await scanAllResources(projectId, options.region);
    const allResources = [...result.managed, ...result.orphaned];
    const resource = allResources.find(r => r.name === resourceName && r.type === resourceType);

    if (!resource) {
      console.log(chalk.red(`  ✗ Resource not found: ${resourceType} "${resourceName}"`));
      console.log(chalk.gray('  Make sure the resource exists and has StackSolo labels.\n'));
      process.exit(1);
    }

    console.log(chalk.gray(`  Sharing ${resourceType} "${resourceName}" with project "${additionalProject}"...\n`));

    const shareResult = await shareResource(
      projectId,
      resourceType,
      resourceName,
      resource.labels || {},
      additionalProject,
      options.region
    );

    if (shareResult.success) {
      console.log(chalk.green(`  ✓ Successfully shared ${resourceName}`));
      console.log(chalk.gray(`    Added to stacksolo-shared-with: ${additionalProject}\n`));
    } else {
      console.log(chalk.red(`  ✗ Failed to share ${resourceName}`));
      console.log(chalk.gray(`    Error: ${shareResult.error}\n`));
      process.exit(1);
    }
  });