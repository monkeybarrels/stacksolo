import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const pubsubSubscription = defineResource({
  id: 'gcp:pubsub_subscription',
  provider: 'gcp',
  name: 'Pub/Sub Subscription',
  description: 'Subscribe to a topic to receive messages',
  icon: 'inbox',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Subscription Name',
        description: 'Unique name for the subscription',
        minLength: 3,
        maxLength: 255,
      },
      topic: {
        type: 'string',
        title: 'Topic Name',
        description: 'Name of the topic to subscribe to',
      },
      ackDeadlineSeconds: {
        type: 'number',
        title: 'Ack Deadline (seconds)',
        description: 'Time to acknowledge a message before redelivery',
        default: 10,
        minimum: 10,
        maximum: 600,
      },
      messageRetentionDuration: {
        type: 'string',
        title: 'Message Retention',
        description: 'How long to retain unacked messages',
        default: '604800s',
      },
      retainAckedMessages: {
        type: 'boolean',
        title: 'Retain Acked Messages',
        description: 'Keep messages after acknowledgment',
        default: false,
      },
      pushEndpoint: {
        type: 'string',
        title: 'Push Endpoint',
        description: 'URL to push messages to (leave empty for pull)',
      },
      filter: {
        type: 'string',
        title: 'Filter',
        description: 'Filter expression for messages',
      },
      enableExactlyOnceDelivery: {
        type: 'boolean',
        title: 'Exactly Once Delivery',
        description: 'Enable exactly-once message delivery',
        default: false,
      },
      deadLetterTopic: {
        type: 'string',
        title: 'Dead Letter Topic',
        description: 'Topic for failed messages',
      },
      maxDeliveryAttempts: {
        type: 'number',
        title: 'Max Delivery Attempts',
        description: 'Max attempts before dead-lettering',
        default: 5,
        minimum: 5,
        maximum: 100,
      },
    },
    required: ['name', 'topic'],
  },

  defaultConfig: {
    ackDeadlineSeconds: 10,
    messageRetentionDuration: '604800s',
    retainAckedMessages: false,
    enableExactlyOnceDelivery: false,
    maxDeliveryAttempts: 5,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const subConfig = config as {
      name: string;
      topic: string;
      ackDeadlineSeconds?: number;
      messageRetentionDuration?: string;
      retainAckedMessages?: boolean;
      pushEndpoint?: string;
      filter?: string;
      enableExactlyOnceDelivery?: boolean;
      deadLetterTopic?: string;
      maxDeliveryAttempts?: number;
    };

    let code = `const ${varName}Subscription = new gcp.pubsub.Subscription("${config.name}", {
  name: "${config.name}",
  topic: "${subConfig.topic}",`;

    if (subConfig.ackDeadlineSeconds) {
      code += `\n  ackDeadlineSeconds: ${subConfig.ackDeadlineSeconds},`;
    }

    if (subConfig.messageRetentionDuration) {
      code += `\n  messageRetentionDuration: "${subConfig.messageRetentionDuration}",`;
    }

    if (subConfig.retainAckedMessages) {
      code += `\n  retainAckedMessages: true,`;
    }

    if (subConfig.enableExactlyOnceDelivery) {
      code += `\n  enableExactlyOnceDelivery: true,`;
    }

    if (subConfig.filter) {
      code += `\n  filter: "${subConfig.filter}",`;
    }

    if (subConfig.pushEndpoint) {
      code += `\n  pushConfig: {
    pushEndpoint: "${subConfig.pushEndpoint}",
  },`;
    }

    if (subConfig.deadLetterTopic) {
      code += `\n  deadLetterPolicy: {
    deadLetterTopic: "${subConfig.deadLetterTopic}",
    maxDeliveryAttempts: ${subConfig.maxDeliveryAttempts || 5},
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}SubscriptionName = ${varName}Subscription.name;`,
        `export const ${varName}SubscriptionId = ${varName}Subscription.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'First 10GB/month free', amount: 0 },
      { item: 'Message delivery included', amount: 0 },
    ],
  }),
});
