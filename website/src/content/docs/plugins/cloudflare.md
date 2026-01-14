---
title: Cloudflare Plugin
description: Automatic DNS configuration with Cloudflare
---

The `@stacksolo/plugin-cloudflare` provides automatic DNS configuration for your domains. Point your domain to your GCP load balancer without manual Cloudflare dashboard configuration.

## Quick Start

1. Get your Cloudflare Zone ID from the dashboard
2. Create an API token with DNS edit permissions
3. Store the token as a secret
4. Add the `dns` config to your load balancer

```json
{
  "project": {
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-cloudflare"
    ],
    "cloudflare": {
      "zoneId": "your-zone-id-here",
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

After deployment:
- DNS record is automatically created
- Domain points to load balancer IP
- Cloudflare proxy enabled (if configured)

## Resources

| Resource | Config Key | Purpose |
|----------|------------|---------|
| DNS Record | `cloudflare:dns_record` | Create A, AAAA, or CNAME records |

---

## DNS Record

Create DNS records in Cloudflare, typically to point domains to load balancer IPs.

### Configuration

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Resource name |
| `zoneId` | `string` | Yes | - | Cloudflare Zone ID |
| `recordName` | `string` | Yes | - | DNS name (e.g., "app" for app.example.com) |
| `type` | `string` | Yes | `A` | Record type: A, AAAA, or CNAME |
| `value` | `string` | Yes | - | IP address or CDKTF reference |
| `proxied` | `boolean` | No | `true` | Enable Cloudflare proxy (orange cloud) |
| `ttl` | `number` | No | `1` | TTL in seconds (1 = auto when proxied) |

### Example

```json
{
  "type": "cloudflare:dns_record",
  "name": "app-dns",
  "config": {
    "zoneId": "abc123def456",
    "recordName": "app",
    "type": "A",
    "value": "${gatewayIp.address}",
    "proxied": true
  }
}
```

---

## Load Balancer Integration

The easiest way to use Cloudflare DNS is through the load balancer's `dns` option:

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

This automatically:
1. Creates a Cloudflare A record
2. Points it to the load balancer's IP address
3. Enables Cloudflare proxy if specified

### DNS Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `provider` | `string` | Yes | Must be `"cloudflare"` |
| `proxied` | `boolean` | No | Enable Cloudflare proxy (default: `true`) |

---

## Setup Guide

### 1. Get Your Zone ID

1. Log into [Cloudflare dashboard](https://dash.cloudflare.com)
2. Select your domain
3. On the Overview page, scroll to the right sidebar
4. Copy the "Zone ID" value

### 2. Create an API Token

1. Go to **Profile** → **API Tokens**
2. Click **Create Token**
3. Use the "Edit zone DNS" template
4. Under "Zone Resources", select your zone
5. Click **Continue to summary** → **Create Token**
6. Copy the token (you won't see it again)

### 3. Store the Token as a Secret

```bash
# Create secret in GCP Secret Manager
echo -n "your-cloudflare-api-token" | gcloud secrets create cloudflare-api-token --data-file=-
```

### 4. Add Cloudflare Config

Add to your `stacksolo.config.json`:

```json
{
  "project": {
    "cloudflare": {
      "zoneId": "your-zone-id",
      "apiToken": "@secret/cloudflare-api-token"
    }
  }
}
```

---

## Cloudflare Proxy

When `proxied: true`:

- Traffic routes through Cloudflare's CDN
- DDoS protection enabled
- SSL/TLS managed by Cloudflare
- Hides your origin server IP
- Analytics available in Cloudflare dashboard

When `proxied: false`:

- DNS-only mode
- Traffic goes directly to your server
- Origin IP is visible in DNS lookups

### Proxy vs Non-Proxied

| Feature | Proxied | Non-Proxied |
|---------|---------|-------------|
| CDN caching | Yes | No |
| DDoS protection | Yes | No |
| Origin IP hidden | Yes | No |
| Cloudflare analytics | Yes | No |
| Direct connection | No | Yes |

---

## Cost

| Resource | Monthly Cost |
|----------|-------------|
| DNS Records | Free |
| Cloudflare Proxy | Free tier included |

Cloudflare offers a generous free tier. Paid plans add additional features like advanced DDoS protection and analytics.

---

## Prerequisites

1. **Cloudflare account** - Free tier works
2. **Domain on Cloudflare** - DNS must be managed by Cloudflare (nameservers pointed to Cloudflare)
3. **API token** - With "Edit zone DNS" permission for your zone
4. **Terraform** - Required for CDKTF deployment

---

## Troubleshooting

### "Authentication error" during deployment

- Verify your API token has "Edit zone DNS" permission
- Check the token is stored correctly in Secret Manager
- Ensure the zone ID is correct

### DNS record not updating

- Cloudflare DNS propagates quickly, but TTL affects caching
- If proxied, the A record points to Cloudflare IPs (this is expected)
- Use `dig` or online DNS checkers to verify

### SSL certificate issues

When using Cloudflare proxy with GCP HTTPS load balancer:
- Cloudflare handles client → Cloudflare SSL
- GCP handles Cloudflare → Load Balancer SSL
- Both certificates need to be valid

For simplest setup, use Cloudflare's "Full (strict)" SSL mode.

---

## Learn More

- [Config Schema Reference](/reference/config-schema/)
- [Load Balancer Resource](/plugins/gcp-cdktf/#load-balancer)
- [Cloudflare API Documentation](https://developers.cloudflare.com/api/)
