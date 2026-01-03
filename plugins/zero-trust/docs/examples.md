# Examples

Real-world patterns for using Zero Trust.

## Internal Admin Panel

Protect an admin dashboard that only your team can access.

```typescript
// The admin app (Cloud Run)
{
  type: 'gcp-cdktf:cloud_run',
  name: 'admin',
  config: {
    location: 'us-central1',
    image: 'gcr.io/my-project/admin:latest',
    allowUnauthenticated: false  // Important: disable public access
  }
}

// Load balancer with path routing
{
  type: 'gcp-cdktf:load_balancer',
  name: 'main-lb',
  config: {
    routes: [
      { path: '/admin/*', containerName: 'admin' },
      { path: '/*', containerName: 'public-api' }
    ]
  }
}

// IAP protection for admin
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-iap',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:mycompany.com'],
    supportEmail: 'admin@mycompany.com',
    applicationTitle: 'Admin Dashboard'
  }
}
```

## Dev Environment SSH Access

Give developers SSH access to a dev VM without a VPN.

```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'dev-ssh',
  config: {
    targetInstance: 'dev-server',
    targetZone: 'us-central1-a',
    allowedMembers: ['group:engineering@mycompany.com'],
    allowedPorts: [22]
  }
}
```

Developers connect with:
```bash
gcloud compute ssh dev-server --zone=us-central1-a --tunnel-through-iap
```

## Database Access for DBAs

Secure database access without exposing ports publicly.

```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'prod-db-access',
  config: {
    targetInstance: 'prod-db',
    targetZone: 'us-central1-a',
    allowedMembers: [
      'group:dba-team@mycompany.com',
      'user:oncall@mycompany.com'
    ],
    allowedPorts: [5432]  // PostgreSQL
  }
}
```

DBAs connect with:
```bash
# Start tunnel
gcloud compute start-iap-tunnel prod-db 5432 \
  --zone=us-central1-a \
  --local-host-port=localhost:5432

# Connect with any PostgreSQL client
psql -h localhost -p 5432 -U admin -d production
```

## Multi-Tenant SaaS Admin

Give each customer access to their own admin panel.

```typescript
// Shared admin service
{
  type: 'gcp-cdktf:cloud_run',
  name: 'tenant-admin',
  config: {
    location: 'us-central1',
    image: 'gcr.io/my-project/tenant-admin:latest'
  }
}

// Customer A access
{
  type: 'zero-trust:iap_web_backend',
  name: 'acme-corp-admin',
  config: {
    backendService: 'tenant-admin-backend',
    allowedMembers: ['domain:acmecorp.com'],
    supportEmail: 'support@mysaas.com',
    applicationTitle: 'Acme Corp Admin'
  }
}

// Customer B access
{
  type: 'zero-trust:iap_web_backend',
  name: 'bigco-admin',
  config: {
    backendService: 'tenant-admin-backend',
    allowedMembers: ['domain:bigco.io'],
    supportEmail: 'support@mysaas.com',
    applicationTitle: 'BigCo Admin'
  }
}
```

Your app checks the `X-Goog-Authenticated-User-Email` header to determine which tenant is accessing.

## Staging Environment

Protect staging from public access while allowing QA team.

```typescript
// Staging app
{
  type: 'gcp-cdktf:cloud_run',
  name: 'staging-app',
  config: {
    location: 'us-central1',
    image: 'gcr.io/my-project/app:staging'
  }
}

// IAP for staging
{
  type: 'zero-trust:iap_web_backend',
  name: 'staging-protection',
  config: {
    backendService: 'staging-app-backend',
    allowedMembers: [
      'group:engineering@mycompany.com',
      'group:qa@mycompany.com',
      'user:product-manager@mycompany.com'
    ],
    supportEmail: 'dev@mycompany.com',
    applicationTitle: 'Staging Environment'
  }
}
```

## Internal API Gateway

Protect internal APIs from external access.

```typescript
// Internal API
{
  type: 'gcp-cdktf:cloud_run',
  name: 'internal-api',
  config: {
    location: 'us-central1',
    image: 'gcr.io/my-project/internal-api:latest',
    allowUnauthenticated: false
  }
}

// IAP protection
{
  type: 'zero-trust:iap_web_backend',
  name: 'internal-api-iap',
  config: {
    backendService: 'internal-api-backend',
    allowedMembers: ['domain:mycompany.com'],
    supportEmail: 'api@mycompany.com',
    applicationTitle: 'Internal API'
  }
}
```

Internal tools and services authenticate via Google identity to call the API.

## Mixed Public/Private Architecture

Common pattern: public API, protected admin, public docs.

```typescript
// Public API (no IAP)
{ type: 'gcp-cdktf:cloud_run', name: 'api', config: { ... } }

// Protected admin
{ type: 'gcp-cdktf:cloud_run', name: 'admin', config: { ... } }
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-iap',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['group:admins@mycompany.com'],
    supportEmail: 'admin@mycompany.com'
  }
}

// Public docs (no IAP)
{ type: 'gcp-cdktf:storage_website', name: 'docs', config: { ... } }

// Load balancer routes everything
{
  type: 'gcp-cdktf:load_balancer',
  name: 'main',
  config: {
    routes: [
      { path: '/api/*', containerName: 'api' },
      { path: '/admin/*', containerName: 'admin' },
      { path: '/*', uiName: 'docs' }
    ]
  }
}
```
