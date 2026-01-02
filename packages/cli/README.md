# @stacksolo/cli

A command-line tool for deploying apps to Google Cloud. Designed for solo developers who want to ship fast without managing complex cloud configurations.

## What does it do?

StackSolo takes your code and a simple config file, then handles all the cloud setup for you:
- Creates Cloud Functions for your backend
- Sets up load balancers to route traffic
- Hosts your frontend on Cloud Storage
- Manages databases and caches
- Handles all the networking automatically

You focus on writing code. StackSolo handles the infrastructure.

---

## Installation

```bash
npm install -g @stacksolo/cli
```

## Prerequisites

Before using StackSolo, you need:

1. **Node.js 18 or newer**
   ```bash
   node --version  # Should show v18.x.x or higher
   ```

2. **Terraform CLI** - This is the tool that actually creates cloud resources
   ```bash
   # macOS
   brew install terraform

   # Or download from: https://developer.hashicorp.com/terraform/install
   ```

3. **Google Cloud CLI** - For authenticating with GCP
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

4. **Authenticate with Google Cloud**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

---

## Quick Start

### Step 1: Initialize a new project

```bash
stacksolo init
```

This creates a `.stacksolo/stacksolo.config.json` file with your project settings.

### Step 2: Add your code

Create a function at `functions/api/index.ts`:

```typescript
import * as functions from '@google-cloud/functions-framework';

functions.http('api', (req, res) => {
  res.json({ message: 'Hello from StackSolo!' });
});
```

### Step 3: Deploy to GCP

```bash
stacksolo deploy
```

That's it! Your API is now live on Google Cloud.

---

## Commands

### `stacksolo init`

Creates a new StackSolo project in the current directory.

**What it does:**
1. Asks you some questions about your project
2. Creates a `.stacksolo/stacksolo.config.json` file
3. Registers the project in your global registry

**Example:**
```bash
cd my-project
stacksolo init
```

---

### `stacksolo deploy`

Deploys your infrastructure to Google Cloud.

**What it does:**
1. Reads your config file
2. Generates Terraform code
3. Runs Terraform to create resources
4. Shows you the URLs when done

**Example:**
```bash
stacksolo deploy
```

**Flags:**
- `--dry-run` - Show what would be deployed without actually deploying

---

### `stacksolo destroy`

Deletes all resources created by StackSolo.

**What it does:**
1. Runs Terraform destroy
2. Removes all cloud resources
3. Cleans up local state

**Example:**
```bash
stacksolo destroy
```

**Warning:** This permanently deletes your infrastructure. Any data stored in databases or storage buckets will be lost.

---

### `stacksolo status`

Shows the current state of your deployment.

**What it does:**
1. Reads the Terraform state
2. Shows what resources exist
3. Shows URLs for your services

**Example:**
```bash
stacksolo status
```

---

### `stacksolo list`

Lists all StackSolo projects on your computer.

**What it does:**
1. Reads from your global registry (`~/.stacksolo/registry.db`)
2. Shows project names and paths

**Example:**
```bash
# List all projects
stacksolo list

# Show details for a specific project
stacksolo list my-app
```

---

### `stacksolo dev`

Starts a local development environment using Kubernetes.

**What it does:**
1. Generates Kubernetes manifests from your config
2. Starts a local K8s cluster (using Docker Desktop or minikube)
3. Runs Firebase emulators for Firestore, Auth, and Pub/Sub
4. Sets up port forwarding so you can access your services

**Example:**
```bash
stacksolo dev
```

**Flags:**
- `--no-emulators` - Skip starting Firebase emulators
- `--health` - Check the health of running services
- `--ports` - Show port forwarding status
- `--restart [service]` - Restart a specific service or all services
- `--service-names` - List available service names

---

### `stacksolo scaffold`

Generates starter code and local dev files from your config.

**What it does:**
1. Creates function/container boilerplate
2. Generates `.env.local` with environment variables
3. Creates `lib/env.ts` for type-safe env access
4. Sets up Kubernetes manifests for local dev

**Example:**
```bash
stacksolo scaffold
```

---

## Project Configuration

StackSolo uses a JSON config file at `.stacksolo/stacksolo.config.json`. Here's a simple example:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1"
  },
  "networks": [{
    "name": "main",
    "functions": [{
      "name": "api",
      "runtime": "nodejs20",
      "entryPoint": "api"
    }],
    "loadBalancer": {
      "name": "gateway",
      "routes": [
        { "path": "/*", "functionName": "api" }
      ]
    }
  }]
}
```

### What each part means:

- **project.name** - A name for your project (used in resource naming)
- **project.gcpProjectId** - Your Google Cloud project ID
- **project.region** - Where to deploy (e.g., `us-central1`, `europe-west1`)
- **networks** - Groups of related resources
- **functions** - Serverless functions (your backend code)
- **loadBalancer** - Routes traffic to your functions

For detailed config options, see the [GCP CDKTF Plugin docs](../plugins/gcp-cdktf/README.md).

---

## Supported Resources

StackSolo can create these Google Cloud resources:

| Resource | What it's for |
|----------|---------------|
| **Cloud Functions (Gen2)** | Serverless backend code that scales automatically |
| **Cloud Run** | Containerized apps with more control than Functions |
| **Cloud Storage** | File storage (also hosts static websites) |
| **Pub/Sub** | Message queues for async processing |
| **VPC Networks** | Private networking between your services |
| **Load Balancers** | Route traffic to multiple backends |
| **Firestore** | NoSQL database |

---

## Local Development

StackSolo includes a local Kubernetes environment that mirrors production:

```bash
stacksolo dev
```

This creates a local K8s cluster with:
- **Firebase emulators** - Fake versions of Firestore, Auth, and Pub/Sub
- **Hot-reloading** - Your code updates automatically when you save
- **Service mesh** - Services can call each other just like in production
- **Environment variables** - Same env vars as production

### Why Kubernetes locally?

Using K8s locally means your dev environment works exactly like production. No more "it works on my machine" problems.

---

## Runtime Package

When writing your function code, use the `@stacksolo/runtime` package for environment detection and service calls:

```bash
npm install @stacksolo/runtime
```

```typescript
import { env, firestore, services } from '@stacksolo/runtime';

// Check if running locally or in production
if (env.isLocal) {
  console.log('Running with emulators');
}

// Auto-configured Firestore client (uses emulator locally)
const db = firestore();
const users = await db.collection('users').get();

// Call another service in your stack
const response = await services.call('api', '/users');
```

See the [Runtime package docs](../runtime/README.md) for more details.

---

## Global Project Registry

StackSolo keeps track of all your projects in a local database at `~/.stacksolo/registry.db`. This lets you:

- Switch between projects easily
- See all your StackSolo projects in one place
- Access project info from any directory

```bash
# List all projects
stacksolo list

# Register the current directory as a project
stacksolo register

# View details about a specific project
stacksolo list my-app
```

---

## Typical Workflow

Here's how most developers use StackSolo:

1. **Start a new project:**
   ```bash
   mkdir my-app && cd my-app
   stacksolo init
   ```

2. **Write your code:**
   ```bash
   # Create your function
   mkdir -p functions/api
   # ... write code ...
   ```

3. **Develop locally:**
   ```bash
   stacksolo scaffold  # Generate boilerplate
   stacksolo dev       # Start local environment
   ```

4. **Deploy to production:**
   ```bash
   stacksolo deploy
   ```

5. **Check status:**
   ```bash
   stacksolo status
   ```

6. **Make changes and redeploy:**
   ```bash
   # ... edit code ...
   stacksolo deploy
   ```

---

## Links

- [Documentation](https://stacksolo.dev)
- [GitHub](https://github.com/monkeybarrels/stacksolo)
- [Issues](https://github.com/monkeybarrels/stacksolo/issues)

## License

MIT
