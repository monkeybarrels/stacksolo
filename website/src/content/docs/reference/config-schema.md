---
title: Config Schema
description: Complete reference for stacksolo.config.json
---

The `stacksolo.config.json` file (located in `.stacksolo/`) defines your entire infrastructure.

## Full Schema

```json
{
  "project": {
    "name": "string",
    "gcpProjectId": "string",
    "region": "string",
    "backend": "cdktf",
    "plugins": ["string"],

    "kernel": {
      "name": "string",
      "firebaseProjectId": "string",
      "gcsBucket": "string"
    },

    "gcpKernel": {
      "name": "string",
      "firebaseProjectId": "string",
      "storageBucket": "string"
    },

    "webAdmin": {
      "enabled": true,
      "port": 3000
    },

    "networks": [{
      "name": "string",
      "functions": [{
        "name": "string",
        "runtime": "nodejs20",
        "entryPoint": "string",
        "memory": "256MB",
        "timeout": 60,
        "allowUnauthenticated": true,
        "sourceDir": "string"
      }],
      "uis": [{
        "name": "string",
        "hosting": "gcs | firebase",
        "framework": "vue",
        "sourceDir": "string",
        "buildCommand": "npm run build",
        "buildOutputDir": "dist"
      }],
      "containers": [{
        "name": "string",
        "sourceDir": "string",
        "port": 8080
      }],
      "loadBalancer": {
        "name": "string",
        "domain": "string",
        "enableHttps": true,
        "redirectHttpToHttps": true,
        "routes": [{
          "path": "string",
          "backend": "string"
        }]
      }
    }]
  }
}
```

## Project Properties

### name
**Type:** `string` (required)

The project name. Used for namespacing resources.

```json
{ "project": { "name": "my-app" } }
```

### gcpProjectId
**Type:** `string` (required)

Your Google Cloud project ID.

```json
{ "project": { "gcpProjectId": "my-gcp-project-123" } }
```

### region
**Type:** `string` (default: `"us-central1"`)

GCP region for deploying resources.

```json
{ "project": { "region": "us-west1" } }
```

### backend
**Type:** `"cdktf"` (default: `"cdktf"`)

The infrastructure-as-code backend. Currently only CDKTF is supported.

### plugins
**Type:** `string[]` (optional)

List of plugins to load. Plugins are npm packages.

```json
{
  "project": {
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-kernel"
    ]
  }
}
```

---

## Cloudflare

Configuration for Cloudflare DNS integration. Requires `@stacksolo/plugin-cloudflare`.

### cloudflare.zoneId
**Type:** `string` (required)

Your Cloudflare Zone ID (found in Cloudflare dashboard, Overview tab).

### cloudflare.apiToken
**Type:** `string` (required)

Cloudflare API token with "Edit zone DNS" permission. Use `@secret/` syntax for secure storage.

```json
{
  "project": {
    "cloudflare": {
      "zoneId": "your-zone-id",
      "apiToken": "@secret/cloudflare-api-token"
    }
  }
}
```

---

## Kernel (NATS-based)

For projects that need shared infrastructure services using NATS for messaging.

### kernel.name
**Type:** `string` (required)

Name of the kernel service.

### kernel.firebaseProjectId
**Type:** `string` (optional)

Firebase project ID for authentication. Defaults to `gcpProjectId`.

### kernel.gcsBucket
**Type:** `string` (optional)

GCS bucket for file storage. Auto-generated if not specified.

```json
{
  "project": {
    "kernel": {
      "name": "kernel",
      "firebaseProjectId": "my-firebase-project",
      "gcsBucket": "my-app-files"
    }
  }
}
```

---

## GCP Kernel (Cloud Native)

For projects using GCP-native services (Pub/Sub instead of NATS).

### gcpKernel.name
**Type:** `string` (required)

Name of the GCP kernel service.

### gcpKernel.firebaseProjectId
**Type:** `string` (required)

Firebase project ID for authentication.

### gcpKernel.storageBucket
**Type:** `string` (required)

GCS bucket for file operations.

```json
{
  "project": {
    "gcpKernel": {
      "name": "gcp-kernel",
      "firebaseProjectId": "my-firebase-project",
      "storageBucket": "my-app-storage"
    }
  }
}
```

---

## Networks

Networks group related services together.

### network.name
**Type:** `string` (required)

Network identifier.

---

## Functions

Cloud Functions Gen2 definitions.

### function.name
**Type:** `string` (required)

Function name. Source code expected in `functions/<name>/`.

### function.runtime
**Type:** `string` (default: `"nodejs20"`)

Runtime environment: `nodejs18`, `nodejs20`, `python39`, `python310`, `python311`, `python312`.

### function.entryPoint
**Type:** `string` (default: `"handler"`)

The exported function name.

### function.memory
**Type:** `string` (default: `"256MB"`)

Memory allocation: `128MB`, `256MB`, `512MB`, `1GB`, `2GB`, `4GB`, `8GB`.

### function.timeout
**Type:** `number` (default: `60`)

Timeout in seconds (max: 540 for Gen2).

### function.allowUnauthenticated
**Type:** `boolean` (default: `false`)

Whether the function is publicly accessible.

### function.sourceDir
**Type:** `string` (optional)

Custom source directory. Defaults to `functions/<name>`.

```json
{
  "functions": [{
    "name": "api",
    "runtime": "nodejs20",
    "entryPoint": "api",
    "memory": "512MB",
    "timeout": 120,
    "allowUnauthenticated": true
  }]
}
```

---

## UIs

Static site / frontend deployments.

### ui.name
**Type:** `string` (required)

UI name. Source code expected in `apps/<name>/`.

### ui.hosting
**Type:** `"gcs" | "firebase"` (default: `"gcs"`)

Hosting provider:
- `gcs` - Cloud Storage bucket with CDN (default). Good for static sites and admin panels.
- `firebase` - Firebase Hosting. **Recommended for apps using Firebase Auth** (avoids cross-origin cookie issues with OAuth).

:::tip[When to use Firebase Hosting]
If your app uses Firebase Authentication with social providers (Google, Facebook, etc.), use `hosting: "firebase"`. This avoids the "missing initial state" error that occurs when the app domain doesn't match the Firebase `authDomain`.
:::

### ui.framework
**Type:** `string` (default: auto-detected)

Framework: `vue`, `react`, `sveltekit`, `html`.

### ui.sourceDir
**Type:** `string` (optional)

Custom source directory. Defaults to `apps/<name>`.

### ui.buildCommand
**Type:** `string` (default: `"npm run build"`)

Command to build the UI.

### ui.buildOutputDir
**Type:** `string` (optional)

Build output directory. Defaults to `dist` (or `build` for SvelteKit).

### GCS Hosting Example

```json
{
  "uis": [{
    "name": "docs",
    "hosting": "gcs",
    "framework": "vue",
    "sourceDir": "./apps/docs"
  }]
}
```

### Firebase Hosting Example

```json
{
  "uis": [{
    "name": "web",
    "hosting": "firebase",
    "framework": "vue",
    "sourceDir": "./apps/web"
  }]
}
```

:::note[Firebase Hosting Requirements]
When using `hosting: "firebase"`:
1. A `firebase.json` file must exist in your project root with hosting config
2. Firebase CLI must be installed (`npm install -g firebase-tools`)
3. You must be logged in (`firebase login`)
4. Your `.env.production` should set `VITE_FIREBASE_AUTH_DOMAIN` to your Firebase Hosting domain (e.g., `your-project.web.app`)
:::

---

## Containers

Cloud Run container deployments.

### container.name
**Type:** `string` (required)

Container name. Source code expected in `containers/<name>/`.

### container.sourceDir
**Type:** `string` (optional)

Custom source directory.

### container.port
**Type:** `number` (default: `8080`)

Port the container listens on.

```json
{
  "containers": [{
    "name": "worker",
    "port": 8080
  }]
}
```

---

## Load Balancer

HTTP(S) load balancer with path-based routing and optional HTTPS/SSL support.

### loadBalancer.name
**Type:** `string` (required)

Load balancer name.

### loadBalancer.domain
**Type:** `string` (optional, **required for IAP**)

Custom domain for HTTPS. DNS must point to the load balancer IP after deployment.

### loadBalancer.enableHttps
**Type:** `boolean` (default: `false`, **required for IAP**)

Enable HTTPS with a Google-managed SSL certificate. Requires `domain` to be set.

### loadBalancer.redirectHttpToHttps
**Type:** `boolean` (default: `false`)

Redirect all HTTP traffic to HTTPS. Recommended when `enableHttps` is true.

### loadBalancer.dns
**Type:** `object` (optional)

Automatic DNS configuration. Requires `@stacksolo/plugin-cloudflare`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `provider` | `string` | - | DNS provider (`cloudflare`) |
| `proxied` | `boolean` | `true` | Enable Cloudflare proxy (CDN, DDoS protection) |

### loadBalancer.routes
**Type:** `Route[]` (required)

Path-based routing rules.

#### route.path
**Type:** `string` (required)

URL path pattern. Supports `/*` for prefix matching.

#### route.backend
**Type:** `string` (required)

Backend service name (must match a function, ui, or container name).

### Basic Example (HTTP only)

```json
{
  "loadBalancer": {
    "name": "gateway",
    "routes": [
      { "path": "/api/*", "backend": "api" },
      { "path": "/*", "backend": "web" }
    ]
  }
}
```

### HTTPS Example (required for IAP)

```json
{
  "loadBalancer": {
    "name": "gateway",
    "domain": "app.example.com",
    "enableHttps": true,
    "redirectHttpToHttps": true,
    "routes": [
      { "path": "/api/*", "backend": "api" },
      { "path": "/*", "backend": "web" }
    ]
  }
}
```

### With Automatic Cloudflare DNS

```json
{
  "project": {
    "cloudflare": {
      "zoneId": "your-zone-id",
      "apiToken": "@secret/cloudflare-api-token"
    },
    "networks": [{
      "loadBalancer": {
        "name": "gateway",
        "domain": "app.example.com",
        "enableHttps": true,
        "dns": {
          "provider": "cloudflare",
          "proxied": true
        },
        "routes": [{ "path": "/*", "backend": "api" }]
      }
    }]
  }
}
```

When `dns.provider: cloudflare` is set, the deployment automatically creates a DNS A record pointing your domain to the load balancer IP.

:::note[IAP Requires HTTPS]
If you're using Zero Trust IAP (`zeroTrust.iapWebBackends`), you **must** configure `domain` and `enableHttps: true`. The deployment will fail with an error otherwise.
:::

---

## Web Admin

Optional web-based admin panel.

### webAdmin.enabled
**Type:** `boolean` (default: `false`)

Enable the web admin UI during `stacksolo dev`.

### webAdmin.port
**Type:** `number` (default: `3000`)

Port for the admin UI.

```json
{
  "project": {
    "webAdmin": {
      "enabled": true,
      "port": 3001
    }
  }
}
```

---

## Zero Trust (IAP)

Protect backend services with Identity-Aware Proxy. Requires `@stacksolo/plugin-zero-trust`.

### zeroTrust.iapWebBackends

Protect web backends with Google login.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Configuration name |
| `backend` | `string` | Yes | Backend name to protect (must match a function, container, or ui) |
| `allowedMembers` | `string[]` | Yes | Who can access (see formats below) |
| `supportEmail` | `string` | Yes | Email for OAuth consent screen |
| `applicationTitle` | `string` | No | Title shown on login screen |

#### allowedMembers formats

```
user:alice@example.com     # Individual user
group:team@example.com     # Google Group
domain:example.com         # Entire domain
```

### zeroTrust.iapTunnels

SSH/TCP access to VMs without public IPs.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Configuration name |
| `targetInstance` | `string` | Yes | VM instance name |
| `targetZone` | `string` | Yes | Zone (e.g., `us-central1-a`) |
| `allowedMembers` | `string[]` | Yes | Who can access |
| `allowedPorts` | `number[]` | No | Ports to allow (default: `[22]`) |
| `network` | `string` | No | VPC network name (default: `default`) |

```json
{
  "zeroTrust": {
    "iapWebBackends": [{
      "name": "admin-protection",
      "backend": "admin",
      "allowedMembers": ["domain:mycompany.com"],
      "supportEmail": "admin@mycompany.com"
    }],
    "iapTunnels": [{
      "name": "dev-ssh",
      "targetInstance": "dev-vm",
      "targetZone": "us-central1-a",
      "allowedMembers": ["group:developers@mycompany.com"],
      "allowedPorts": [22, 3306]
    }]
  }
}
```

---

## Example: Full Config

```json
{
  "project": {
    "name": "my-saas",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "backend": "cdktf",
    "plugins": ["@stacksolo/plugin-gcp-cdktf"],

    "kernel": {
      "name": "kernel",
      "firebaseProjectId": "my-firebase-project"
    },

    "webAdmin": {
      "enabled": true
    },

    "networks": [{
      "name": "main",
      "functions": [
        { "name": "api", "entryPoint": "api", "allowUnauthenticated": true },
        { "name": "webhook", "entryPoint": "handler", "timeout": 300 }
      ],
      "uis": [
        { "name": "web", "framework": "vue" }
      ],
      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/*", "backend": "api" },
          { "path": "/webhook/*", "backend": "webhook" },
          { "path": "/*", "backend": "web" }
        ]
      }
    }]
  }
}
```

---

## Example: Full Config with Zero Trust

Public API + protected admin panel + SSH access to dev VM.

:::caution[HTTPS Required for IAP]
IAP requires HTTPS. Notice the `domain`, `enableHttps`, and `redirectHttpToHttps` settings in the load balancer config below.
:::

```json
{
  "project": {
    "name": "my-saas",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "backend": "cdktf",
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-zero-trust"
    ],

    "networks": [{
      "name": "main",
      "functions": [
        { "name": "api", "entryPoint": "api", "allowUnauthenticated": true }
      ],
      "containers": [
        { "name": "admin", "port": 3000 }
      ],
      "uis": [
        { "name": "docs", "framework": "vue" }
      ],
      "loadBalancer": {
        "name": "gateway",
        "domain": "my-saas.example.com",
        "enableHttps": true,
        "redirectHttpToHttps": true,
        "routes": [
          { "path": "/api/*", "backend": "api" },
          { "path": "/admin/*", "backend": "admin" },
          { "path": "/*", "backend": "docs" }
        ]
      }
    }],

    "zeroTrust": {
      "iapWebBackends": [
        {
          "name": "admin-protection",
          "backend": "admin",
          "allowedMembers": [
            "domain:mycompany.com",
            "user:contractor@gmail.com"
          ],
          "supportEmail": "admin@mycompany.com",
          "applicationTitle": "Admin Dashboard"
        }
      ],
      "iapTunnels": [
        {
          "name": "dev-ssh",
          "targetInstance": "dev-vm",
          "targetZone": "us-central1-a",
          "allowedMembers": ["group:engineering@mycompany.com"],
          "allowedPorts": [22]
        },
        {
          "name": "db-access",
          "targetInstance": "prod-db",
          "targetZone": "us-central1-a",
          "allowedMembers": ["group:dba@mycompany.com"],
          "allowedPorts": [5432]
        }
      ]
    }
  }
}
```

**What this creates:**

| Resource | Access |
|----------|--------|
| `/api/*` | Public (anyone) |
| `/admin/*` | IAP protected (mycompany.com domain + contractor) |
| `/*` (docs) | Public (anyone) |
| `dev-vm` SSH | IAP tunnel (engineering group) |
| `prod-db` PostgreSQL | IAP tunnel (dba group) |

**After deployment:**

```bash
# Public API - just works
curl https://my-saas.example.com/api/health

# Admin panel - visit in browser, Google login required
open https://my-saas.example.com/admin

# SSH to dev VM
gcloud compute ssh dev-vm --zone=us-central1-a --tunnel-through-iap

# Connect to prod database
gcloud compute start-iap-tunnel prod-db 5432 \
  --zone=us-central1-a \
  --local-host-port=localhost:5432
psql -h localhost -p 5432 -U postgres
```
