import { defineResource, type ResourceConfig } from '@stacksolo/core';
import { generateLabelsCode, RESOURCE_TYPES } from '../utils/labels';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const storageWebsite = defineResource({
  id: 'gcp-cdktf:storage_website',
  provider: 'gcp-cdktf',
  name: 'Storage Website',
  description: 'Cloud Storage bucket configured for static website hosting with CDN',
  icon: 'web',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Site Name',
        description: 'Unique name for the website bucket',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'GCP region/location for the bucket',
        default: 'US',
      },
      indexDocument: {
        type: 'string',
        title: 'Index Document',
        description: 'Main page to serve',
        default: 'index.html',
      },
      errorDocument: {
        type: 'string',
        title: 'Error Document',
        description: 'Page to serve for 404 errors (use index.html for SPA routing)',
        default: 'index.html',
      },
      enableCdn: {
        type: 'boolean',
        title: 'Enable CDN',
        description: 'Enable Cloud CDN for the backend bucket',
        default: true,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    location: 'US',
    indexDocument: 'index.html',
    errorDocument: 'index.html',
    enableCdn: true,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const uiConfig = config as {
      name: string;
      location?: string;
      indexDocument?: string;
      errorDocument?: string;
      enableCdn?: boolean;
      projectId?: string;
      projectName?: string;
    };

    const location = uiConfig.location || 'US';
    const indexDocument = uiConfig.indexDocument || 'index.html';
    const errorDocument = uiConfig.errorDocument || 'index.html';
    const enableCdn = uiConfig.enableCdn ?? true;
    const projectId = uiConfig.projectId || '${var.project_id}';
    const projectName = uiConfig.projectName || '${var.project_name}';
    const labelsCode = generateLabelsCode(projectName, RESOURCE_TYPES.STORAGE_WEBSITE);

    // Generate bucket name - must be globally unique
    const bucketName = `${projectId}-${config.name}`;

    const code = `// GCS bucket for static website: ${config.name}
const ${varName}Bucket = new StorageBucket(this, '${config.name}', {
  name: '${bucketName}',
  location: '${location}',
  uniformBucketLevelAccess: true,
  forceDestroy: true,
  website: {
    mainPageSuffix: '${indexDocument}',
    notFoundPage: '${errorDocument}',
  },
  ${labelsCode}
});

// Public access for website
new StorageBucketIamMember(this, '${config.name}-public', {
  bucket: ${varName}Bucket.name,
  role: 'roles/storage.objectViewer',
  member: 'allUsers',
});

// Backend bucket for load balancer (with CDN)
const ${varName}BackendBucket = new ComputeBackendBucket(this, '${config.name}-backend', {
  name: '${config.name}-backend',
  bucketName: ${varName}Bucket.name,
  enableCdn: ${enableCdn},
});`;

    return {
      imports: [
        "import { StorageBucket } from '@cdktf/provider-google/lib/storage-bucket';",
        "import { StorageBucketIamMember } from '@cdktf/provider-google/lib/storage-bucket-iam-member';",
        "import { ComputeBackendBucket } from '@cdktf/provider-google/lib/compute-backend-bucket';",
      ],
      code,
      outputs: [
        `export const ${varName}BucketName = ${varName}Bucket.name;`,
        `export const ${varName}BucketUrl = ${varName}Bucket.url;`,
        `export const ${varName}WebsiteUrl = 'https://storage.googleapis.com/' + ${varName}Bucket.name;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    // Cloud Storage is very cheap for static hosting
    // CDN costs depend on usage
    return {
      monthly: 1,
      currency: 'USD',
      breakdown: [
        { item: 'Cloud Storage (estimated 1GB)', amount: 0.02 },
        { item: 'Cloud CDN (estimated egress)', amount: 1 },
      ],
    };
  },
});
