---
title: Zero Trust Auth Plugin
description: Dynamic authorization for Zero Trust using Firestore
---

The `@stacksolo/plugin-zero-trust-auth` enables dynamic authorization for Zero Trust protected resources. Grant or revoke access at runtime without redeploying infrastructure.

**Requires:** [`@stacksolo/plugin-zero-trust`](/plugins/zero-trust/) and [`@stacksolo/plugin-gcp-kernel`](/plugins/gcp-kernel/)

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        Request Flow                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   User → IAP (Authentication) → Your App → Kernel (Check)   │
│                                                              │
│   1. IAP verifies Google identity (who you are)             │
│   2. Your app calls kernel.access.check()                   │
│   3. Kernel checks Firestore (what you can do)              │
│   4. Access granted or denied                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

- **IAP** handles authentication (Google login)
- **Firestore** stores access grants (via kernel)
- **Your app** checks authorization at runtime

## Quick Start

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-gcp-kernel",
      "@stacksolo/plugin-zero-trust",
      "@stacksolo/plugin-zero-trust-auth"
    ],
    "gcpKernel": {
      "name": "kernel",
      "firebaseProjectId": "my-gcp-project",
      "storageBucket": "my-app-files"
    },
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
    },
    "zeroTrustAuth": {
      "protectedResources": [{
        "name": "admin-dashboard",
        "backend": "admin",
        "initialMembers": [
          { "email": "alice@yourcompany.com", "permissions": ["read", "write", "admin"] }
        ],
        "requirePermission": "read"
      }],
      "defaultPermissions": ["read"],
      "auditLogging": true
    }
  }
}
```

## Configuration

### ZeroTrustAuthConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `protectedResources` | `array` | No | Resources to protect with dynamic authorization |
| `defaultPermissions` | `string[]` | No | Default permissions when granting access (default: `["read"]`) |
| `auditLogging` | `boolean` | No | Enable audit logging (default: `true`) |

### ProtectedResourceConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Resource identifier |
| `backend` | `string` | Yes | Backend name to protect |
| `initialMembers` | `array` | No | Members to grant access on deploy |
| `requirePermission` | `string` | No | Permission required to access |

### InitialMemberConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `email` | `string` | Yes | Member email address |
| `permissions` | `string[]` | Yes | Permissions to grant |

---

## Kernel Access API

The kernel provides REST endpoints for managing access:

### Grant Access

```bash
POST /access/grant
{
  "resource": "admin-dashboard",
  "member": "bob@yourcompany.com",
  "permissions": ["read", "write"],
  "grantedBy": "alice@yourcompany.com"
}
```

### Revoke Access

```bash
POST /access/revoke
{
  "resource": "admin-dashboard",
  "member": "bob@yourcompany.com",
  "revokedBy": "alice@yourcompany.com"
}
```

### Check Access

```bash
POST /access/check
{
  "resource": "admin-dashboard",
  "member": "bob@yourcompany.com",
  "permission": "write"
}

# Response
{
  "hasAccess": true,
  "permissions": ["read", "write"]
}
```

### List Members

```bash
GET /access/list?resource=admin-dashboard

# Response
{
  "resource": "admin-dashboard",
  "members": [
    {
      "member": "alice@yourcompany.com",
      "permissions": ["read", "write", "admin"],
      "grantedAt": "2024-01-15T10:30:00Z",
      "grantedBy": "system"
    },
    {
      "member": "bob@yourcompany.com",
      "permissions": ["read", "write"],
      "grantedAt": "2024-01-16T14:20:00Z",
      "grantedBy": "alice@yourcompany.com"
    }
  ]
}
```

### List Resources

```bash
GET /access/resources

# Response
{
  "resources": ["admin-dashboard", "api/v1/users", "reports"]
}
```

---

## Using in Your App

### Check Access in Express

```typescript
import express from 'express';

const app = express();
const KERNEL_URL = process.env.KERNEL_URL || 'http://kernel:8080';

// Middleware to check access
async function requireAccess(resource: string, permission?: string) {
  return async (req, res, next) => {
    // Get user email from IAP header
    const userEmail = req.headers['x-goog-authenticated-user-email']
      ?.toString()
      .replace('accounts.google.com:', '');

    if (!userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check access via kernel
    const response = await fetch(`${KERNEL_URL}/access/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource, member: userEmail, permission })
    });

    const result = await response.json();

    if (!result.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Attach permissions to request for later use
    req.userPermissions = result.permissions;
    next();
  };
}

// Protected routes
app.get('/admin', requireAccess('admin-dashboard', 'read'), (req, res) => {
  res.json({ message: 'Welcome to admin' });
});

app.post('/admin/users', requireAccess('admin-dashboard', 'write'), (req, res) => {
  res.json({ message: 'User created' });
});

app.delete('/admin/users/:id', requireAccess('admin-dashboard', 'admin'), (req, res) => {
  res.json({ message: 'User deleted' });
});
```

### Admin Panel for Access Management

```typescript
// Grant access to a new user
app.post('/admin/access/grant', requireAccess('admin-dashboard', 'admin'), async (req, res) => {
  const { email, permissions } = req.body;
  const grantedBy = req.headers['x-goog-authenticated-user-email']
    ?.toString()
    .replace('accounts.google.com:', '');

  await fetch(`${KERNEL_URL}/access/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource: 'admin-dashboard',
      member: email,
      permissions,
      grantedBy
    })
  });

  res.json({ granted: true });
});

// Revoke access
app.post('/admin/access/revoke', requireAccess('admin-dashboard', 'admin'), async (req, res) => {
  const { email } = req.body;
  const revokedBy = req.headers['x-goog-authenticated-user-email']
    ?.toString()
    .replace('accounts.google.com:', '');

  await fetch(`${KERNEL_URL}/access/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resource: 'admin-dashboard',
      member: email,
      revokedBy
    })
  });

  res.json({ revoked: true });
});
```

---

## Firestore Data Structure

Access grants are stored in Firestore:

```
kernel_access/
  {resource}/
    members/
      {email}/
        permissions: ["read", "write"]
        grantedAt: timestamp
        grantedBy: "admin@example.com"

kernel_access_audit/
  {auto-id}/
    action: "grant" | "revoke"
    resource: "admin-dashboard"
    member: "bob@example.com"
    permissions: ["read", "write"]
    performedBy: "alice@example.com"
    timestamp: timestamp
```

---

## Security Model

This plugin implements the standard **Authentication vs Authorization** separation:

| Layer | Service | Responsibility |
|-------|---------|----------------|
| Authentication | IAP | Verify identity (Google login) |
| Authorization | Kernel + Firestore | Check permissions |

### Defense in Depth

1. **Network Level:** IAP blocks unauthenticated requests
2. **Application Level:** Your app checks permissions via kernel
3. **Audit Trail:** All access changes logged to Firestore

---

## Cost

| Resource | Monthly Cost |
|----------|-------------|
| Firestore reads | ~$0.06 per 100K reads |
| Firestore writes | ~$0.18 per 100K writes |
| Audit logging | Minimal (write-only) |

For most apps: < $1/month

---

## Prerequisites

1. IAP configured via `@stacksolo/plugin-zero-trust`
2. GCP Kernel deployed via `@stacksolo/plugin-gcp-kernel`
3. Firestore enabled in your GCP project

## Learn More

- [Zero Trust Plugin](/plugins/zero-trust/) - IAP infrastructure
- [GCP Kernel Plugin](/plugins/gcp-kernel/) - Runtime services
- [Config Schema Reference](/reference/config-schema/) - Full configuration options
