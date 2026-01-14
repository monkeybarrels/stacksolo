import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * DNS Record Resource
 *
 * Creates DNS records in Cloudflare, typically used to point domains to
 * GCP load balancer IP addresses.
 *
 * Supports A, AAAA, and CNAME record types.
 */
export const dnsRecord = defineResource({
  id: 'cloudflare:dns_record',
  provider: 'cloudflare',
  name: 'DNS Record',
  description: 'Create DNS records in Cloudflare (A, AAAA, CNAME)',
  icon: 'dns',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Record Name',
        description: 'Unique name for this DNS record resource',
        minLength: 1,
        maxLength: 63,
      },
      zoneId: {
        type: 'string',
        title: 'Zone ID',
        description: 'Cloudflare Zone ID (found in dashboard Overview tab)',
      },
      recordName: {
        type: 'string',
        title: 'DNS Name',
        description: 'The DNS record name (e.g., "app" for app.example.com, or "@" for root)',
      },
      type: {
        type: 'string',
        title: 'Record Type',
        description: 'DNS record type (A, AAAA, CNAME)',
        enum: ['A', 'AAAA', 'CNAME'],
      },
      value: {
        type: 'string',
        title: 'Value',
        description: 'Record value (IP address or hostname). Can be a CDKTF reference like ${loadBalancerIp.address}',
      },
      proxied: {
        type: 'boolean',
        title: 'Proxied',
        description: 'Enable Cloudflare proxy (orange cloud) for CDN and DDoS protection',
      },
      ttl: {
        type: 'number',
        title: 'TTL',
        description: 'Time to live in seconds (1 = auto when proxied)',
      },
    },
    required: ['name', 'zoneId', 'recordName', 'type', 'value'],
  },

  defaultConfig: {
    type: 'A',
    proxied: true,
    ttl: 1,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const dnsConfig = config as {
      name: string;
      zoneId: string;
      recordName: string;
      type: 'A' | 'AAAA' | 'CNAME';
      value: string;
      proxied?: boolean;
      ttl?: number;
    };

    // Handle CDKTF references in value (e.g., ${loadBalancerIp.address})
    const valueCode = dnsConfig.value.startsWith('${')
      ? dnsConfig.value.slice(2, -1) // Remove ${ and } for direct reference
      : `'${dnsConfig.value}'`;

    const proxied = dnsConfig.proxied ?? true;
    const ttl = dnsConfig.ttl ?? 1;

    const code = `// Cloudflare DNS Record: ${dnsConfig.recordName}
const ${varName}DnsRecord = new CloudflareRecord(this, '${config.name}-dns', {
  zoneId: '${dnsConfig.zoneId}',
  name: '${dnsConfig.recordName}',
  type: '${dnsConfig.type}',
  value: ${valueCode},
  proxied: ${proxied},
  ttl: ${ttl},
});`;

    return {
      imports: [
        "import { Record as CloudflareRecord } from '@cdktf/provider-cloudflare/lib/record';",
      ],
      code,
      outputs: [
        `export const ${varName}DnsRecordHostname = ${varName}DnsRecord.hostname;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Cloudflare DNS (Free tier)', amount: 0 },
      { item: 'Note: Proxied traffic uses Cloudflare CDN', amount: 0 },
    ],
  }),
});
