import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudSql = defineResource({
  id: 'gcp:cloud_sql',
  provider: 'gcp',
  name: 'Cloud SQL',
  description: 'Fully managed PostgreSQL, MySQL, or SQL Server database',
  icon: 'storage',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Instance Name',
        description: 'Unique name for the database instance',
        minLength: 1,
        maxLength: 63,
      },
      databaseVersion: {
        type: 'string',
        title: 'Database Version',
        description: 'Database engine and version',
        default: 'POSTGRES_15',
        enum: [
          'POSTGRES_15',
          'POSTGRES_14',
          'POSTGRES_13',
          'MYSQL_8_0',
          'MYSQL_5_7',
        ],
      },
      tier: {
        type: 'string',
        title: 'Machine Type',
        description: 'Instance size and performance tier',
        default: 'db-f1-micro',
        enum: [
          'db-f1-micro',
          'db-g1-small',
          'db-custom-1-3840',
          'db-custom-2-7680',
          'db-custom-4-15360',
        ],
      },
      region: {
        type: 'string',
        title: 'Region',
        description: 'GCP region for the instance',
        default: 'us-central1',
        enum: [
          'us-central1',
          'us-east1',
          'us-west1',
          'europe-west1',
          'europe-west2',
          'asia-east1',
          'asia-northeast1',
        ],
      },
      databaseName: {
        type: 'string',
        title: 'Database Name',
        description: 'Name of the initial database to create',
        default: 'app',
      },
      diskSize: {
        type: 'number',
        title: 'Disk Size (GB)',
        description: 'Storage capacity in GB',
        default: 10,
        minimum: 10,
        maximum: 65536,
      },
      diskType: {
        type: 'string',
        title: 'Disk Type',
        description: 'Storage type',
        default: 'PD_SSD',
        enum: ['PD_SSD', 'PD_HDD'],
      },
      enablePublicIp: {
        type: 'boolean',
        title: 'Enable Public IP',
        description: 'Allow connections from public internet',
        default: false,
      },
    },
    required: ['name', 'databaseName'],
  },

  defaultConfig: {
    databaseVersion: 'POSTGRES_15',
    tier: 'db-f1-micro',
    region: 'us-central1',
    databaseName: 'app',
    diskSize: 10,
    diskType: 'PD_SSD',
    enablePublicIp: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const sqlConfig = config as {
      name: string;
      databaseVersion?: string;
      tier?: string;
      region?: string;
      databaseName?: string;
      diskSize?: number;
      diskType?: string;
      enablePublicIp?: boolean;
    };

    const databaseVersion = sqlConfig.databaseVersion || 'POSTGRES_15';
    const tier = sqlConfig.tier || 'db-f1-micro';
    const region = sqlConfig.region || 'us-central1';
    const databaseName = sqlConfig.databaseName || 'app';
    const diskSize = sqlConfig.diskSize ?? 10;
    const diskType = sqlConfig.diskType || 'PD_SSD';
    const enablePublicIp = sqlConfig.enablePublicIp ?? false;

    const code = `// Generate random password for database user
const ${varName}Password = new random.RandomPassword("${config.name}-password", {
  length: 24,
  special: false,
});

// Cloud SQL Instance
const ${varName}Instance = new gcp.sql.DatabaseInstance("${config.name}", {
  name: "${config.name}",
  region: "${region}",
  databaseVersion: "${databaseVersion}",
  deletionProtection: false,
  settings: {
    tier: "${tier}",
    diskSize: ${diskSize},
    diskType: "${diskType}",
    ipConfiguration: {
      ipv4Enabled: ${enablePublicIp},
      ${enablePublicIp ? `authorizedNetworks: [{ value: "0.0.0.0/0", name: "all" }],` : ''}
    },
  },
});

// Database
const ${varName}Database = new gcp.sql.Database("${config.name}-db", {
  name: "${databaseName}",
  instance: ${varName}Instance.name,
});

// Database User
const ${varName}User = new gcp.sql.User("${config.name}-user", {
  name: "app",
  instance: ${varName}Instance.name,
  password: ${varName}Password.result,
});`;

    // Build connection string based on database type
    const isPostgres = databaseVersion.startsWith('POSTGRES');
    const connectionStringOutput = isPostgres
      ? `export const ${varName}ConnectionString = pulumi.interpolate\`postgresql://app:\${${varName}Password.result}@\${${varName}Instance.publicIpAddress || ${varName}Instance.privateIpAddress}/${databaseName}\`;`
      : `export const ${varName}ConnectionString = pulumi.interpolate\`mysql://app:\${${varName}Password.result}@\${${varName}Instance.publicIpAddress || ${varName}Instance.privateIpAddress}/${databaseName}\`;`;

    return {
      imports: [
        "import * as gcp from '@pulumi/gcp';",
        "import * as random from '@pulumi/random';",
        "import * as pulumi from '@pulumi/pulumi';",
      ],
      code,
      outputs: [
        connectionStringOutput,
        `export const ${varName}InstanceName = ${varName}Instance.name;`,
        `export const ${varName}PrivateIp = ${varName}Instance.privateIpAddress;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const sqlConfig = config as { tier?: string; diskSize?: number };
    const tier = sqlConfig.tier || 'db-f1-micro';
    const diskSize = sqlConfig.diskSize ?? 10;

    // Rough monthly pricing by tier
    const tierPricing: Record<string, number> = {
      'db-f1-micro': 7.5,
      'db-g1-small': 25,
      'db-custom-1-3840': 50,
      'db-custom-2-7680': 100,
      'db-custom-4-15360': 200,
    };

    const computeCost = tierPricing[tier] || 7.5;
    const storageCost = diskSize * 0.17; // ~$0.17/GB/month for SSD

    return {
      monthly: computeCost + storageCost,
      currency: 'USD',
      breakdown: [
        { item: `Compute (${tier})`, amount: computeCost },
        { item: `Storage (${diskSize} GB)`, amount: storageCost },
      ],
    };
  },
});
