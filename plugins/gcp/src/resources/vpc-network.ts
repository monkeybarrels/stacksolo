import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const vpcNetwork = defineResource({
  id: 'gcp:vpc_network',
  provider: 'gcp',
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
        default: false,
      },
      routingMode: {
        type: 'string',
        title: 'Routing Mode',
        description: 'Network-wide routing mode',
        default: 'REGIONAL',
        enum: ['REGIONAL', 'GLOBAL'],
      },
      mtu: {
        type: 'number',
        title: 'MTU',
        description: 'Maximum Transmission Unit (1460-1500)',
        default: 1460,
        minimum: 1300,
        maximum: 8896,
      },
      deleteDefaultRoutes: {
        type: 'boolean',
        title: 'Delete Default Routes',
        description: 'Remove default internet gateway routes',
        default: false,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    autoCreateSubnetworks: false,
    routingMode: 'REGIONAL',
    mtu: 1460,
    deleteDefaultRoutes: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const vpcConfig = config as {
      name: string;
      description?: string;
      autoCreateSubnetworks?: boolean;
      routingMode?: string;
      mtu?: number;
      deleteDefaultRoutes?: boolean;
    };

    const autoCreate = vpcConfig.autoCreateSubnetworks || false;
    const routingMode = vpcConfig.routingMode || 'REGIONAL';
    const mtu = vpcConfig.mtu || 1460;

    let code = `const ${varName}Network = new gcp.compute.Network("${config.name}", {
  name: "${config.name}",
  autoCreateSubnetworks: ${autoCreate},
  routingMode: "${routingMode}",
  mtu: ${mtu},`;

    if (vpcConfig.description) {
      code += `\n  description: "${vpcConfig.description}",`;
    }

    if (vpcConfig.deleteDefaultRoutes) {
      code += `\n  deleteDefaultRoutesOnCreate: true,`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
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
      { item: 'Egress charges apply separately', amount: 0 },
    ],
  }),
});
