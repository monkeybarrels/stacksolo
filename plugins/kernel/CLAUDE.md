# @stacksolo/plugin-kernel

Kernel plugin for shared infrastructure services: authentication, file storage, and event streaming.

## Purpose

The kernel provides hybrid HTTP + NATS infrastructure:
- **HTTP endpoints**: Auth validation, health checks
- **NATS subjects**: File operations, event streaming

This is a shared service that other functions/containers connect to for common operations.

## Architecture

```
plugins/kernel/
├── src/
│   ├── index.ts          # Plugin export
│   ├── types.ts          # KernelConfig, KernelOutputs
│   └── resources/
│       ├── index.ts
│       └── kernel.ts     # Resource definition
└── service/              # The actual kernel service code
    ├── src/
    │   ├── index.ts      # Entry point
    │   ├── config.ts     # Configuration
    │   ├── http/         # HTTP handlers
    │   │   ├── auth.ts   # /auth/validate
    │   │   └── health.ts # /health
    │   ├── nats/         # NATS handlers
    │   │   └── files.ts  # kernel.files.*
    │   └── setup/
    │       └── streams.ts # JetStream setup
    ├── Dockerfile
    └── package.json
```

## Configuration

```json
{
  "networks": {
    "main": {
      "kernel": {
        "name": "kernel",
        "firebaseProjectId": "my-firebase-project",
        "storageBucket": "my-bucket",
        "memory": "512Mi",
        "cpu": 1
      }
    }
  }
}
```

## Outputs

| Output | Description |
|--------|-------------|
| `url` | Base Cloud Run URL |
| `authUrl` | Auth validation endpoint (`${url}/auth`) |
| `natsUrl` | NATS connection string |

## HTTP Endpoints

### POST /auth/validate
Validates Firebase ID tokens:
```typescript
const response = await fetch(`${kernelUrl}/auth/validate`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${idToken}` },
});
const { valid, uid, email } = await response.json();
```

### GET /health
Health check endpoint for load balancers.

## NATS Subjects

### kernel.files.upload
Request file upload URL:
```typescript
nc.request('kernel.files.upload', { filename: 'doc.pdf', contentType: 'application/pdf' });
// Returns: { uploadUrl, publicUrl }
```

### kernel.files.delete
Delete a file:
```typescript
nc.publish('kernel.files.delete', { path: 'uploads/doc.pdf' });
```

### kernel.events.*
Event streaming for pub/sub patterns.

## Development

### Building the Plugin
```bash
pnpm --filter kernel build
```

### Building the Service
```bash
cd plugins/kernel/service
pnpm install
pnpm build
docker build -t kernel-service .
```

## Coding Practices

### Plugin Structure
The plugin follows the same pattern as `gcp-cdktf`:
```typescript
export const kernelResource = defineResource({
  id: 'kernel:service',
  provider: 'kernel',
  // ...
});
```

### Service Code
The `service/` directory contains the actual running code:
- Uses Fastify for HTTP
- Uses NATS.js for messaging
- Firebase Admin SDK for auth validation
- GCS for file storage

### Adding HTTP Endpoints
1. Create handler in `service/src/http/`
2. Register route in `service/src/index.ts`
3. Update CLAUDE.md with endpoint docs

### Adding NATS Handlers
1. Create handler in `service/src/nats/`
2. Subscribe in `service/src/index.ts`
3. Update CLAUDE.md with subject docs

### Environment Variables
The kernel service reads:
- `FIREBASE_PROJECT_ID` - For auth token validation
- `GCS_BUCKET` - For file storage
- `NATS_URL` - NATS server connection
- `PORT` - HTTP port (default: 8080)
