import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

interface CorsConfig {
  origin: string[];
  method: string[];
  responseHeader: string[];
  maxAgeSeconds: number;
}

export const storageBucket = defineResource({
  id: 'gcp-cdktf:storage_bucket',
  provider: 'gcp-cdktf',
  name: 'Cloud Storage Bucket',
  description: 'Google Cloud Storage bucket for file storage',
  icon: 'storage',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Bucket Name',
        description: 'Globally unique name for the bucket',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'GCP region or multi-region for the bucket',
        default: 'US',
      },
      storageClass: {
        type: 'string',
        title: 'Storage Class',
        description: 'Storage class for the bucket',
        enum: ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'],
        default: 'STANDARD',
      },
      uniformBucketLevelAccess: {
        type: 'boolean',
        title: 'Uniform Bucket-Level Access',
        description: 'Enable uniform bucket-level access',
        default: true,
      },
      versioning: {
        type: 'boolean',
        title: 'Versioning',
        description: 'Enable object versioning',
        default: false,
      },
      cors: {
        type: 'array',
        title: 'CORS Configuration',
        description: 'Cross-origin resource sharing rules',
        items: {
          type: 'object',
          properties: {
            origin: { type: 'array', items: { type: 'string' } },
            method: { type: 'array', items: { type: 'string' } },
            responseHeader: { type: 'array', items: { type: 'string' } },
            maxAgeSeconds: { type: 'number' },
          },
        },
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

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const bucketConfig = config as {
      name: string;
      location?: string;
      storageClass?: string;
      uniformBucketLevelAccess?: boolean;
      versioning?: boolean;
      cors?: CorsConfig[];
      projectId?: string;
    };

    const location = bucketConfig.location || 'US';
    const storageClass = bucketConfig.storageClass || 'STANDARD';
    const uniformBucketLevelAccess = bucketConfig.uniformBucketLevelAccess ?? true;
    const versioning = bucketConfig.versioning ?? false;
    const projectId = bucketConfig.projectId || '${var.project_id}';

    // CORS configuration
    let corsBlock = '';
    if (bucketConfig.cors && bucketConfig.cors.length > 0) {
      const corsConfigs = bucketConfig.cors.map(cors => `{
      origin: ${JSON.stringify(cors.origin)},
      method: ${JSON.stringify(cors.method)},
      responseHeader: ${JSON.stringify(cors.responseHeader)},
      maxAgeSeconds: ${cors.maxAgeSeconds},
    }`).join(',\n    ');
      corsBlock = `
  cors: [
    ${corsConfigs}
  ],`;
    }

    const code = `// GCS bucket: ${config.name}
const ${varName}Bucket = new StorageBucket(this, '${varName}-bucket', {
  name: '${config.name}',
  project: '${projectId}',
  location: '${location}',
  storageClass: '${storageClass}',
  uniformBucketLevelAccess: ${uniformBucketLevelAccess},
  versioning: {
    enabled: ${versioning},
  },${corsBlock}
  forceDestroy: true,
});`;

    return {
      imports: [
        "import { StorageBucket } from '@cdktf/provider-google/lib/storage-bucket';",
      ],
      code,
      outputs: [
        `export const ${varName}BucketName = ${varName}Bucket.name;`,
        `export const ${varName}BucketUrl = ${varName}Bucket.url;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const bucketConfig = config as { storageClass?: string };
    const storageClass = bucketConfig.storageClass || 'STANDARD';

    // Rough cost estimates per GB/month
    const costPerGb: Record<string, number> = {
      STANDARD: 0.02,
      NEARLINE: 0.01,
      COLDLINE: 0.004,
      ARCHIVE: 0.0012,
    };

    const monthlyPerGb = costPerGb[storageClass] || 0.02;

    return {
      monthly: 5, // Assume 250GB average
      currency: 'USD',
      breakdown: [
        { item: `Storage (${storageClass}, estimated 250GB)`, amount: Math.round(monthlyPerGb * 250 * 100) / 100 },
        { item: 'Operations (estimated)', amount: 2 },
        { item: 'Network egress (estimated)', amount: 3 },
      ],
    };
  },
});
