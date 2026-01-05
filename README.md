# StackSolo

**A CLI tool that helps solo developers scaffold and deploy cloud infrastructure using CDKTF (Terraform).**

> A [MonkeyBarrels](https://monkeybarrels.com) open source project

---

## What is StackSolo?

StackSolo is an infrastructure automation tool for indie hackers and solo developers. Define your infrastructure in a simple JSON config file, and StackSolo generates and deploys real Terraform code you own.

**You get:**
- A simple CLI for deploying infrastructure
- Real CDKTF/Terraform files you can inspect, modify, and version control
- One-click deploys to GCP (more providers coming)
- Local Kubernetes development environment that mirrors production
- Clean, exportable code you can eject anytime

**This is not a managed platform.** You run it locally. You own the code it generates. You can eject anytime.

---

## Documentation

Visit [stacksolo.dev](https://stacksolo.dev) for full documentation.

| Guide | Description |
|-------|-------------|
| [Quickstart](https://stacksolo.dev/getting-started/quickstart/) | Get started in 5 minutes |
| [CLI Reference](https://stacksolo.dev/reference/cli/) | All commands and options |
| [Configuration](https://stacksolo.dev/guides/configuration/) | How to write stacksolo.config.json |
| [Resource Sharing](https://stacksolo.dev/guides/resource-sharing/) | Share VPCs, buckets, and registries |
| [Architecture](https://stacksolo.dev/architecture/overview/) | How StackSolo works internally |

---

## Who is this for?

- Solo founders bootstrapping a micro-SaaS
- Indie hackers who know code but not cloud infrastructure
- Developers who want guardrails without lock-in

---

## Quick Start

```bash
# Install the CLI
npm install -g @stacksolo/cli

# Login to GCP
gcloud auth login
gcloud auth application-default login

# Create a new project
mkdir my-app && cd my-app
stacksolo init

# Deploy to GCP
stacksolo deploy

# Create another project sharing the same VPC
mkdir ../my-second-app && cd ../my-second-app
stacksolo clone ../my-app --name my-second-app
```

### Prerequisites

- Node.js 18+
- [Terraform CLI](https://developer.hashicorp.com/terraform/downloads)
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) (for GCP)

---

## Example Config

```json
{
  "project": {
    "name": "my-api",
    "region": "us-central1",
    "gcpProjectId": "my-gcp-project",
    "networks": [
      {
        "name": "main",
        "functions": [
          {
            "name": "api",
            "runtime": "nodejs20",
            "memory": "256Mi"
          }
        ],
        "loadBalancer": {
          "name": "gateway",
          "routes": [
            { "path": "/api/*", "backend": "api" }
          ]
        }
      }
    ]
  }
}
```

See [Configuration Guide](https://stacksolo.dev/guides/configuration/) for all options.

---

## Supported Resources

### GCP (via CDKTF)
- Cloud Functions (Gen2)
- Cloud Run
- Cloud SQL (PostgreSQL, MySQL)
- Cloud Storage
- Memorystore (Redis)
- HTTP(S) Load Balancer
- VPC Networks
- Secret Manager
- Pub/Sub
- Cloud Scheduler

### Coming Soon
- AWS (Lambda, S3, RDS, etc.)
- Azure (Functions, Blob Storage, etc.)

---

## Local Development

StackSolo includes a local Kubernetes environment that mirrors production:

```bash
# Start local environment
stacksolo dev

# Check status
stacksolo dev --status

# View logs
stacksolo dev --logs api

# Stop environment
stacksolo dev --stop
```

This spins up your functions, UIs, and emulators (Firebase, Pub/Sub) locally with the same routing as production.

See [CLI Reference](https://stacksolo.dev/reference/cli/) for details.

---

## Plugin Architecture

StackSolo is extensible via plugins. Add new cloud providers or resource types:

```typescript
import { defineResource } from '@stacksolo/core';

export const myResource = defineResource({
  id: 'my-provider:my-resource',
  provider: 'my-provider',
  name: 'My Resource',
  description: 'Does something useful',
  configSchema: { /* JSON Schema */ },
  defaultConfig: {},
  generate: (config) => ({
    imports: ['...'],
    code: '// CDKTF code',
    outputs: ['...'],
  }),
});
```

See [Plugin Development Guide](https://stacksolo.dev/architecture/plugin-development/) for full documentation.

---

## Project Structure

```
stacksolo/
├── packages/
│   ├── cli/          # CLI commands
│   ├── core/         # Plugin system
│   ├── blueprint/    # Config parsing & code generation
│   ├── api/          # Optional web API
│   └── web/          # Optional web UI
├── plugins/
│   ├── gcp-cdktf/    # GCP resources (CDKTF)
│   └── kernel/       # Shared services (auth, files, events)
└── docs/             # Documentation
```

---

## Development

```bash
# Clone the repo
git clone https://github.com/monkeybarrels/stacksolo
cd stacksolo

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link CLI for testing
pnpm cli:link

# Run tests
pnpm test
```

---

## Contributing

We welcome contributions! Whether it's:
- New resource types for existing providers
- New provider plugins
- Bug fixes and improvements
- Documentation

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT © [MonkeyBarrels LLC](https://monkeybarrels.com)

---

## Links

- [Website](https://stacksolo.dev)
- [Documentation](https://stacksolo.dev/getting-started/introduction/)
- [MonkeyBarrels](https://monkeybarrels.com)