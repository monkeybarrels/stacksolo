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
| `storageBuckets` | Cloud Storage |
| `functions` | Cloud Functions Gen2 |
| `uis` | Firebase Hosting |
| `containers` | Cloud Run |
| `loadBalancer` | HTTP(S) Load Balancer |

---

## Storage Buckets

Create Cloud Storage buckets within a network. These can be used as trigger sources for functions.

```json
{
  "networks": [{
    "name": "main",
    "storageBuckets": [
      { "name": "myapp-uploads" },
      { "name": "myapp-processed" }
    ]
  }]
}
```

### Bucket Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | - | Bucket name (required, globally unique) |
| `location` | `string` | region | Bucket location |
| `storageClass` | `string` | `STANDARD` | `STANDARD`, `NEARLINE`, `COLDLINE`, `ARCHIVE` |
| `versioning` | `boolean` | `false` | Enable object versioning |
| `uniformBucketLevelAccess` | `boolean` | `true` | Use uniform IAM access |

---

## Cloud Functions

Deploy Cloud Functions Gen2 with HTTP or event triggers.

### HTTP Function

```json
{
  "functions": [{
    "name": "api",
    "entryPoint": "handler",
    "allowUnauthenticated": true
  }]
}
```

### Storage-Triggered Function

Process files automatically when uploaded to a bucket:

```json
{
  "networks": [{
    "name": "main",
    "storageBuckets": [
      { "name": "myapp-uploads" },
      { "name": "myapp-processed" }
    ],
    "functions": [{
      "name": "processor",
      "entryPoint": "handler",
      "memory": "1Gi",
      "timeout": 300,
      "trigger": {
        "type": "storage",
        "bucket": "myapp-uploads",
        "event": "finalize"
      },
      "env": {
        "OUTPUT_BUCKET": "myapp-processed"
      }
    }]
  }]
}
```

**Storage trigger events:**

| Event | When triggered |
|-------|---------------|
| `finalize` | File created or overwritten (default) |
| `delete` | File deleted |
| `archive` | File archived (versioned buckets) |
| `metadataUpdate` | File metadata changed |

The plugin automatically:
- Enables Eventarc API
- Grants IAM permissions for GCS to publish events
- Grants the function permission to receive events
- Configures the Eventarc trigger

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
- Eventarc (for storage/pubsub triggers)

## Learn More

- [Source code](https://github.com/monkeybarrels/stacksolo/tree/main/plugins/gcp-cdktf)
- [Config Schema](/reference/config-schema/) - All configuration options
- [Deployment Guide](/guides/deployment/)
