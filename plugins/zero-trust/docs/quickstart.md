# Zero Trust Quickstart

Get secure access to your resources in 5 minutes.

## 1. Protect a Web App (Admin Panel)

Add IAP protection to any Cloud Run or App Engine service:

```typescript
{
  type: 'zero-trust:iap_web_backend',
  name: 'admin-protection',
  config: {
    backendService: 'admin-backend',
    allowedMembers: ['domain:yourcompany.com'],
    supportEmail: 'you@yourcompany.com'
  }
}
```

Deploy. Done. Anyone with a `@yourcompany.com` Google account can now access. Everyone else gets denied.

## 2. SSH to a Private VM

No public IP needed. No VPN needed.

```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'dev-access',
  config: {
    targetInstance: 'my-vm',
    targetZone: 'us-central1-a',
    allowedMembers: ['group:developers@yourcompany.com']
  }
}
```

Deploy. Then SSH:

```bash
gcloud compute ssh my-vm --zone=us-central1-a --tunnel-through-iap
```

## 3. Database Access

Tunnel to your private database:

```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'db-access',
  config: {
    targetInstance: 'db-vm',
    targetZone: 'us-central1-a',
    allowedMembers: ['user:dba@yourcompany.com'],
    allowedPorts: [5432]  // PostgreSQL
  }
}
```

Connect:

```bash
# Start tunnel in background
gcloud compute start-iap-tunnel db-vm 5432 \
  --zone=us-central1-a \
  --local-host-port=localhost:5432 &

# Connect to Postgres
psql -h localhost -p 5432 -U postgres
```

## Who Can Access?

Specify access with `allowedMembers`:

```typescript
// One person
allowedMembers: ['user:alice@gmail.com']

// A team (via Google Group)
allowedMembers: ['group:backend@yourcompany.com']

// Your whole company
allowedMembers: ['domain:yourcompany.com']

// Mix them
allowedMembers: [
  'domain:yourcompany.com',
  'user:contractor@gmail.com'
]
```

## That's It

No VPN setup. No firewall rules to manage. No IP allowlists.

Users just need a Google account and (for SSH/tunnels) the `gcloud` CLI.
