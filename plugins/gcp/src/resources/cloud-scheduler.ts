import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudScheduler = defineResource({
  id: 'gcp:scheduler_job',
  provider: 'gcp',
  name: 'Cloud Scheduler Job',
  description: 'Cron job that triggers HTTP endpoints, Pub/Sub, or App Engine',
  icon: 'schedule',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Job Name',
        description: 'Unique name for the scheduler job',
        minLength: 1,
        maxLength: 500,
      },
      schedule: {
        type: 'string',
        title: 'Schedule (cron)',
        description: 'Cron expression (e.g., "0 9 * * 1" for 9am every Monday)',
      },
      timezone: {
        type: 'string',
        title: 'Timezone',
        description: 'Timezone for the schedule',
        default: 'UTC',
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Human-readable description of the job',
      },
      targetType: {
        type: 'string',
        title: 'Target Type',
        description: 'What to trigger',
        default: 'http',
        enum: ['http', 'pubsub'],
      },
      httpUrl: {
        type: 'string',
        title: 'HTTP URL',
        description: 'URL to call (for HTTP targets)',
      },
      httpMethod: {
        type: 'string',
        title: 'HTTP Method',
        description: 'HTTP method to use',
        default: 'POST',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      },
      httpBody: {
        type: 'string',
        title: 'HTTP Body',
        description: 'Request body for HTTP target',
      },
      pubsubTopic: {
        type: 'string',
        title: 'Pub/Sub Topic',
        description: 'Topic to publish to (for Pub/Sub targets)',
      },
      pubsubData: {
        type: 'string',
        title: 'Pub/Sub Message Data',
        description: 'Base64-encoded message data',
      },
      retryCount: {
        type: 'number',
        title: 'Retry Count',
        description: 'Number of retry attempts',
        default: 0,
        minimum: 0,
        maximum: 5,
      },
      attemptDeadline: {
        type: 'string',
        title: 'Attempt Deadline',
        description: 'Timeout for each attempt (e.g., "30s")',
        default: '180s',
      },
    },
    required: ['name', 'schedule'],
  },

  defaultConfig: {
    timezone: 'UTC',
    targetType: 'http',
    httpMethod: 'POST',
    retryCount: 0,
    attemptDeadline: '180s',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const jobConfig = config as {
      name: string;
      schedule: string;
      timezone?: string;
      description?: string;
      targetType?: string;
      httpUrl?: string;
      httpMethod?: string;
      httpBody?: string;
      httpHeaders?: Record<string, string>;
      pubsubTopic?: string;
      pubsubData?: string;
      retryCount?: number;
      attemptDeadline?: string;
      // High-level config from blueprint
      target?: string;
      path?: string;
    };

    const timezone = jobConfig.timezone || 'UTC';
    const targetType = jobConfig.targetType || 'http';

    let code = `const ${varName}Job = new gcp.cloudscheduler.Job("${config.name}", {
  name: "${config.name}",
  schedule: "${jobConfig.schedule}",
  timeZone: "${timezone}",`;

    if (jobConfig.description) {
      code += `\n  description: "${jobConfig.description}",`;
    }

    if (jobConfig.attemptDeadline) {
      code += `\n  attemptDeadline: "${jobConfig.attemptDeadline}",`;
    }

    if (jobConfig.retryCount && jobConfig.retryCount > 0) {
      code += `\n  retryConfig: {
    retryCount: ${jobConfig.retryCount},
  },`;
    }

    // Handle target reference (e.g., "main/processor" -> reference to function/container URL)
    if (jobConfig.target && jobConfig.target.includes('/')) {
      const [, resourceName] = jobConfig.target.split('/');
      const resourceVarName = toVariableName(resourceName);
      const pathSuffix = jobConfig.path || '';

      // Generate code that references the target resource's URL directly
      // Reference the function's serviceConfig.uri instead of the export variable
      code += `\n  httpTarget: {
    uri: ${resourceVarName}Function.serviceConfig.apply(sc => \`\${sc?.uri || ""}${pathSuffix}\`),
    httpMethod: "${jobConfig.httpMethod || 'GET'}",`;

      if (jobConfig.httpBody) {
        code += `\n    body: Buffer.from("${jobConfig.httpBody}").toString("base64"),`;
      }
      if (jobConfig.httpHeaders) {
        code += `\n    headers: ${JSON.stringify(jobConfig.httpHeaders)},`;
      }
      code += '\n  },';
    } else if (targetType === 'http' && jobConfig.httpUrl) {
      code += `\n  httpTarget: {
    uri: "${jobConfig.httpUrl}",
    httpMethod: "${jobConfig.httpMethod || 'POST'}",`;
      if (jobConfig.httpBody) {
        code += `\n    body: Buffer.from("${jobConfig.httpBody}").toString("base64"),`;
      }
      code += '\n  },';
    } else if (targetType === 'pubsub' && jobConfig.pubsubTopic) {
      code += `\n  pubsubTarget: {
    topicName: "${jobConfig.pubsubTopic}",`;
      if (jobConfig.pubsubData) {
        code += `\n    data: "${jobConfig.pubsubData}",`;
      }
      code += '\n  },';
    } else {
      // Default: create a placeholder HTTP target that must be configured
      code += `\n  httpTarget: {
    uri: "https://placeholder.example.com",
    httpMethod: "GET",
  },`;
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

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'First 3 jobs free', amount: 0 },
      { item: 'Additional: $0.10/job/month', amount: 0 },
    ],
  }),
});
