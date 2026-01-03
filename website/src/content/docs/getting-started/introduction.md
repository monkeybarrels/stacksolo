---
title: Introduction
description: What is StackSolo and why use it?
---

StackSolo is an open source CLI tool that helps solo developers deploy cloud infrastructure without learning Terraform or clicking through cloud consoles.

## What is StackSolo?

You write a simple JSON config file describing what you want:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "networks": [{
      "name": "main",
      "functions": [{ "name": "api" }],
      "uis": [{ "name": "web" }]
    }]
  }
}
```

Then run `stacksolo deploy`, and StackSolo:

1. Generates real Terraform/CDKTF code
2. Creates all the GCP resources
3. Outputs URLs and connection strings

## Key Points

- **Open source** - MIT licensed, community driven
- **Runs locally** - No SaaS, no accounts, no vendor lock-in
- **Generates real code** - You can audit and eject anytime
- **Plugin-based** - Extend with your own resources

## What Can You Build?

StackSolo helps you deploy common patterns on Google Cloud:

| Pattern | Resources Created |
|---------|------------------|
| **API** | Cloud Function + Load Balancer |
| **Full Stack** | Function + Static Site + Database |
| **Microservices** | Multiple Cloud Run containers |
| **Event-Driven** | Functions + Pub/Sub topics |

## How It Works

```
Your Config → StackSolo → Terraform/CDKTF → GCP Resources
```

1. You write `stacksolo.config.json`
2. StackSolo generates infrastructure code
3. Terraform deploys to GCP
4. You get working URLs

The generated code lives in `.stacksolo/cdktf/` - you own it completely.

## Next Steps

- [Quickstart](/getting-started/quickstart/) - Deploy your first app in 5 minutes
- [Installation](/getting-started/installation/) - Install the CLI
- [Configuration Guide](/guides/configuration/) - Learn the config format
