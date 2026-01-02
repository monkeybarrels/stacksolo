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
│   ├── index.ts          # Plugin export (with services metadata)
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
    │   │   ├── health.ts # /health
    │   │   └── index.ts  # Express app setup
    │   ├── nats/         # NATS handlers
    │   │   ├── files.ts  # kernel.files.*
    │   │   ├── events.ts # kernel.events.*
    │   │   └── index.ts  # NATS connection
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

All file operations use request/response pattern via `nc.request()`.

### kernel.files.upload-url
Generate a signed upload URL:
```typescript
const response = await nc.request('kernel.files.upload-url', sc.encode(JSON.stringify({
  path: 'users/123/doc.pdf',
  contentType: 'application/pdf'
})));
const { uploadUrl, path, expiresAt } = JSON.parse(sc.decode(response.data));
```

### kernel.files.download-url
Generate a signed download URL:
```typescript
const response = await nc.request('kernel.files.download-url', sc.encode(JSON.stringify({
  path: 'users/123/doc.pdf'
})));
const { downloadUrl, path, expiresAt } = JSON.parse(sc.decode(response.data));
```

### kernel.files.list
List files with optional prefix:
```typescript
const response = await nc.request('kernel.files.list', sc.encode(JSON.stringify({
  prefix: 'users/123/',
  maxResults: 100,
  pageToken: undefined
})));
const { files, nextPageToken } = JSON.parse(sc.decode(response.data));
// files: [{ path, size, contentType, created, updated }]
```

### kernel.files.delete
Delete a file:
```typescript
const response = await nc.request('kernel.files.delete', sc.encode(JSON.stringify({
  path: 'users/123/doc.pdf'
})));
const { deleted, path } = JSON.parse(sc.decode(response.data));
```

### kernel.files.move
Move/rename a file:
```typescript
const response = await nc.request('kernel.files.move', sc.encode(JSON.stringify({
  sourcePath: 'users/123/old.pdf',
  destinationPath: 'users/123/new.pdf'
})));
const { moved, sourcePath, destinationPath } = JSON.parse(sc.decode(response.data));
```

### kernel.files.metadata
Get file metadata:
```typescript
const response = await nc.request('kernel.files.metadata', sc.encode(JSON.stringify({
  path: 'users/123/doc.pdf'
})));
const { path, size, contentType, created, updated, metadata } = JSON.parse(sc.decode(response.data));
```

### kernel.events.*
Event streaming for pub/sub patterns (stored in JetStream for 7 days).

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
- Uses Express for HTTP
- Uses NATS.js for messaging
- Firebase Admin SDK for auth validation
- Google Cloud Storage for file operations

### Plugin Services Export
The plugin exports a `services` array for local dev integration:
```typescript
services: [{
  name: 'kernel',
  image: 'ghcr.io/monkeybarrels/stacksolo-kernel:0.1.0',
  sourcePath: './service',
  ports: { http: 8080, nats: 4222 },
  // ...
}]
```
This enables `stacksolo dev` to build and run the kernel from source in monorepo development.

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
