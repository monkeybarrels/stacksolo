import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudRun = defineResource({
  id: 'gcp:cloud_run',
  provider: 'gcp',
  name: 'Cloud Run Service',
  description: 'Fully managed serverless container platform',
  icon: 'directions_run',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Service Name',
        description: 'Unique name for the Cloud Run service',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region to deploy the service',
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
      image: {
        type: 'string',
        title: 'Container Image',
        description: 'Full container image URL (e.g., gcr.io/project/image:tag)',
      },
      memory: {
        type: 'string',
        title: 'Memory',
        description: 'Memory allocated per instance',
        default: '512Mi',
        enum: ['256Mi', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi'],
      },
      cpu: {
        type: 'string',
        title: 'CPU',
        description: 'CPU allocated per instance',
        default: '1',
        enum: ['1', '2', '4', '8'],
      },
      minInstances: {
        type: 'number',
        title: 'Min Instances',
        description: 'Minimum number of instances (0 for scale to zero)',
        default: 0,
        minimum: 0,
        maximum: 100,
      },
      maxInstances: {
        type: 'number',
        title: 'Max Instances',
        description: 'Maximum number of instances',
        default: 10,
        minimum: 1,
        maximum: 1000,
      },
      port: {
        type: 'number',
        title: 'Container Port',
        description: 'Port the container listens on',
        default: 8080,
      },
      allowUnauthenticated: {
        type: 'boolean',
        title: 'Allow Unauthenticated',
        description: 'Allow public access without authentication',
        default: true,
      },
    },
    required: ['name', 'image'],
  },

  defaultConfig: {
    location: 'us-central1',
    memory: '512Mi',
    cpu: '1',
    minInstances: 0,
    maxInstances: 10,
    port: 8080,
    allowUnauthenticated: true,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const runConfig = config as {
      name: string;
      location?: string;
      image: string;
      memory?: string;
      cpu?: string;
      minInstances?: number;
      maxInstances?: number;
      port?: number;
      allowUnauthenticated?: boolean;
    };

    const location = runConfig.location || 'us-central1';
    const memory = runConfig.memory || '512Mi';
    const cpu = runConfig.cpu || '1';
    const minInstances = runConfig.minInstances ?? 0;
    const maxInstances = runConfig.maxInstances ?? 10;
    const port = runConfig.port ?? 8080;
    const allowUnauthenticated = runConfig.allowUnauthenticated ?? true;

    let code = `const ${varName}Service = new gcp.cloudrunv2.Service("${config.name}", {
  name: "${config.name}",
  location: "${location}",
  template: {
    scaling: {
      minInstanceCount: ${minInstances},
      maxInstanceCount: ${maxInstances},
    },
    containers: [{
      image: "${runConfig.image}",
      ports: [{
        containerPort: ${port},
      }],
      resources: {
        limits: {
          memory: "${memory}",
          cpu: "${cpu}",
        },
      },
    }],
  },
});`;

    if (allowUnauthenticated) {
      code += `

// Allow unauthenticated access
const ${varName}IamMember = new gcp.cloudrunv2.ServiceIamMember("${config.name}-public", {
  name: ${varName}Service.name,
  location: "${location}",
  role: "roles/run.invoker",
  member: "allUsers",
});`;
    }

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [`export const ${varName}Url = ${varName}Service.uri;`],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const runConfig = config as { memory?: string; cpu?: string };
    const memory = runConfig.memory || '512Mi';

    // Rough estimation based on memory tier
    const memoryPricing: Record<string, number> = {
      '256Mi': 5,
      '512Mi': 10,
      '1Gi': 20,
      '2Gi': 40,
      '4Gi': 80,
      '8Gi': 160,
    };

    const estimated = memoryPricing[memory] || 10;

    return {
      monthly: estimated,
      currency: 'USD',
      breakdown: [
        { item: 'Cloud Run compute (estimated)', amount: estimated },
        { item: 'Free tier: 2M requests/month', amount: 0 },
      ],
    };
  },
});
