/**
 * StackSolo Blueprint Parser
 * Reads and validates stacksolo.config.json
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type {
  StackSoloConfig,
  ValidationResult,
  ValidationError,
  ProjectConfig,
  NetworkConfig,
  ContainerConfig,
  FunctionConfig,
  DatabaseConfig,
  CacheConfig,
  BucketConfig,
  SecretConfig,
  TopicConfig,
  QueueConfig,
  CronConfig,
} from './schema.js';

const CONFIG_FILENAMES = [
  'stacksolo.config.json',
  'stacksolo.json',
  '.stacksolo.json',
];

/**
 * Find the config file in the given directory
 */
export function findConfigFile(dir: string): string | null {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = resolve(dir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }
  return null;
}

/**
 * Parse the config file from a path
 */
export function parseConfig(configPath: string): StackSoloConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in config file: ${(err as Error).message}`);
  }

  return parsed as StackSoloConfig;
}

/**
 * Parse config from a directory (auto-discovers config file)
 */
export function parseConfigFromDir(dir: string): StackSoloConfig {
  const configPath = findConfigFile(dir);
  if (!configPath) {
    throw new Error(
      `No config file found in ${dir}. Expected one of: ${CONFIG_FILENAMES.join(', ')}`
    );
  }
  return parseConfig(configPath);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate the entire config
 */
export function validateConfig(config: StackSoloConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Check root structure
  if (!config.project) {
    errors.push({ path: 'project', message: 'project is required' });
    return { valid: false, errors };
  }

  // Validate project
  validateProject(config.project, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateProject(project: ProjectConfig, errors: ValidationError[]): void {
  // Required fields
  if (!project.name) {
    errors.push({ path: 'project.name', message: 'name is required' });
  } else if (!isValidResourceName(project.name)) {
    errors.push({
      path: 'project.name',
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: project.name,
    });
  }

  if (!project.region) {
    errors.push({ path: 'project.region', message: 'region is required' });
  }

  if (!project.gcpProjectId) {
    errors.push({ path: 'project.gcpProjectId', message: 'gcpProjectId is required' });
  }

  // Validate buckets
  if (project.buckets) {
    project.buckets.forEach((bucket, i) => {
      validateBucket(bucket, `project.buckets[${i}]`, errors);
    });
  }

  // Validate secrets
  if (project.secrets) {
    project.secrets.forEach((secret, i) => {
      validateSecret(secret, `project.secrets[${i}]`, errors);
    });
  }

  // Validate topics
  if (project.topics) {
    project.topics.forEach((topic, i) => {
      validateTopic(topic, `project.topics[${i}]`, errors);
    });
  }

  // Validate queues
  if (project.queues) {
    project.queues.forEach((queue, i) => {
      validateQueue(queue, `project.queues[${i}]`, errors);
    });
  }

  // Validate crons
  if (project.crons) {
    project.crons.forEach((cron, i) => {
      validateCron(cron, `project.crons[${i}]`, errors);
    });
  }

  // Validate networks
  if (project.networks) {
    project.networks.forEach((network, i) => {
      validateNetwork(network, `project.networks[${i}]`, errors);
    });
  }

  // Check for duplicate names across all resources
  checkDuplicateNames(project, errors);
}

function validateBucket(bucket: BucketConfig, path: string, errors: ValidationError[]): void {
  if (!bucket.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidBucketName(bucket.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'bucket name must be 3-63 chars, lowercase alphanumeric with hyphens/underscores',
      value: bucket.name,
    });
  }

  if (bucket.storageClass && !['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'].includes(bucket.storageClass)) {
    errors.push({
      path: `${path}.storageClass`,
      message: 'storageClass must be STANDARD, NEARLINE, COLDLINE, or ARCHIVE',
      value: bucket.storageClass,
    });
  }
}

function validateSecret(secret: SecretConfig, path: string, errors: ValidationError[]): void {
  if (!secret.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(secret.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: secret.name,
    });
  }
}

function validateTopic(topic: TopicConfig, path: string, errors: ValidationError[]): void {
  if (!topic.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(topic.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: topic.name,
    });
  }
}

function validateQueue(queue: QueueConfig, path: string, errors: ValidationError[]): void {
  if (!queue.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(queue.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: queue.name,
    });
  }
}

function validateCron(cron: CronConfig, path: string, errors: ValidationError[]): void {
  if (!cron.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  }

  if (!cron.schedule) {
    errors.push({ path: `${path}.schedule`, message: 'schedule is required' });
  } else if (!isValidCronExpression(cron.schedule)) {
    errors.push({
      path: `${path}.schedule`,
      message: 'schedule must be a valid cron expression',
      value: cron.schedule,
    });
  }

  if (!cron.target) {
    errors.push({ path: `${path}.target`, message: 'target is required' });
  }
}

function validateNetwork(network: NetworkConfig, path: string, errors: ValidationError[]): void {
  if (!network.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(network.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: network.name,
    });
  }

  // Validate containers
  if (network.containers) {
    network.containers.forEach((container, i) => {
      validateContainer(container, `${path}.containers[${i}]`, errors);
    });
  }

  // Validate functions
  if (network.functions) {
    network.functions.forEach((fn, i) => {
      validateFunction(fn, `${path}.functions[${i}]`, errors);
    });
  }

  // Validate databases
  if (network.databases) {
    network.databases.forEach((db, i) => {
      validateDatabase(db, `${path}.databases[${i}]`, errors);
    });
  }

  // Validate caches
  if (network.caches) {
    network.caches.forEach((cache, i) => {
      validateCache(cache, `${path}.caches[${i}]`, errors);
    });
  }
}

function validateContainer(container: ContainerConfig, path: string, errors: ValidationError[]): void {
  if (!container.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(container.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: container.name,
    });
  }

  // Validate memory format
  if (container.memory && !isValidMemoryFormat(container.memory)) {
    errors.push({
      path: `${path}.memory`,
      message: 'memory must be in format like 256Mi, 1Gi, 2Gi',
      value: container.memory,
    });
  }

  // Validate env references
  if (container.env) {
    validateEnvReferences(container.env, `${path}.env`, errors);
  }
}

function validateFunction(fn: FunctionConfig, path: string, errors: ValidationError[]): void {
  if (!fn.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(fn.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: fn.name,
    });
  }

  // Validate runtime
  const validRuntimes = ['nodejs20', 'nodejs18', 'python311', 'python310', 'go121', 'go120'];
  if (fn.runtime && !validRuntimes.includes(fn.runtime)) {
    errors.push({
      path: `${path}.runtime`,
      message: `runtime must be one of: ${validRuntimes.join(', ')}`,
      value: fn.runtime,
    });
  }

  // Validate env references
  if (fn.env) {
    validateEnvReferences(fn.env, `${path}.env`, errors);
  }
}

function validateDatabase(db: DatabaseConfig, path: string, errors: ValidationError[]): void {
  if (!db.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(db.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: db.name,
    });
  }

  // Validate database version
  const validVersions = ['POSTGRES_15', 'POSTGRES_14', 'MYSQL_8_0', 'MYSQL_5_7'];
  if (db.databaseVersion && !validVersions.includes(db.databaseVersion)) {
    errors.push({
      path: `${path}.databaseVersion`,
      message: `databaseVersion must be one of: ${validVersions.join(', ')}`,
      value: db.databaseVersion,
    });
  }
}

function validateCache(cache: CacheConfig, path: string, errors: ValidationError[]): void {
  if (!cache.name) {
    errors.push({ path: `${path}.name`, message: 'name is required' });
  } else if (!isValidResourceName(cache.name)) {
    errors.push({
      path: `${path}.name`,
      message: 'name must be lowercase alphanumeric with hyphens, 1-63 chars',
      value: cache.name,
    });
  }

  // Validate tier
  if (cache.tier && !['BASIC', 'STANDARD_HA'].includes(cache.tier)) {
    errors.push({
      path: `${path}.tier`,
      message: 'tier must be BASIC or STANDARD_HA',
      value: cache.tier,
    });
  }
}

function validateEnvReferences(env: Record<string, string>, path: string, errors: ValidationError[]): void {
  for (const [key, value] of Object.entries(env)) {
    if (value.startsWith('@')) {
      // Validate reference format
      if (!isValidReference(value)) {
        errors.push({
          path: `${path}.${key}`,
          message: 'invalid reference format. Expected @type/name or @type/name.property',
          value,
        });
      }
    }
  }
}

function checkDuplicateNames(project: ProjectConfig, errors: ValidationError[]): void {
  const seen = new Map<string, string>(); // name -> path

  const check = (name: string, path: string) => {
    if (seen.has(name)) {
      errors.push({
        path,
        message: `duplicate resource name "${name}" (also defined at ${seen.get(name)})`,
        value: name,
      });
    } else {
      seen.set(name, path);
    }
  };

  // Check global resources
  project.buckets?.forEach((b, i) => check(b.name, `project.buckets[${i}]`));
  project.secrets?.forEach((s, i) => check(s.name, `project.secrets[${i}]`));
  project.topics?.forEach((t, i) => check(t.name, `project.topics[${i}]`));
  project.queues?.forEach((q, i) => check(q.name, `project.queues[${i}]`));
  project.crons?.forEach((c, i) => check(c.name, `project.crons[${i}]`));

  // Check network resources (scoped by network)
  project.networks?.forEach((network, ni) => {
    const networkSeen = new Map<string, string>();
    const checkNetwork = (name: string, path: string) => {
      if (networkSeen.has(name)) {
        errors.push({
          path,
          message: `duplicate resource name "${name}" in network "${network.name}" (also at ${networkSeen.get(name)})`,
          value: name,
        });
      } else {
        networkSeen.set(name, path);
      }
    };

    network.containers?.forEach((c, i) => checkNetwork(c.name, `project.networks[${ni}].containers[${i}]`));
    network.functions?.forEach((f, i) => checkNetwork(f.name, `project.networks[${ni}].functions[${i}]`));
    network.databases?.forEach((d, i) => checkNetwork(d.name, `project.networks[${ni}].databases[${i}]`));
    network.caches?.forEach((c, i) => checkNetwork(c.name, `project.networks[${ni}].caches[${i}]`));
  });
}

// =============================================================================
// Validation Helpers
// =============================================================================

function isValidResourceName(name: string): boolean {
  // GCP resource names: lowercase, alphanumeric, hyphens, 1-63 chars
  return /^[a-z][a-z0-9-]{0,62}$/.test(name);
}

function isValidBucketName(name: string): boolean {
  // Bucket names: 3-63 chars, lowercase, alphanumeric, hyphens, underscores
  return /^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/.test(name);
}

function isValidCronExpression(expr: string): boolean {
  // Basic cron validation (5 or 6 fields)
  const parts = expr.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}

function isValidMemoryFormat(memory: string): boolean {
  return /^\d+(Mi|Gi)$/.test(memory);
}

function isValidReference(ref: string): boolean {
  // @type/name or @type/name.property
  return /^@[a-z]+\/[a-z0-9-]+(\.[a-zA-Z]+)?$/.test(ref);
}
