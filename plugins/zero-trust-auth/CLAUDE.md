# Zero Trust Auth Plugin - AI Assistant Guide

This document helps AI assistants understand and work with the Zero Trust Auth plugin.

## What This Plugin Does

Provides dynamic authorization for IAP-protected resources using Firestore. While `@stacksolo/plugin-zero-trust` handles authentication (Google login), this plugin handles authorization (permission checking) at runtime.

## Quick Reference

### Resources

| Resource | ID | Purpose |
|----------|-----|---------|
| Access Control | `zero-trust-auth:access_control` | Configure protected resources with Firestore-based access |

### Required Dependencies

- `@stacksolo/plugin-zero-trust` - For IAP infrastructure
- `@stacksolo/plugin-gcp-kernel` - For Firestore access API (kernel must include access routes)

## Architecture

### Request Flow
```
User → IAP (Google login) → App → Kernel /access/check → Firestore
                                         ↓
                              Access granted or denied
```

### Separation of Concerns
- **IAP**: Authentication (who you are)
- **Kernel + Firestore**: Authorization (what you can do)

## Code Generation

### Access Control generates:
- Firestore security rules for the `kernel_access` collection
- Initial member grants via Firestore seeding
- IAM bindings for kernel service account to read/write Firestore

## Common Patterns

### Protect an admin panel with dynamic access
```json
{
  "zeroTrust": {
    "iapWebBackends": [{
      "name": "admin-iap",
      "backend": "admin",
      "allowedMembers": ["domain:company.com"],
      "supportEmail": "admin@company.com"
    }]
  },
  "zeroTrustAuth": {
    "protectedResources": [{
      "name": "admin-dashboard",
      "backend": "admin",
      "initialMembers": [
        { "email": "alice@company.com", "permissions": ["read", "write", "admin"] }
      ]
    }]
  }
}
```

### Check access in Express
```typescript
const result = await fetch(`${KERNEL_URL}/access/check`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resource: 'admin-dashboard',
    member: userEmail,
    permission: 'write'
  })
}).then(r => r.json());

if (!result.hasAccess) {
  return res.status(403).json({ error: 'Access denied' });
}
```

### Grant access at runtime
```typescript
await fetch(`${KERNEL_URL}/access/grant`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    resource: 'admin-dashboard',
    member: 'bob@company.com',
    permissions: ['read', 'write'],
    grantedBy: currentUser.email
  })
});
```

## Important Notes

1. **Requires both zero-trust and gcp-kernel plugins** - Authentication via IAP, authorization via kernel
2. **Firestore must be enabled** - The kernel stores access grants in Firestore
3. **Audit logging is automatic** - All access changes are logged to `kernel_access_audit`
4. **Minimal cost** - Firestore reads/writes are typically < $1/month

## File Structure

```
plugins/zero-trust-auth/
├── src/
│   ├── provider.ts           # Provider definition
│   ├── resources/
│   │   ├── access-control.ts # Access control resource
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsup.config.ts
├── README.md
└── CLAUDE.md
```

## Firestore Collections

### kernel_access/{resource}/members/{email}
```json
{
  "permissions": ["read", "write"],
  "grantedAt": "2024-01-15T10:30:00Z",
  "grantedBy": "admin@company.com"
}
```

### kernel_access_audit/{auto-id}
```json
{
  "action": "grant",
  "resource": "admin-dashboard",
  "member": "bob@company.com",
  "permissions": ["read", "write"],
  "performedBy": "alice@company.com",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Kernel Access API Endpoints

These endpoints are added by the gcp-kernel plugin:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/access/grant` | POST | Grant access to a resource |
| `/access/revoke` | POST | Revoke access from a resource |
| `/access/check` | POST | Check if member has access |
| `/access/list` | GET | List members with access |
| `/access/resources` | GET | List all protected resources |

## Dependencies

- `@stacksolo/core` - Plugin interfaces
- Uses kernel access API (no direct CDKTF resources)

## Coding Practices

### Plugin Structure
```typescript
export const accessControlResource = defineResource({
  id: 'zero-trust-auth:access_control',
  provider: 'zero-trust-auth',
  // ...
});
```

### Relationship to Other Plugins

| Plugin | Relationship |
|--------|--------------|
| `zero-trust` | Provides IAP protection (authentication layer) |
| `gcp-kernel` | Provides access API endpoints (authorization layer) |
| `gcp-cdktf` | Provides Firestore resources |

### Extending Access Control

To add new permission types:
1. Update the config schema in `schema/config.json`
2. Update the kernel access service in `plugins/gcp-kernel/service/src/services/access.ts`
3. Document new permissions in README.md and CLAUDE.md
