/**
 * stacksolo serve
 *
 * Start the StackSolo API server (headless mode).
 * Used by the CLI when not running as a desktop app.
 */

import { Command } from 'commander';
import chalk from 'chalk';

export const serveCommand = new Command('serve')
  .description('Start the StackSolo API server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--host <host>', 'Host to bind to', 'localhost')
  .action(async (options) => {
    console.log(chalk.bold('\n  StackSolo Server\n'));

    const port = parseInt(options.port, 10);
    const host = options.host;

    console.log(chalk.gray(`  Starting API server on ${host}:${port}...`));

    // Dynamically import the API to avoid bundling it unnecessarily
    try {
      // The API package exports a startServer function we can call
      const { startServer } = await import('@stacksolo/api');
      await startServer({ port, host });
    } catch (error) {
      // Fallback: spawn as child process
      const { spawn } = await import('child_process');
      const path = await import('path');
      const { fileURLToPath } = await import('url');

      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const apiPath = path.resolve(__dirname, '../../api/dist/index.js');

      console.log(chalk.gray(`  Spawning API from ${apiPath}...\n`));

      const child = spawn('node', [apiPath], {
        env: {
          ...process.env,
          PORT: String(port),
          HOST: host,
        },
        stdio: 'inherit',
      });

      child.on('error', (err) => {
        console.log(chalk.red(`  Failed to start server: ${err.message}\n`));
        process.exit(1);
      });

      child.on('exit', (code) => {
        process.exit(code || 0);
      });

      // Handle shutdown
      process.on('SIGINT', () => {
        child.kill('SIGINT');
      });

      process.on('SIGTERM', () => {
        child.kill('SIGTERM');
      });
    }
  });
