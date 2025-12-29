import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudRunJob = defineResource({
  id: 'gcp:cloud_run_job',
  provider: 'gcp',
  name: 'Cloud Run Job',
  description: 'Run containers to completion for batch processing and scheduled tasks',
  icon: 'work',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Job Name',
        description: 'Unique name for the job',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region to run the job',
        default: 'us-central1',
      },
      image: {
        type: 'string',
        title: 'Container Image',
        description: 'Full container image URL',
      },
      command: {
        type: 'array',
        title: 'Command',
        description: 'Container entrypoint command',
      },
      args: {
        type: 'array',
        title: 'Arguments',
        description: 'Arguments to the entrypoint',
      },
      env: {
        type: 'object',
        title: 'Environment Variables',
        description: 'Environment variables for the container',
      },
      memory: {
        type: 'string',
        title: 'Memory',
        description: 'Memory allocated per task',
        default: '512Mi',
        enum: ['256Mi', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi', '16Gi'],
      },
      cpu: {
        type: 'string',
        title: 'CPU',
        description: 'CPU allocated per task',
        default: '1',
        enum: ['1', '2', '4', '8'],
      },
      taskCount: {
        type: 'number',
        title: 'Task Count',
        description: 'Number of tasks to run in parallel',
        default: 1,
        minimum: 1,
        maximum: 10000,
      },
      parallelism: {
        type: 'number',
        title: 'Parallelism',
        description: 'Maximum parallel tasks',
        default: 1,
        minimum: 0,
        maximum: 100,
      },
      maxRetries: {
        type: 'number',
        title: 'Max Retries',
        description: 'Maximum retry attempts per task',
        default: 3,
        minimum: 0,
        maximum: 10,
      },
      timeout: {
        type: 'string',
        title: 'Timeout',
        description: 'Maximum execution time per task',
        default: '600s',
      },
      serviceAccount: {
        type: 'string',
        title: 'Service Account',
        description: 'Service account email for the job',
      },
      vpcConnector: {
        type: 'string',
        title: 'VPC Connector',
        description: 'VPC connector for private network access',
      },
      labels: {
        type: 'object',
        title: 'Labels',
        description: 'Key-value labels',
      },
    },
    required: ['name', 'image'],
  },

  defaultConfig: {
    location: 'us-central1',
    memory: '512Mi',
    cpu: '1',
    taskCount: 1,
    parallelism: 1,
    maxRetries: 3,
    timeout: '600s',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const jobConfig = config as {
      name: string;
      location?: string;
      image: string;
      command?: string[];
      args?: string[];
      env?: Record<string, string>;
      memory?: string;
      cpu?: string;
      taskCount?: number;
      parallelism?: number;
      maxRetries?: number;
      timeout?: string;
      serviceAccount?: string;
      vpcConnector?: string;
      labels?: Record<string, string>;
    };

    const location = jobConfig.location || 'us-central1';
    const memory = jobConfig.memory || '512Mi';
    const cpu = jobConfig.cpu || '1';
    const taskCount = jobConfig.taskCount || 1;
    const parallelism = jobConfig.parallelism || 1;
    const maxRetries = jobConfig.maxRetries ?? 3;
    const timeout = jobConfig.timeout || '600s';

    let code = `const ${varName}Job = new gcp.cloudrunv2.Job("${config.name}", {
  name: "${config.name}",
  location: "${location}",
  template: {
    taskCount: ${taskCount},
    parallelism: ${parallelism},
    template: {
      maxRetries: ${maxRetries},
      timeout: "${timeout}",
      containers: [{
        image: "${jobConfig.image}",
        resources: {
          limits: {
            memory: "${memory}",
            cpu: "${cpu}",
          },
        },`;

    if (jobConfig.command && jobConfig.command.length > 0) {
      code += `\n        command: ${JSON.stringify(jobConfig.command)},`;
    }

    if (jobConfig.args && jobConfig.args.length > 0) {
      code += `\n        args: ${JSON.stringify(jobConfig.args)},`;
    }

    if (jobConfig.env && Object.keys(jobConfig.env).length > 0) {
      code += `\n        envs: [`;
      for (const [key, value] of Object.entries(jobConfig.env)) {
        code += `\n          { name: "${key}", value: "${value}" },`;
      }
      code += `\n        ],`;
    }

    code += `\n      }],`;

    if (jobConfig.serviceAccount) {
      code += `\n      serviceAccount: "${jobConfig.serviceAccount}",`;
    }

    if (jobConfig.vpcConnector) {
      code += `\n      vpcAccess: {
        connector: "${jobConfig.vpcConnector}",
      },`;
    }

    code += `\n    },
  },`;

    if (jobConfig.labels && Object.keys(jobConfig.labels).length > 0) {
      code += `\n  labels: ${JSON.stringify(jobConfig.labels)},`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}JobName = ${varName}Job.name;`,
        `export const ${varName}JobId = ${varName}Job.id;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const jobConfig = config as { memory?: string; cpu?: string };
    const memory = jobConfig.memory || '512Mi';

    const memoryPricing: Record<string, number> = {
      '256Mi': 5,
      '512Mi': 10,
      '1Gi': 20,
      '2Gi': 40,
      '4Gi': 80,
      '8Gi': 160,
      '16Gi': 320,
    };

    const estimated = memoryPricing[memory] || 10;

    return {
      monthly: estimated,
      currency: 'USD',
      breakdown: [
        { item: 'Execution time (pay per use)', amount: estimated },
        { item: 'Free tier: 50 vCPU-hours/month', amount: 0 },
      ],
    };
  },
});
