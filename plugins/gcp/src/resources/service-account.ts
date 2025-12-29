import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const serviceAccount = defineResource({
  id: 'gcp:service_account',
  provider: 'gcp',
  name: 'Service Account',
  description: 'Identity for applications and services to authenticate with GCP',
  icon: 'badge',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Account ID',
        description: 'Unique ID for the service account (lowercase, max 30 chars)',
        minLength: 6,
        maxLength: 30,
      },
      displayName: {
        type: 'string',
        title: 'Display Name',
        description: 'Human-readable name',
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Description of what this service account is for',
      },
      createKey: {
        type: 'boolean',
        title: 'Create Key',
        description: 'Generate a JSON key for this service account',
        default: false,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    createKey: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const saConfig = config as {
      name: string;
      displayName?: string;
      description?: string;
      createKey?: boolean;
    };

    let code = `const ${varName}ServiceAccount = new gcp.serviceaccount.Account("${config.name}", {
  accountId: "${config.name}",`;

    if (saConfig.displayName) {
      code += `\n  displayName: "${saConfig.displayName}",`;
    }

    if (saConfig.description) {
      code += `\n  description: "${saConfig.description}",`;
    }

    code += '\n});';

    const outputs = [
      `export const ${varName}Email = ${varName}ServiceAccount.email;`,
      `export const ${varName}UniqueId = ${varName}ServiceAccount.uniqueId;`,
    ];

    if (saConfig.createKey) {
      code += `

const ${varName}Key = new gcp.serviceaccount.Key("${config.name}-key", {
  serviceAccountId: ${varName}ServiceAccount.name,
});`;
      outputs.push(`export const ${varName}KeyPrivate = ${varName}Key.privateKey;`);
    }

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs,
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Service accounts (no charge)', amount: 0 },
    ],
  }),
});
