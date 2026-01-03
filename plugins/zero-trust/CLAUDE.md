# Zero Trust Plugin - AI Assistant Guide

This document helps AI assistants understand and work with the Zero Trust plugin.

## What This Plugin Does

Provides Identity-Aware Proxy (IAP) resources that let users secure internal resources without VPNs. Users authenticate with Google identity instead of managing network access.

## Quick Reference

### Resources

| Resource | ID | Purpose |
|----------|-----|---------|
| IAP Tunnel | `zero-trust:iap_tunnel` | SSH/TCP access to VMs without public IPs |
| IAP Web Backend | `zero-trust:iap_web_backend` | Protect web apps with Google login |

### Access Control Formats

```
user:alice@example.com     # Individual user
group:team@example.com     # Google Group
domain:example.com         # Entire domain
```

## Code Generation

### IAP Tunnel generates:
- `ComputeFirewall` - Allows IAP IP range (35.235.240.0/20)
- `IapTunnelInstanceIamBinding` - Grants tunnel access to specified members

### IAP Web Backend generates:
- `IapBrand` - OAuth consent screen config
- `IapClient` - OAuth client for authentication
- `IapWebBackendServiceIamBinding` - Grants web access to specified members
- `IapWebBackendServiceIamPolicy` - Applies the IAM policy

## Common Patterns

### Protect an admin panel
```typescript
{ type: 'gcp-cdktf:cloud_run', name: 'admin', ... }
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-iap',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:company.com'],
    supportEmail: 'admin@company.com'
  }
}
```

### SSH access to private VM
```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'ssh-access',
  config: {
    targetInstance: 'my-vm',
    targetZone: 'us-central1-a',
    allowedMembers: ['group:devs@company.com']
  }
}
```

## Important Notes

1. **No StackSolo CLI needed for end users** - They use `gcloud` or browser
2. **IAP is free** - Only underlying resources (VMs, LB) have costs
3. **One IAP Brand per project** - If user already has one, skip brand creation
4. **Requires OAuth consent screen** - Must be configured in GCP console first

## File Structure

```
plugins/zero-trust/
├── src/
│   ├── provider.ts           # Provider definition with gcloud auth
│   ├── resources/
│   │   ├── iap-tunnel.ts     # SSH/TCP tunnel resource
│   │   ├── iap-web-backend.ts # Web app protection resource
│   │   └── index.ts
│   └── index.ts
├── package.json
├── tsup.config.ts
├── README.md
└── CLAUDE.md
```

## Dependencies

- `@stacksolo/core` - Plugin interfaces
- `@cdktf/provider-google` - GCP Terraform resources
