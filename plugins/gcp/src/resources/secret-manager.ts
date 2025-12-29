import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const secretManager = defineResource({
  id: 'gcp:secret',
  provider: 'gcp',
  name: 'Secret Manager Secret',
  description: 'Securely store API keys, passwords, and other sensitive data',
  icon: 'lock',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Secret Name',
        description: 'Unique name for the secret',
        minLength: 1,
        maxLength: 255,
      },
      value: {
        type: 'string',
        title: 'Secret Value',
        description: 'The secret value to store (will be encrypted)',
      },
      labels: {
        type: 'object',
        title: 'Labels',
        description: 'Key-value labels for organization',
      },
      replication: {
        type: 'string',
        title: 'Replication Policy',
        description: 'How the secret is replicated',
        default: 'automatic',
        enum: ['automatic', 'user-managed'],
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    replication: 'automatic',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const secretConfig = config as {
      name: string;
      value?: string;
      labels?: Record<string, string>;
    };

    let code = `const ${varName}Secret = new gcp.secretmanager.Secret("${config.name}", {
  secretId: "${config.name}",
  replication: {
    auto: {},
  },`;

    if (secretConfig.labels && Object.keys(secretConfig.labels).length > 0) {
      code += `\n  labels: ${JSON.stringify(secretConfig.labels)},`;
    }

    code += '\n});';

    // If a value is provided, create a version
    if (secretConfig.value) {
      code += `

const ${varName}SecretVersion = new gcp.secretmanager.SecretVersion("${config.name}-v1", {
  secret: ${varName}Secret.id,
  secretData: "${secretConfig.value}",
});`;
    }

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}SecretId = ${varName}Secret.secretId;`,
        `export const ${varName}SecretName = ${varName}Secret.name;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0.06,
    currency: 'USD',
    breakdown: [
      { item: 'Secret versions (first 6 free)', amount: 0 },
      { item: 'Access operations ($0.03/10K)', amount: 0.06 },
    ],
  }),
});
