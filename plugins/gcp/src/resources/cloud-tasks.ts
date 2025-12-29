import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudTasks = defineResource({
  id: 'gcp:cloud_tasks_queue',
  provider: 'gcp',
  name: 'Cloud Tasks Queue',
  description: 'Managed queue for asynchronous task execution',
  icon: 'queue',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Queue Name',
        description: 'Unique name for the queue',
        minLength: 1,
        maxLength: 100,
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'GCP region for the queue',
        default: 'us-central1',
      },
      rateLimitDispatchesPerSecond: {
        type: 'number',
        title: 'Dispatches Per Second',
        description: 'Maximum rate of task dispatches',
        default: 500,
        minimum: 0.1,
        maximum: 5000,
      },
      rateLimitMaxConcurrentDispatches: {
        type: 'number',
        title: 'Max Concurrent Dispatches',
        description: 'Maximum concurrent task dispatches',
        default: 1000,
        minimum: 1,
        maximum: 5000,
      },
      rateLimitMaxBurstSize: {
        type: 'number',
        title: 'Max Burst Size',
        description: 'Maximum burst size for rate limiting',
        default: 100,
      },
      retryMaxAttempts: {
        type: 'number',
        title: 'Max Retry Attempts',
        description: 'Maximum number of retry attempts (-1 for unlimited)',
        default: 100,
        minimum: -1,
        maximum: 100,
      },
      retryMaxRetryDuration: {
        type: 'string',
        title: 'Max Retry Duration',
        description: 'Maximum time to retry a failed task',
        default: '0s',
      },
      retryMinBackoff: {
        type: 'string',
        title: 'Min Backoff',
        description: 'Minimum backoff time between retries',
        default: '0.1s',
      },
      retryMaxBackoff: {
        type: 'string',
        title: 'Max Backoff',
        description: 'Maximum backoff time between retries',
        default: '3600s',
      },
      retryMaxDoublings: {
        type: 'number',
        title: 'Max Doublings',
        description: 'Maximum times backoff doubles',
        default: 16,
        minimum: 0,
        maximum: 100,
      },
      stackdriverLoggingEnabled: {
        type: 'boolean',
        title: 'Enable Logging',
        description: 'Enable Stackdriver logging',
        default: false,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    location: 'us-central1',
    rateLimitDispatchesPerSecond: 500,
    rateLimitMaxConcurrentDispatches: 1000,
    rateLimitMaxBurstSize: 100,
    retryMaxAttempts: 100,
    retryMaxRetryDuration: '0s',
    retryMinBackoff: '0.1s',
    retryMaxBackoff: '3600s',
    retryMaxDoublings: 16,
    stackdriverLoggingEnabled: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const queueConfig = config as {
      name: string;
      location?: string;
      rateLimitDispatchesPerSecond?: number;
      rateLimitMaxConcurrentDispatches?: number;
      rateLimitMaxBurstSize?: number;
      retryMaxAttempts?: number;
      retryMaxRetryDuration?: string;
      retryMinBackoff?: string;
      retryMaxBackoff?: string;
      retryMaxDoublings?: number;
      stackdriverLoggingEnabled?: boolean;
    };

    const location = queueConfig.location || 'us-central1';

    let code = `const ${varName}Queue = new gcp.cloudtasks.Queue("${config.name}", {
  name: "${config.name}",
  location: "${location}",
  rateLimits: {
    maxDispatchesPerSecond: ${queueConfig.rateLimitDispatchesPerSecond || 500},
    maxConcurrentDispatches: ${queueConfig.rateLimitMaxConcurrentDispatches || 1000},
    maxBurstSize: ${queueConfig.rateLimitMaxBurstSize || 100},
  },
  retryConfig: {
    maxAttempts: ${queueConfig.retryMaxAttempts ?? 100},
    maxRetryDuration: "${queueConfig.retryMaxRetryDuration || '0s'}",
    minBackoff: "${queueConfig.retryMinBackoff || '0.1s'}",
    maxBackoff: "${queueConfig.retryMaxBackoff || '3600s'}",
    maxDoublings: ${queueConfig.retryMaxDoublings || 16},
  },`;

    if (queueConfig.stackdriverLoggingEnabled) {
      code += `\n  stackdriverLoggingConfig: {
    samplingRatio: 1.0,
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}QueueName = ${varName}Queue.name;`,
        `export const ${varName}QueueId = ${varName}Queue.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'First 1M operations free', amount: 0 },
      { item: 'Additional: $0.40/million', amount: 0 },
    ],
  }),
});
