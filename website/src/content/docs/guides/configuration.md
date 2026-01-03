---
title: Configuration Guide
description: How to configure your StackSolo project
---

This guide explains how to configure your StackSolo project using `stacksolo.config.json`.

## Config File Location

After running `stacksolo init`, you'll have:

```
your-project/
├── .stacksolo/
│   └── stacksolo.config.json    <-- Your config file
├── functions/                    <-- Your code
└── ...
```

## Basic Structure

Every config file has this structure:

```json
{
  "$schema": "https://stacksolo.dev/schema/config.json",
  "project": {
    "name": "my-app",
    "region": "us-central1",
    "gcpProjectId": "my-gcp-project-id",
    "networks": [...]
  }
}
```

**Required fields:**

| Field | What It Is | Example |
|-------|-----------|---------|
| `name` | Your project name | `"my-app"` |
| `region` | GCP region to deploy to | `"us-central1"` |
| `gcpProjectId` | Your GCP project ID | `"my-company-prod"` |

## Project-Level vs Network-Level Resources

### Project-Level (Global)

These resources exist outside any VPC network:

- `buckets` - Cloud Storage buckets
- `secrets` - Secret Manager secrets
- `topics` - Pub/Sub topics
- `queues` - Cloud Tasks queues
- `crons` - Cloud Scheduler jobs
- `kernel` / `gcpKernel` - Shared infrastructure service

### Network-Level (VPC-Bound)

These resources live inside a VPC network:

- `functions` - Cloud Functions
- `containers` - Cloud Run services
- `databases` - Cloud SQL instances
- `caches` - Redis (Memorystore)
- `uis` - Static website hosting
- `loadBalancer` - HTTP(S) load balancer

## Complete Example

Here's a full-stack app with all the pieces:

```json
{
  "$schema": "https://stacksolo.dev/schema/config.json",
  "project": {
    "name": "fullstack-app",
    "region": "us-central1",
    "gcpProjectId": "my-project",

    "secrets": [
      { "name": "jwt-secret" },
      { "name": "api-key" }
    ],

    "buckets": [
      {
        "name": "uploads",
        "storageClass": "STANDARD"
      }
    ],

    "networks": [
      {
        "name": "main",

        "functions": [
          {
            "name": "api",
            "runtime": "nodejs20",
            "memory": "256Mi",
            "env": {
              "DATABASE_URL": "@database/db.connectionString",
              "JWT_SECRET": "@secret/jwt-secret"
            }
          }
        ],

        "databases": [
          {
            "name": "db",
            "databaseVersion": "POSTGRES_15",
            "tier": "db-g1-small"
          }
        ],

        "uis": [
          {
            "name": "web",
            "sourceDir": "./web",
            "framework": "react"
          }
        ],

        "loadBalancer": {
          "name": "gateway",
          "routes": [
            { "path": "/api/*", "backend": "api" },
            { "path": "/*", "backend": "web" }
          ]
        }
      }
    ]
  }
}
```

## Resource Reference

### Functions

Cloud Functions (Gen2) that scale automatically.

```json
{
  "functions": [
    {
      "name": "api",
      "sourceDir": "./functions/api",
      "runtime": "nodejs20",
      "entryPoint": "handler",
      "memory": "256Mi",
      "timeout": 60,
      "minInstances": 0,
      "maxInstances": 100,
      "allowUnauthenticated": true,
      "env": {
        "NODE_ENV": "production"
      }
    }
  ]
}
```

### Containers

Cloud Run services for Docker containers.

```json
{
  "containers": [
    {
      "name": "api",
      "image": "gcr.io/my-project/api:latest",
      "port": 8080,
      "memory": "512Mi",
      "cpu": "1",
      "minInstances": 0,
      "maxInstances": 10,
      "env": {
        "DATABASE_URL": "@database/db.connectionString"
      }
    }
  ]
}
```

### Databases

Cloud SQL instances (PostgreSQL or MySQL).

```json
{
  "databases": [
    {
      "name": "db",
      "databaseVersion": "POSTGRES_15",
      "tier": "db-g1-small",
      "diskSize": 10,
      "backupEnabled": true
    }
  ]
}
```

### UIs (Static Websites)

Static website hosting with Cloud Storage + CDN.

```json
{
  "uis": [
    {
      "name": "web",
      "sourceDir": "./web",
      "framework": "react",
      "buildCommand": "npm run build",
      "buildOutputDir": "dist"
    }
  ]
}
```

### Load Balancer

HTTP(S) load balancer with path-based routing.

```json
{
  "loadBalancer": {
    "name": "gateway",
    "routes": [
      { "path": "/api/*", "backend": "api" },
      { "path": "/admin/*", "backend": "admin" },
      { "path": "/*", "backend": "web" }
    ]
  }
}
```

Routes are matched in order (first match wins).

## References

References let resources use values from other resources.

**Format:** `@type/name.property`

### Available References

| Reference | Properties |
|-----------|------------|
| `@secret/name` | `id`, `name`, `version` |
| `@database/name` | `connectionString`, `privateIp`, `publicIp` |
| `@bucket/name` | `name`, `url`, `selfLink` |
| `@cache/name` | `host`, `port`, `authString` |
| `@container/name` | `url`, `name` |
| `@function/name` | `url`, `name` |
| `@kernel/name` | `url`, `authUrl`, `natsUrl` |
| `@gcp-kernel/name` | `url` |

### Example

```json
{
  "env": {
    "DATABASE_URL": "@database/db.connectionString",
    "REDIS_HOST": "@cache/sessions.host",
    "JWT_SECRET": "@secret/jwt-secret",
    "UPLOADS_BUCKET": "@bucket/uploads.name"
  }
}
```

## Common Patterns

### Simple API

```json
{
  "project": {
    "name": "simple-api",
    "region": "us-central1",
    "gcpProjectId": "my-project",
    "networks": [
      {
        "name": "main",
        "functions": [{ "name": "api" }]
      }
    ]
  }
}
```

### API + Database

```json
{
  "project": {
    "name": "api-with-db",
    "region": "us-central1",
    "gcpProjectId": "my-project",
    "networks": [
      {
        "name": "main",
        "functions": [
          {
            "name": "api",
            "env": {
              "DATABASE_URL": "@database/db.connectionString"
            }
          }
        ],
        "databases": [
          { "name": "db", "databaseVersion": "POSTGRES_15" }
        ]
      }
    ]
  }
}
```

### Full Stack with Load Balancer

```json
{
  "project": {
    "name": "fullstack",
    "region": "us-central1",
    "gcpProjectId": "my-project",
    "networks": [
      {
        "name": "main",
        "functions": [{ "name": "api" }],
        "uis": [{ "name": "web", "sourceDir": "./web" }],
        "loadBalancer": {
          "name": "gateway",
          "routes": [
            { "path": "/api/*", "backend": "api" },
            { "path": "/*", "backend": "web" }
          ]
        }
      }
    ]
  }
}
```

## Validation

StackSolo validates your config when you run any command.

Run `stacksolo config validate` to check your config without deploying.

## Next Steps

- [CLI Reference](/reference/cli/) - All commands explained
- [Config Schema](/reference/config-schema/) - Full schema reference
