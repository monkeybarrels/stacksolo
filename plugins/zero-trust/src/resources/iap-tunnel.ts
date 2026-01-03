import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * IAP Tunnel Resource
 *
 * Enables secure SSH/TCP tunneling to VMs and internal services through
 * Google Cloud's Identity-Aware Proxy (IAP). No VPN required.
 *
 * Access methods (after deployment):
 * - SSH: gcloud compute ssh INSTANCE --tunnel-through-iap
 * - TCP: gcloud compute start-iap-tunnel INSTANCE PORT --local-host-port=localhost:PORT
 */
export const iapTunnel = defineResource({
  id: 'zero-trust:iap_tunnel',
  provider: 'zero-trust',
  name: 'IAP Tunnel',
  description:
    'Secure SSH/TCP tunneling to VMs without public IPs using Identity-Aware Proxy',
  icon: 'vpn_lock',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Configuration Name',
        description: 'Unique name for this IAP tunnel configuration',
        minLength: 1,
        maxLength: 63,
      },
      targetInstance: {
        type: 'string',
        title: 'Target Instance',
        description: 'Name of the Compute Engine instance to access',
      },
      targetZone: {
        type: 'string',
        title: 'Zone',
        description: 'Zone where the instance is located (e.g., us-central1-a)',
      },
      network: {
        type: 'string',
        title: 'VPC Network',
        description: 'VPC network name (for firewall rules)',
        default: 'default',
      },
      allowedMembers: {
        type: 'array',
        title: 'Allowed Members',
        description:
          'IAM members allowed to use this tunnel (e.g., user:alice@example.com, group:devs@example.com, domain:example.com)',
        items: {
          type: 'string',
        },
      },
      allowedPorts: {
        type: 'array',
        title: 'Allowed Ports',
        description: 'Ports allowed through the tunnel (default: 22 for SSH)',
        items: {
          type: 'number',
        },
        default: [22],
      },
    },
    required: ['name', 'targetInstance', 'targetZone', 'allowedMembers'],
  },

  defaultConfig: {
    network: 'default',
    allowedPorts: [22],
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const tunnelConfig = config as {
      name: string;
      targetInstance: string;
      targetZone: string;
      network?: string;
      allowedMembers: string[];
      allowedPorts?: number[];
    };

    const network = tunnelConfig.network || 'default';
    const ports = tunnelConfig.allowedPorts || [22];
    const members = tunnelConfig.allowedMembers;

    // Format members for Terraform
    const membersCode = members.map((m) => `    '${m}',`).join('\n');

    // Format ports for firewall rule
    const portsCode = ports.map((p) => `'${p}'`).join(', ');

    const code = `// IAP Tunnel Firewall Rule - Allow IAP to reach the instance
// IAP uses this IP range: 35.235.240.0/20
const ${varName}IapFirewall = new ComputeFirewall(this, '${config.name}-iap-fw', {
  name: '${config.name}-allow-iap',
  network: '${network}',
  direction: 'INGRESS',
  priority: 1000,
  sourceRanges: ['35.235.240.0/20'],
  allow: [{
    protocol: 'tcp',
    ports: [${portsCode}],
  }],
  targetTags: ['iap-tunnel-${config.name}'],
});

// IAP Tunnel IAM Binding - Who can access via IAP
const ${varName}IapBinding = new IapTunnelInstanceIamBinding(this, '${config.name}-iap-binding', {
  project: \${var.project_id},
  zone: '${tunnelConfig.targetZone}',
  instance: '${tunnelConfig.targetInstance}',
  role: 'roles/iap.tunnelResourceAccessor',
  members: [
${membersCode}
  ],
});`;

    return {
      imports: [
        "import { ComputeFirewall } from '@cdktf/provider-google/lib/compute-firewall';",
        "import { IapTunnelInstanceIamBinding } from '@cdktf/provider-google/lib/iap-tunnel-instance-iam-binding';",
      ],
      code,
      outputs: [
        `// Access via: gcloud compute ssh ${tunnelConfig.targetInstance} --zone=${tunnelConfig.targetZone} --tunnel-through-iap`,
        `export const ${varName}TunnelInstance = '${tunnelConfig.targetInstance}';`,
        `export const ${varName}TunnelZone = '${tunnelConfig.targetZone}';`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'IAP Tunnel (no charge)', amount: 0 },
      { item: 'Note: Standard GCE charges apply for VMs', amount: 0 },
    ],
  }),
});
