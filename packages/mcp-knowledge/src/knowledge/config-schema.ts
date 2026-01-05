/**
 * Config schema documentation for AI assistants
 */

export const configSchema = `# StackSolo Config Schema

The config file is located at \`.stacksolo/stacksolo.config.json\`.

## Root Structure

\`\`\`json
{
  "project": {
    "name": "string (required) - Project name, used for resource naming",
    "gcpProjectId": "string (required) - Your GCP project ID",
    "region": "string (default: us-central1) - GCP region",
    "backend": "string (default: cdktf) - Infrastructure backend",
    "networks": "array (required) - Network configurations",
    "buckets": "array (optional) - Storage bucket configurations",
    "secrets": "array (optional) - Secret Manager secrets"
  }
}
\`\`\`

## Network Configuration

Each network groups resources that share a VPC:

\`\`\`json
{
  "name": "string (required) - Network name",
  "existing": "boolean (optional) - If true, references existing VPC",
  "functions": "array - Cloud Functions in this network",
  "containers": "array - Cloud Run services in this network",
  "uis": "array - Static sites in this network",
  "loadBalancer": "object (optional) - HTTP(S) load balancer config"
}
\`\`\`

## Function Configuration

Cloud Functions (Gen2):

\`\`\`json
{
  "name": "string (required) - Function name",
  "runtime": "string (default: nodejs20) - Runtime: nodejs20, python312, go122",
  "entryPoint": "string (required) - Export name to invoke",
  "memory": "string (default: 256Mi) - Memory allocation",
  "timeout": "number (default: 60) - Timeout in seconds",
  "minInstances": "number (default: 0) - Minimum instances",
  "maxInstances": "number (default: 100) - Maximum instances",
  "allowUnauthenticated": "boolean (default: false) - Public access",
  "sourceDir": "string (optional) - Source directory (default: functions/<name>/)",
  "env": "object (optional) - Environment variables",
  "secrets": "array (optional) - Secret references"
}
\`\`\`

## Container Configuration

Cloud Run services:

\`\`\`json
{
  "name": "string (required) - Service name",
  "image": "string (optional) - Docker image (built from sourceDir if not specified)",
  "port": "number (default: 8080) - Container port",
  "memory": "string (default: 512Mi) - Memory allocation",
  "cpu": "string (default: 1) - CPU allocation",
  "minInstances": "number (default: 0) - Minimum instances",
  "maxInstances": "number (default: 100) - Maximum instances",
  "allowUnauthenticated": "boolean (default: false) - Public access",
  "sourceDir": "string (optional) - Source directory (default: containers/<name>/)",
  "env": "object (optional) - Environment variables",
  "secrets": "array (optional) - Secret references"
}
\`\`\`

## UI Configuration

Static site hosting:

\`\`\`json
{
  "name": "string (required) - UI name",
  "sourceDir": "string (optional) - Source directory (default: ui/<name>/)",
  "buildCommand": "string (optional) - Build command",
  "outputDir": "string (default: dist) - Build output directory"
}
\`\`\`

## Load Balancer Configuration

HTTP(S) load balancer:

\`\`\`json
{
  "name": "string (required) - Load balancer name",
  "routes": [
    {
      "path": "string (required) - URL path pattern (e.g., /api/*)",
      "backend": "string (required) - Backend service name"
    }
  ],
  "defaultBackend": "string (optional) - Default backend if no route matches"
}
\`\`\`

## Bucket Configuration

Cloud Storage buckets:

\`\`\`json
{
  "name": "string (required) - Bucket name (must be globally unique)",
  "location": "string (default: US) - Bucket location",
  "storageClass": "string (default: STANDARD) - Storage class",
  "existing": "boolean (optional) - Reference existing bucket",
  "cors": "array (optional) - CORS configuration"
}
\`\`\`

## Secret Configuration

Secret Manager secrets:

\`\`\`json
{
  "name": "string (required) - Secret name",
  "existing": "boolean (optional) - Reference existing secret"
}
\`\`\`

## References

Use references to connect resources:

\`\`\`json
{
  "env": {
    "DATABASE_URL": "@sql/my-database.connectionString",
    "REDIS_HOST": "@redis/my-cache.host",
    "BUCKET_NAME": "@bucket/my-bucket.name",
    "API_URL": "@container/my-api.url"
  }
}
\`\`\`

Reference format: \`@<type>/<name>.<property>\`

Available types:
- \`@sql\` - Cloud SQL instances
- \`@redis\` - Memorystore Redis
- \`@bucket\` - Storage buckets
- \`@container\` - Cloud Run services
- \`@function\` - Cloud Functions
- \`@secret\` - Secret Manager secrets
`;

export const configExamples = `# Config Examples

## Minimal API

\`\`\`json
{
  "project": {
    "name": "my-api",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "networks": [{
      "name": "main",
      "functions": [{
        "name": "api",
        "runtime": "nodejs20",
        "entryPoint": "api",
        "allowUnauthenticated": true
      }]
    }]
  }
}
\`\`\`

## API with Database

\`\`\`json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "networks": [{
      "name": "main",
      "containers": [{
        "name": "api",
        "port": 3000,
        "allowUnauthenticated": true,
        "env": {
          "DATABASE_URL": "@sql/db.connectionString"
        }
      }],
      "sql": [{
        "name": "db",
        "databaseVersion": "POSTGRES_15",
        "tier": "db-f1-micro"
      }],
      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/*", "backend": "api" }
        ]
      }
    }]
  }
}
\`\`\`

## Full Stack App

\`\`\`json
{
  "project": {
    "name": "fullstack-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "networks": [{
      "name": "main",
      "containers": [{
        "name": "api",
        "port": 3000,
        "env": {
          "DATABASE_URL": "@sql/db.connectionString",
          "REDIS_URL": "@redis/cache.url"
        }
      }],
      "uis": [{
        "name": "web",
        "buildCommand": "npm run build",
        "outputDir": "dist"
      }],
      "sql": [{
        "name": "db",
        "databaseVersion": "POSTGRES_15",
        "tier": "db-g1-small"
      }],
      "redis": [{
        "name": "cache",
        "tier": "BASIC",
        "memorySizeGb": 1
      }],
      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/*", "backend": "api" },
          { "path": "/*", "backend": "web" }
        ]
      }
    }]
  }
}
\`\`\`

## Shared VPC (Second Project)

When you have multiple projects sharing infrastructure:

\`\`\`json
{
  "project": {
    "name": "second-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "networks": [{
      "name": "first-app-main",
      "existing": true,
      "containers": [{
        "name": "worker",
        "port": 8080
      }]
    }]
  }
}
\`\`\`

Note: The network name must match the original project's network name prefixed with the project name.
`;
