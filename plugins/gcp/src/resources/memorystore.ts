import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const memorystore = defineResource({
  id: 'gcp:memorystore',
  provider: 'gcp',
  name: 'Memorystore (Redis)',
  description: 'Fully managed Redis instance for caching and session storage',
  icon: 'memory',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Instance Name',
        description: 'Unique name for the Redis instance',
        minLength: 1,
        maxLength: 40,
      },
      region: {
        type: 'string',
        title: 'Region',
        description: 'GCP region',
        default: 'us-central1',
      },
      tier: {
        type: 'string',
        title: 'Tier',
        description: 'Service tier',
        default: 'BASIC',
        enum: ['BASIC', 'STANDARD_HA'],
      },
      memorySizeGb: {
        type: 'number',
        title: 'Memory Size (GB)',
        description: 'Redis memory capacity',
        default: 1,
        minimum: 1,
        maximum: 300,
      },
      redisVersion: {
        type: 'string',
        title: 'Redis Version',
        description: 'Redis version',
        default: 'REDIS_7_0',
        enum: ['REDIS_7_0', 'REDIS_6_X', 'REDIS_5_0', 'REDIS_4_0'],
      },
      displayName: {
        type: 'string',
        title: 'Display Name',
        description: 'Human-readable name',
      },
      authorizedNetwork: {
        type: 'string',
        title: 'Authorized Network',
        description: 'VPC network for the instance',
      },
      connectMode: {
        type: 'string',
        title: 'Connect Mode',
        description: 'Connection mode',
        default: 'DIRECT_PEERING',
        enum: ['DIRECT_PEERING', 'PRIVATE_SERVICE_ACCESS'],
      },
      authEnabled: {
        type: 'boolean',
        title: 'Auth Enabled',
        description: 'Require AUTH for connections',
        default: false,
      },
      transitEncryptionMode: {
        type: 'string',
        title: 'Transit Encryption',
        description: 'In-transit encryption mode',
        default: 'DISABLED',
        enum: ['DISABLED', 'SERVER_AUTHENTICATION'],
      },
      maintenanceDay: {
        type: 'string',
        title: 'Maintenance Day',
        description: 'Day for maintenance window',
        default: 'SUNDAY',
        enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      },
      maintenanceHour: {
        type: 'number',
        title: 'Maintenance Hour',
        description: 'Hour for maintenance window (0-23 UTC)',
        default: 3,
        minimum: 0,
        maximum: 23,
      },
      labels: {
        type: 'object',
        title: 'Labels',
        description: 'Key-value labels',
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    region: 'us-central1',
    tier: 'BASIC',
    memorySizeGb: 1,
    redisVersion: 'REDIS_7_0',
    connectMode: 'DIRECT_PEERING',
    authEnabled: false,
    transitEncryptionMode: 'DISABLED',
    maintenanceDay: 'SUNDAY',
    maintenanceHour: 3,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const redisConfig = config as {
      name: string;
      region?: string;
      tier?: string;
      memorySizeGb?: number;
      redisVersion?: string;
      displayName?: string;
      authorizedNetwork?: string;
      connectMode?: string;
      authEnabled?: boolean;
      transitEncryptionMode?: string;
      maintenanceDay?: string;
      maintenanceHour?: number;
      labels?: Record<string, string>;
    };

    const region = redisConfig.region || 'us-central1';
    const tier = redisConfig.tier || 'BASIC';
    const memorySizeGb = redisConfig.memorySizeGb || 1;
    const redisVersion = redisConfig.redisVersion || 'REDIS_7_0';

    let code = `const ${varName}Redis = new gcp.redis.Instance("${config.name}", {
  name: "${config.name}",
  region: "${region}",
  tier: "${tier}",
  memorySizeGb: ${memorySizeGb},
  redisVersion: "${redisVersion}",`;

    if (redisConfig.displayName) {
      code += `\n  displayName: "${redisConfig.displayName}",`;
    }

    if (redisConfig.authorizedNetwork) {
      code += `\n  authorizedNetwork: "${redisConfig.authorizedNetwork}",`;
    }

    if (redisConfig.connectMode) {
      code += `\n  connectMode: "${redisConfig.connectMode}",`;
    }

    if (redisConfig.authEnabled) {
      code += `\n  authEnabled: true,`;
    }

    if (redisConfig.transitEncryptionMode && redisConfig.transitEncryptionMode !== 'DISABLED') {
      code += `\n  transitEncryptionMode: "${redisConfig.transitEncryptionMode}",`;
    }

    code += `\n  maintenancePolicy: {
    weeklyMaintenanceWindows: [{
      day: "${redisConfig.maintenanceDay || 'SUNDAY'}",
      startTime: {
        hours: ${redisConfig.maintenanceHour || 3},
        minutes: 0,
      },
    }],
  },`;

    if (redisConfig.labels && Object.keys(redisConfig.labels).length > 0) {
      code += `\n  labels: ${JSON.stringify(redisConfig.labels)},`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}RedisHost = ${varName}Redis.host;`,
        `export const ${varName}RedisPort = ${varName}Redis.port;`,
        `export const ${varName}RedisConnectionString = pulumi.interpolate\`redis://\${${varName}Redis.host}:\${${varName}Redis.port}\`;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const redisConfig = config as { tier?: string; memorySizeGb?: number };
    const tier = redisConfig.tier || 'BASIC';
    const memorySizeGb = redisConfig.memorySizeGb || 1;

    // Rough pricing: BASIC ~$0.049/GB/hr, STANDARD_HA ~$0.098/GB/hr
    const hourlyRate = tier === 'STANDARD_HA' ? 0.098 : 0.049;
    const monthly = hourlyRate * memorySizeGb * 730;

    return {
      monthly: Math.round(monthly * 100) / 100,
      currency: 'USD',
      breakdown: [
        { item: `${tier} tier (${memorySizeGb}GB)`, amount: monthly },
      ],
    };
  },
});
