/**
 * CLI Integration Utilities
 *
 * Functions to execute StackSolo CLI commands from the web admin.
 * These run on the server side via SvelteKit API routes.
 */

import { spawn } from 'child_process';

/** Result from a CLI command execution */
export interface CLIResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Options for CLI execution */
export interface CLIOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Execute a stacksolo CLI command and return the result.
 * Use this for commands that complete quickly (status, config, etc.)
 */
export async function execCLI(
  args: string[],
  options: CLIOptions = {}
): Promise<CLIResult> {
  const { cwd = process.env.STACKSOLO_PROJECT_PATH, timeout = 30000 } = options;

  return new Promise((resolve) => {
    const proc = spawn('stacksolo', args, {
      cwd,
      env: { ...process.env, ...options.env },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        success: false,
        stdout,
        stderr: stderr + '\nCommand timed out',
        exitCode: -1,
      });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        stdout,
        stderr: err.message,
        exitCode: -1,
      });
    });
  });
}

/** Callback for streaming output */
export type StreamCallback = (line: string, type: 'stdout' | 'stderr') => void;

/**
 * Execute a stacksolo CLI command with streaming output.
 * Use this for long-running commands (deploy, dev logs, etc.)
 *
 * @returns A function to abort the command
 */
export function streamCLI(
  args: string[],
  onData: StreamCallback,
  onComplete: (exitCode: number) => void,
  options: CLIOptions = {}
): () => void {
  const { cwd = process.env.STACKSOLO_PROJECT_PATH } = options;

  const proc = spawn('stacksolo', args, {
    cwd,
    env: { ...process.env, ...options.env },
    shell: true,
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line: string) => onData(line, 'stdout'));
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach((line: string) => onData(line, 'stderr'));
  });

  proc.on('close', (code) => {
    onComplete(code ?? -1);
  });

  proc.on('error', (err) => {
    onData(`Error: ${err.message}`, 'stderr');
    onComplete(-1);
  });

  // Return abort function
  return () => {
    proc.kill();
  };
}

/**
 * Parse JSON output from CLI commands that support --json flag
 */
export function parseJSONOutput<T>(result: CLIResult): T | null {
  if (!result.success) {
    return null;
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    return null;
  }
}
