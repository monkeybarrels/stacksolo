import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const firestore = defineResource({
  id: 'gcp:firestore',
  provider: 'gcp',
  name: 'Firestore Database',
  description: 'Serverless NoSQL document database with real-time sync',
  icon: 'storage',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Database Name',
        description: 'Database identifier (use "(default)" for default database)',
        default: '(default)',
      },
      locationId: {
        type: 'string',
        title: 'Location',
        description: 'Region or multi-region for the database',
        default: 'nam5',
        enum: [
          'nam5',
          'eur3',
          'us-central1',
          'us-east1',
          'us-west1',
          'europe-west1',
          'europe-west2',
          'asia-east1',
          'asia-northeast1',
        ],
      },
      type: {
        type: 'string',
        title: 'Database Type',
        description: 'Firestore mode',
        default: 'FIRESTORE_NATIVE',
        enum: ['FIRESTORE_NATIVE', 'DATASTORE_MODE'],
      },
      concurrencyMode: {
        type: 'string',
        title: 'Concurrency Mode',
        description: 'Transaction concurrency control',
        default: 'OPTIMISTIC',
        enum: ['OPTIMISTIC', 'PESSIMISTIC', 'OPTIMISTIC_WITH_ENTITY_GROUPS'],
      },
      deleteProtectionState: {
        type: 'string',
        title: 'Delete Protection',
        description: 'Prevent accidental deletion',
        default: 'DELETE_PROTECTION_DISABLED',
        enum: ['DELETE_PROTECTION_ENABLED', 'DELETE_PROTECTION_DISABLED'],
      },
      pointInTimeRecovery: {
        type: 'boolean',
        title: 'Point-in-Time Recovery',
        description: 'Enable point-in-time recovery (PITR)',
        default: false,
      },
    },
    required: [],
  },

  defaultConfig: {
    name: '(default)',
    locationId: 'nam5',
    type: 'FIRESTORE_NATIVE',
    concurrencyMode: 'OPTIMISTIC',
    deleteProtectionState: 'DELETE_PROTECTION_DISABLED',
    pointInTimeRecovery: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name || 'default');
    const fsConfig = config as {
      name?: string;
      locationId?: string;
      type?: string;
      concurrencyMode?: string;
      deleteProtectionState?: string;
      pointInTimeRecovery?: boolean;
    };

    const dbName = fsConfig.name || '(default)';
    const locationId = fsConfig.locationId || 'nam5';
    const dbType = fsConfig.type || 'FIRESTORE_NATIVE';
    const concurrencyMode = fsConfig.concurrencyMode || 'OPTIMISTIC';
    const deleteProtection = fsConfig.deleteProtectionState || 'DELETE_PROTECTION_DISABLED';
    const pitr = fsConfig.pointInTimeRecovery ? 'POINT_IN_TIME_RECOVERY_ENABLED' : 'POINT_IN_TIME_RECOVERY_DISABLED';

    const code = `const ${varName}Database = new gcp.firestore.Database("${dbName}", {
  name: "${dbName}",
  locationId: "${locationId}",
  type: "${dbType}",
  concurrencyMode: "${concurrencyMode}",
  deleteProtectionState: "${deleteProtection}",
  pointInTimeRecoveryEnablement: "${pitr}",
});`;

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}DatabaseName = ${varName}Database.name;`,
        `export const ${varName}DatabaseId = ${varName}Database.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Document reads ($0.06/100K)', amount: 0 },
      { item: 'Document writes ($0.18/100K)', amount: 0 },
      { item: 'Document deletes ($0.02/100K)', amount: 0 },
      { item: 'Storage ($0.18/GB/month)', amount: 0 },
    ],
  }),
});
