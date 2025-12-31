/**
 * @stacksolo/cli
 *
 * CLI entry point for StackSolo commands.
 * Can be run standalone or invoked by the Electron shell.
 */

import { Command } from 'commander';
import {
  // Project commands
  initCommand,
  scaffoldCommand,
  // Infrastructure commands
  deployCommand,
  destroyCommand,
  statusCommand,
  outputCommand,
  logsCommand,
  resetCommand,
  infraCommand,
  listCommand,
  // Development commands
  buildCommand,
  installCommand,
  serveCommand,
  // Configuration commands
  configCommand,
  envCommand,
  registerCommand,
  unregisterCommand,
} from './commands';

const program = new Command();

program
  .name('stacksolo')
  .description('Deploy cloud infrastructure for your applications')
  .version('0.1.0');

// Project commands
program.addCommand(initCommand);
program.addCommand(scaffoldCommand);

// Infrastructure commands
program.addCommand(deployCommand);
program.addCommand(destroyCommand);
program.addCommand(statusCommand);
program.addCommand(outputCommand);
program.addCommand(logsCommand);
program.addCommand(resetCommand);
program.addCommand(infraCommand);
program.addCommand(listCommand);

// Development commands
program.addCommand(buildCommand);
program.addCommand(installCommand);
program.addCommand(serveCommand);

// Configuration commands
program.addCommand(configCommand);
program.addCommand(envCommand);
program.addCommand(registerCommand);
program.addCommand(unregisterCommand);

program.parse();
