/**
 * @stacksolo/cli
 *
 * CLI entry point for StackSolo commands.
 * Can be run standalone or invoked by the Electron shell.
 */

import { Command } from 'commander';
import { createRequire } from 'module';
import {
  // Project commands
  initCommand,
  scaffoldCommand,
  cloneCommand,
  addCommand,
  // Infrastructure commands
  deployCommand,
  destroyCommand,
  statusCommand,
  outputCommand,
  logsCommand,
  resetCommand,
  infraCommand,
  listCommand,
  eventsCommand,
  inventoryCommand,
  doctorCommand,
  mergeCommand,
  refreshCommand,
  // Development commands
  buildCommand,
  devCommand,
  installCommand,
  serveCommand,
  // Configuration commands
  configCommand,
  envCommand,
  registerCommand,
  unregisterCommand,
} from './commands';

// Read version from package.json at runtime
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('stacksolo')
  .description('Deploy cloud infrastructure for your applications')
  .version(pkg.version);

// Project commands
program.addCommand(initCommand);
program.addCommand(scaffoldCommand);
program.addCommand(cloneCommand);
program.addCommand(addCommand);

// Infrastructure commands
program.addCommand(deployCommand);
program.addCommand(destroyCommand);
program.addCommand(statusCommand);
program.addCommand(outputCommand);
program.addCommand(logsCommand);
program.addCommand(resetCommand);
program.addCommand(infraCommand);
program.addCommand(listCommand);
program.addCommand(eventsCommand);
program.addCommand(inventoryCommand);
program.addCommand(doctorCommand);
program.addCommand(mergeCommand);
program.addCommand(refreshCommand);

// Development commands
program.addCommand(buildCommand);
program.addCommand(devCommand);
program.addCommand(installCommand);
program.addCommand(serveCommand);

// Configuration commands
program.addCommand(configCommand);
program.addCommand(envCommand);
program.addCommand(registerCommand);
program.addCommand(unregisterCommand);

program.parse();
