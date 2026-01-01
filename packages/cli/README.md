# @stacksolo/cli

Command-line tool for deploying GCP infrastructure. Designed for solo developers who want to ship fast without managing complex cloud configurations.

## Installation

```bash
npm install -g @stacksolo/cli
```

## Prerequisites

- Node.js 18+
- [Terraform CLI](https://developer.hashicorp.com/terraform/install) installed
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated

## Quick Start

```bash
# Initialize a new project
stacksolo init

# Deploy infrastructure
stacksolo deploy

# Check status
stacksolo status
```

## Commands

| Command | Description |
|---------|-------------|
| `stacksolo init` | Initialize a new StackSolo project with GCP setup |
| `stacksolo deploy` | Deploy infrastructure using CDKTF/Terraform |
| `stacksolo destroy` | Tear down deployed infrastructure |
| `stacksolo status` | Show deployment status |
| `stacksolo list` | List all registered projects |
| `stacksolo dev` | Start local K8s development environment |
| `stacksolo scaffold` | Generate local dev environment from config |

## Project Configuration

StackSolo uses a JSON configuration file at `.stacksolo/stacksolo.config.json`:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1"
  },
  "networks": {
    "main": {
      "functions": {
        "api": {
          "runtime": "nodejs20",
          "entryPoint": "api",
          "sourceDir": "functions/api"
        }
      }
    }
  }
}
```

## Supported Resources

- **Cloud Functions (Gen2)** - Serverless functions with automatic scaling
- **Cloud Run** - Containerized applications
- **Cloud Storage** - Object storage buckets
- **Pub/Sub** - Message queuing
- **VPC Networks** - Private networking with connectors
- **Load Balancers** - Global HTTP(S) load balancing
- **Firestore** - NoSQL database

## Local Development

StackSolo includes a local Kubernetes development environment:

```bash
# Start local dev with emulators
stacksolo dev
```

This creates a local K8s cluster with:
- Firebase emulators (Firestore, Auth, Pub/Sub)
- Hot-reloading for your functions
- Service mesh for inter-service calls

## Runtime Package

For environment detection and service-to-service calls in your functions:

```bash
npm install @stacksolo/runtime
```

```typescript
import { env, firestore, services } from '@stacksolo/runtime';

// Environment detection
if (env.isLocal) {
  console.log('Running with emulators');
}

// Auto-configured Firestore client
const db = firestore();

// Call other services
const response = await services.call('api', '/users');
```

## Global Registry

StackSolo maintains a registry of all your projects at `~/.stacksolo/registry.db`:

```bash
# List all projects
stacksolo list

# Register current project
stacksolo register

# View project details
stacksolo list my-app
```

## Links

- [Documentation](https://stacksolo.dev)
- [GitHub](https://github.com/monkeybarrels/stacksolo)
- [Issues](https://github.com/monkeybarrels/stacksolo/issues)

## License

MIT
