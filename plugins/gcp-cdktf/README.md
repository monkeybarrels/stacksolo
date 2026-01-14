# @stacksolo/plugin-gcp-cdktf

Google Cloud Platform infrastructure for StackSolo using CDKTF (Terraform).

## What is this plugin?

This plugin lets you deploy your apps to Google Cloud. It creates:

- **Cloud Functions** - Serverless code that runs when someone calls your API
- **Load Balancers** - Routes traffic to the right function based on URL path
- **Static Websites** - Host your React/Vue/HTML frontend
- **VPC Networks** - Private networks for your resources
- **VPC Connectors** - Let your functions talk to private resources (like databases)

---

## Quick Start

### Step 1: Set up your config

Create or edit `stacksolo.config.json`:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "backend": "cdktf",

    "networks": [{
      "name": "main",

      "functions": [{
        "name": "api",
        "runtime": "nodejs20",
        "entryPoint": "api",
        "allowUnauthenticated": true
      }],

      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/*", "functionName": "api" }
        ]
      }
    }]
  }
}
```

### Step 2: Create your function code

Create a file at `functions/api/index.ts`:

```typescript
import * as functions from '@google-cloud/functions-framework';

functions.http('api', (req, res) => {
  res.json({ message: 'Hello from Cloud Functions!' });
});
```

### Step 3: Deploy

```bash
stacksolo deploy
```

Your API is now live at the load balancer IP!

---

## Available Resources

### 1. Cloud Function

Serverless functions that run your backend code. They scale automatically and you only pay when they run.

**When to use:** APIs, webhooks, background processing

**Config:**

```json
{
  "functions": [{
    "name": "api",
    "runtime": "nodejs20",
    "entryPoint": "api",
    "memory": "256Mi",
    "timeout": 60,
    "allowUnauthenticated": true
  }]
}
```

| Field | Required | Default | What it does |
|-------|----------|---------|--------------|
| `name` | Yes | - | Name of your function |
| `runtime` | No | `nodejs20` | Language runtime (`nodejs20`, `nodejs18`, `python311`, `python310`, `go121`, `go120`) |
| `entryPoint` | No | `api` | The exported function name in your code |
| `memory` | No | `256Mi` | Memory for each instance (`128Mi`, `256Mi`, `512Mi`, `1Gi`, `2Gi`, `4Gi`) |
| `timeout` | No | `60` | Max seconds a request can run |
| `minInstances` | No | `0` | Keep instances warm (costs money but faster cold starts) |
| `maxInstances` | No | `100` | Max concurrent instances |
| `allowUnauthenticated` | No | `true` | Allow public access |
| `vpcConnector` | No | - | Name of VPC connector (for database access) |
| `env` | No | - | Environment variables |

**Example with all options:**

```json
{
  "functions": [{
    "name": "api",
    "runtime": "nodejs20",
    "entryPoint": "api",
    "memory": "512Mi",
    "timeout": 120,
    "minInstances": 1,
    "maxInstances": 10,
    "allowUnauthenticated": true,
    "vpcConnector": "main-connector",
    "env": {
      "DATABASE_URL": "@database/main.connectionString"
    }
  }]
}
```

---

### 2. Load Balancer

Routes incoming traffic to the right place based on the URL path. This is how you get one domain that serves your API and frontend.

**When to use:**
- You have multiple functions and want one URL
- You want to serve your frontend and API from the same domain
- You need a global IP address

**Basic config (one function):**

```json
{
  "loadBalancer": {
    "name": "gateway",
    "routes": [
      { "path": "/*", "functionName": "api" }
    ]
  }
}
```

**Multi-function config:**

```json
{
  "loadBalancer": {
    "name": "gateway",
    "routes": [
      { "path": "/api/*", "functionName": "api" },
      { "path": "/auth/*", "functionName": "auth" },
      { "path": "/webhooks/*", "functionName": "webhooks" }
    ]
  }
}
```

**API + Frontend config:**

```json
{
  "loadBalancer": {
    "name": "gateway",
    "routes": [
      { "path": "/api/*", "functionName": "api" },
      { "path": "/*", "uiName": "web" }
    ]
  },

  "uis": [{
    "name": "web",
    "sourceDir": "./frontend"
  }]
}
```

| Field | Required | What it does |
|-------|----------|--------------|
| `name` | Yes | Name for the load balancer |
| `routes` | Yes | List of path-to-backend mappings |
| `routes[].path` | Yes | URL path pattern (e.g., `/api/*`) |
| `routes[].functionName` | * | Function to route to |
| `routes[].uiName` | * | Static website to route to |
| `domain` | No | Custom domain for HTTPS |
| `enableHttps` | No | Enable HTTPS with managed SSL certificate |
| `dns` | No | Auto-configure DNS (requires Cloudflare plugin) |

*Either `functionName` or `uiName` is required for each route.

**With custom domain and HTTPS:**

```json
{
  "loadBalancer": {
    "name": "gateway",
    "domain": "app.example.com",
    "enableHttps": true,
    "redirectHttpToHttps": true,
    "routes": [
      { "path": "/api/*", "functionName": "api" },
      { "path": "/*", "uiName": "web" }
    ]
  }
}
```

**With automatic Cloudflare DNS:**

```json
{
  "loadBalancer": {
    "name": "gateway",
    "domain": "app.example.com",
    "enableHttps": true,
    "dns": {
      "provider": "cloudflare",
      "proxied": true
    },
    "routes": [
      { "path": "/*", "functionName": "api" }
    ]
  }
}
```

When using Cloudflare DNS, you also need to configure `cloudflare.zoneId` at the project level.

**How path matching works:**

- `/api/*` matches `/api/users`, `/api/orders/123`, etc.
- `/*` matches everything (use as fallback)
- More specific paths are matched first

---

### 3. Storage Website

Hosts your static frontend (React, Vue, plain HTML) on Cloud Storage with CDN.

**When to use:** Frontend apps, marketing sites, documentation

**Config:**

```json
{
  "uis": [{
    "name": "web",
    "sourceDir": "./frontend",
    "indexDocument": "index.html",
    "errorDocument": "index.html"
  }]
}
```

| Field | Required | Default | What it does |
|-------|----------|---------|--------------|
| `name` | Yes | - | Name for the website |
| `sourceDir` | Yes | - | Path to your frontend folder |
| `location` | No | `US` | Storage location |
| `indexDocument` | No | `index.html` | Main page |
| `errorDocument` | No | `index.html` | 404 page (use `index.html` for SPAs) |
| `enableCdn` | No | `true` | Enable Cloud CDN for faster loading |

**For single-page apps (React, Vue, etc.):**

Set `errorDocument` to `index.html` so client-side routing works:

```json
{
  "uis": [{
    "name": "web",
    "sourceDir": "./frontend",
    "errorDocument": "index.html"
  }]
}
```

---

### 4. VPC Network

A private network that isolates your resources. Required if you want functions to access databases or other private resources.

**When to use:**
- Connecting functions to Cloud SQL
- Connecting functions to Redis/Memorystore
- Any private resource access

**Config:**

```json
{
  "networks": [{
    "name": "main",
    "autoCreateSubnetworks": true
  }]
}
```

| Field | Required | Default | What it does |
|-------|----------|---------|--------------|
| `name` | Yes | - | Name for the network |
| `autoCreateSubnetworks` | No | `true` | Auto-create subnets in each region |

---

### 5. VPC Connector

Connects your Cloud Functions to a VPC network. This is how functions access databases.

**When to use:** Your function needs to connect to a database or cache

**Config:**

```json
{
  "vpcConnector": {
    "name": "main-connector",
    "network": "main",
    "region": "us-central1",
    "ipCidrRange": "10.8.0.0/28"
  }
}
```

| Field | Required | Default | What it does |
|-------|----------|---------|--------------|
| `name` | Yes | - | Name for the connector |
| `network` | Yes | - | VPC network name to connect to |
| `region` | Yes | - | GCP region |
| `ipCidrRange` | No | `10.8.0.0/28` | IP range for the connector |
| `minThroughput` | No | `200` | Min throughput in Mbps |
| `maxThroughput` | No | `300` | Max throughput in Mbps |

---

## Complete Examples

### Example 1: Simple API

Just an API, no frontend.

```json
{
  "project": {
    "name": "my-api",
    "gcpProjectId": "my-project",
    "region": "us-central1",
    "backend": "cdktf",

    "networks": [{
      "name": "main",

      "functions": [{
        "name": "api",
        "runtime": "nodejs20",
        "entryPoint": "api"
      }],

      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/*", "functionName": "api" }
        ]
      }
    }]
  }
}
```

**Result:** Your API is available at `http://<load-balancer-ip>/`

---

### Example 2: API + Frontend

An API backend with a React/Vue frontend.

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-project",
    "region": "us-central1",
    "backend": "cdktf",

    "networks": [{
      "name": "main",

      "functions": [{
        "name": "api",
        "runtime": "nodejs20",
        "entryPoint": "api"
      }],

      "uis": [{
        "name": "web",
        "sourceDir": "./frontend",
        "errorDocument": "index.html"
      }],

      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/*", "functionName": "api" },
          { "path": "/*", "uiName": "web" }
        ]
      }
    }]
  }
}
```

**Result:**
- `http://<ip>/api/*` → API function
- `http://<ip>/*` → Frontend

---

### Example 3: Multiple APIs (Microservices)

Split your backend into separate functions.

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-project",
    "region": "us-central1",
    "backend": "cdktf",

    "networks": [{
      "name": "main",

      "functions": [
        {
          "name": "api-users",
          "runtime": "nodejs20",
          "entryPoint": "api"
        },
        {
          "name": "api-orders",
          "runtime": "nodejs20",
          "entryPoint": "api"
        },
        {
          "name": "api-payments",
          "runtime": "nodejs20",
          "entryPoint": "api",
          "memory": "512Mi"
        }
      ],

      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/users/*", "functionName": "api-users" },
          { "path": "/api/orders/*", "functionName": "api-orders" },
          { "path": "/api/payments/*", "functionName": "api-payments" }
        ]
      }
    }]
  }
}
```

---

### Example 4: API with Database Access

Connect your function to a Cloud SQL database.

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-project",
    "region": "us-central1",
    "backend": "cdktf",

    "networks": [{
      "name": "main",
      "autoCreateSubnetworks": true,

      "vpcConnector": {
        "name": "db-connector",
        "network": "main",
        "region": "us-central1"
      },

      "databases": [{
        "name": "main",
        "databaseVersion": "POSTGRES_15",
        "tier": "db-f1-micro"
      }],

      "functions": [{
        "name": "api",
        "runtime": "nodejs20",
        "entryPoint": "api",
        "vpcConnector": "db-connector",
        "env": {
          "DATABASE_URL": "@database/main.connectionString"
        }
      }],

      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/*", "functionName": "api" }
        ]
      }
    }]
  }
}
```

---

## Writing Function Code

### Basic Express-style Function (Node.js)

```typescript
// functions/api/index.ts

import * as functions from '@google-cloud/functions-framework';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]);
});

app.post('/api/users', (req, res) => {
  const { name } = req.body;
  res.json({ id: 3, name });
});

// Export the Express app as a Cloud Function
functions.http('api', app);
```

### Function with Database (Node.js)

```typescript
// functions/api/index.ts

import * as functions from '@google-cloud/functions-framework';
import express from 'express';
import { Pool } from 'pg';

const app = express();
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.get('/api/users', async (req, res) => {
  const result = await pool.query('SELECT * FROM users');
  res.json(result.rows);
});

functions.http('api', app);
```

### Function with Environment Variables

Access environment variables in your code:

```typescript
const apiKey = process.env.API_KEY;
const databaseUrl = process.env.DATABASE_URL;
```

Set them in your config:

```json
{
  "functions": [{
    "name": "api",
    "env": {
      "API_KEY": "your-api-key",
      "DATABASE_URL": "@database/main.connectionString"
    }
  }]
}
```

---

## Folder Structure

When deploying, StackSolo expects this structure:

```
my-project/
├── stacksolo.config.json
├── functions/
│   ├── api/
│   │   ├── package.json
│   │   ├── index.ts
│   │   └── ... other files
│   └── webhooks/
│       ├── package.json
│       └── index.ts
└── frontend/
    ├── package.json
    ├── index.html
    └── ... your frontend code
```

Each function is in its own folder with its own `package.json`.

---

## Deployment

### Prerequisites

1. **Install Google Cloud CLI:**
   ```bash
   # macOS
   brew install google-cloud-sdk

   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Login to Google Cloud:**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

3. **Set your project:**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

4. **Install Terraform:**
   ```bash
   # macOS
   brew install terraform

   # Or download from: https://developer.hashicorp.com/terraform/downloads
   ```

### Deploy

```bash
stacksolo deploy
```

### View deployed resources

```bash
stacksolo status
```

### Destroy everything

```bash
stacksolo destroy
```

---

## Cost Estimates

| Resource | Estimated Monthly Cost |
|----------|----------------------|
| Cloud Function (256Mi) | ~$0 (free tier covers 2M invocations) |
| Cloud Function (512Mi) | ~$5 |
| Cloud Function (1Gi) | ~$10 |
| Load Balancer | ~$18 |
| Storage Website (1GB) | ~$1 |
| VPC Connector | ~$0 (pay per GB processed) |
| VPC Network | $0 |

*Costs vary based on usage. These are rough estimates.*

---

## Troubleshooting

### "Permission denied" errors

Make sure you're logged in:
```bash
gcloud auth login
gcloud auth application-default login
```

### Function not accessible

Check if `allowUnauthenticated` is set to `true`:
```json
{
  "functions": [{
    "allowUnauthenticated": true
  }]
}
```

### Function can't connect to database

1. Make sure you have a VPC connector:
   ```json
   {
     "vpcConnector": {
       "name": "db-connector",
       "network": "main",
       "region": "us-central1"
     }
   }
   ```

2. Add the connector to your function:
   ```json
   {
     "functions": [{
       "vpcConnector": "db-connector"
     }]
   }
   ```

### Load balancer shows wrong content

Check your route order. More specific paths should come first:
```json
{
  "routes": [
    { "path": "/api/*", "functionName": "api" },
    { "path": "/*", "uiName": "web" }
  ]
}
```

### Frontend routes return 404

For single-page apps, set `errorDocument` to `index.html`:
```json
{
  "uis": [{
    "errorDocument": "index.html"
  }]
}
```

---

## Reference

### Supported Runtimes

| Runtime | Language |
|---------|----------|
| `nodejs20` | Node.js 20 |
| `nodejs18` | Node.js 18 |
| `python311` | Python 3.11 |
| `python310` | Python 3.10 |
| `go121` | Go 1.21 |
| `go120` | Go 1.20 |

### Memory Options

| Option | Use case |
|--------|----------|
| `128Mi` | Very light tasks |
| `256Mi` | Default, good for most APIs |
| `512Mi` | APIs with more processing |
| `1Gi` | Heavy processing, large payloads |
| `2Gi` | Very heavy processing |
| `4Gi` | Maximum available |

### Environment Variable References

Use `@type/name.property` to reference other resources:

| Reference | What it gets |
|-----------|--------------|
| `@database/main.connectionString` | Database connection string |
| `@database/main.privateIp` | Database private IP |
| `@secret/api-key` | Secret value |
| `@bucket/uploads.name` | Bucket name |
| `@function/api.url` | Function URL |

---

## Summary

| What you want | What to use |
|---------------|-------------|
| Run backend code | Cloud Function |
| One URL for everything | Load Balancer |
| Host frontend | Storage Website |
| Connect function to database | VPC Network + VPC Connector |
| Route to different backends | Load Balancer with routes |