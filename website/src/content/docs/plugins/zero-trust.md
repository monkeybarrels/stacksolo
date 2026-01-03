---
title: Zero Trust Plugin
description: Secure access without VPNs using Identity-Aware Proxy
---

The `@stacksolo/plugin-zero-trust` provides Zero Trust network access using Google Cloud's Identity-Aware Proxy (IAP). Secure your internal resources without VPNs - users authenticate with their Google identity.

## Quick Start

Add to your `stacksolo.config.json`:

```json
{
  "project": {
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-zero-trust"
    ],
    "networks": [{
      "name": "main",
      "containers": [{ "name": "admin", "port": 3000 }],
      "loadBalancer": {
        "name": "gateway",
        "routes": [{ "path": "/admin/*", "backend": "admin" }]
      }
    }],
    "zeroTrust": {
      "iapWebBackends": [{
        "name": "admin-protection",
        "backend": "admin",
        "allowedMembers": ["domain:yourcompany.com"],
        "supportEmail": "admin@yourcompany.com"
      }]
    }
  }
}
```

After deployment, users just visit the URL. Google login appears automatically.

## Resources

| Resource | Config Key | Purpose |
|----------|------------|---------|
| IAP Web Backend | `zeroTrust.iapWebBackends` | Protect web apps with Google login |
| IAP Tunnel | `zeroTrust.iapTunnels` | SSH/TCP access to VMs without public IPs |

## Access Control

Control who can access using `allowedMembers`:

| Format | Example | Scope |
|--------|---------|-------|
| Individual | `user:alice@example.com` | Single person |
| Group | `group:team@example.com` | Google Group members |
| Domain | `domain:example.com` | Anyone with @example.com account |

### Examples

```json
// Single person
"allowedMembers": ["user:alice@mycompany.com"]

// Team via Google Group
"allowedMembers": ["group:developers@mycompany.com"]

// Entire company
"allowedMembers": ["domain:mycompany.com"]

// Mix (internal + external contractor)
"allowedMembers": [
  "domain:mycompany.com",
  "user:contractor@gmail.com"
]
```

---

## IAP Web Backend

Protect web applications with Google login. No code changes needed.

### Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Configuration name |
| `backend` | `string` | Yes | Backend name to protect (must match a function, container, or ui) |
| `allowedMembers` | `string[]` | Yes | Who can access |
| `supportEmail` | `string` | Yes | Email for OAuth consent screen |
| `applicationTitle` | `string` | No | Title shown on login screen |

### Example

```json
{
  "zeroTrust": {
    "iapWebBackends": [{
      "name": "admin-protection",
      "backend": "admin",
      "allowedMembers": ["domain:mycompany.com"],
      "supportEmail": "admin@mycompany.com",
      "applicationTitle": "Admin Dashboard"
    }]
  }
}
```

**After deployment:** Users visit the URL → Google login prompt → access granted (if in allowedMembers).

---

## IAP Tunnel

Secure SSH/TCP access to VMs without exposing public IPs.

### Configuration

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Configuration name |
| `targetInstance` | `string` | Yes | VM instance name |
| `targetZone` | `string` | Yes | Zone (e.g., `us-central1-a`) |
| `allowedMembers` | `string[]` | Yes | Who can access |
| `allowedPorts` | `number[]` | No | Ports to allow (default: `[22]`) |
| `network` | `string` | No | VPC network name (default: `default`) |

### Example

```json
{
  "zeroTrust": {
    "iapTunnels": [{
      "name": "dev-ssh",
      "targetInstance": "my-vm",
      "targetZone": "us-central1-a",
      "allowedMembers": ["group:developers@mycompany.com"],
      "allowedPorts": [22, 3306]
    }]
  }
}
```

**After deployment, users access via:**

```bash
# SSH
gcloud compute ssh my-vm --zone=us-central1-a --tunnel-through-iap

# Database tunnel
gcloud compute start-iap-tunnel my-vm 3306 \
  --zone=us-central1-a \
  --local-host-port=localhost:3306
```

---

## Full Example

Public API + protected admin panel + SSH access to dev VM.

```json
{
  "project": {
    "name": "my-saas",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-zero-trust"
    ],
    "networks": [{
      "name": "main",
      "functions": [
        { "name": "api", "allowUnauthenticated": true }
      ],
      "containers": [
        { "name": "admin", "port": 3000 }
      ],
      "uis": [
        { "name": "docs", "framework": "vue" }
      ],
      "loadBalancer": {
        "name": "gateway",
        "routes": [
          { "path": "/api/*", "backend": "api" },
          { "path": "/admin/*", "backend": "admin" },
          { "path": "/*", "backend": "docs" }
        ]
      }
    }],
    "zeroTrust": {
      "iapWebBackends": [{
        "name": "admin-protection",
        "backend": "admin",
        "allowedMembers": [
          "domain:mycompany.com",
          "user:contractor@gmail.com"
        ],
        "supportEmail": "admin@mycompany.com",
        "applicationTitle": "Admin Dashboard"
      }],
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

### What This Creates

| Resource | Access |
|----------|--------|
| `/api/*` | Public (anyone) |
| `/admin/*` | IAP protected (mycompany.com + contractor) |
| `/*` (docs) | Public (anyone) |
| `dev-vm` SSH | IAP tunnel (engineering group) |
| `prod-db` PostgreSQL | IAP tunnel (dba group) |

### After Deployment

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

---

## User Access

**No StackSolo CLI needed.** After you deploy, users access with:

| Resource | How Users Access |
|----------|------------------|
| Web apps | Visit URL in browser (Google login prompt) |
| SSH | `gcloud compute ssh INSTANCE --tunnel-through-iap` |
| TCP tunnel | `gcloud compute start-iap-tunnel INSTANCE PORT` |

## Cost

| Resource | Monthly Cost |
|----------|-------------|
| IAP Tunnel | Free |
| IAP Web Backend | Free |

Standard charges apply for underlying resources (VMs, Load Balancers).

## Prerequisites

1. Google Cloud CLI installed and authenticated
2. Terraform installed
3. OAuth consent screen configured in GCP project (for web backends)

## Learn More

- [Config Schema Reference](/reference/config-schema/) - Full configuration options
- [Source code](https://github.com/monkeybarrels/stacksolo/tree/main/plugins/zero-trust)
