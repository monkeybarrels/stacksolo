# IAP Web Backend

Protect web applications with Google login. No code changes needed.

## Basic Usage

```typescript
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-protection',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:mycompany.com'],
    supportEmail: 'admin@mycompany.com'
  }
}
```

## Configuration

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | - | Configuration name |
| `backendService` | Yes | - | Backend service name from Load Balancer |
| `allowedMembers` | Yes | - | Who can access |
| `supportEmail` | Yes | - | Email shown on OAuth consent screen |
| `applicationTitle` | No | `name` | Title shown on OAuth consent screen |

## How Users Access

1. User visits the URL
2. Google login prompt appears
3. If user is in `allowedMembers`, access granted
4. If not, access denied

No VPN. No special client. Just a browser.

## Access Patterns

### Company-Wide Access

```typescript
allowedMembers: ['domain:mycompany.com']
```

Anyone with an `@mycompany.com` Google Workspace account can access.

### Team Access

```typescript
allowedMembers: ['group:admin-team@mycompany.com']
```

Only members of the Google Group can access.

### External Contractors

```typescript
allowedMembers: [
  'domain:mycompany.com',
  'user:contractor@gmail.com',
  'user:freelancer@outlook.com'
]
```

Mix internal domain with specific external users.

### Multi-Tenant SaaS

Each customer gets their own IAP config:

```typescript
// Customer A
{
  type: 'zero-trust:iap_web_backend',
  name: 'customer-a-admin',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:customer-a.com'],
    supportEmail: 'support@yoursaas.com'
  }
}

// Customer B
{
  type: 'zero-trust:iap_web_backend',
  name: 'customer-b-admin',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:customer-b.com'],
    supportEmail: 'support@yoursaas.com'
  }
}
```

## Prerequisites

### Automatic OAuth Setup

StackSolo automatically creates the OAuth consent screen (brand) and OAuth client during deployment. No manual GCP Console configuration needed.

The `supportEmail` field in your config is used for the OAuth consent screen.

### Load Balancer

IAP protects backend services behind a Load Balancer. Your setup should look like:

```
Internet → Load Balancer → Backend Service → Cloud Run/GCE/etc.
                               ↑
                          IAP protects here
```

## What Gets Created

1. **IAP Brand** - OAuth consent screen configuration
2. **IAP Client** - OAuth client for authentication
3. **IAM Binding** - Grants `roles/iap.httpsResourceAccessor` to allowed members
4. **IAM Policy** - Applies the binding to the backend service

## Important Notes

### One Brand Per Project

Only one IAP Brand (OAuth consent screen) can exist per GCP project. If you already have one configured manually in GCP Console, the deployment may fail. In that case, you can import the existing brand into Terraform state or remove the manual configuration.

### Headers Available to Your App

IAP adds headers your app can use:

```
X-Goog-Authenticated-User-Email: accounts.google.com:user@example.com
X-Goog-Authenticated-User-Id: 123456789
```

Use these for audit logging or user identification.

## Cost

Free. IAP itself has no charges. You pay for the Load Balancer and backend services.
