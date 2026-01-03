# @stacksolo/plugin-zero-trust-auth

Dynamic authorization for Zero Trust using Firestore. Grant or revoke access at runtime without redeploying infrastructure.

## What This Plugin Does

This plugin enables dynamic access control on top of IAP-protected resources. While the `@stacksolo/plugin-zero-trust` handles **authentication** (who you are), this plugin handles **authorization** (what you can do).

| Component | Responsibility | Storage |
|-----------|---------------|---------|
| IAP | Authentication | Google Identity |
| Kernel + Firestore | Authorization | Firestore |

## Requirements

- `@stacksolo/plugin-zero-trust` - For IAP protection
- `@stacksolo/plugin-gcp-kernel` - For Firestore access API
- `@stacksolo/runtime` - For the kernel client

## Runtime Usage

**This is the main way to use access control.** Just import the runtime and use `kernel.access`:

```typescript
import { kernel } from '@stacksolo/runtime';
import '@stacksolo/plugin-zero-trust-auth/runtime';

// Check if user has access
const { hasAccess, permissions } = await kernel.access.check(
  'admin-dashboard',
  'bob@example.com',
  'read'
);

// Grant access
await kernel.access.grant(
  'admin-dashboard',
  'bob@example.com',
  ['read', 'write'],
  'alice@example.com'  // who granted it
);

// Revoke access
await kernel.access.revoke(
  'admin-dashboard',
  'bob@example.com',
  'alice@example.com'  // who revoked it
);

// List members with access
const { members } = await kernel.access.list('admin-dashboard');

// List all protected resources
const { resources } = await kernel.access.resources();
```

## Express Middleware

Use the built-in middleware to protect routes:

```typescript
import express from 'express';
import { kernel } from '@stacksolo/runtime';
import '@stacksolo/plugin-zero-trust-auth/runtime';

const app = express();

// Protect a route - requires 'read' permission
app.get('/admin', kernel.access.requireAccess('admin-dashboard', 'read'), (req, res) => {
  // req.user.email is set by the middleware
  // req.userPermissions contains the user's permissions
  res.json({ user: req.user, permissions: req.userPermissions });
});

// Different permissions for different routes
app.get('/admin/users', kernel.access.requireAccess('admin-dashboard', 'read'), handler);
app.post('/admin/users', kernel.access.requireAccess('admin-dashboard', 'write'), handler);
app.delete('/admin/users/:id', kernel.access.requireAccess('admin-dashboard', 'admin'), handler);
```

## Quick Start

```json
{
  "project": {
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-gcp-kernel",
      "@stacksolo/plugin-zero-trust",
      "@stacksolo/plugin-zero-trust-auth"
    ],
    "gcpKernel": {
      "name": "kernel",
      "firebaseProjectId": "my-project",
      "storageBucket": "my-bucket"
    },
    "zeroTrust": {
      "iapWebBackends": [{
        "name": "admin-iap",
        "backend": "admin",
        "allowedMembers": ["domain:mycompany.com"],
        "supportEmail": "admin@mycompany.com"
      }]
    },
    "zeroTrustAuth": {
      "protectedResources": [{
        "name": "admin-dashboard",
        "backend": "admin",
        "initialMembers": [
          { "email": "alice@mycompany.com", "permissions": ["read", "write", "admin"] }
        ]
      }]
    }
  }
}
```

## How It Works

1. User visits protected URL
2. IAP prompts for Google login (authentication)
3. IAP passes user identity to your app via headers
4. Your app calls kernel to check Firestore (authorization)
5. Access granted or denied based on stored permissions

## Kernel Access API

### Grant Access
```bash
POST /access/grant
{ "resource": "admin-dashboard", "member": "bob@example.com", "permissions": ["read"], "grantedBy": "alice@example.com" }
```

### Revoke Access
```bash
POST /access/revoke
{ "resource": "admin-dashboard", "member": "bob@example.com", "revokedBy": "alice@example.com" }
```

### Check Access
```bash
POST /access/check
{ "resource": "admin-dashboard", "member": "bob@example.com", "permission": "read" }
# Returns: { "hasAccess": true, "permissions": ["read"] }
```

### List Members
```bash
GET /access/list?resource=admin-dashboard
```

### List Resources
```bash
GET /access/resources
```

## Firestore Structure

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
    timestamp: timestamp
```

## Express Middleware Example

```typescript
async function requireAccess(resource: string, permission?: string) {
  return async (req, res, next) => {
    const userEmail = req.headers['x-goog-authenticated-user-email']
      ?.toString().replace('accounts.google.com:', '');

    if (!userEmail) return res.status(401).json({ error: 'Not authenticated' });

    const result = await fetch(`${KERNEL_URL}/access/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource, member: userEmail, permission })
    }).then(r => r.json());

    if (!result.hasAccess) return res.status(403).json({ error: 'Access denied' });

    req.userPermissions = result.permissions;
    next();
  };
}

// Usage
app.get('/admin', requireAccess('admin-dashboard', 'read'), handler);
```

## Configuration Reference

### ZeroTrustAuthConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `protectedResources` | `array` | No | Resources with dynamic auth |
| `defaultPermissions` | `string[]` | No | Default permissions (default: `["read"]`) |
| `auditLogging` | `boolean` | No | Enable audit logging (default: `true`) |

### ProtectedResourceConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Resource identifier |
| `backend` | `string` | Yes | Backend name to protect |
| `initialMembers` | `array` | No | Members to grant on deploy |
| `requirePermission` | `string` | No | Required permission |

## Cost

Firestore reads/writes are minimal:
- ~$0.06 per 100K reads
- ~$0.18 per 100K writes

For most apps: < $1/month
