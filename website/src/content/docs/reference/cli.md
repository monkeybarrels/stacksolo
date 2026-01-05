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
| `stacksolo deploy` | Deploy infrastructure |
| `stacksolo destroy` | Destroy all resources |
| `stacksolo status` | Show deployment status |
| `stacksolo events` | View deploy event logs |
| `stacksolo dev` | Start local development |
| `stacksolo scaffold` | Generate local dev files |
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
