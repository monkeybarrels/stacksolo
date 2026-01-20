/**
 * Resource type documentation for AI assistants
 */

export interface ResourceInfo {
  id: string;
  name: string;
  description: string;
  configKey: string;
  requiredFields: string[];
  optionalFields: Record<string, string>;
  example: string;
}

export const resources: ResourceInfo[] = [
  {
    id: 'cloud-function',
    name: 'Cloud Function (Gen2)',
    description: 'Serverless function that runs code in response to HTTP requests or events',
    configKey: 'functions',
    requiredFields: ['name', 'entryPoint'],
    optionalFields: {
      runtime: 'nodejs20, python312, go122 (default: nodejs20)',
      memory: '128Mi, 256Mi, 512Mi, 1Gi, 2Gi (default: 256Mi)',
      timeout: 'Seconds, max 540 (default: 60)',
      minInstances: 'Minimum warm instances (default: 0)',
      maxInstances: 'Maximum instances (default: 100)',
      allowUnauthenticated: 'Public access (default: false)',
      sourceDir: 'Source directory (default: functions/<name>/)',
      env: 'Environment variables object',
      secrets: 'Array of secret references',
    },
    example: `{
  "name": "api",
  "runtime": "nodejs20",
  "entryPoint": "handler",
  "memory": "512Mi",
  "allowUnauthenticated": true,
  "env": {
    "NODE_ENV": "production"
  }
}`,
  },
  {
    id: 'cloud-run',
    name: 'Cloud Run',
    description: 'Fully managed containerized service that auto-scales',
    configKey: 'containers',
    requiredFields: ['name'],
    optionalFields: {
      image: 'Docker image (builds from sourceDir if not specified)',
      port: 'Container port (default: 8080)',
      memory: '128Mi to 32Gi (default: 512Mi)',
      cpu: '1, 2, 4, or 8 (default: 1)',
      minInstances: 'Minimum instances (default: 0)',
      maxInstances: 'Maximum instances (default: 100)',
      allowUnauthenticated: 'Public access (default: false)',
      sourceDir: 'Source directory (default: containers/<name>/)',
      env: 'Environment variables object',
      secrets: 'Array of secret references',
    },
    example: `{
  "name": "api",
  "port": 3000,
  "memory": "1Gi",
  "allowUnauthenticated": true,
  "env": {
    "DATABASE_URL": "@sql/db.connectionString"
  }
}`,
  },
  {
    id: 'cloud-sql',
    name: 'Cloud SQL',
    description: 'Managed relational database (PostgreSQL or MySQL)',
    configKey: 'sql',
    requiredFields: ['name'],
    optionalFields: {
      databaseVersion: 'POSTGRES_15, POSTGRES_14, MYSQL_8_0 (default: POSTGRES_15)',
      tier: 'db-f1-micro, db-g1-small, db-custom-* (default: db-f1-micro)',
      diskSizeGb: 'Disk size in GB (default: 10)',
      diskType: 'PD_SSD or PD_HDD (default: PD_SSD)',
      availabilityType: 'ZONAL or REGIONAL (default: ZONAL)',
      backupEnabled: 'Enable backups (default: true)',
    },
    example: `{
  "name": "db",
  "databaseVersion": "POSTGRES_15",
  "tier": "db-g1-small",
  "diskSizeGb": 20
}`,
  },
  {
    id: 'memorystore-redis',
    name: 'Memorystore Redis',
    description: 'Managed Redis cache for session storage, caching, pub/sub',
    configKey: 'redis',
    requiredFields: ['name'],
    optionalFields: {
      tier: 'BASIC or STANDARD_HA (default: BASIC)',
      memorySizeGb: '1 to 300 GB (default: 1)',
      redisVersion: 'REDIS_7_0, REDIS_6_X (default: REDIS_7_0)',
    },
    example: `{
  "name": "cache",
  "tier": "BASIC",
  "memorySizeGb": 1
}`,
  },
  {
    id: 'storage-bucket',
    name: 'Cloud Storage Bucket',
    description: 'Object storage for files, images, backups',
    configKey: 'buckets',
    requiredFields: ['name'],
    optionalFields: {
      location: 'US, EU, ASIA, or specific region (default: US)',
      storageClass: 'STANDARD, NEARLINE, COLDLINE, ARCHIVE (default: STANDARD)',
      existing: 'Reference existing bucket (default: false)',
      cors: 'CORS configuration array',
      versioning: 'Enable versioning (default: false)',
    },
    example: `{
  "name": "my-app-uploads",
  "location": "US",
  "storageClass": "STANDARD",
  "cors": [{
    "origin": ["https://myapp.com"],
    "method": ["GET", "PUT"],
    "maxAgeSeconds": 3600
  }]
}`,
  },
  {
    id: 'load-balancer',
    name: 'HTTP(S) Load Balancer',
    description: 'Global load balancer for routing traffic to backends. Supports multi-domain hosting with host-based routing for cost-effective setups.',
    configKey: 'loadBalancer',
    requiredFields: ['name', 'routes'],
    optionalFields: {
      domain: 'Single custom domain for HTTPS',
      domains: 'Multiple domains for HTTPS (single SSL cert with SANs)',
      enableHttps: 'Enable HTTPS with managed SSL certificate (default: false)',
      redirectHttpToHttps: 'Redirect all HTTP traffic to HTTPS (default: false)',
      defaultBackend: 'Default backend if no route matches',
    },
    example: `{
  "name": "gateway",
  "domains": ["example.com", "api.example.com"],
  "enableHttps": true,
  "redirectHttpToHttps": true,
  "routes": [
    { "host": "api.example.com", "path": "/*", "backend": "api" },
    { "host": "example.com", "path": "/api/*", "backend": "bff" },
    { "host": "example.com", "path": "/*", "backend": "web" }
  ]
}`,
  },
  {
    id: 'pubsub',
    name: 'Pub/Sub',
    description: 'Message queue for async communication between services',
    configKey: 'pubsub',
    requiredFields: ['name'],
    optionalFields: {
      subscriptions: 'Array of subscription configurations',
      messageRetentionDuration: 'How long to retain messages',
    },
    example: `{
  "name": "events",
  "subscriptions": [{
    "name": "worker-sub",
    "pushEndpoint": "@function/worker.url"
  }]
}`,
  },
  {
    id: 'scheduler',
    name: 'Cloud Scheduler',
    description: 'Cron job scheduler for triggering functions/endpoints',
    configKey: 'schedulers',
    requiredFields: ['name', 'schedule', 'target'],
    optionalFields: {
      timezone: 'Timezone (default: UTC)',
      retryCount: 'Number of retries on failure',
    },
    example: `{
  "name": "daily-cleanup",
  "schedule": "0 2 * * *",
  "target": "@function/cleanup.url",
  "timezone": "America/New_York"
}`,
  },
  {
    id: 'secret',
    name: 'Secret Manager',
    description: 'Secure storage for API keys, passwords, certificates',
    configKey: 'secrets',
    requiredFields: ['name'],
    optionalFields: {
      existing: 'Reference existing secret (default: false)',
    },
    example: `{
  "name": "api-key",
  "existing": true
}`,
  },
];

export const getResourcesOverview = (): string => {
  let output = '# Available Resources\\n\\n';

  for (const resource of resources) {
    output += `## ${resource.name}\\n`;
    output += `${resource.description}\\n\\n`;
    output += `Config key: \`${resource.configKey}\`\\n\\n`;
    output += `Required fields: ${resource.requiredFields.map(f => `\`${f}\``).join(', ')}\\n\\n`;
    output += `Example:\\n\`\`\`json\\n${resource.example}\\n\`\`\`\\n\\n`;
  }

  return output;
};
