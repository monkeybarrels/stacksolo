---
title: CLI Commands
description: Complete reference for all StackSolo CLI commands
---

Complete reference for all StackSolo CLI commands.

## Installation

```bash
# Use directly with npx (recommended)
npx stacksolo <command>

# Or install globally
npm install -g stacksolo
```

## Command Overview

| Command | Description |
|---------|-------------|
| `stacksolo init` | Initialize a new project |
| `stacksolo clone` | Bootstrap from an existing project |
| `stacksolo scaffold` | Generate local dev files |
| `stacksolo deploy` | Deploy infrastructure |
| `stacksolo destroy` | Destroy all resources |
| `stacksolo merge` | Merge multiple projects into one |
| `stacksolo status` | Show deployment status |
| `stacksolo events` | View deploy event logs |
| `stacksolo inventory` | Scan and manage GCP resources |
| `stacksolo dev` | Start local development |
| `stacksolo logs` | View deployment logs |
| `stacksolo output` | Show resource outputs |

## Project Commands

### `stacksolo init`

Initialize a new StackSolo project.

```bash
stacksolo init [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Project name |
| `--project-id <id>` | GCP project ID |
| `-r, --region <region>` | Region |
| `-t, --template <template>` | Project template (function-api, ui-api, etc.) |
| `-y, --yes` | Skip prompts and use defaults |
| `--create-project` | Create a new GCP + Firebase project |
| `--list-templates` | List available remote templates |
| `--skip-org-policy` | Skip org policy check and fix |
| `--skip-apis` | Skip enabling GCP APIs |

**What it does:**
1. Checks gcloud authentication
2. Lists your GCP projects
3. Enables required APIs
4. Asks what type of app you're building
5. Generates `.stacksolo/stacksolo.config.json`

#### Create Project Mode (`--create-project`)

Create a brand new GCP project with Firebase pre-configured:

```bash
stacksolo init --create-project
```

This interactive flow:
1. Checks gcloud and firebase CLI authentication
2. Prompts for project name and auto-generates a unique GCP project ID
3. Creates the GCP project
4. Guides you through enabling billing (with automatic linking if you have billing accounts)
5. Enables all required GCP APIs
6. Adds Firebase to the project
7. Optionally configures Firebase Authentication (pauses for manual setup)
8. Sets up org policies and Cloud Build permissions
9. Generates your stacksolo config with kernel support

**Example:**

```bash
# Create new project interactively
stacksolo init --create-project

# Create with pre-set name and region
stacksolo init --create-project --name my-app --region us-central1
```

**Why use this?** Each stacksolo project gets its own isolated GCP/Firebase project. This avoids cross-project complexity and keeps billing/quotas separate.

### `stacksolo clone`

Clone a remote stack or bootstrap from an existing local project. Stacks are complete, deployable applications with full source code.

```bash
stacksolo clone [source] [destination] [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `source` | Stack ID (e.g., `rag-platform`) or path to local project |
| `destination` | Directory name for the new project |

**Options:**

| Option | Description |
|--------|-------------|
| `--list` | List available remote stacks |
| `-n, --name <name>` | Name for the new project |
| `-o, --output <dir>` | Output directory (default: current directory) |
| `--no-vpc` | Do not share the VPC (local clone only) |
| `--no-buckets` | Do not share storage buckets (local clone only) |
| `--no-registry` | Do not share artifact registry (local clone only) |
| `-y, --yes` | Skip prompts and use defaults |

**Examples:**

```bash
# List available stacks
stacksolo clone --list

# Clone a remote stack
stacksolo clone rag-platform my-chatbot

# Clone with defaults (no prompts)
stacksolo clone rag-platform my-chatbot -y

# Clone a local project
stacksolo clone ./my-existing-project --name my-new-api

# Clone but create a new VPC (local clone only)
stacksolo clone ./my-existing-project --name my-new-api --no-vpc
```

**Remote Stacks:**

Remote stacks are hosted in the [stacksolo-architectures](https://github.com/monkeybarrels/stacksolo-architectures) repository. They include:
- Full source code (services, apps)
- Infrastructure configuration
- Documentation and setup guides
- Variable substitution for customization

**Local Project Cloning:**

When cloning a local project, shared resources (VPC, buckets, registry) are automatically configured with `existing: true`:
- **VPC Network** - Reuses the source project's VPC (avoids quota limits)
- **Storage Buckets** - References existing buckets
- **Artifact Registry** - Uses the same container registry

**See also:** [Resource Sharing Guide](/guides/resource-sharing/)

### `stacksolo scaffold`

Generate local development files from your config.

```bash
stacksolo scaffold [options]
```

| Option | Description |
|--------|-------------|
| `--env-only` | Only generate .env files |
| `--docker-only` | Only generate docker-compose.yml |
| `--force` | Overwrite existing files |
| `--dry-run` | Show what would be generated |

## Infrastructure Commands

### `stacksolo deploy`

Deploy your infrastructure to GCP.

```bash
stacksolo deploy [options]
```

| Option | Description |
|--------|-------------|
| `--preview` | Show what would change |
| `--skip-build` | Skip building container images |
| `--tag <tag>` | Container image tag (default: `latest`) |
| `--refresh` | Refresh Terraform state first |
| `--force` | Force recreate conflicting resources |
| `--helm` | Generate Helm chart (Kubernetes backend only) |

**Helm Output:**

For Kubernetes backend projects, use `--helm` to generate a Helm chart instead of raw manifests:

```bash
# Preview Helm chart
stacksolo deploy --helm --preview

# Generate and deploy via Helm
stacksolo deploy --helm
```

The chart is generated to `.stacksolo/helm-chart/`. See [Helm Plugin](/plugins/helm/) for multi-environment deployment workflows.

### `stacksolo destroy`

Destroy all deployed resources.

```bash
stacksolo destroy [options]
```

| Option | Description |
|--------|-------------|
| `--force` | Skip confirmation prompt |

### `stacksolo status`

Show deployment status.

```bash
stacksolo status
```

### `stacksolo output`

Show outputs from deployed resources.

```bash
stacksolo output [resource]
```

### `stacksolo logs`

View deployment logs.

```bash
stacksolo logs [options]
```

| Option | Description |
|--------|-------------|
| `--follow` | Stream logs in real-time |
| `--since <duration>` | Show logs since (e.g., `1h`, `30m`) |

### `stacksolo events`

View high-resolution event logs for deploy operations. Events are stored in `~/.stacksolo/registry.db` and provide full observability of every operation during deployment.

```bash
# View latest session events
stacksolo events

# List all sessions
stacksolo events list [options]

# View specific session
stacksolo events show [session-id] [options]
```

#### `stacksolo events` (default)

Shows events from the most recent deploy session in an ASCII table.

```
+--------------+-----------------+------------+----------------------+-------------------------------------+
| TIME         | PROJECT         | CATEGORY   | EVENT                | DETAILS                             |
+--------------+-----------------+------------+----------------------+-------------------------------------+
| 19:55:54.294 | my-app          | internal   | session_start        | deploy                              |
| 19:55:54.297 | my-app          | internal   | phase_start          | phase=preflight                     |
| 19:56:24.356 | my-app          | internal   | phase_end            | phase=preflight                     |
| 19:56:24.358 | my-app          | internal   | phase_start          | phase=apply                         |
| 19:56:24.359 | my-app          | terraform  | apply_start          |                                     |
| 19:57:14.519 | my-app          | terraform  | apply_end            | exit=0                              |
| 19:57:14.521 | my-app          | internal   | phase_end            | phase=apply                         |
| 19:57:14.521 | my-app          | internal   | session_end          | exit=0                              |
+--------------+-----------------+------------+----------------------+-------------------------------------+
```

#### `stacksolo events list`

List recent deploy sessions.

| Option | Description |
|--------|-------------|
| `-n, --limit <number>` | Number of sessions to show (default: 10) |
| `--json` | Output as JSON |

#### `stacksolo events show`

Show events for a specific session.

```bash
# View by session ID (first 8 chars work)
stacksolo events show abc12345

# Filter by category
stacksolo events show --category terraform

# Filter by resource
stacksolo events show --resource my-bucket

# JSON output
stacksolo events show --json
```

| Option | Description |
|--------|-------------|
| `-c, --category <category>` | Filter by category: `internal`, `terraform`, `docker`, `gcloud`, `file`, `gcs` |
| `-r, --resource <name>` | Filter by resource name |
| `-n, --limit <number>` | Maximum events to show |
| `--json` | Output as JSON |

#### Event Categories

| Category | Description |
|----------|-------------|
| `internal` | Session lifecycle, phase transitions, conflicts, user prompts |
| `terraform` | Terraform init, plan, apply operations and resource changes |
| `docker` | Docker build and push operations |
| `gcloud` | gcloud CLI commands |
| `file` | File system operations |
| `gcs` | GCS uploads |

### `stacksolo merge`

Merge multiple StackSolo projects into a single deployable stack. Useful for CI pipelines or combining microservices.

```bash
stacksolo merge <projects...> --name <name> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `projects` | Paths to project directories or config files (1 or more) |

**Options:**

| Option | Description |
|--------|-------------|
| `--name <name>` | Name for the merged project (required) |
| `-o, --output <dir>` | Output directory (default: `.stacksolo-merged/`) |
| `--shared-vpc <name>` | Use a shared VPC for all projects |
| `--dry-run` | Show what would be merged without writing files |

**Examples:**

```bash
# Merge two projects
stacksolo merge ./users-api ./orders-api --name platform

# Merge with custom output directory
stacksolo merge ./api ./web --name my-app --output ./deploy

# Preview merge without writing files
stacksolo merge ./services/* --name prod-stack --dry-run
```

**How it works:**

1. Loads and validates all source project configs
2. Detects conflicts (all projects must use the same GCP project ID)
3. Prefixes all resource names with source project name (e.g., `api` → `users-api-api`)
4. Merges networks into a single shared VPC
5. Combines load balancer routes with path prefixes (e.g., `/users/*`, `/orders/*`)
6. Writes merged config to output directory

**See also:** [Resource Sharing Guide](/guides/resource-sharing/)

### `stacksolo inventory`

Scan and manage GCP resources across your projects. Helps track shared resources and find orphaned infrastructure.

```bash
stacksolo inventory [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--project <id>` | GCP project ID to scan |
| `--json` | Output as JSON |
| `--orphaned` | Show only orphaned resources |

**Subcommands:**

```bash
# Scan for all StackSolo resources
stacksolo inventory --project=my-gcp-project

# Adopt an unmanaged resource
stacksolo inventory adopt "VPC Network" default my-project-name

# Mark a resource as shared with other projects
stacksolo inventory share "VPC Network" my-vpc second-project third-project
```

**Resource categories:**

- **Managed** - Resources with StackSolo labels linked to registered projects
- **Orphaned** - StackSolo resources whose projects are no longer registered
- **Unmanaged** - GCP resources without StackSolo labels

**See also:** [Resource Sharing Guide](/guides/resource-sharing/)

## Development Commands

### `stacksolo dev`

Start a local development environment.

```bash
stacksolo dev [options]
```

| Option | Description |
|--------|-------------|
| `--local` | Run services locally without Docker/K8s |
| `--stop` | Tear down local environment |
| `--status` | Show running pods |
| `--logs [service]` | Tail logs |
| `--rebuild` | Force regenerate K8s manifests |
| `--no-emulators` | Skip Firebase/Pub/Sub emulators |

#### Local Mode (`--local`)

Run services directly on your machine without Docker or Kubernetes.

```bash
stacksolo dev --local
stacksolo dev --local --no-emulators
```

**How it works:**
1. Reads config from `.stacksolo/stacksolo.config.json`
2. Finds all services (functions, UIs, containers)
3. Runs `npm run dev` for each service in parallel
4. Streams logs with colored prefixes per service
5. Ctrl+C gracefully stops all processes

**Port allocation:**

| Service Type | Ports |
|--------------|-------|
| Functions | 8081, 8082, 8083... |
| UIs | 3000, 3001, 3002... |
| Containers | 9000, 9001, 9002... |

**Requirements:**

All services **must** have an `npm run dev` script in their package.json:

| Service Type | Required `dev` Script |
|--------------|----------------------|
| Function | `tsup src/index.ts --watch --onSuccess 'functions-framework ...'` |
| UI (React/Vue) | `vite` |
| Container | `tsx watch src/index.ts` |

The CLI injects `PORT` env var for functions/containers, and passes `--port` flag for UIs.

#### Kubernetes Mode (default)

Start a local Kubernetes environment via OrbStack or Docker Desktop.

```bash
stacksolo dev
```

**Prerequisites:** OrbStack or any local Kubernetes cluster.

### `stacksolo build`

Build container images locally.

```bash
stacksolo build [options]
```

| Option | Description |
|--------|-------------|
| `--service <name>` | Build specific service |
| `--tag <tag>` | Image tag |
| `--push` | Push to registry |

## Configuration Commands

### `stacksolo config`

Manage configuration.

```bash
# View config
stacksolo config show

# Edit config
stacksolo config edit

# Validate config
stacksolo config validate
```

### `stacksolo env`

Manage environment variables.

```bash
# List env vars
stacksolo env list

# Set env var
stacksolo env set API_KEY=secret123

# Remove env var
stacksolo env unset API_KEY
```

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Show help |
| `--version` | Show version |
| `--verbose` | Detailed output |
| `--quiet` | Suppress output |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STACKSOLO_CONFIG` | Path to config file |
| `STACKSOLO_PROJECT` | GCP project ID override |
| `STACKSOLO_REGION` | Region override |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Authentication error |
| 4 | Deployment error |

## Common Workflows

### First-time setup

```bash
npm install -g @stacksolo/cli
gcloud auth login
gcloud auth application-default login
mkdir my-app && cd my-app
stacksolo init
```

### Daily development

```bash
# Local mode (no Docker/K8s - fastest)
stacksolo dev --local
# Make changes, see live reload...
# Ctrl+C to stop

# Or Kubernetes mode
stacksolo dev
stacksolo dev --logs api
stacksolo dev --stop
```

### Deploying changes

```bash
stacksolo deploy --preview
stacksolo deploy
stacksolo status
```
