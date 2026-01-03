---
title: Local Development
description: Run your StackSolo project locally with Kubernetes
---

StackSolo includes a local development environment that mirrors your production setup using Kubernetes.

## Prerequisites

- [OrbStack](https://orbstack.dev/) with Kubernetes enabled (recommended for macOS)
- Or any local Kubernetes cluster (minikube, Docker Desktop, etc.)
- `kubectl` CLI

## Quick Start

```bash
# Start local environment
stacksolo dev

# Check what's running
stacksolo dev --status

# View logs
stacksolo dev --logs

# Stop everything
stacksolo dev --stop
```

## What Gets Created

When you run `stacksolo dev`, it creates Kubernetes resources that mirror your config:

| Your Config | Local Equivalent |
|-------------|-----------------|
| Functions | K8s Deployment + Service |
| Containers | K8s Deployment + Service |
| UIs | K8s Deployment + Service |
| Load balancer routes | K8s Ingress |
| Kernel | K8s Deployment (NATS + HTTP) |
| GCP Kernel | K8s Deployment (HTTP only) |

Plus automatic emulators:
- Firebase Emulator (Firestore, Auth)
- Pub/Sub Emulator

## Default Ports

| Service | Port |
|---------|------|
| Ingress (your app) | 8000 |
| Firebase Firestore | 8080 |
| Firebase Auth | 9099 |
| Firebase UI | 4000 |
| Pub/Sub | 8085 |
| Kernel HTTP | 8090 |
| Kernel NATS | 4222 |
| GCP Kernel | 8080 |

## Commands

### Start Development

```bash
stacksolo dev
```

Builds and deploys all services to local Kubernetes.

### Check Status

```bash
stacksolo dev --status
```

Shows running pods and their status.

### View Logs

```bash
# All logs
stacksolo dev --logs

# Specific service
stacksolo dev --logs api
```

### Rebuild

```bash
# Force regenerate K8s manifests
stacksolo dev --rebuild
```

### Stop

```bash
stacksolo dev --stop
```

Tears down all Kubernetes resources.

## How It Works

1. **Manifest Generation**: StackSolo reads your config and generates Kubernetes manifests in `.stacksolo/k8s/`

2. **Image Building**: For each function/container, it builds a Docker image locally

3. **Deployment**: Applies manifests to your local Kubernetes cluster

4. **Port Forwarding**: Sets up ingress so you can access your app at `localhost:8000`

## Environment Variables

In local dev, environment variable references are resolved:

```json
{
  "env": {
    "DATABASE_URL": "@database/db.connectionString"
  }
}
```

Becomes something like:
```
DATABASE_URL=postgres://user:pass@db-service:5432/mydb
```

## Using the Kernel

If your config includes a kernel:

```json
{
  "kernel": {
    "name": "main",
    "firebaseProjectId": "my-project",
    "storageBucket": "uploads"
  }
}
```

Or GCP kernel:

```json
{
  "gcpKernel": {
    "name": "kernel",
    "firebaseProjectId": "my-project",
    "storageBucket": "uploads"
  }
}
```

The kernel is automatically built from source and deployed locally.

## File Watching

Services are built with file watching enabled. When you change source files:

1. The build process runs automatically
2. Kubernetes picks up the new image
3. Your changes are live

## Troubleshooting

### Pods stuck in "Pending"

Check if Kubernetes has enough resources:

```bash
kubectl describe pod <pod-name> -n stacksolo
```

### Service not accessible

Check the ingress:

```bash
kubectl get ingress -n stacksolo
```

### Build failing

Check the build logs:

```bash
stacksolo dev --logs <service-name>
```

### Reset everything

```bash
stacksolo dev --stop
kubectl delete namespace stacksolo
stacksolo dev
```

## Next Steps

- [Deployment Guide](/guides/deployment/) - Deploy to GCP
- [CLI Reference](/reference/cli/) - All dev command options
