import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const firewall = defineResource({
  id: 'gcp:firewall',
  provider: 'gcp',
  name: 'Firewall Rule',
  description: 'Control ingress and egress traffic to VPC resources',
  icon: 'security',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Rule Name',
        description: 'Unique name for the firewall rule',
        minLength: 1,
        maxLength: 63,
      },
      network: {
        type: 'string',
        title: 'Network',
        description: 'VPC network to apply the rule to',
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Human-readable description',
      },
      direction: {
        type: 'string',
        title: 'Direction',
        description: 'Traffic direction',
        default: 'INGRESS',
        enum: ['INGRESS', 'EGRESS'],
      },
      priority: {
        type: 'number',
        title: 'Priority',
        description: 'Rule priority (0-65535, lower = higher priority)',
        default: 1000,
        minimum: 0,
        maximum: 65535,
      },
      action: {
        type: 'string',
        title: 'Action',
        description: 'Allow or deny matching traffic',
        default: 'allow',
        enum: ['allow', 'deny'],
      },
      protocol: {
        type: 'string',
        title: 'Protocol',
        description: 'IP protocol (tcp, udp, icmp, or all)',
        default: 'tcp',
      },
      ports: {
        type: 'array',
        title: 'Ports',
        description: 'Port numbers or ranges (e.g., ["80", "443", "8080-8090"])',
      },
      sourceRanges: {
        type: 'array',
        title: 'Source Ranges',
        description: 'Source IP CIDR ranges (for ingress)',
      },
      destinationRanges: {
        type: 'array',
        title: 'Destination Ranges',
        description: 'Destination IP CIDR ranges (for egress)',
      },
      sourceTags: {
        type: 'array',
        title: 'Source Tags',
        description: 'Source instance tags (for ingress)',
      },
      targetTags: {
        type: 'array',
        title: 'Target Tags',
        description: 'Target instance tags',
      },
      sourceServiceAccounts: {
        type: 'array',
        title: 'Source Service Accounts',
        description: 'Source service accounts (for ingress)',
      },
      targetServiceAccounts: {
        type: 'array',
        title: 'Target Service Accounts',
        description: 'Target service accounts',
      },
      disabled: {
        type: 'boolean',
        title: 'Disabled',
        description: 'Disable the rule without deleting',
        default: false,
      },
      enableLogging: {
        type: 'boolean',
        title: 'Enable Logging',
        description: 'Log firewall rule matches',
        default: false,
      },
    },
    required: ['name', 'network'],
  },

  defaultConfig: {
    direction: 'INGRESS',
    priority: 1000,
    action: 'allow',
    protocol: 'tcp',
    disabled: false,
    enableLogging: false,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const fwConfig = config as {
      name: string;
      network: string;
      description?: string;
      direction?: string;
      priority?: number;
      action?: string;
      protocol?: string;
      ports?: string[];
      sourceRanges?: string[];
      destinationRanges?: string[];
      sourceTags?: string[];
      targetTags?: string[];
      sourceServiceAccounts?: string[];
      targetServiceAccounts?: string[];
      disabled?: boolean;
      enableLogging?: boolean;
    };

    const direction = fwConfig.direction || 'INGRESS';
    const priority = fwConfig.priority ?? 1000;
    const action = fwConfig.action || 'allow';
    const protocol = fwConfig.protocol || 'tcp';

    let code = `const ${varName}Firewall = new gcp.compute.Firewall("${config.name}", {
  name: "${config.name}",
  network: "${fwConfig.network}",
  direction: "${direction}",
  priority: ${priority},`;

    if (fwConfig.description) {
      code += `\n  description: "${fwConfig.description}",`;
    }

    if (fwConfig.disabled) {
      code += `\n  disabled: true,`;
    }

    // Build allow/deny rules
    const ruleType = action === 'allow' ? 'allows' : 'denies';
    code += `\n  ${ruleType}: [{
    protocol: "${protocol}",`;
    if (fwConfig.ports && fwConfig.ports.length > 0) {
      code += `\n    ports: ${JSON.stringify(fwConfig.ports)},`;
    }
    code += `\n  }],`;

    // Source/destination ranges
    if (fwConfig.sourceRanges && fwConfig.sourceRanges.length > 0) {
      code += `\n  sourceRanges: ${JSON.stringify(fwConfig.sourceRanges)},`;
    }
    if (fwConfig.destinationRanges && fwConfig.destinationRanges.length > 0) {
      code += `\n  destinationRanges: ${JSON.stringify(fwConfig.destinationRanges)},`;
    }

    // Tags
    if (fwConfig.sourceTags && fwConfig.sourceTags.length > 0) {
      code += `\n  sourceTags: ${JSON.stringify(fwConfig.sourceTags)},`;
    }
    if (fwConfig.targetTags && fwConfig.targetTags.length > 0) {
      code += `\n  targetTags: ${JSON.stringify(fwConfig.targetTags)},`;
    }

    // Service accounts
    if (fwConfig.sourceServiceAccounts && fwConfig.sourceServiceAccounts.length > 0) {
      code += `\n  sourceServiceAccounts: ${JSON.stringify(fwConfig.sourceServiceAccounts)},`;
    }
    if (fwConfig.targetServiceAccounts && fwConfig.targetServiceAccounts.length > 0) {
      code += `\n  targetServiceAccounts: ${JSON.stringify(fwConfig.targetServiceAccounts)},`;
    }

    // Logging
    if (fwConfig.enableLogging) {
      code += `\n  logConfig: {
    metadata: "INCLUDE_ALL_METADATA",
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}FirewallName = ${varName}Firewall.name;`,
        `export const ${varName}FirewallId = ${varName}Firewall.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Firewall rules (no charge)', amount: 0 },
      { item: 'Logging ($0.50/GB if enabled)', amount: 0 },
    ],
  }),
});
