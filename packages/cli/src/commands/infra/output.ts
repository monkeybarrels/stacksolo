/**
 * stacksolo output
 *
 * Get resource output values from the registry
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getRegistry, ReferenceService } from '@stacksolo/registry';

export const outputCommand = new Command('output')
  .description('Get resource output value from the registry')
  .argument('<reference>', 'Resource reference (e.g., @project/resource.property)')
  .option('--json', 'Output as JSON')
  .action(async (reference, options) => {
    const registry = getRegistry();
    const refService = new ReferenceService(registry);

    // Validate reference format
    const parsed = refService.parseReference(reference);
    if (!parsed) {
      console.log(chalk.red(`\n  Error: Invalid reference format: ${reference}\n`));
      console.log(chalk.gray('  Expected format:'));
      console.log(chalk.gray('    @project/resource.property'));
      console.log(chalk.gray('    @project/network/resource.property\n'));
      console.log(chalk.gray('  Examples:'));
      console.log(chalk.gray('    @shared-infra/users-db.connectionString'));
      console.log(chalk.gray('    @shared-infra/main/api.url'));
      console.log(chalk.gray('    @my-project/uploads.name\n'));
      process.exit(1);
    }

    try {
      const result = await refService.resolveWithResource(reference);

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              reference,
              value: result.value,
              resource: {
                id: result.resource.id,
                name: result.resource.name,
                type: result.resource.type,
                network: result.resource.network,
                status: result.resource.status,
              },
            },
            null,
            2
          )
        );
      } else {
        // Just output the value (useful for scripting)
        console.log(result.value);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`\n  Error: ${message}\n`));

      // Provide helpful hints
      if (message.includes('Project not found')) {
        console.log(chalk.gray('  Run `stacksolo list` to see registered projects.\n'));
      } else if (message.includes('Resource not found')) {
        console.log(chalk.gray(`  Run \`stacksolo list ${parsed.projectName}\` to see resources.\n`));
      } else if (message.includes('not been deployed')) {
        console.log(chalk.gray('  Deploy the project first to populate outputs.\n'));
      } else if (message.includes('not found in outputs')) {
        // Try to show available properties
        try {
          const project = await registry.findProjectByName(parsed.projectName);
          if (project) {
            const resource = await registry.findResourceByRef(
              project.id,
              parsed.resourceName,
              parsed.network
            );
            if (resource?.outputs) {
              const available = Object.keys(resource.outputs);
              console.log(chalk.gray(`  Available properties: ${available.join(', ')}\n`));
            }
          }
        } catch {
          // Ignore errors in hint generation
        }
      }

      process.exit(1);
    }
  });
