# IAP Tunnel

Secure SSH and TCP access to VMs without public IPs.

## Basic Usage

```typescript
{
  type: 'zero-trust:iap_tunnel',
  name: 'ssh-access',
  config: {
    targetInstance: 'my-vm',
    targetZone: 'us-central1-a',
    allowedMembers: ['domain:mycompany.com']
  }
}
```

## Configuration

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | - | Configuration name |
| `targetInstance` | Yes | - | VM instance name |
| `targetZone` | Yes | - | Zone (e.g., `us-central1-a`) |
| `network` | No | `default` | VPC network for firewall rules |
| `allowedMembers` | Yes | - | Who can access |
| `allowedPorts` | No | `[22]` | Ports to allow |

## Access Patterns

### SSH Access

```bash
gcloud compute ssh my-vm --zone=us-central1-a --tunnel-through-iap
```

### Database Tunnel

```typescript
config: {
  targetInstance: 'db-server',
  targetZone: 'us-central1-a',
  allowedMembers: ['group:dba-team@company.com'],
  allowedPorts: [3306, 5432]  // MySQL and PostgreSQL
}
```

```bash
# MySQL
gcloud compute start-iap-tunnel db-server 3306 \
  --zone=us-central1-a \
  --local-host-port=localhost:3306

mysql -h localhost -P 3306 -u root -p
```

```bash
# PostgreSQL
gcloud compute start-iap-tunnel db-server 5432 \
  --zone=us-central1-a \
  --local-host-port=localhost:5432

psql -h localhost -p 5432 -U postgres
```

### Redis/Memcached

```typescript
config: {
  targetInstance: 'cache-server',
  targetZone: 'us-central1-a',
  allowedMembers: ['group:developers@company.com'],
  allowedPorts: [6379]  // Redis
}
```

```bash
gcloud compute start-iap-tunnel cache-server 6379 \
  --zone=us-central1-a \
  --local-host-port=localhost:6379

redis-cli -h localhost -p 6379
```

## What Gets Created

1. **Firewall Rule** - Allows IAP IP range (`35.235.240.0/20`) to reach your VM
2. **IAM Binding** - Grants `roles/iap.tunnelResourceAccessor` to allowed members

## Network Tags

The firewall rule uses a target tag: `iap-tunnel-{name}`

Make sure your VM has this tag, or modify to use a different targeting method.

## Cost

Free. IAP tunneling has no additional charges. You only pay for the VM itself.
