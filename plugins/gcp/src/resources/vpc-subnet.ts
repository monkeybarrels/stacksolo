import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const vpcSubnet = defineResource({
  id: 'gcp:vpc_subnet',
  provider: 'gcp',
  name: 'VPC Subnet',
  description: 'Subnet within a VPC network with a specific IP range',
  icon: 'lan',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Subnet Name',
        description: 'Unique name for the subnet',
        minLength: 1,
        maxLength: 63,
      },
      network: {
        type: 'string',
        title: 'Network',
        description: 'VPC network name or self-link',
      },
      region: {
        type: 'string',
        title: 'Region',
        description: 'GCP region for the subnet',
        default: 'us-central1',
      },
      ipCidrRange: {
        type: 'string',
        title: 'IP CIDR Range',
        description: 'Primary IP range (e.g., 10.0.0.0/24)',
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Human-readable description',
      },
      privateIpGoogleAccess: {
        type: 'boolean',
        title: 'Private Google Access',
        description: 'Access Google APIs without external IP',
        default: true,
      },
      secondaryIpRanges: {
        type: 'array',
        title: 'Secondary IP Ranges',
        description: 'Additional IP ranges for pods/services',
      },
      logConfig: {
        type: 'boolean',
        title: 'Enable Flow Logs',
        description: 'Enable VPC flow logs for this subnet',
        default: false,
      },
      purpose: {
        type: 'string',
        title: 'Purpose',
        description: 'Subnet purpose',
        default: 'PRIVATE',
        enum: ['PRIVATE', 'REGIONAL_MANAGED_PROXY', 'GLOBAL_MANAGED_PROXY', 'PRIVATE_SERVICE_CONNECT'],
      },
    },
    required: ['name', 'network', 'ipCidrRange'],
  },

  defaultConfig: {
    region: 'us-central1',
    privateIpGoogleAccess: true,
    logConfig: false,
    purpose: 'PRIVATE',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const subnetConfig = config as {
      name: string;
      network: string;
      region?: string;
      ipCidrRange: string;
      description?: string;
      privateIpGoogleAccess?: boolean;
      secondaryIpRanges?: Array<{ rangeName: string; ipCidrRange: string }>;
      logConfig?: boolean;
      purpose?: string;
    };

    const region = subnetConfig.region || 'us-central1';
    const privateAccess = subnetConfig.privateIpGoogleAccess !== false;

    let code = `const ${varName}Subnet = new gcp.compute.Subnetwork("${config.name}", {
  name: "${config.name}",
  network: "${subnetConfig.network}",
  region: "${region}",
  ipCidrRange: "${subnetConfig.ipCidrRange}",
  privateIpGoogleAccess: ${privateAccess},`;

    if (subnetConfig.description) {
      code += `\n  description: "${subnetConfig.description}",`;
    }

    if (subnetConfig.purpose && subnetConfig.purpose !== 'PRIVATE') {
      code += `\n  purpose: "${subnetConfig.purpose}",`;
    }

    if (subnetConfig.secondaryIpRanges && subnetConfig.secondaryIpRanges.length > 0) {
      code += `\n  secondaryIpRanges: [`;
      for (const range of subnetConfig.secondaryIpRanges) {
        code += `\n    { rangeName: "${range.rangeName}", ipCidrRange: "${range.ipCidrRange}" },`;
      }
      code += `\n  ],`;
    }

    if (subnetConfig.logConfig) {
      code += `\n  logConfig: {
    aggregationInterval: "INTERVAL_5_SEC",
    flowSampling: 0.5,
    metadata: "INCLUDE_ALL_METADATA",
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}SubnetName = ${varName}Subnet.name;`,
        `export const ${varName}SubnetId = ${varName}Subnet.id;`,
        `export const ${varName}SubnetSelfLink = ${varName}Subnet.selfLink;`,
        `export const ${varName}SubnetIpRange = ${varName}Subnet.ipCidrRange;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Subnet (no charge)', amount: 0 },
      { item: 'Flow logs ($0.50/GB if enabled)', amount: 0 },
    ],
  }),
});
