---
title: Sharing Resources Across Projects
description: How to reuse VPCs, buckets, and registries across multiple StackSolo projects
---

When running multiple StackSolo projects in the same GCP project, you may want to share certain resources to reduce costs, simplify management, or work within GCP quotas.

## Shareable Resources

| Resource | Shareable | Use Case |
|----------|-----------|----------|
| VPC Network | Yes | Avoid VPC quota limits (default: 5 per GCP project) |
| Artifact Registry | Yes | Share container images across apps |
| Storage Bucket | Yes | Shared file storage across apps |
| VPC Connector | No | Created per-network, required for VPC access |
| Cloud Run / Functions | No | Per-application services |
| Load Balancer | No | Per-application routing |

## VPC Network Sharing

VPC networks are the most common resource to share because GCP has a default quota of 5 VPCs per project.

### Config-Based Sharing

To use an existing VPC instead of creating a new one, add `"existing": true` to your network config:

```json
{
  "project": {
    "name": "my-second-app",
    "region": "us-central1",
    "gcpProjectId": "my-gcp-project",
    "networks": [
      {
        "name": "my-first-app-main",
        "existing": true,
        "functions": [
          {
            "name": "api",
            "runtime": "nodejs20"
          }
        ]
      }
    ]
  }
}
```

**Key points:**

- `name` must match the exact name of the existing VPC
- `existing: true` tells StackSolo to reference the VPC instead of creating it
- A new VPC Connector will still be created for this project
- All other resources (functions, containers, load balancer) work normally

### Finding Your VPC Name

If you deployed with StackSolo before, the VPC name follows this pattern:

```
{project-name}-{network-name}
```

For example, if your first project was:
```json
{
  "project": {
    "name": "my-first-app",
    "networks": [{ "name": "main" }]
  }
}
```

The VPC name would be: `my-first-app-main`

You can also list VPCs with:
```bash
gcloud compute networks list --project=YOUR_PROJECT_ID
```

### Tracking Shared VPCs

Use the inventory command to see and manage shared resources:

```bash
# Scan for all StackSolo resources
stacksolo inventory --project=YOUR_PROJECT_ID

# Mark a VPC as shared with another project
stacksolo inventory share "VPC Network" my-first-app-main my-second-app
```

This adds a `stacksolo-shared-with` label to track which projects use the VPC.

## Artifact Registry Sharing

Artifact Registry stores your container images. Sharing a registry across projects:

- Reduces storage costs (no duplicate images)
- Speeds up deployments (cached layers)
- Simplifies image management

### Config-Based Sharing

Add `"existing": true` to reference an existing registry:

```json
{
  "project": {
    "name": "my-second-app",
    "region": "us-central1",
    "gcpProjectId": "my-gcp-project",
    "artifactRegistry": {
      "name": "my-first-app-registry",
      "existing": true
    },
    "networks": [
      {
        "name": "shared-vpc",
        "existing": true,
        "containers": [
          {
            "name": "api",
            "image": "us-central1-docker.pkg.dev/my-gcp-project/my-first-app-registry/api:latest"
          }
        ]
      }
    ]
  }
}
```

### Sharing Strategy

Two common approaches:

1. **Shared Registry**: One registry for all projects
   - Pros: Simpler management, shared cache
   - Cons: All images in one place

2. **Per-Project Registry**: Each project has its own
   - Pros: Clear ownership, isolation
   - Cons: No layer sharing, higher storage costs

## Storage Bucket Sharing

Buckets are useful to share when multiple apps need access to the same files.

### Config-Based Sharing

Add `"existing": true` to reference an existing bucket:

```json
{
  "project": {
    "name": "my-second-app",
    "region": "us-central1",
    "gcpProjectId": "my-gcp-project",
    "buckets": [
      {
        "name": "my-shared-uploads-bucket",
        "existing": true
      }
    ],
    "networks": [
      {
        "name": "main",
        "functions": [
          {
            "name": "api",
            "env": {
              "UPLOADS_BUCKET": "@bucket/my-shared-uploads-bucket.name"
            }
          }
        ]
      }
    ]
  }
}
```

**Note:** Bucket names must be globally unique across all of GCP, so sharing makes sense for buckets you've already created.

## Inventory Management

The `stacksolo inventory` command helps you track and manage shared resources.

### View All Resources

```bash
# Scan your GCP project
stacksolo inventory --project=YOUR_PROJECT_ID

# Output shows:
# - Managed: Resources with StackSolo labels
# - Orphaned: StackSolo resources without registered projects
# - Unmanaged: Resources without StackSolo labels
```

### Adopt Unmanaged Resources

Add StackSolo labels to resources you want to track:

```bash
stacksolo inventory adopt "VPC Network" default my-project-name
```

### Mark Resources as Shared

Add sharing metadata to resources used by multiple projects:

```bash
stacksolo inventory share "VPC Network" my-app-main second-app third-app
```

### JSON Output

For scripting and automation:

```bash
stacksolo inventory --json --project=YOUR_PROJECT_ID
```

## Best Practices

### 1. Plan Your Sharing Strategy

Before deploying multiple projects, decide:
- Will they share a VPC? (recommended for quota management)
- Will they share a registry? (recommended for container projects)
- Will they share buckets? (only if they need the same files)

### 2. Use Consistent Naming

When sharing resources, use descriptive names:
- `shared-vpc` instead of `my-app-main`
- `company-registry` instead of `first-project-registry`

### 3. Document Shared Resources

Keep track of which projects use shared resources:
```bash
# Run periodically to update labels
stacksolo inventory --project=YOUR_PROJECT_ID
```

### 4. Clean Up Orphaned Resources

When you destroy a project, check for orphaned resources:
```bash
stacksolo inventory --orphaned --project=YOUR_PROJECT_ID
```

## Clone Command: Quick Bootstrap

The `stacksolo clone` command provides the fastest way to create a new project that shares resources with an existing one.

### Basic Usage

```bash
# Clone from an existing project
stacksolo clone ./my-existing-project --name my-new-project

# Clone with non-interactive mode
stacksolo clone ./my-existing-project --name my-new-project -y

# Clone to a specific directory
stacksolo clone ./my-existing-project --name my-new-project --output ./new-project-dir
```

### What Gets Shared

When you clone, the new project automatically gets `existing: true` for:

- **VPC Network** - Reuses the source project's VPC
- **Storage Buckets** - References the same buckets (if any)
- **Artifact Registry** - Uses the same container registry (if any)

### Selective Sharing

You can choose which resources to share:

```bash
# Share VPC but create new buckets
stacksolo clone ./source --name new-project --no-buckets

# Share VPC and registry but not buckets
stacksolo clone ./source --name new-project --no-buckets

# Don't share VPC (creates a new one)
stacksolo clone ./source --name new-project --no-vpc
```

### Generated Config

After cloning, your new project config looks like:

```json
{
  "project": {
    "name": "my-new-project",
    "region": "us-central1",
    "gcpProjectId": "my-gcp-project",
    "networks": [
      {
        "name": "source-project-main",
        "existing": true,
        "functions": [],
        "containers": [],
        "uis": []
      }
    ]
  }
}
```

The `functions`, `containers`, and `uis` arrays are empty, ready for you to add your resources.

### Next Steps After Cloning

1. Edit `.stacksolo/stacksolo.config.json` to add your functions/containers
2. Run `stacksolo scaffold` to generate code templates
3. Write your application code
4. Run `stacksolo deploy`

## Common Scenarios

### Scenario 1: Multiple APIs, One VPC

You have several microservices that need to communicate:

```json
// First project creates the VPC
{
  "project": {
    "name": "users-api",
    "networks": [{ "name": "shared", ... }]
  }
}

// Second project reuses it
{
  "project": {
    "name": "orders-api",
    "networks": [{
      "name": "users-api-shared",
      "existing": true,
      ...
    }]
  }
}
```

### Scenario 2: Dev/Staging/Prod Separation

Share VPCs within environments, not across:

```bash
# Each environment has its own shared VPC
dev-shared-vpc     # For: users-api-dev, orders-api-dev
staging-shared-vpc # For: users-api-staging, orders-api-staging
prod-shared-vpc    # For: users-api-prod, orders-api-prod
```

### Scenario 3: Hitting VPC Quota

If you're at your VPC limit:

1. Check existing VPCs: `gcloud compute networks list`
2. Identify which StackSolo projects created them: `stacksolo inventory`
3. Update new projects to use existing VPCs: `"existing": true`

## Troubleshooting

### "VPC not found" Error

The VPC name in your config must exactly match the GCP resource name:
```bash
gcloud compute networks list --project=YOUR_PROJECT_ID
```

### "Permission denied" Error

Ensure your GCP account has `compute.networks.get` permission on the VPC.

### Inventory Shows No Resources

Enable the required GCP APIs:
```bash
gcloud services enable compute.googleapis.com --project=YOUR_PROJECT_ID
gcloud services enable storage.googleapis.com --project=YOUR_PROJECT_ID
gcloud services enable run.googleapis.com --project=YOUR_PROJECT_ID
```

## Next Steps

- [Configuration Guide](/guides/configuration/) - Full config reference
- [CLI Reference](/reference/cli/) - All commands
- [Deployment Guide](/guides/deployment/) - Deploy your project