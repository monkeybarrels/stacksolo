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
