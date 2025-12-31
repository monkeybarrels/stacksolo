/**
 * Debug logger for StackSolo CLI
 * Writes debug output to .stacksolo/debug.log
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const STACKSOLO_DIR = '.stacksolo';
const DEBUG_LOG_FILE = 'debug.log';
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

let logFilePath: string | null = null;
let sessionStarted = false;

/**
 * Get the debug log file path
 */
export function getLogPath(): string {
  if (!logFilePath) {
    // Try local .stacksolo first, fall back to home directory
    const localDir = path.join(process.cwd(), STACKSOLO_DIR);
    const homeDir = path.join(homedir(), STACKSOLO_DIR);

    if (fs.existsSync(localDir)) {
      logFilePath = path.join(localDir, DEBUG_LOG_FILE);
    } else {
      // Ensure home directory exists
      if (!fs.existsSync(homeDir)) {
        fs.mkdirSync(homeDir, { recursive: true });
      }
      logFilePath = path.join(homeDir, DEBUG_LOG_FILE);
    }
  }
  return logFilePath;
}

/**
 * Initialize logging session with separator
 */
function initSession(): void {
  if (sessionStarted) return;
  sessionStarted = true;

  const logPath = getLogPath();

  // Rotate log if too large
  try {
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > MAX_LOG_SIZE) {
        const backupPath = logPath + '.old';
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.renameSync(logPath, backupPath);
      }
    }
  } catch {
    // Ignore rotation errors
  }

  // Write session header
  const timestamp = new Date().toISOString();
  const separator = '='.repeat(80);
  const header = `\n${separator}\n[${timestamp}] StackSolo CLI Session Started\n${separator}\n`;

  try {
    fs.appendFileSync(logPath, header);
  } catch {
    // Ignore write errors
  }
}

/**
 * Format a log entry
 */
function formatEntry(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  let entry = `[${timestamp}] [${level}] ${message}`;

  if (data !== undefined) {
    try {
      if (data instanceof Error) {
        entry += `\n  Error: ${data.message}`;
        if (data.stack) {
          entry += `\n  Stack: ${data.stack}`;
        }
      } else if (typeof data === 'object') {
        entry += `\n  Data: ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}`;
      } else {
        entry += `\n  Data: ${String(data)}`;
      }
    } catch {
      entry += `\n  Data: [Could not serialize]`;
    }
  }

  return entry + '\n';
}

/**
 * Write to the debug log
 */
function writeLog(level: string, message: string, data?: unknown): void {
  initSession();
  const entry = formatEntry(level, message, data);

  try {
    fs.appendFileSync(getLogPath(), entry);
  } catch {
    // Silently fail - don't interrupt CLI operation
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, data?: unknown): void {
  writeLog('INFO', message, data);
}

/**
 * Log a warning message
 */
export function logWarn(message: string, data?: unknown): void {
  writeLog('WARN', message, data);
}

/**
 * Log an error message
 */
export function logError(message: string, data?: unknown): void {
  writeLog('ERROR', message, data);
}

/**
 * Log a debug message (verbose)
 */
export function logDebug(message: string, data?: unknown): void {
  writeLog('DEBUG', message, data);
}

/**
 * Log command execution
 */
export function logCommand(command: string, args?: Record<string, unknown>): void {
  writeLog('CMD', `Executing: ${command}`, args);
}

/**
 * Log command output (stdout/stderr)
 */
export function logOutput(type: 'stdout' | 'stderr', output: string): void {
  if (output.trim()) {
    writeLog(type.toUpperCase(), output.trim());
  }
}

/**
 * Log a full error with context for debugging
 */
export function logFullError(
  context: string,
  error: unknown,
  additionalData?: Record<string, unknown>
): void {
  const errorData: Record<string, unknown> = {
    context,
    ...additionalData,
  };

  if (error instanceof Error) {
    errorData.errorMessage = error.message;
    errorData.errorStack = error.stack;
    errorData.errorName = error.name;
  } else {
    errorData.rawError = String(error);
  }

  writeLog('ERROR', `Error in ${context}`, errorData);
}

/**
 * Create a logger for a specific command
 */
export function createCommandLogger(commandName: string) {
  return {
    info: (message: string, data?: unknown) => logInfo(`[${commandName}] ${message}`, data),
    warn: (message: string, data?: unknown) => logWarn(`[${commandName}] ${message}`, data),
    error: (message: string, data?: unknown) => logError(`[${commandName}] ${message}`, data),
    debug: (message: string, data?: unknown) => logDebug(`[${commandName}] ${message}`, data),
    command: (cmd: string, args?: Record<string, unknown>) =>
      logCommand(`[${commandName}] ${cmd}`, args),
  };
}
