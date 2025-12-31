import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const vpcNetwork = defineResource({
  id: 'gcp-cdktf:vpc_network',
  provider: 'gcp-cdktf',
  name: 'VPC Network',
  description: 'Virtual Private Cloud network for isolating resources',
  icon: 'hub',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Network Name',
        description: 'Unique name for the VPC network',
        minLength: 1,
        maxLength: 63,
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Human-readable description',
      },
      autoCreateSubnetworks: {
        type: 'boolean',
        title: 'Auto Create Subnets',
        description: 'Automatically create subnets in each region',
        default: true,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    autoCreateSubnetworks: true,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const vpcConfig = config as {
      name: string;
      description?: string;
      autoCreateSubnetworks?: boolean;
    };

    const autoCreate = vpcConfig.autoCreateSubnetworks ?? true;

    const code = `const ${varName}Network = new ComputeNetwork(this, '${config.name}', {
  name: '${config.name}',
  autoCreateSubnetworks: ${autoCreate},
});`;

    return {
      imports: [
        "import { ComputeNetwork } from '@cdktf/provider-google/lib/compute-network';",
      ],
      code,
      outputs: [
        `export const ${varName}NetworkName = ${varName}Network.name;`,
        `export const ${varName}NetworkId = ${varName}Network.id;`,
        `export const ${varName}NetworkSelfLink = ${varName}Network.selfLink;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'VPC network (no charge)', amount: 0 },
    ],
  }),
});
