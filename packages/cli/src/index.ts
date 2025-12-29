/**
 * @stacksolo/cli
 *
 * CLI entry point for StackSolo commands.
 * Can be run standalone or invoked by the Electron shell.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { configCommand } from './commands/config';
import { scaffoldCommand } from './commands/scaffold';
import { deployCommand } from './commands/deploy';
import { destroyCommand } from './commands/destroy';
import { statusCommand } from './commands/status';
import { envCommand } from './commands/env';
import { serveCommand } from './commands/serve';
import { registerCommand } from './commands/register';
import { listCommand } from './commands/list';
import { outputCommand } from './commands/output';
import { unregisterCommand } from './commands/unregister';
import { buildCommand } from './commands/build';

const program = new Command();

program
  .name('stacksolo')
  .description('Deploy cloud infrastructure for your applications')
  .version('0.1.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(scaffoldCommand);
program.addCommand(deployCommand);
program.addCommand(destroyCommand);
program.addCommand(statusCommand);
program.addCommand(envCommand);
program.addCommand(serveCommand);
program.addCommand(registerCommand);
program.addCommand(listCommand);
program.addCommand(outputCommand);
program.addCommand(unregisterCommand);
program.addCommand(buildCommand);

program.parse();
