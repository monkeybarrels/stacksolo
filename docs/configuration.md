# Configuration Guide

This guide explains how to configure your StackSolo project using `stacksolo.config.json`.

## Where the Config File Lives

After running `stacksolo init`, you'll have:

```
your-project/
├── .stacksolo/
│   └── stacksolo.config.json    <-- This is your config file
├── functions/                    <-- Your code goes here
└── ...
```

## Basic Structure

Every config file has this structure:

```json
{
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

---

## Project-Level vs Network-Level Resources

StackSolo organizes resources into two levels:

### Project-Level (Global)

These resources exist outside any VPC network:

- `buckets` - Cloud Storage buckets
- `secrets` - Secret Manager secrets
- `topics` - Pub/Sub topics
- `queues` - Cloud Tasks queues
- `crons` - Cloud Scheduler jobs

### Network-Level (VPC-Bound)

These resources live inside a VPC network:

- `functions` - Cloud Functions
- `containers` - Cloud Run services
- `databases` - Cloud SQL instances
- `caches` - Redis (Memorystore)
- `uis` - Static website hosting
- `loadBalancer` - HTTP(S) load balancer

```json
{
  "project": {
    "name": "my-app",
    "region": "us-central1",
    "gcpProjectId": "my-project",

    "buckets": [...],     // Project-level
    "secrets": [...],     // Project-level

    "networks": [
      {
        "name": "main",
        "functions": [...],    // Network-level
        "containers": [...],   // Network-level
        "databases": [...]     // Network-level
      }
    ]
  }
}
```

---

## Complete Example

Here's a full-stack app with all the pieces:

```json
{
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

---

## Resource Configuration Reference

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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Function name |
| `sourceDir` | string | `./functions/{name}` | Path to source code |
| `runtime` | string | `nodejs20` | Runtime: `nodejs20`, `nodejs18`, `python311`, `go121` |
| `entryPoint` | string | `api` | Function entry point |
| `memory` | string | `256Mi` | Memory: `128Mi`, `256Mi`, `512Mi`, `1Gi`, `2Gi`, `4Gi` |
| `timeout` | number | `60` | Timeout in seconds |
| `minInstances` | number | `0` | Minimum instances (0 = scale to zero) |
| `maxInstances` | number | `100` | Maximum instances |
| `allowUnauthenticated` | boolean | `true` | Allow public access |
| `env` | object | `{}` | Environment variables |

---

### Containers

Cloud Run services for running Docker containers.

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
      "allowUnauthenticated": true,
      "env": {
        "DATABASE_URL": "@database/db.connectionString"
      }
    }
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Service name |
| `image` | string | auto | Container image URL |
| `port` | number | `8080` | Container port |
| `memory` | string | `512Mi` | Memory limit |
| `cpu` | string | `1` | CPU limit |
| `minInstances` | number | `0` | Minimum instances |
| `maxInstances` | number | `100` | Maximum instances |
| `concurrency` | number | `80` | Max requests per instance |
| `timeout` | string | `300s` | Request timeout |
| `allowUnauthenticated` | boolean | `true` | Allow public access |
| `env` | object | `{}` | Environment variables |

---

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
      "databaseName": "app",
      "enablePublicIp": false,
      "backupEnabled": true
    }
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Instance name |
| `databaseVersion` | string | `POSTGRES_15` | `POSTGRES_15`, `POSTGRES_14`, `MYSQL_8_0` |
| `tier` | string | `db-f1-micro` | Machine type |
| `diskSize` | number | `10` | Disk size in GB |
| `diskType` | string | `PD_SSD` | `PD_SSD` or `PD_HDD` |
| `databaseName` | string | `{name}` | Database name to create |
| `enablePublicIp` | boolean | `false` | Enable public IP |
| `requireSsl` | boolean | `true` | Require SSL connections |
| `backupEnabled` | boolean | `true` | Enable automated backups |

---

### Caches

Redis instances using Memorystore.

```json
{
  "caches": [
    {
      "name": "sessions",
      "tier": "BASIC",
      "memorySizeGb": 1,
      "authEnabled": true
    }
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Instance name |
| `tier` | string | `BASIC` | `BASIC` or `STANDARD_HA` |
| `memorySizeGb` | number | `1` | Memory in GB |
| `redisVersion` | string | `REDIS_7_0` | Redis version |
| `authEnabled` | boolean | `true` | Enable authentication |

---

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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Site name |
| `sourceDir` | string | required | Path to source code |
| `framework` | string | auto-detect | `react`, `vue`, `sveltekit`, `html` |
| `buildCommand` | string | `npm run build` | Build command |
| `buildOutputDir` | string | `dist` | Output directory |
| `indexDocument` | string | `index.html` | Main page |
| `errorDocument` | string | `index.html` | 404 page (SPA routing) |

---

### Buckets

Cloud Storage buckets.

```json
{
  "buckets": [
    {
      "name": "uploads",
      "location": "US",
      "storageClass": "STANDARD",
      "versioning": false,
      "publicAccess": false,
      "cors": {
        "origins": ["https://myapp.com"],
        "methods": ["GET", "PUT"],
        "maxAgeSeconds": 3600
      }
    }
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Bucket name |
| `location` | string | `US` | Location: `US`, `EU`, `ASIA`, or region |
| `storageClass` | string | `STANDARD` | `STANDARD`, `NEARLINE`, `COLDLINE`, `ARCHIVE` |
| `versioning` | boolean | `false` | Enable object versioning |
| `publicAccess` | boolean | `false` | Make objects public |
| `uniformBucketLevelAccess` | boolean | `true` | Use uniform IAM |

---

### Secrets

Secret Manager secrets.

```json
{
  "secrets": [
    {
      "name": "api-key"
    },
    {
      "name": "database-password",
      "labels": {
        "env": "production"
      }
    }
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Secret name |
| `labels` | object | `{}` | Labels for the secret |

**Note:** Secret values are set via GCP Console or `gcloud`. StackSolo creates the secret but doesn't store the value in config.

---

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

**How routing works:**

1. Routes are matched in order (first match wins)
2. More specific paths should come before wildcards
3. Backend names refer to functions, containers, or UIs in the same network

---

### Cron Jobs

Cloud Scheduler jobs that call your services on a schedule.

```json
{
  "crons": [
    {
      "name": "daily-cleanup",
      "schedule": "0 2 * * *",
      "timezone": "America/New_York",
      "target": "@function/api",
      "path": "/cron/cleanup",
      "method": "POST"
    }
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Job name |
| `schedule` | string | required | Cron expression |
| `timezone` | string | `UTC` | Timezone |
| `target` | string | required | Target service (reference) |
| `path` | string | `/` | HTTP path to call |
| `method` | string | `POST` | HTTP method |

---

## References

References let resources use values from other resources. Format: `@type/name.property`

### Available References

| Reference | Properties | Default |
|-----------|------------|---------|
| `@secret/name` | `id`, `name`, `version` | `secretId` |
| `@database/name` | `connectionString`, `privateIp`, `publicIp` | `connectionString` |
| `@bucket/name` | `name`, `url`, `selfLink` | `name` |
| `@cache/name` | `host`, `port`, `authString` | `host` |
| `@container/name` | `url`, `name` | `url` |
| `@function/name` | `url`, `name` | `url` |
| `@topic/name` | `name`, `id` | `name` |
| `@queue/name` | `name`, `id` | `name` |
| `@ui/name` | `url`, `bucketName` | `url` |
| `@kernel/name` | `url`, `authUrl`, `natsUrl` | `url` |

### Examples

```json
{
  "env": {
    "DATABASE_URL": "@database/db.connectionString",
    "REDIS_HOST": "@cache/sessions.host",
    "REDIS_PORT": "@cache/sessions.port",
    "JWT_SECRET": "@secret/jwt-secret",
    "UPLOADS_BUCKET": "@bucket/uploads.name",
    "API_URL": "@function/api.url"
  }
}
```

---

## Common Patterns

### Simple API

Just a single function:

```json
{
  "project": {
    "name": "simple-api",
    "region": "us-central1",
    "gcpProjectId": "my-project",
    "networks": [
      {
        "name": "main",
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

### API + Database

Function with PostgreSQL:

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
          {
            "name": "db",
            "databaseVersion": "POSTGRES_15"
          }
        ]
      }
    ]
  }
}
```

### Full Stack with Load Balancer

Frontend + Backend + Database:

```json
{
  "project": {
    "name": "fullstack",
    "region": "us-central1",
    "gcpProjectId": "my-project",
    "networks": [
      {
        "name": "main",
        "functions": [
          { "name": "api" }
        ],
        "uis": [
          { "name": "web", "sourceDir": "./web" }
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

---

## Validation

StackSolo validates your config when you run any command. Common errors:

**Missing required field:**
```
Error: project.name is required
```

**Invalid reference:**
```
Error: Reference @database/main not found.
Available databases: db
```

**Duplicate names:**
```
Error: Duplicate function name: api
```

Run `stacksolo config validate` to check your config without deploying.

---

## Environment Variables

Override config values with environment variables:

| Variable | Description |
|----------|-------------|
| `STACKSOLO_PROJECT` | Override GCP project ID |
| `STACKSOLO_REGION` | Override region |
| `STACKSOLO_CONFIG` | Path to config file |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account key |

Example:
```bash
STACKSOLO_PROJECT=my-prod-project stacksolo deploy
```

---

## Tips

1. **Start simple** - Begin with just a function, add resources as needed
2. **Use references** - Let StackSolo wire up connections between resources
3. **Check the examples** - The `examples/` directory has working configurations
4. **Validate often** - Run `stacksolo config validate` to catch errors early
5. **Use environment variables** - Keep secrets out of your config file