---
title: Architecture Overview
description: How StackSolo works under the hood
---

StackSolo transforms declarative JSON configs into real GCP infrastructure.

## Flow

```
Config (JSON) → Code Generator → CDKTF/Terraform → GCP Resources
```

1. You write `stacksolo.config.json`
2. StackSolo generates TypeScript CDKTF code
3. CDKTF synthesizes to Terraform JSON
4. Terraform deploys to GCP

## Key Components

### CLI (`@stacksolo/cli`)

The command-line interface that orchestrates everything:
- `init` - Project setup and config generation
- `scaffold` - Generate source code templates
- `dev` - Local Kubernetes development
- `deploy` - Production deployment

### Blueprint (`@stacksolo/blueprint`)

Config schema and validation:
- JSON Schema definitions
- Type generation
- Reference resolution (`@function/name.url`)

### Core (`@stacksolo/core`)

Plugin system:
- Provider registration
- Resource type definitions
- Code generation interfaces

### Runtime (`@stacksolo/runtime`)

Environment abstraction for deployed code:
- Unified access to env vars
- Local vs production detection
- Kernel connection helpers

## Plugins

Plugins provide resource types and code generation:

| Plugin | Purpose |
|--------|---------|
| `gcp-cdktf` | Core GCP resources via Terraform CDK |
| `kernel` | Shared services (NATS-based) |
| `gcp-kernel` | Shared services (GCP-native) |

## Generated Artifacts

```
.stacksolo/
├── stacksolo.config.json   # Your config
├── cdktf/                  # Generated infrastructure code
│   ├── main.ts
│   └── cdktf.out/          # Terraform JSON
└── k8s/                    # Local dev manifests
```

## Local Development

`stacksolo dev` creates a local Kubernetes environment:
- Uses OrbStack/Docker Desktop
- Runs Firebase & Pub/Sub emulators
- Port-forwards all services
- Hot reloads on file changes

## Learn More

- [Plugin Development](/architecture/plugin-development/)
- [CLI Reference](/reference/cli/)
