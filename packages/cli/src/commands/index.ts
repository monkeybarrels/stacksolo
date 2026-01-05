/**
 * StackSolo CLI Commands
 *
 * Commands are organized into groups:
 * - project/  - Project setup (init, scaffold)
 * - infra/    - Infrastructure (deploy, destroy, status, etc.)
 * - dev/      - Development (build, serve)
 * - config/   - Configuration (config, env, register, etc.)
 */

// Project commands
export { initCommand, scaffoldCommand } from './project';

// Infrastructure commands
export {
  deployCommand,
  destroyCommand,
  statusCommand,
  outputCommand,
  logsCommand,
  resetCommand,
  infraCommand,
  listCommand,
  eventsCommand,
} from './infra';

// Development commands
export { buildCommand, devCommand, installCommand, serveCommand } from './dev';

// Configuration commands
export {
  configCommand,
  envCommand,
  registerCommand,
  unregisterCommand,
} from './config';
