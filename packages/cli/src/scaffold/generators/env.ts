/**
 * Environment file generator
 * Generates .env.local and .env.example from config
 */

import type {
  StackSoloConfig,
  DatabaseConfig,
  CacheConfig,
  SecretConfig,
  BucketConfig,
  ContainerConfig,
  FunctionConfig,
} from '@stacksolo/blueprint';
import type { EnvSection, EnvVariable, GeneratedFile } from './types.js';

interface EnvGeneratorResult {
  envLocal: GeneratedFile;
  envExample: GeneratedFile;
  envTs: GeneratedFile;
}

/**
 * Generate environment files from config
 */
export function generateEnvFiles(config: StackSoloConfig): EnvGeneratorResult {
  const sections: EnvSection[] = [];

  // Project info
  sections.push({
    header: 'Project',
    variables: [
      { name: 'PROJECT_NAME', value: config.project.name },
      { name: 'GCP_PROJECT_ID', value: config.project.gcpProjectId },
      { name: 'GCP_REGION', value: config.project.region },
    ],
  });

  // Collect all referenced resources from container/function env vars
  const referencedSecrets = new Set<string>();
  const referencedDatabases = new Set<string>();
  const referencedCaches = new Set<string>();
  const referencedBuckets = new Set<string>();

  // Scan all containers and functions for references
  for (const network of config.project.networks || []) {
    for (const container of network.containers || []) {
      collectReferences(container.env || {}, referencedSecrets, referencedDatabases, referencedCaches, referencedBuckets);
    }
    for (const func of network.functions || []) {
      collectReferences(func.env || {}, referencedSecrets, referencedDatabases, referencedCaches, referencedBuckets);
    }
  }

  // Database section
  const databases = collectDatabases(config);
  if (databases.length > 0) {
    sections.push({
      header: 'Database',
      variables: databases.flatMap((db) => generateDatabaseEnvVars(db)),
    });
  }

  // Cache section
  const caches = collectCaches(config);
  if (caches.length > 0) {
    sections.push({
      header: 'Cache',
      variables: caches.flatMap((cache) => generateCacheEnvVars(cache)),
    });
  }

  // Secrets section
  const secrets = config.project.secrets || [];
  if (secrets.length > 0) {
    sections.push({
      header: 'Secrets (replace with real values)',
      variables: secrets.map((secret) => generateSecretEnvVar(secret)),
    });
  }

  // Storage section
  const buckets = config.project.buckets || [];
  if (buckets.length > 0) {
    sections.push({
      header: 'Storage',
      variables: buckets.map((bucket) => generateBucketEnvVar(bucket)),
    });
  }

  const envLocalContent = generateEnvFileContent(sections, false);
  const envExampleContent = generateEnvFileContent(sections, true);
  const envTsContent = generateEnvTsContent(sections);

  return {
    envLocal: { path: '.env.local', content: envLocalContent },
    envExample: { path: '.env.example', content: envExampleContent },
    envTs: { path: 'lib/env.ts', content: envTsContent },
  };
}

function collectReferences(
  env: Record<string, string>,
  secrets: Set<string>,
  databases: Set<string>,
  caches: Set<string>,
  buckets: Set<string>
): void {
  for (const value of Object.values(env)) {
    if (value.startsWith('@secret/')) {
      secrets.add(value.slice(8));
    } else if (value.startsWith('@database/')) {
      const parts = value.slice(10).split('.');
      databases.add(parts[0]);
    } else if (value.startsWith('@cache/')) {
      const parts = value.slice(7).split('.');
      caches.add(parts[0]);
    } else if (value.startsWith('@bucket/')) {
      const parts = value.slice(8).split('.');
      buckets.add(parts[0]);
    }
  }
}

function collectDatabases(config: StackSoloConfig): DatabaseConfig[] {
  const databases: DatabaseConfig[] = [];
  for (const network of config.project.networks || []) {
    for (const db of network.databases || []) {
      databases.push(db);
    }
  }
  return databases;
}

function collectCaches(config: StackSoloConfig): CacheConfig[] {
  const caches: CacheConfig[] = [];
  for (const network of config.project.networks || []) {
    for (const cache of network.caches || []) {
      caches.push(cache);
    }
  }
  return caches;
}

function generateDatabaseEnvVars(db: DatabaseConfig): EnvVariable[] {
  const prefix = toEnvVarName(db.name);
  const isPostgres = db.databaseVersion?.startsWith('POSTGRES') ?? true;
  const dbName = db.databaseName || 'app';
  const defaultPort = isPostgres ? '5432' : '3306';
  const protocol = isPostgres ? 'postgres' : 'mysql';

  return [
    {
      name: `${prefix}_HOST`,
      value: 'localhost',
    },
    {
      name: `${prefix}_PORT`,
      value: defaultPort,
    },
    {
      name: `${prefix}_USER`,
      value: isPostgres ? 'postgres' : 'root',
    },
    {
      name: `${prefix}_PASSWORD`,
      value: 'postgres',
      isSecret: true,
    },
    {
      name: `${prefix}_DATABASE`,
      value: dbName,
    },
    {
      name: `${prefix}_CONNECTION_STRING`,
      value: `${protocol}://${isPostgres ? 'postgres' : 'root'}:postgres@localhost:${defaultPort}/${dbName}`,
    },
  ];
}

function generateCacheEnvVars(cache: CacheConfig): EnvVariable[] {
  const prefix = toEnvVarName(cache.name);
  return [
    {
      name: `${prefix}_HOST`,
      value: 'localhost',
    },
    {
      name: `${prefix}_PORT`,
      value: '6379',
    },
    {
      name: `${prefix}_URL`,
      value: 'redis://localhost:6379',
    },
  ];
}

function generateSecretEnvVar(secret: SecretConfig): EnvVariable {
  const name = toEnvVarName(secret.name);
  return {
    name,
    value: `your-${secret.name}-here`,
    isSecret: true,
    comment: 'Replace with actual secret value',
  };
}

function generateBucketEnvVar(bucket: BucketConfig): EnvVariable {
  const name = `BUCKET_${toEnvVarName(bucket.name)}_PATH`;
  return {
    name,
    value: `./local-storage/${bucket.name}`,
    comment: 'Local filesystem path for development',
  };
}

function toEnvVarName(name: string): string {
  return name.toUpperCase().replace(/-/g, '_');
}

function generateEnvFileContent(sections: EnvSection[], isExample: boolean): string {
  const lines: string[] = [
    '# StackSolo Local Development Environment',
    `# Generated by: stacksolo scaffold`,
    `# ${isExample ? 'Template file - copy to .env.local and fill in secrets' : 'Local development values - DO NOT COMMIT'}`,
    '',
  ];

  for (const section of sections) {
    lines.push(`# ${section.header}`);
    for (const variable of section.variables) {
      if (variable.comment) {
        lines.push(`# ${variable.comment}`);
      }
      const value = isExample && variable.isSecret ? '' : variable.value;
      lines.push(`${variable.name}=${value}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateEnvTsContent(sections: EnvSection[]): string {
  const lines: string[] = [
    '/**',
    ' * Type-safe environment configuration',
    ' * Generated by: stacksolo scaffold',
    ' */',
    '',
    'function requireEnv(name: string): string {',
    '  const value = process.env[name];',
    '  if (!value) {',
    '    throw new Error(`Missing required environment variable: ${name}`);',
    '  }',
    '  return value;',
    '}',
    '',
    'function optionalEnv(name: string, defaultValue: string): string {',
    '  return process.env[name] || defaultValue;',
    '}',
    '',
    'export const env = {',
  ];

  // Group by section type
  for (const section of sections) {
    if (section.header === 'Project') continue; // Skip project info in typed config

    const sectionName = sectionToPropertyName(section.header);
    const vars = section.variables;

    if (sectionName === 'database' || sectionName === 'cache' || sectionName === 'storage') {
      // Object with properties
      lines.push(`  ${sectionName}: {`);
      for (const v of vars) {
        const propName = envVarToPropertyName(v.name);
        if (v.name.includes('PORT')) {
          lines.push(`    ${propName}: parseInt(optionalEnv('${v.name}', '${v.value}'), 10),`);
        } else if (v.isSecret) {
          lines.push(`    ${propName}: requireEnv('${v.name}'),`);
        } else {
          lines.push(`    ${propName}: optionalEnv('${v.name}', '${v.value}'),`);
        }
      }
      lines.push('  },');
    } else if (sectionName === 'secrets') {
      lines.push('  secrets: {');
      for (const v of vars) {
        const propName = envVarToPropertyName(v.name);
        lines.push(`    ${propName}: requireEnv('${v.name}'),`);
      }
      lines.push('  },');
    }
  }

  lines.push('} as const;');
  lines.push('');
  lines.push('export type Env = typeof env;');
  lines.push('');

  return lines.join('\n');
}

function sectionToPropertyName(header: string): string {
  if (header.toLowerCase().includes('database')) return 'database';
  if (header.toLowerCase().includes('cache')) return 'cache';
  if (header.toLowerCase().includes('secret')) return 'secrets';
  if (header.toLowerCase().includes('storage')) return 'storage';
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function envVarToPropertyName(envVar: string): string {
  // Remove common prefixes and convert to camelCase
  const parts = envVar.toLowerCase().split('_');
  if (parts.length <= 1) return parts[0];

  // Skip first part if it's a known prefix (e.g., DB_, REDIS_, BUCKET_)
  const skipFirst = ['db', 'redis', 'bucket'].includes(parts[0]) || parts[0] === parts[1];
  const startIndex = skipFirst ? 1 : 0;

  return parts.slice(startIndex).map((part, i) => {
    if (i === 0) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('');
}
