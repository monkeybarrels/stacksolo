---
title: Zero Trust Auth Plugin
description: Dynamic authorization for Zero Trust using Firestore
---

The `@stacksolo/plugin-zero-trust-auth` enables dynamic authorization for Zero Trust protected resources. Grant or revoke access at runtime without redeploying infrastructure.

**Requires:** [`@stacksolo/plugin-zero-trust`](/plugins/zero-trust/) and [`@stacksolo/plugin-gcp-kernel`](/plugins/gcp-kernel/)

## Runtime Usage

**The easiest way to use access control.** Just import the runtime and use `kernel.access`:

```typescript
import { kernel } from '@stacksolo/runtime';
import '@stacksolo/plugin-zero-trust-auth/runtime';

// Check access
const { hasAccess } = await kernel.access.check('admin-dashboard', userEmail, 'read');

// Grant access
await kernel.access.grant('admin-dashboard', 'bob@example.com', ['read', 'write'], currentUser);

// Revoke access
await kernel.access.revoke('admin-dashboard', 'bob@example.com', currentUser);

// List members
const { members } = await kernel.access.list('admin-dashboard');
```

## Express Middleware

Built-in middleware for protecting routes:

```typescript
import { kernel } from '@stacksolo/runtime';
import '@stacksolo/plugin-zero-trust-auth/runtime';

// Protect routes with one line
app.get('/admin', kernel.access.requireAccess('admin-dashboard', 'read'), handler);
app.post('/admin/users', kernel.access.requireAccess('admin-dashboard', 'write'), handler);
app.delete('/admin/users/:id', kernel.access.requireAccess('admin-dashboard', 'admin'), handler);
```

The middleware:
- Gets user email from IAP header (`x-goog-authenticated-user-email`)
- Checks access via kernel
- Sets `req.user.email` and `req.userPermissions`
- Returns 401/403 if unauthorized

---

## How It Works

```
User → IAP (Google login) → Your App → kernel.access.check() → Firestore
```

- **IAP** handles authentication (who you are)
- **Firestore** stores access grants (via kernel)
- **Your app** calls `kernel.access.*` methods via the runtime

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
