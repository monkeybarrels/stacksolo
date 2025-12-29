import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudDns = defineResource({
  id: 'gcp:dns_zone',
  provider: 'gcp',
  name: 'Cloud DNS Zone',
  description: 'Managed DNS zone for domain name resolution',
  icon: 'dns',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Zone Name',
        description: 'Unique name for the DNS zone',
        minLength: 1,
        maxLength: 63,
      },
      dnsName: {
        type: 'string',
        title: 'DNS Name',
        description: 'The DNS name of this zone (e.g., example.com.)',
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Human-readable description',
      },
      visibility: {
        type: 'string',
        title: 'Visibility',
        description: 'Zone visibility',
        default: 'public',
        enum: ['public', 'private'],
      },
      privateVisibilityNetworks: {
        type: 'array',
        title: 'Private Networks',
        description: 'VPC networks for private zones',
      },
      dnssecEnabled: {
        type: 'boolean',
        title: 'DNSSEC',
        description: 'Enable DNSSEC for this zone',
        default: false,
      },
      forwardingTargets: {
        type: 'array',
        title: 'Forwarding Targets',
        description: 'DNS servers to forward queries to',
      },
    },
    required: ['name', 'dnsName'],
  },

  defaultConfig: {
    visibility: 'public',
    dnssecEnabled: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const dnsConfig = config as {
      name: string;
      dnsName: string;
      description?: string;
      visibility?: string;
      privateVisibilityNetworks?: string[];
      dnssecEnabled?: boolean;
      forwardingTargets?: string[];
    };

    const visibility = dnsConfig.visibility || 'public';

    let code = `const ${varName}Zone = new gcp.dns.ManagedZone("${config.name}", {
  name: "${config.name}",
  dnsName: "${dnsConfig.dnsName}",
  visibility: "${visibility}",`;

    if (dnsConfig.description) {
      code += `\n  description: "${dnsConfig.description}",`;
    }

    if (dnsConfig.dnssecEnabled) {
      code += `\n  dnssecConfig: {
    state: "on",
  },`;
    }

    if (visibility === 'private' && dnsConfig.privateVisibilityNetworks && dnsConfig.privateVisibilityNetworks.length > 0) {
      code += `\n  privateVisibilityConfig: {
    networks: [`;
      for (const network of dnsConfig.privateVisibilityNetworks) {
        code += `\n      { networkUrl: "${network}" },`;
      }
      code += `\n    ],
  },`;
    }

    if (dnsConfig.forwardingTargets && dnsConfig.forwardingTargets.length > 0) {
      code += `\n  forwardingConfig: {
    targetNameServers: [`;
      for (const target of dnsConfig.forwardingTargets) {
        code += `\n      { ipv4Address: "${target}" },`;
      }
      code += `\n    ],
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}ZoneName = ${varName}Zone.name;`,
        `export const ${varName}NameServers = ${varName}Zone.nameServers;`,
        `export const ${varName}ZoneId = ${varName}Zone.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0.2,
    currency: 'USD',
    breakdown: [
      { item: 'Managed zone ($0.20/zone/month)', amount: 0.2 },
      { item: 'Queries ($0.40/million)', amount: 0 },
    ],
  }),
});
