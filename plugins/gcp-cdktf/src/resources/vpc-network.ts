import { defineResource, type ResourceConfig } from '@stacksolo/core';
import { generateLabelsCode, RESOURCE_TYPES } from '../utils/labels';

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
      existing: {
        type: 'boolean',
        title: 'Use Existing Network',
        description: 'Reference an existing VPC network instead of creating a new one. When true, a data source lookup will be used.',
        default: false,
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
      existing?: boolean;
      projectName?: string;
    };

    // If using an existing network, use a data source lookup
    if (vpcConfig.existing) {
      const code = `const ${varName}Network = new DataGoogleComputeNetwork(this, '${config.name}', {
  name: '${config.name}',
});`;

      return {
        imports: [
          "import { DataGoogleComputeNetwork } from '@cdktf/provider-google/lib/data-google-compute-network';",
        ],
        code,
        outputs: [
          `export const ${varName}NetworkName = ${varName}Network.name;`,
          `export const ${varName}NetworkId = ${varName}Network.id;`,
          `export const ${varName}NetworkSelfLink = ${varName}Network.selfLink;`,
        ],
      };
    }

    // Create a new network
    const autoCreate = vpcConfig.autoCreateSubnetworks ?? true;
    const projectName = vpcConfig.projectName || '${var.project_name}';
    const labelsCode = generateLabelsCode(projectName, RESOURCE_TYPES.VPC_NETWORK);

    const code = `const ${varName}Network = new ComputeNetwork(this, '${config.name}', {
  name: '${config.name}',
  autoCreateSubnetworks: ${autoCreate},
  ${labelsCode}
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
