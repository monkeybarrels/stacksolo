# @stacksolo/plugin-zero-trust

Zero Trust network access for StackSolo using Google Cloud's Identity-Aware Proxy (IAP). Secure your internal resources without VPNs - users authenticate with their Google identity.

## Features

- **No VPN required** - Access based on identity, not network location
- **No public IPs needed** - Keep internal resources truly internal
- **Google identity integration** - Use existing Google Workspace accounts
- **Fine-grained access control** - By user, group, or entire domain
- **Free tier** - IAP itself has no additional cost on GCP

## Installation

```bash
pnpm add @stacksolo/plugin-zero-trust
```

## Resources

### IAP Tunnel (`zero-trust:iap_tunnel`)

Secure SSH/TCP tunneling to VMs and internal services without exposing public IPs.

```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'dev-ssh-access',
  config: {
    targetInstance: 'my-vm',
    targetZone: 'us-central1-a',
    network: 'default',
    allowedMembers: [
      'user:alice@example.com',
      'group:developers@example.com'
    ],
    allowedPorts: [22, 3306]  // SSH and MySQL
  }
}
```

**After deployment, users access via:**

```bash
# SSH access
gcloud compute ssh my-vm --zone=us-central1-a --tunnel-through-iap

# Database tunnel (MySQL on port 3306)
gcloud compute start-iap-tunnel my-vm 3306 --zone=us-central1-a --local-host-port=localhost:3306

# Then connect locally
mysql -h localhost -P 3306 -u root -p
```

### IAP Web Backend (`zero-trust:iap_web_backend`)

Protect web applications with Google login. Users visiting the URL are prompted to authenticate.

```typescript
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-panel-protection',
  config: {
    backendService: 'admin-backend',
    allowedMembers: [
      'domain:mycompany.com',
      'user:contractor@gmail.com'
    ],
    supportEmail: 'support@mycompany.com',
    applicationTitle: 'Admin Panel'
  }
}
```

**After deployment, users access via:**

Just visit the URL in a browser. Google login appears automatically. Only allowed members can access.

## Access Control

The `allowedMembers` field supports three formats:

| Type | Format | Example | Scope |
|------|--------|---------|-------|
| Individual | `user:email` | `user:alice@example.com` | Single person |
| Group | `group:email` | `group:devs@example.com` | Everyone in the Google Group |
| Domain | `domain:name` | `domain:example.com` | Anyone with @example.com Google account |

### Examples

```typescript
// Single developer
allowedMembers: ['user:alice@mycompany.com']

// Team via Google Group
allowedMembers: ['group:backend-team@mycompany.com']

// Entire company
allowedMembers: ['domain:mycompany.com']

// Mixed access (internal team + external contractor)
allowedMembers: [
  'group:devops@mycompany.com',
  'user:contractor@gmail.com'
]
```

## Architecture: Mixing Public and Protected Resources

You can have both public and IAP-protected services behind the same load balancer:

```
                    Internet
                        │
                        ▼
              ┌─────────────────┐
              │  Load Balancer  │
              │  (path routing) │
              └────────┬────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   /api/*         /admin/*       /docs/*
   (public)      (IAP protected)  (public)
```

```typescript
// Public API - no IAP protection
{ type: 'gcp-cdktf:cloud_run', name: 'api', config: { ... } }

// Protected admin panel
{ type: 'gcp-cdktf:cloud_run', name: 'admin', config: { ... } }
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-protection',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:mycompany.com'],
    supportEmail: 'admin@mycompany.com'
  }
}

// Public docs - no IAP protection
{ type: 'gcp-cdktf:storage_website', name: 'docs', config: { ... } }
```

## Multi-Tenant Applications

For SaaS applications where each customer needs isolated access to their admin panel:

```typescript
// Customer A's admin access
{
  type: 'zero-trust:iap_web_backend',
  name: 'customer-a-admin',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:customer-a.com'],
    supportEmail: 'support@yoursaas.com',
    applicationTitle: 'Customer A Admin'
  }
}

// Customer B's admin access
{
  type: 'zero-trust:iap_web_backend',
  name: 'customer-b-admin',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:customer-b.com'],
    supportEmail: 'support@yoursaas.com',
    applicationTitle: 'Customer B Admin'
  }
}
```

## Prerequisites

1. **Google Cloud CLI** installed and authenticated
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Terraform** installed

3. **OAuth consent screen** configured in your GCP project (for web backends)

## User Access (No StackSolo Required)

After you deploy with StackSolo, users access resources using standard Google Cloud tools:

| Resource | Access Method |
|----------|---------------|
| SSH to VM | `gcloud compute ssh INSTANCE --tunnel-through-iap` |
| TCP tunnel | `gcloud compute start-iap-tunnel INSTANCE PORT` |
| Web app | Visit URL in browser (Google login prompt) |

Users only need:
- A Google account (in the allowed members list)
- `gcloud` CLI (for SSH/TCP tunnels only)

## Cost

| Resource | Monthly Cost |
|----------|-------------|
| IAP Tunnel | Free |
| IAP Web Backend | Free |

Note: Standard charges apply for underlying resources (VMs, Load Balancers, etc.)

## License

MIT