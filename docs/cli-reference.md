# CLI Reference

Complete reference for all StackSolo CLI commands.

## Installation

```bash
npm install -g @stacksolo/cli
```

## Command Overview

| Command | Description |
|---------|-------------|
| `stacksolo init` | Initialize a new project |
| `stacksolo deploy` | Deploy infrastructure |
| `stacksolo destroy` | Destroy all resources |
| `stacksolo status` | Show deployment status |
| `stacksolo dev` | Start local development environment |
| `stacksolo scaffold` | Generate local development files |
| `stacksolo logs` | View deployment logs |
| `stacksolo output` | Show resource outputs |

---

## Project Commands

### `stacksolo init`

Initialize a new StackSolo project in the current directory.

```bash
stacksolo init
```

**What it does:**

1. Checks that `gcloud` is installed and authenticated
2. Lists your GCP projects and lets you select one
3. Checks for organization policy restrictions and offers to fix them
4. Enables required GCP APIs (Cloud Functions, Cloud Run, Cloud Build, etc.)
5. Asks what type of app you're building
6. Generates `.stacksolo/stacksolo.config.json`
7. Creates starter templates (docker-compose, env files, service directories)

**Interactive prompts:**

- Select GCP project
- Select project type (function-api, web-app, etc.)
- Select UI framework (if applicable)
- Select region

**Output:**

```
.stacksolo/
├── stacksolo.config.json    # Your infrastructure config
├── .env                     # Environment variables
└── docker-compose.yml       # Local development
functions/
└── api/                     # Starter function code
```

---

### `stacksolo scaffold`

Generate local development files from your config.

```bash
stacksolo scaffold [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--env-only` | Only generate .env files |
| `--docker-only` | Only generate docker-compose.yml |
| `--services-only` | Only generate service directories |
| `--force` | Overwrite existing files |
| `--dry-run` | Show what would be generated without writing |

**Examples:**

```bash
# Generate everything
stacksolo scaffold

# Only regenerate env files
stacksolo scaffold --env-only

# Preview what would be created
stacksolo scaffold --dry-run
```

---

## Infrastructure Commands

### `stacksolo deploy`

Deploy your infrastructure to GCP.

```bash
stacksolo deploy [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--preview` | Show what would change without deploying |
| `--skip-build` | Skip building/pushing container images |
| `--tag <tag>` | Container image tag (default: `latest`) |
| `--refresh` | Refresh Terraform state before deploying |
| `--force` | Force delete and recreate conflicting resources |

**Examples:**

```bash
# Deploy everything
stacksolo deploy

# Preview changes first
stacksolo deploy --preview

# Deploy with a specific image tag
stacksolo deploy --tag v1.2.3

# Force recreate stuck resources
stacksolo deploy --force
```

**Output:**

```
Deploying infrastructure...

✓ Creating storage bucket: my-app-api-source
✓ Creating cloud function: api
✓ Creating load balancer: gateway

Outputs:
  gatewayIp: 34.120.123.45

Deploy complete!
```

---

### `stacksolo destroy`

Destroy all deployed resources.

```bash
stacksolo destroy [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompt |

**Example:**

```bash
# Destroy with confirmation
stacksolo destroy

# Destroy without confirmation
stacksolo destroy --force
```

**Warning:** This permanently deletes all resources. There is no undo.

---

### `stacksolo status`

Show the current deployment status.

```bash
stacksolo status
```

**Output:**

```
Project: my-app
Region: us-central1

Resources:
  ✓ function-api        Cloud Function    deployed
  ✓ gateway             Load Balancer     deployed
  ✓ api-source          Storage Bucket    deployed

Last deployed: 2024-01-15 10:30:00
```

---

### `stacksolo output`

Show outputs from deployed resources.

```bash
stacksolo output [resource]
```

**Examples:**

```bash
# Show all outputs
stacksolo output

# Show specific resource outputs
stacksolo output gateway
```

**Output:**

```
gatewayIp: 34.120.123.45
apiFunctionUrl: https://api-abc123.cloudfunctions.net
apiFunctionName: api
```

---

### `stacksolo logs`

View deployment logs.

```bash
stacksolo logs [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--follow` | Stream logs in real-time |
| `--since <duration>` | Show logs since (e.g., `1h`, `30m`) |

**Examples:**

```bash
# View recent logs
stacksolo logs

# Stream logs
stacksolo logs --follow

# Logs from last hour
stacksolo logs --since 1h
```

---

### `stacksolo reset`

Reset the Terraform/Pulumi state. Use this if state gets corrupted.

```bash
stacksolo reset [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation |

**Warning:** This removes the state file. You may need to manually delete resources in GCP.

---

## Development Commands

### `stacksolo dev`

Start a local Kubernetes development environment that mirrors your production setup.

```bash
stacksolo dev [options]
```

**Prerequisites:**
- [OrbStack](https://orbstack.dev/) with Kubernetes enabled (or any local K8s cluster)
- `kubectl` CLI

**Options:**

| Option | Description |
|--------|-------------|
| `--stop` | Tear down the local environment |
| `--status` | Show running pods |
| `--describe <resource>` | Describe a Kubernetes resource |
| `--logs [service]` | Tail logs (all or specific service) |
| `--rebuild` | Force regenerate Kubernetes manifests |
| `--no-emulators` | Skip Firebase/Pub/Sub emulators |

**Examples:**

```bash
# Start local environment
stacksolo dev

# Check what's running
stacksolo dev --status

# View logs for api service
stacksolo dev --logs api

# Stop everything
stacksolo dev --stop
```

**What gets created:**

| Your Config | Local Equivalent |
|-------------|-----------------|
| Functions | K8s Deployment + Service |
| UIs | K8s Deployment + Service |
| Load balancer routes | K8s Ingress |
| (automatic) | Firebase Emulator |
| (automatic) | Pub/Sub Emulator |

**Default ports:**

| Service | Port |
|---------|------|
| Ingress | 8000 |
| Firebase Firestore | 8080 |
| Firebase Auth | 9099 |
| Firebase UI | 4000 |
| Pub/Sub | 8085 |

---

### `stacksolo build`

Build container images locally.

```bash
stacksolo build [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--service <name>` | Build specific service |
| `--tag <tag>` | Image tag (default: `latest`) |
| `--push` | Push to container registry |

**Examples:**

```bash
# Build all services
stacksolo build

# Build specific service
stacksolo build --service api

# Build and push
stacksolo build --push --tag v1.0.0
```

---

## Configuration Commands

### `stacksolo config`

View or edit configuration.

```bash
stacksolo config [subcommand]
```

**Subcommands:**

```bash
# View current config
stacksolo config show

# Open config in editor
stacksolo config edit

# Validate config
stacksolo config validate
```

---

### `stacksolo env`

Manage environment variables.

```bash
stacksolo env [subcommand]
```

**Subcommands:**

```bash
# List all env vars
stacksolo env list

# Set an env var
stacksolo env set API_KEY=secret123

# Remove an env var
stacksolo env unset API_KEY
```

---

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--help` | Show help for a command |
| `--version` | Show CLI version |
| `--verbose` | Show detailed output |
| `--quiet` | Suppress non-essential output |

**Examples:**

```bash
stacksolo --version
stacksolo deploy --help
stacksolo deploy --verbose
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Authentication error |
| 4 | Deployment error |

---

## Environment Variables

The CLI respects these environment variables:

| Variable | Description |
|----------|-------------|
| `STACKSOLO_CONFIG` | Path to config file |
| `STACKSOLO_PROJECT` | GCP project ID override |
| `STACKSOLO_REGION` | Region override |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account key |

**Example:**

```bash
STACKSOLO_CONFIG=./custom-config.json stacksolo deploy
```

---

## Common Workflows

### First-time setup

```bash
# Install CLI
npm install -g @stacksolo/cli

# Login to GCP
gcloud auth login
gcloud auth application-default login

# Create project
mkdir my-app && cd my-app
stacksolo init
```

### Daily development

```bash
# Start local environment
stacksolo dev

# Make changes to your code...

# Check logs
stacksolo dev --logs api

# Stop when done
stacksolo dev --stop
```

### Deploying changes

```bash
# Preview changes
stacksolo deploy --preview

# Deploy
stacksolo deploy

# Check status
stacksolo status
```

### Debugging issues

```bash
# Check deployment status
stacksolo status

# View outputs
stacksolo output

# Check logs
stacksolo logs --since 1h

# Force redeploy
stacksolo deploy --force
```