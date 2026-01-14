/**
 * Secret Manager Service
 *
 * Handles scanning for @secret/ references in config,
 * checking which secrets exist in GCP Secret Manager,
 * reading values from .env.production, and creating missing secrets.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { StackSoloConfig } from '@stacksolo/blueprint';

const execAsync = promisify(exec);

export interface SecretReference {
  envKey: string;        // e.g., "OPENAI_API_KEY"
  secretName: string;    // e.g., "openai-api-key"
  source: string;        // e.g., "function:api" or "container:admin"
}

export interface SecretCheckResult {
  required: SecretReference[];
  existing: string[];
  missing: SecretReference[];
}

export interface SecretCreationResult {
  success: boolean;
  created: string[];
  failed: string[];
  skipped: string[];
}

/**
 * Scan config for all @secret/ references in env vars
 */
export function scanSecretReferences(config: StackSoloConfig): SecretReference[] {
  const secrets: SecretReference[] = [];
  const seen = new Set<string>();

  // Scan networks for functions and containers
  for (const network of config.project.networks || []) {
    // Scan functions
    for (const fn of network.functions || []) {
      const env = fn.env || {};
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && value.startsWith('@secret/')) {
          const secretName = value.replace('@secret/', '');
          if (!seen.has(secretName)) {
            seen.add(secretName);
            secrets.push({
              envKey: key,
              secretName,
              source: `function:${fn.name}`,
            });
          }
        }
      }
    }

    // Scan containers
    for (const container of network.containers || []) {
      const env = container.env || {};
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && value.startsWith('@secret/')) {
          const secretName = value.replace('@secret/', '');
          if (!seen.has(secretName)) {
            seen.add(secretName);
            secrets.push({
              envKey: key,
              secretName,
              source: `container:${container.name}`,
            });
          }
        }
      }

      // Also check the 'secrets' field if present
      const containerSecrets = container.secrets || {};
      for (const [key, value] of Object.entries(containerSecrets)) {
        if (typeof value === 'string' && value.startsWith('@secret/')) {
          const secretName = value.replace('@secret/', '');
          if (!seen.has(secretName)) {
            seen.add(secretName);
            secrets.push({
              envKey: key,
              secretName,
              source: `container:${container.name}`,
            });
          }
        }
      }
    }
  }

  // Scan kernel config
  if (config.project.kernel?.env) {
    for (const [key, value] of Object.entries(config.project.kernel.env)) {
      if (typeof value === 'string' && value.startsWith('@secret/')) {
        const secretName = value.replace('@secret/', '');
        if (!seen.has(secretName)) {
          seen.add(secretName);
          secrets.push({
            envKey: key,
            secretName,
            source: 'kernel',
          });
        }
      }
    }
  }

  return secrets;
}

/**
 * Check which secrets exist in GCP Secret Manager
 */
export async function checkExistingSecrets(
  gcpProjectId: string,
  secretNames: string[]
): Promise<string[]> {
  if (secretNames.length === 0) {
    return [];
  }

  try {
    const { stdout } = await execAsync(
      `gcloud secrets list --project=${gcpProjectId} --format="value(name)"`,
      { timeout: 30000 }
    );

    const existingSecrets = stdout.trim().split('\n').filter(s => s);

    // Filter to only return secrets that are in our list
    return secretNames.filter(name => existingSecrets.includes(name));
  } catch (error) {
    // If the command fails, assume no secrets exist
    // This handles cases where Secret Manager API isn't enabled yet
    return [];
  }
}

/**
 * Read values from .env.production file
 * Returns a map of env key names to values
 */
export async function readEnvProductionFile(projectDir: string): Promise<Record<string, string>> {
  const envPath = path.join(projectDir, '.env.production');
  const values: Record<string, string> = {};

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=value format
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        values[key] = value;
      }
    }
  } catch {
    // File doesn't exist or can't be read - return empty
  }

  return values;
}

/**
 * Create a secret in GCP Secret Manager
 */
export async function createSecret(
  gcpProjectId: string,
  secretName: string,
  secretValue: string
): Promise<boolean> {
  try {
    // First, create the secret (without a version)
    await execAsync(
      `gcloud secrets create ${secretName} --project=${gcpProjectId} --replication-policy="automatic"`,
      { timeout: 30000 }
    );

    // Then add the secret version with the value
    // Use stdin to avoid exposing the secret in process args
    await execAsync(
      `echo -n "${secretValue.replace(/"/g, '\\"')}" | gcloud secrets versions add ${secretName} --project=${gcpProjectId} --data-file=-`,
      { timeout: 30000 }
    );

    return true;
  } catch (error) {
    const errorStr = String(error);
    // If secret already exists, try to just add a new version
    if (errorStr.includes('already exists')) {
      try {
        await execAsync(
          `echo -n "${secretValue.replace(/"/g, '\\"')}" | gcloud secrets versions add ${secretName} --project=${gcpProjectId} --data-file=-`,
          { timeout: 30000 }
        );
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Full secret checking flow:
 * 1. Scan config for @secret/ references
 * 2. Check which exist in GCP
 * 3. Return required, existing, and missing lists
 */
export async function checkSecrets(
  config: StackSoloConfig,
  gcpProjectId: string
): Promise<SecretCheckResult> {
  const required = scanSecretReferences(config);
  const secretNames = required.map(s => s.secretName);
  const existing = await checkExistingSecrets(gcpProjectId, secretNames);

  const missing = required.filter(s => !existing.includes(s.secretName));

  return {
    required,
    existing,
    missing,
  };
}

/**
 * Interactively create missing secrets
 * Returns which secrets were created, failed, or skipped
 */
export async function createMissingSecrets(
  missing: SecretReference[],
  gcpProjectId: string,
  projectDir: string,
  options: {
    onLog?: (message: string) => void;
    promptForValue?: (envKey: string, secretName: string) => Promise<string | null>;
    skipPrompt?: boolean;
  } = {}
): Promise<SecretCreationResult> {
  const { onLog = console.log, promptForValue, skipPrompt = false } = options;

  const result: SecretCreationResult = {
    success: true,
    created: [],
    failed: [],
    skipped: [],
  };

  if (missing.length === 0) {
    return result;
  }

  // Read .env.production for potential values
  const envValues = await readEnvProductionFile(projectDir);

  for (const secret of missing) {
    // Check if we have a value in .env.production
    let value = envValues[secret.envKey];

    if (!value && !skipPrompt && promptForValue) {
      // Prompt user for the value
      value = await promptForValue(secret.envKey, secret.secretName) ?? undefined;
    }

    if (!value) {
      // Skip this secret
      result.skipped.push(secret.secretName);
      onLog(`  Skipped: ${secret.secretName} (no value provided)`);
      continue;
    }

    // Create the secret
    onLog(`  Creating secret: ${secret.secretName}...`);
    const success = await createSecret(gcpProjectId, secret.secretName, value);

    if (success) {
      result.created.push(secret.secretName);
      onLog(`  Created: ${secret.secretName}`);
    } else {
      result.failed.push(secret.secretName);
      result.success = false;
      onLog(`  Failed: ${secret.secretName}`);
    }
  }

  return result;
}

/**
 * Map an environment variable name to a secret name
 * Converts from SCREAMING_SNAKE_CASE to kebab-case
 */
export function envKeyToSecretName(envKey: string): string {
  return envKey.toLowerCase().replace(/_/g, '-');
}

/**
 * Map a secret name to an environment variable name
 * Converts from kebab-case to SCREAMING_SNAKE_CASE
 */
export function secretNameToEnvKey(secretName: string): string {
  return secretName.toUpperCase().replace(/-/g, '_');
}
