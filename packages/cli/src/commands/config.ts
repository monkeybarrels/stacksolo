/**
 * stacksolo config
 *
 * Commands for viewing and validating stacksolo.config.json
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseConfig, validateConfig } from '@stacksolo/blueprint';
import { resolveConfig, topologicalSort } from '@stacksolo/blueprint';
import { parseReference } from '@stacksolo/blueprint';
import type { StackSoloConfig, NetworkConfig } from '@stacksolo/blueprint';

const STACKSOLO_DIR = '.stacksolo';
const CONFIG_FILENAME = 'stacksolo.config.json';

function getConfigPath(): string {
  return path.join(process.cwd(), STACKSOLO_DIR, CONFIG_FILENAME);
}

async function loadConfig(configPath: string): Promise<StackSoloConfig | null> {
  try {
    return parseConfig(configPath);
  } catch (error) {
    console.log(chalk.red(`\n  Error: Could not read ${STACKSOLO_DIR}/${CONFIG_FILENAME}\n`));
    console.log(chalk.gray(`  ${error}`));
    return null;
  }
}

// ============================================================================
// config show - Pretty-print the config
// ============================================================================

const showCommand = new Command('show')
  .description('Display the current configuration')
  .option('-r, --raw', 'Output raw JSON without formatting')
  .action(async (options) => {
    const configPath = getConfigPath();

    const config = await loadConfig(configPath);
    if (!config) return;

    if (options.raw) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(chalk.bold('\n  StackSolo Configuration\n'));

    // Project info
    console.log(chalk.cyan('  Project:'));
    console.log(chalk.white(`    Name:       ${config.project.name}`));
    console.log(chalk.white(`    Region:     ${config.project.region}`));
    console.log(chalk.white(`    GCP Project: ${config.project.gcpProjectId}`));

    // Global resources
    const { buckets, secrets, topics, queues, crons } = config.project;

    if (buckets?.length) {
      console.log(chalk.cyan('\n  Buckets:'));
      buckets.forEach((b) => {
        console.log(chalk.white(`    - ${b.name}`) + chalk.gray(` (${b.storageClass || 'STANDARD'})`));
      });
    }

    if (secrets?.length) {
      console.log(chalk.cyan('\n  Secrets:'));
      secrets.forEach((s) => {
        console.log(chalk.white(`    - ${s.name}`));
      });
    }

    if (topics?.length) {
      console.log(chalk.cyan('\n  Topics:'));
      topics.forEach((t) => {
        console.log(chalk.white(`    - ${t.name}`));
      });
    }

    if (queues?.length) {
      console.log(chalk.cyan('\n  Queues:'));
      queues.forEach((q) => {
        console.log(chalk.white(`    - ${q.name}`));
      });
    }

    if (crons?.length) {
      console.log(chalk.cyan('\n  Scheduled Jobs:'));
      crons.forEach((c) => {
        console.log(chalk.white(`    - ${c.name}`) + chalk.gray(` (${c.schedule})`));
      });
    }

    // Networks and their resources
    const networks = config.project.networks || [];
    if (networks.length) {
      networks.forEach((network: NetworkConfig) => {
        console.log(chalk.cyan(`\n  Network: ${network.name}`));

        if (network.subnets?.length) {
          console.log(chalk.gray('    Subnets:'));
          network.subnets.forEach((s) => {
            console.log(chalk.white(`      - ${s.name}`) + chalk.gray(` (${s.ipCidrRange})`));
          });
        }

        if (network.containers?.length) {
          console.log(chalk.gray('    Containers:'));
          network.containers.forEach((c) => {
            console.log(chalk.white(`      - ${c.name}`) + chalk.gray(` (${c.memory || '256Mi'})`));
          });
        }

        if (network.functions?.length) {
          console.log(chalk.gray('    Functions:'));
          network.functions.forEach((f) => {
            console.log(chalk.white(`      - ${f.name}`) + chalk.gray(` (${f.runtime || 'nodejs20'})`));
          });
        }

        if (network.databases?.length) {
          console.log(chalk.gray('    Databases:'));
          network.databases.forEach((d) => {
            console.log(chalk.white(`      - ${d.name}`) + chalk.gray(` (${d.databaseVersion || 'POSTGRES_15'})`));
          });
        }

        if (network.caches?.length) {
          console.log(chalk.gray('    Caches:'));
          network.caches.forEach((c) => {
            console.log(chalk.white(`      - ${c.name}`) + chalk.gray(` (${c.memorySizeGb || 1}GB)`));
          });
        }
      });
    }

    console.log('');
  });

// ============================================================================
// config resources - List all resources that will be created
// ============================================================================

const resourcesCommand = new Command('resources')
  .description('List all resources that will be created')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const configPath = getConfigPath();

    const config = await loadConfig(configPath);
    if (!config) return;

    try {
      const resolved = resolveConfig(config);
      const order = topologicalSort(resolved.resources);

      if (options.json) {
        console.log(JSON.stringify(resolved.resources, null, 2));
        return;
      }

      console.log(chalk.bold('\n  Resources to Create\n'));
      console.log(chalk.gray(`  Order of creation (${order.length} resources):\n`));

      order.forEach((id, index) => {
        const resource = resolved.resources.find((r) => r.id === id);
        if (!resource) return;

        const deps = resource.dependsOn.length
          ? chalk.gray(` → depends on: ${resource.dependsOn.join(', ')}`)
          : '';

        console.log(
          chalk.white(`  ${String(index + 1).padStart(2)}. `) +
            chalk.cyan(resource.type) +
            chalk.white(` "${resource.name}"`) +
            deps
        );
      });

      console.log('');
    } catch (error) {
      console.log(chalk.red(`\n  Error resolving config: ${error}\n`));
    }
  });

// ============================================================================
// config validate - Check if config is valid
// ============================================================================

const validateCommand = new Command('validate')
  .description('Validate the configuration file')
  .action(async () => {
    const configPath = getConfigPath();

    const config = await loadConfig(configPath);
    if (!config) return;

    const result = validateConfig(config);

    if (result.valid) {
      console.log(chalk.green('\n  ✓ Configuration is valid\n'));

      // Also try to resolve to catch dependency issues
      try {
        const resolved = resolveConfig(config);
        const order = topologicalSort(resolved.resources);
        console.log(chalk.gray(`  ${resolved.resources.length} resources defined`));
        console.log(chalk.gray(`  No circular dependencies detected\n`));
      } catch (error) {
        console.log(chalk.yellow(`\n  ⚠ Warning: ${error}\n`));
      }
    } else {
      console.log(chalk.red('\n  ✗ Configuration has errors:\n'));
      result.errors.forEach((err) => {
        console.log(chalk.red(`    - ${err.path}: ${err.message}`));
        if (err.value !== undefined) {
          console.log(chalk.gray(`      value: ${JSON.stringify(err.value)}`));
        }
      });
      console.log('');
      process.exit(1);
    }
  });

// ============================================================================
// config references - Show all @type/name references
// ============================================================================

const referencesCommand = new Command('references')
  .description('Show all resource references in the configuration')
  .action(async () => {
    const configPath = getConfigPath();

    const config = await loadConfig(configPath);
    if (!config) return;

    console.log(chalk.bold('\n  Resource References\n'));

    const allReferences: Array<{
      location: string;
      envVar: string;
      reference: string;
      parsed: ReturnType<typeof parseReference>;
    }> = [];

    // Collect references from networks
    const networks = config.project.networks || [];
    networks.forEach((network: NetworkConfig) => {
      // Check containers
      network.containers?.forEach((container) => {
        if (container.env) {
          Object.entries(container.env).forEach(([key, value]) => {
            if (value.startsWith('@')) {
              allReferences.push({
                location: `${network.name}/${container.name}`,
                envVar: key,
                reference: value,
                parsed: parseReference(value),
              });
            }
          });
        }
      });

      // Check functions
      network.functions?.forEach((func) => {
        if (func.env) {
          Object.entries(func.env).forEach(([key, value]) => {
            if (value.startsWith('@')) {
              allReferences.push({
                location: `${network.name}/${func.name}`,
                envVar: key,
                reference: value,
                parsed: parseReference(value),
              });
            }
          });
        }
      });
    });

    if (allReferences.length === 0) {
      console.log(chalk.gray('  No references found.\n'));
      return;
    }

    // Group by type
    const byType = new Map<string, typeof allReferences>();
    allReferences.forEach((ref) => {
      const type = ref.parsed?.type || 'unknown';
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(ref);
    });

    byType.forEach((refs, type) => {
      console.log(chalk.cyan(`  @${type}:`));
      refs.forEach((ref) => {
        const property = ref.parsed?.property ? `.${ref.parsed.property}` : '';
        console.log(
          chalk.white(`    ${ref.reference}`) +
            chalk.gray(` → ${ref.location}.env.${ref.envVar}`)
        );
      });
      console.log('');
    });
  });

// ============================================================================
// Main config command
// ============================================================================

export const configCommand = new Command('config')
  .description('View and validate configuration')
  .addCommand(showCommand)
  .addCommand(resourcesCommand)
  .addCommand(validateCommand)
  .addCommand(referencesCommand);

// Default action when just running `stacksolo config`
configCommand.action(() => {
  configCommand.outputHelp();
});
