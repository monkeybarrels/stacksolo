# StackSolo

**A local webapp that helps solo developers scaffold and deploy cloud infrastructure using Pulumi.**

> A [MonkeyBarrels](https://monkeybarrels.com) open source project

---

## What is StackSolo?

StackSolo is a visual infrastructure builder for indie hackers and solo developers. Instead of wrestling with Terraform docs or clicking through cloud consoles, you define your resources through a simple UI - and StackSolo generates clean, exportable Pulumi code you actually own.

**You get:**
- A local web UI for designing your infrastructure
- Real Pulumi TypeScript files you can inspect, modify, and version control
- One-click deploys to your cloud provider (or export and run yourself)
- SQLite persistence - your projects live on your machine

**This is not a managed platform.** You run it locally. You own the code it generates. You can eject anytime.

---

## Who is this for?

- Solo founders bootstrapping a micro-SaaS
- Indie hackers who know code but not cloud infrastructure
- Developers who want guardrails without lock-in

---

## Quick Start

```bash
npx @stacksolo/cli
```

Then open `http://localhost:3000`

### Prerequisites

- Node.js 18+
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- Cloud CLI for your provider (e.g., `gcloud` for GCP)

---

## Supported Providers

### v0.1
- **Google Cloud Platform (GCP)**
  - Cloud Storage Bucket

### Planned
- GCP: Cloud Functions, Cloud Run, Firestore, Secret Manager
- AWS: S3, Lambda, API Gateway, DynamoDB
- Azure: Blob Storage, Functions
- Railway, Render, Fly.io, Supabase, and more

---

## Plugin Architecture

StackSolo is built on a plugin system. Providers and resource types are defined as plugins, making it easy to:

- Add new cloud providers
- Add new resource types to existing providers
- Create custom resources for your specific needs

### Using Plugins

Plugins are auto-discovered from:
- Built-in: `@stacksolo/plugin-gcp-cdktf` (CDKTF/Terraform-based)
- npm packages: `stacksolo-plugin-*`
- Local: `./stacksolo-plugins/` or `~/.stacksolo/plugins/`

Override or add plugins via config:

```typescript
// stacksolo.config.ts
import { defineConfig } from '@stacksolo/core'
import myCustomPlugin from './my-plugins/custom'

export default defineConfig({
  plugins: [
    myCustomPlugin()
  ],
  disable: ['@stacksolo/plugin-azure']
})
```

### Creating Plugins

```typescript
// my-custom-resource.ts
import { defineResource } from '@stacksolo/core'

export default defineResource({
  id: 'gcp:my-resource',
  provider: 'gcp',
  name: 'My Custom Resource',
  description: 'Does something custom',
  
  configSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Name' },
      // ... JSON Schema for config
    },
    required: ['name']
  },

  defaultConfig: {
    name: 'my-resource'
  },

  generatePulumi: (config) => ({
    imports: ["import * as gcp from '@pulumi/gcp'"],
    code: `// Your Pulumi code here`,
    outputs: []
  })
})
```

---

## Project Structure

```
stacksolo/
├── packages/
│   ├── api/          # Express + tRPC backend
│   ├── web/          # SvelteKit frontend
│   ├── shared/       # Shared types
│   ├── core/         # Plugin interfaces & registry
│   └── cli/          # CLI entry point
│
├── plugins/
│   └── gcp/          # Built-in GCP plugin
│
└── stacksolo.config.ts
```

---

## Local Development with `stacksolo dev`

StackSolo includes a local Kubernetes-based development environment that mirrors your production GCP stack. This lets you develop and test locally without deploying to the cloud.

### Prerequisites

- [OrbStack](https://orbstack.dev/) with Kubernetes enabled (or any local K8s cluster)
- `kubectl` CLI available

### Quick Start

```bash
# Start local development environment
stacksolo dev

# The command will:
# 1. Generate K8s manifests from your stacksolo.config.json
# 2. Spin up Firebase and Pub/Sub emulators
# 3. Start your functions and UIs with hot-reload
# 4. Set up ingress routing matching your production config
```

### Available Commands

```bash
stacksolo dev              # Start local K8s environment
stacksolo dev --stop       # Tear down environment
stacksolo dev --status     # Show running pods
stacksolo dev --logs       # Tail all pod logs
stacksolo dev --logs api   # Tail logs for specific service
stacksolo dev --rebuild    # Force regenerate manifests
stacksolo dev --no-emulators  # Skip Firebase/Pub/Sub emulators
```

### What Gets Created

From your `stacksolo.config.json`, the following K8s resources are generated:

| Config Element | K8s Resource |
|----------------|--------------|
| `functions[]` | Deployment + Service |
| `uis[]` | Deployment + Service |
| `loadBalancer.routes` | Ingress |
| Firebase (automatic) | Firebase Emulator Pod |
| Pub/Sub (automatic) | Pub/Sub Emulator Pod |

### Port Mapping

| Service | Port |
|---------|------|
| Ingress | 8000 |
| Firebase Firestore | 8080 |
| Firebase Auth | 9099 |
| Firebase UI | 4000 |
| Pub/Sub | 8085 |
| Functions | 8081, 8082, ... |
| UIs | 3000, 3001, ... |

### Environment Variables

All pods automatically receive emulator connection strings via a shared ConfigMap:

```
FIRESTORE_EMULATOR_HOST=firebase-emulator:8080
FIREBASE_AUTH_EMULATOR_HOST=firebase-emulator:9099
PUBSUB_EMULATOR_HOST=pubsub-emulator:8085
NODE_ENV=development
```

### Project Directory Convention

```
your-project/
├── stacksolo.config.json
├── .stacksolo/              # Generated K8s manifests (gitignored)
│   └── k8s/
├── functions/               # Function source code
│   ├── api/
│   └── hello/
└── ui/                      # UI source code
    └── web/
```

---

## Development

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

---

## How It Works

1. **Create a Project** - Name it, select your cloud provider, configure region
2. **Add Resources** - Pick from available resource types, configure via form
3. **Preview Code** - See the generated Pulumi TypeScript
4. **Deploy** - One-click deploy via Pulumi Automation API
5. **Eject** - Export the Pulumi project and run it yourself anytime

---

## Non-Goals

- Multi-cloud orchestration in a single project
- Team collaboration features (for now)
- Hosting your infrastructure state
- Replacing Pulumi/Terraform for complex setups

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
- [Documentation](https://stacksolo.dev/docs)
- [MonkeyBarrels](https://monkeybarrels.com)
