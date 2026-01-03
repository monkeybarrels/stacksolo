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
        "framework": "vue",
        "sourceDir": "string"
      }],
      "containers": [{
        "name": "string",
        "sourceDir": "string",
        "port": 8080
      }],
      "loadBalancer": {
        "name": "string",
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

UI name. Source code expected in `ui/<name>/`.

### ui.framework
**Type:** `string` (default: `"vue"`)

Framework: `vue`, `nuxt`, `react`, `next`, `svelte`, `sveltekit`.

### ui.sourceDir
**Type:** `string` (optional)

Custom source directory. Defaults to `ui/<name>`.

```json
{
  "uis": [{
    "name": "web",
    "framework": "vue",
    "sourceDir": "./apps/web"
  }]
}
```

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

HTTP(S) load balancer with path-based routing.

### loadBalancer.name
**Type:** `string` (required)

Load balancer name.

### loadBalancer.routes
**Type:** `Route[]` (required)

Path-based routing rules.

#### route.path
**Type:** `string` (required)

URL path pattern. Supports `/*` for prefix matching.

#### route.backend
**Type:** `string` (required)

Backend service name (must match a function, ui, or container name).

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
