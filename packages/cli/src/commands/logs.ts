/**
 * stacksolo logs
 *
 * View debug logs from CLI operations.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { getLogPath } from '../logger';

export const logsCommand = new Command('logs')
  .description('View debug logs from CLI operations')
  .option('-n, --lines <count>', 'Number of lines to show', '50')
  .option('--path', 'Show log file path only')
  .option('--clear', 'Clear the debug log')
  .action(async (options) => {
    const logPath = getLogPath();

    if (options.path) {
      console.log(logPath);
      return;
    }

    if (options.clear) {
      try {
        if (fs.existsSync(logPath)) {
          fs.unlinkSync(logPath);
          console.log(chalk.green(`\n  Cleared debug log: ${logPath}\n`));
        } else {
          console.log(chalk.gray(`\n  No log file exists at: ${logPath}\n`));
        }
      } catch (error) {
        console.log(chalk.red(`\n  Failed to clear log: ${error}\n`));
      }
      return;
    }

    // Read and display log
    if (!fs.existsSync(logPath)) {
      console.log(chalk.gray(`\n  No debug log found at: ${logPath}\n`));
      console.log(chalk.gray('  Logs are created when commands encounter errors.\n'));
      return;
    }

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n');
      const lineCount = parseInt(options.lines, 10) || 50;

      console.log(chalk.bold(`\n  Debug Log (last ${lineCount} lines)`));
      console.log(chalk.gray(`  ${logPath}\n`));
      console.log(chalk.gray('─'.repeat(80)));

      // Show last N lines
      const startIndex = Math.max(0, lines.length - lineCount);
      const displayLines = lines.slice(startIndex);

      for (const line of displayLines) {
        // Color-code based on log level
        if (line.includes('[ERROR]')) {
          console.log(chalk.red(line));
        } else if (line.includes('[WARN]')) {
          console.log(chalk.yellow(line));
        } else if (line.includes('[INFO]')) {
          console.log(chalk.cyan(line));
        } else if (line.includes('[DEBUG]')) {
          console.log(chalk.gray(line));
        } else if (line.startsWith('=')) {
          console.log(chalk.blue(line));
        } else {
          console.log(line);
        }
      }

      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.gray(`\n  Total lines in log: ${lines.length}`));
      console.log(chalk.gray(`  Use --lines <n> to see more, or --clear to reset.\n`));
    } catch (error) {
      console.log(chalk.red(`\n  Failed to read log: ${error}\n`));
    }
  });
