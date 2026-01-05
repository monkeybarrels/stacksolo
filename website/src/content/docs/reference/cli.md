---
title: CLI Commands
description: Complete reference for all StackSolo CLI commands
---

Complete reference for all StackSolo CLI commands.

## Installation

```bash
npm install -g @stacksolo/cli
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
stacksolo init
```

**What it does:**
1. Checks gcloud authentication
2. Lists your GCP projects
3. Enables required APIs
4. Asks what type of app you're building
5. Generates `.stacksolo/stacksolo.config.json`

### `stacksolo clone`

Bootstrap a new project from an existing StackSolo project. Automatically configures shared resources (VPC, buckets, registry) with `existing: true`.

```bash
stacksolo clone <source> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `source` | Path to source project directory or config file |

**Options:**

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | Name for the new project |
| `-o, --output <dir>` | Output directory (default: current directory) |
| `--no-vpc` | Do not share the VPC (creates a new one) |
| `--no-buckets` | Do not share storage buckets |
| `--no-registry` | Do not share artifact registry |
| `-y, --yes` | Skip prompts and use defaults |

**Examples:**

```bash
# Clone interactively
stacksolo clone ./my-existing-project

# Clone with specific name
stacksolo clone ./my-existing-project --name my-new-api

# Clone non-interactively to a specific directory
stacksolo clone ./my-existing-project --name my-new-api --output ./new-project -y

# Clone but create a new VPC
stacksolo clone ./my-existing-project --name my-new-api --no-vpc
```

**What gets shared:**

- **VPC Network** - Reuses the source project's VPC (avoids quota limits)
- **Storage Buckets** - References existing buckets
- **Artifact Registry** - Uses the same container registry

The new project config will have empty `functions`, `containers`, and `uis` arrays ready for you to add your resources.

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

Start a local Kubernetes development environment.

```bash
stacksolo dev [options]
```

| Option | Description |
|--------|-------------|
| `--stop` | Tear down local environment |
| `--status` | Show running pods |
| `--logs [service]` | Tail logs |
| `--rebuild` | Force regenerate K8s manifests |

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
stacksolo dev
# Make changes...
stacksolo dev --logs api
stacksolo dev --stop
```

### Deploying changes

```bash
stacksolo deploy --preview
stacksolo deploy
stacksolo status
```
