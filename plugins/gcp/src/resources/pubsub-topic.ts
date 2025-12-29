import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const pubsubTopic = defineResource({
  id: 'gcp:pubsub_topic',
  provider: 'gcp',
  name: 'Pub/Sub Topic',
  description: 'Messaging topic for async communication between services',
  icon: 'message',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Topic Name',
        description: 'Unique name for the topic',
        minLength: 3,
        maxLength: 255,
      },
      labels: {
        type: 'object',
        title: 'Labels',
        description: 'Key-value labels for organization',
      },
      messageRetentionDuration: {
        type: 'string',
        title: 'Message Retention',
        description: 'How long to retain messages (e.g., "86400s" for 1 day)',
        default: '604800s',
      },
      messageStoragePolicy: {
        type: 'array',
        title: 'Allowed Regions',
        description: 'Regions where messages can be stored',
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    messageRetentionDuration: '604800s', // 7 days
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const topicConfig = config as {
      name: string;
      labels?: Record<string, string>;
      messageRetentionDuration?: string;
      messageStoragePolicy?: string[];
    };

    let code = `const ${varName}Topic = new gcp.pubsub.Topic("${config.name}", {
  name: "${config.name}",`;

    if (topicConfig.messageRetentionDuration) {
      code += `\n  messageRetentionDuration: "${topicConfig.messageRetentionDuration}",`;
    }

    if (topicConfig.labels && Object.keys(topicConfig.labels).length > 0) {
      code += `\n  labels: ${JSON.stringify(topicConfig.labels)},`;
    }

    if (topicConfig.messageStoragePolicy && topicConfig.messageStoragePolicy.length > 0) {
      code += `\n  messageStoragePolicy: {
    allowedPersistenceRegions: ${JSON.stringify(topicConfig.messageStoragePolicy)},
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}TopicName = ${varName}Topic.name;`,
        `export const ${varName}TopicId = ${varName}Topic.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'First 10GB/month free', amount: 0 },
      { item: 'Additional: $40/TiB', amount: 0 },
    ],
  }),
});
