import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const vpcConnector = defineResource({
  id: 'gcp-cdktf:vpc_connector',
  provider: 'gcp-cdktf',
  name: 'VPC Access Connector',
  description: 'Serverless VPC Access connector for Cloud Functions and Cloud Run',
  icon: 'link',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Connector Name',
        description: 'Unique name for the VPC connector',
        minLength: 1,
        maxLength: 63,
      },
      network: {
        type: 'string',
        title: 'Network',
        description: 'VPC network to connect to',
      },
      region: {
        type: 'string',
        title: 'Region',
        description: 'GCP region for the connector',
      },
      ipCidrRange: {
        type: 'string',
        title: 'IP CIDR Range',
        description: 'IP range for the connector (e.g., 10.8.0.0/28)',
        default: '10.8.0.0/28',
      },
      minThroughput: {
        type: 'number',
        title: 'Min Throughput',
        description: 'Minimum throughput in Mbps',
        default: 200,
      },
      maxThroughput: {
        type: 'number',
        title: 'Max Throughput',
        description: 'Maximum throughput in Mbps',
        default: 300,
      },
    },
    required: ['name', 'network', 'region'],
  },

  defaultConfig: {
    ipCidrRange: '10.8.0.0/28',
    minThroughput: 200,
    maxThroughput: 300,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const connectorConfig = config as {
      name: string;
      network: string;
      region: string;
      ipCidrRange?: string;
      minThroughput?: number;
      maxThroughput?: number;
      existingNetwork?: boolean;
    };

    const ipCidr = connectorConfig.ipCidrRange || '10.8.0.0/28';
    const minThroughput = connectorConfig.minThroughput || 200;
    const maxThroughput = connectorConfig.maxThroughput || 300;
    const networkVar = toVariableName(connectorConfig.network);
    const useExistingNetwork = connectorConfig.existingNetwork === true;

    // If using existing network, reference by name string; otherwise reference the resource
    const networkRef = useExistingNetwork
      ? `'${connectorConfig.network}'`
      : `${networkVar}Network.id`;

    const code = `const ${varName}Connector = new VpcAccessConnector(this, '${config.name}', {
  name: '${config.name}',
  region: '${connectorConfig.region}',
  network: ${networkRef},
  ipCidrRange: '${ipCidr}',
  minThroughput: ${minThroughput},
  maxThroughput: ${maxThroughput},
});`;

    return {
      imports: [
        "import { VpcAccessConnector } from '@cdktf/provider-google/lib/vpc-access-connector';",
      ],
      code,
      outputs: [
        `export const ${varName}ConnectorId = ${varName}Connector.id;`,
        `export const ${varName}ConnectorName = ${varName}Connector.name;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'VPC connector (billed per GB processed)', amount: 0 },
    ],
  }),
});
