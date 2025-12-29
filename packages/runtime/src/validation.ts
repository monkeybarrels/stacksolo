/**
 * Configuration validation helpers
 */

/**
 * Validate that all required environment variables are set.
 * Call this at application startup to fail fast.
 *
 * @param requiredVars - Array of required environment variable names
 * @throws Error if any required variables are missing
 *
 * @example
 * ```typescript
 * import { validateConfig } from '@stacksolo/runtime';
 *
 * // Call at app startup
 * validateConfig(['DATABASE_URL', 'APP_URL']);
 * ```
 */
export function validateConfig(requiredVars: string[]): void {
  const missing: string[] = [];

  for (const name of requiredVars) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Run `stacksolo generate-config` to generate your .env.local file.'
    );
  }
}

/**
 * Get a required environment variable or throw an error.
 *
 * @param name - Environment variable name
 * @param description - Optional description for the error message
 * @returns The environment variable value
 * @throws Error if the variable is not set
 *
 * @example
 * ```typescript
 * import { getRequiredEnv } from '@stacksolo/runtime';
 *
 * const dbUrl = getRequiredEnv('DATABASE_URL', 'Database connection string');
 * ```
 */
export function getRequiredEnv(name: string, description?: string): string {
  const value = process.env[name];
  if (!value) {
    const desc = description ? ` (${description})` : '';
    throw new Error(
      `Missing required environment variable: ${name}${desc}\n` +
        'Run `stacksolo generate-config` to generate your .env.local file.'
    );
  }
  return value;
}
