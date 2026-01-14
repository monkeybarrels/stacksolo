# Cloudflare Plugin - AI Assistant Guide

This document helps AI assistants understand and work with the Cloudflare plugin.

## What This Plugin Does

Provides Cloudflare DNS resources that let users automatically configure DNS records pointing to GCP load balancers. Eliminates manual Cloudflare dashboard configuration.

## Quick Reference

### Resources

| Resource | ID | Purpose |
|----------|-----|---------|
| DNS Record | `cloudflare:dns_record` | Create A, AAAA, or CNAME records |

## Code Generation

### DNS Record generates:

```typescript
import { Record as CloudflareRecord } from '@cdktf/provider-cloudflare/lib/record';

const appDnsRecord = new CloudflareRecord(this, 'app-dns', {
  zoneId: 'zone-id-here',
  name: 'app',
  type: 'A',
  value: gatewayIp.address,  // Reference to LB IP
  proxied: true,
  ttl: 1,
});
```

## Integration with Load Balancer

The load balancer resource in `@stacksolo/plugin-gcp-cdktf` can accept a `dns` config:

```json
{
  "loadBalancer": {
    "dns": {
      "provider": "cloudflare",
      "zoneId": "abc123",
      "proxied": true
    }
  }
}
```

When configured, the load balancer generates the DNS record automatically.

## Common Patterns

### Point subdomain to load balancer

```typescript
{
  type: 'cloudflare:dns_record',
  name: 'app-dns',
  config: {
    zoneId: 'abc123',
    recordName: 'app',
    type: 'A',
    value: '${gatewayIp.address}',
    proxied: true
  }
}
```

### Root domain (apex)

```typescript
{
  type: 'cloudflare:dns_record',
  name: 'root-dns',
  config: {
    zoneId: 'abc123',
    recordName: '@',  // @ means root domain
    type: 'A',
    value: '${gatewayIp.address}',
    proxied: true
  }
}
```

## Important Notes

1. **Zone ID required** - Found in Cloudflare dashboard, Overview tab, right sidebar
2. **API token needed** - Must have "Edit zone DNS" permission for the zone
3. **Proxied = CDN** - When `proxied: true`, traffic goes through Cloudflare's CDN
4. **TTL auto** - When proxied, TTL of 1 means "Auto" (Cloudflare manages it)
5. **Free tier** - Cloudflare DNS is free, no cost concerns

## File Structure

```
plugins/cloudflare/
├── src/
│   ├── provider.ts           # Provider definition
│   ├── resources/
│   │   ├── dns-record.ts     # DNS record resource
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsup.config.ts
├── README.md
└── CLAUDE.md
```

## Dependencies

- `@stacksolo/core` - Plugin interfaces
- `@cdktf/provider-cloudflare` - Cloudflare Terraform resources

## CDKTF References

The `value` field supports CDKTF references to other resources:

```typescript
// Reference load balancer IP
value: '${gatewayIp.address}'

// In generated code, becomes:
value: gatewayIp.address  // Direct reference, no quotes
```

The resource handles this by checking if value starts with `${` and removing the wrapper.
