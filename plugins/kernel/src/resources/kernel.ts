import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const kernelResource = defineResource({
  id: 'kernel',
  provider: 'gcp-cdktf',
  name: 'Kernel',
  description: 'Hybrid HTTP + NATS shared infrastructure (auth, files, events)',
  icon: 'cpu',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        description: 'Resource name for references (@kernel/<name>)',
        default: 'kernel',
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region (defaults to project region)',
      },
      cpu: {
        type: 'number',
        title: 'CPU',
        description: 'CPU allocation',
        default: 1,
      },
      memory: {
        type: 'string',
        title: 'Memory',
        description: 'Memory allocation',
        default: '512Mi',
        enum: ['256Mi', '512Mi', '1Gi', '2Gi'],
      },
      firebaseProjectId: {
        type: 'string',
        title: 'Firebase Project ID',
        description: 'Firebase project for auth token validation',
      },
      storageBucket: {
        type: 'string',
        title: 'Storage Bucket',
        description: 'GCS bucket for file uploads',
      },
      allowedCallers: {
        type: 'array',
        title: 'Allowed Callers',
        description: 'Service account emails allowed to invoke NATS handlers',
        items: { type: 'string' },
      },
    },
    required: ['firebaseProjectId', 'storageBucket'],
  },

  defaultConfig: {
    name: 'kernel',
    cpu: 1,
    memory: '512Mi',
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name as string);
    const name = config.name as string || 'kernel';
    const location = (config.location as string) || '${var.region}';
    const cpu = (config.cpu as number) || 1;
    const memory = (config.memory as string) || '512Mi';
    const firebaseProjectId = config.firebaseProjectId as string;
    const storageBucket = config.storageBucket as string;
    const allowedCallers = (config.allowedCallers as string[]) || [];
    const projectId = (config.projectId as string) || '${var.project_id}';

    const code = `// Service account for kernel
const ${varName}Sa = new ServiceAccount(this, '${name}-sa', {
  accountId: '${name}-kernel',
  displayName: 'Kernel Service Account',
});

// Grant storage access for files service
new ProjectIamMember(this, '${name}-storage-iam', {
  project: '${projectId}',
  role: 'roles/storage.objectAdmin',
  member: \`serviceAccount:\${${varName}Sa.email}\`,
});

// Cloud Run v2 service
const ${varName}Service = new CloudRunV2Service(this, '${name}', {
  name: '${name}',
  location: '${location}',
  ingress: 'INGRESS_TRAFFIC_ALL',

  template: {
    serviceAccount: ${varName}Sa.email,
    containers: [{
      image: 'gcr.io/${projectId}/stacksolo-kernel:latest',
      ports: [{ containerPort: 8080 }],
      resources: {
        limits: {
          cpu: '${cpu}',
          memory: '${memory}',
        },
      },
      envs: [
        { name: 'NATS_PORT', value: '4222' },
        { name: 'HTTP_PORT', value: '8080' },
        { name: 'FIREBASE_PROJECT_ID', value: '${firebaseProjectId}' },
        { name: 'GCS_BUCKET', value: '${storageBucket}' },
        { name: 'ALLOWED_CALLERS', value: '${allowedCallers.join(',')}' },
      ],
    }],
    scaling: {
      minInstanceCount: 1,
      maxInstanceCount: 1,
    },
  },
});

// Allow unauthenticated access (auth endpoint validates tokens itself)
new CloudRunV2ServiceIamMember(this, '${name}-public', {
  name: ${varName}Service.name,
  location: ${varName}Service.location,
  role: 'roles/run.invoker',
  member: 'allUsers',
});`;

    return {
      imports: [
        "import { ServiceAccount } from '@cdktf/provider-google/lib/service-account';",
        "import { ProjectIamMember } from '@cdktf/provider-google/lib/project-iam-member';",
        "import { CloudRunV2Service } from '@cdktf/provider-google/lib/cloud-run-v2-service';",
        "import { CloudRunV2ServiceIamMember } from '@cdktf/provider-google/lib/cloud-run-v2-service-iam-member';",
      ],
      code,
      outputs: [
        `export const ${varName}Url = ${varName}Service.uri;`,
        `export const ${varName}AuthUrl = \`\${${varName}Service.uri}/auth\`;`,
        `export const ${varName}NatsUrl = \`nats://\${${varName}Service.uri.replace('https://', '')}:4222\`;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 44,
    currency: 'USD',
    breakdown: [
      { item: 'Cloud Run (1 vCPU, always-on)', amount: 42 },
      { item: 'Memory (512Mi)', amount: 2 },
    ],
  }),
});