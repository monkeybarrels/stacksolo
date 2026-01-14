---
title: GCP CDKTF Plugin
description: Core plugin for Google Cloud Platform resources
---

The `@stacksolo/plugin-gcp-cdktf` is the core plugin that generates Terraform CDK code for GCP resources.

## Quick Start

```json
{
  "project": {
    "plugins": ["@stacksolo/plugin-gcp-cdktf"],
    "networks": [{
      "name": "main",
      "functions": [{ "name": "api" }]
    }]
  }
}
```

## Resources

| Config | GCP Resource |
|--------|-------------|
| `functions` | Cloud Functions Gen2 |
| `uis` | Firebase Hosting |
| `containers` | Cloud Run |
| `loadBalancer` | HTTP(S) Load Balancer |

---

## Load Balancer

The load balancer routes traffic to your functions, containers, and UIs based on URL paths.

### Basic Config

```json
{
  "loadBalancer": {
    "name": "gateway",
    "routes": [
      { "path": "/api/*", "functionName": "api" },
      { "path": "/*", "uiName": "web" }
    ]
  }
}
```

### With HTTPS and Custom Domain

```json
{
  "loadBalancer": {
    "name": "gateway",
    "domain": "app.example.com",
    "enableHttps": true,
    "redirectHttpToHttps": true,
    "routes": [
      { "path": "/*", "functionName": "api" }
    ]
  }
}
```

### With Automatic Cloudflare DNS

When using the [Cloudflare Plugin](/plugins/cloudflare/), DNS records are created automatically:

```json
{
  "project": {
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
        },
        "routes": [{ "path": "/*", "functionName": "api" }]
      }
    }]
  }
}
```

### Load Balancer Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | - | Load balancer name (required) |
| `routes` | `array` | - | URL path to backend mappings (required) |
| `domain` | `string` | - | Custom domain for HTTPS |
| `enableHttps` | `boolean` | `false` | Enable managed SSL certificate |
| `redirectHttpToHttps` | `boolean` | `false` | Redirect HTTP to HTTPS |
| `dns.provider` | `string` | - | DNS provider (`cloudflare`) |
| `dns.proxied` | `boolean` | `true` | Enable Cloudflare proxy |

## Generated Code

Code is generated to `.stacksolo/cdktf/` using Terraform CDK (TypeScript).

```bash
# View generated code
cat .stacksolo/cdktf/main.ts

# Run terraform commands directly
cd .stacksolo/cdktf && npx cdktf plan
```

## Required APIs

These GCP APIs are enabled automatically:
- Cloud Functions
- Cloud Build
- Cloud Run
- Cloud Storage
- Compute Engine

## Learn More

- [Source code](https://github.com/monkeybarrels/stacksolo/tree/main/plugins/gcp-cdktf)
- [Config Schema](/reference/config-schema/) - All configuration options
- [Deployment Guide](/guides/deployment/)
