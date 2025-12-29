import { defineResource, type ResourceConfig } from '@stacksolo/core';

// Helper to convert resource name to valid variable name
function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const storageBucket = defineResource({
  id: 'gcp:storage_bucket',
  provider: 'gcp',
  name: 'Cloud Storage Bucket',
  description: 'Object storage for files, images, backups, and static assets',
  icon: 'storage',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Bucket Name',
        description: 'Globally unique bucket name',
        minLength: 3,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'Where to store your data',
        default: 'US',
        enum: ['US', 'EU', 'ASIA', 'US-CENTRAL1', 'US-EAST1', 'US-WEST1', 'EUROPE-WEST1'],
      },
      storageClass: {
        type: 'string',
        title: 'Storage Class',
        description: 'Affects pricing and availability',
        default: 'STANDARD',
        enum: ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'],
      },
      uniformBucketLevelAccess: {
        type: 'boolean',
        title: 'Uniform Bucket-Level Access',
        description: 'Use uniform access control (recommended)',
        default: true,
      },
      versioning: {
        type: 'boolean',
        title: 'Enable Versioning',
        description: 'Keep history of object versions',
        default: false,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    location: 'US',
    storageClass: 'STANDARD',
    uniformBucketLevelAccess: true,
    versioning: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const bucketConfig = config as {
      name: string;
      location?: string;
      storageClass?: string;
      uniformBucketLevelAccess?: boolean;
      versioning?: boolean;
    };

    const location = bucketConfig.location || 'US';
    const storageClass = bucketConfig.storageClass || 'STANDARD';
    const uniformAccess = bucketConfig.uniformBucketLevelAccess ?? true;
    const versioning = bucketConfig.versioning ?? false;

    let code = `const ${varName}Bucket = new gcp.storage.Bucket("${config.name}", {
  name: "${config.name}",
  location: "${location}",
  storageClass: "${storageClass}",
  uniformBucketLevelAccess: ${uniformAccess},`;

    if (versioning) {
      code += `
  versioning: {
    enabled: true,
  },`;
    }

    code += `
});`;

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [`export const ${varName}BucketUrl = ${varName}Bucket.url;`],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    // Very rough estimate - storage costs vary by usage
    const storageClass = (config as { storageClass?: string }).storageClass || 'STANDARD';

    const costPerGB: Record<string, number> = {
      STANDARD: 0.02,
      NEARLINE: 0.01,
      COLDLINE: 0.004,
      ARCHIVE: 0.0012,
    };

    // Assume 10GB average usage for estimate
    const estimatedGB = 10;
    const monthly = (costPerGB[storageClass] || 0.02) * estimatedGB;

    return {
      monthly,
      currency: 'USD',
      breakdown: [
        { item: `${storageClass} storage (est. ${estimatedGB}GB)`, amount: monthly },
      ],
    };
  },
});
