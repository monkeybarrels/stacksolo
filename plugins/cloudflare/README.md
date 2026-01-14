# @stacksolo/plugin-cloudflare

Cloudflare DNS integration for StackSolo. Automatically create DNS records pointing to your GCP load balancer.

## Features

- **Automatic DNS setup** - No manual Cloudflare dashboard configuration
- **Cloudflare proxy** - Enable orange-cloud CDN and DDoS protection
- **Load balancer integration** - Automatically point domain to LB IP
- **Free tier** - Cloudflare DNS is free

## Installation

```bash
pnpm add @stacksolo/plugin-cloudflare
```

## Quick Start

1. Get your Cloudflare Zone ID from the dashboard (Overview tab, bottom right)
2. Create an API token with "Edit zone DNS" permissions
3. Store the token as a secret

```bash
# Store Cloudflare API token
echo -n "your-cloudflare-api-token" | gcloud secrets create cloudflare-api-token --data-file=-
```

4. Add to your config:

```json
{
  "project": {
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-cloudflare"
    ],
    "cloudflare": {
      "zoneId": "your-zone-id",
      "apiToken": "@secret/cloudflare-api-token"
    },
    "networks": [{
      "name": "main",
      "loadBalancer": {
        "name": "gateway",
        "domain": "app.example.com",
        "enableHttps": true,
        "dns": {
          "provider": "cloudflare",
          "proxied": true
        }
      }
    }]
  }
}
```

## Resources

### DNS Record (`cloudflare:dns_record`)

Create DNS records in Cloudflare.

```typescript
{
  type: 'cloudflare:dns_record',
  name: 'app-dns',
  config: {
    zoneId: 'abc123',
    recordName: 'app',
    type: 'A',
    value: '${gatewayIp.address}',  // Reference to load balancer IP
    proxied: true,
    ttl: 1  // Auto TTL when proxied
  }
}
```

## Configuration Reference

### DNS Record Options

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Resource name |
| `zoneId` | `string` | Yes | - | Cloudflare Zone ID |
| `recordName` | `string` | Yes | - | DNS name (e.g., "app" for app.example.com) |
| `type` | `string` | Yes | `A` | Record type: A, AAAA, or CNAME |
| `value` | `string` | Yes | - | IP address or CDKTF reference |
| `proxied` | `boolean` | No | `true` | Enable Cloudflare proxy (orange cloud) |
| `ttl` | `number` | No | `1` | TTL in seconds (1 = auto when proxied) |

## Load Balancer Integration

When using with `@stacksolo/plugin-gcp-cdktf`, add `dns` config to your load balancer:

```json
{
  "loadBalancer": {
    "name": "gateway",
    "domain": "app.example.com",
    "enableHttps": true,
    "dns": {
      "provider": "cloudflare",
      "proxied": true
    }
  }
}
```

The load balancer will automatically:
1. Create a Cloudflare DNS record
2. Point it to the load balancer IP
3. Enable Cloudflare proxy if specified

## Prerequisites

1. **Cloudflare account** - Free tier works
2. **Domain on Cloudflare** - DNS must be managed by Cloudflare
3. **API token** - With "Edit zone DNS" permission
4. **Terraform** - Required for CDKTF deployment

## Getting Your Zone ID

1. Log into Cloudflare dashboard
2. Select your domain
3. Scroll down on the Overview page
4. Zone ID is in the right sidebar under "API"

## Creating an API Token

1. Go to Cloudflare dashboard → Profile → API Tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Select your zone under "Zone Resources"
5. Create token and save it securely

## Cost

| Resource | Monthly Cost |
|----------|-------------|
| DNS Records | Free |
| Cloudflare Proxy | Free (Pro features paid) |

## License

MIT
