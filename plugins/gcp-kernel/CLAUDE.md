# @stacksolo/plugin-gcp-kernel

GCP-native kernel plugin for serverless infrastructure: authentication, file storage, and event publishing using Cloud Run + Pub/Sub.

## Purpose

The GCP kernel provides fully serverless shared infrastructure:
- **HTTP endpoints**: Auth validation, health checks, file operations, event publishing
- **Cloud Pub/Sub**: Event streaming (replaces NATS)
- **Scales to zero**: Pay only when used

This is a GCP-native alternative to the regular kernel plugin (which uses NATS).

## Architecture

```
plugins/gcp-kernel/
├── src/
│   ├── index.ts          # Plugin export (with services metadata)
│   ├── types.ts          # GcpKernelConfig, GcpKernelOutputs
│   └── resources/
│       ├── index.ts
│       └── gcp-kernel.ts # CDKTF resource definition
└── service/              # The actual kernel service code
    ├── src/
    │   ├── index.ts      # Express entry point
    │   ├── routes/
    │   │   ├── auth.ts   # /auth/validate
    │   │   ├── health.ts # /health
    │   │   ├── files.ts  # /files/*
    │   │   └── events.ts # /events/publish
    │   └── services/
    │       ├── firebase.ts # Token validation
    │       ├── storage.ts  # GCS signed URLs
    │       └── pubsub.ts   # Cloud Pub/Sub
    ├── Dockerfile
    └── package.json
```

## Configuration

```json
{
  "project": {
    "gcpKernel": {
      "name": "kernel",
      "firebaseProjectId": "my-firebase-project",
      "storageBucket": "my-bucket",
      "minInstances": 0
    }
  }
}
```

## Outputs

| Output | Description |
|--------|-------------|
| `url` | Base Cloud Run URL |

## HTTP Endpoints

### POST /auth/validate
Validates Firebase ID tokens:
```typescript
const response = await fetch(`${kernelUrl}/auth/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: idToken }),
});
const { valid, uid, email } = await response.json();
```

### GET /health
Health check endpoint for load balancers.

### POST /files/upload-url
Generate a signed upload URL:
```typescript
const response = await fetch(`${kernelUrl}/files/upload-url`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: 'users/123/doc.pdf', contentType: 'application/pdf' }),
});
const { uploadUrl, path, expiresAt } = await response.json();
```

### POST /files/download-url
Generate a signed download URL.

### POST /files/list
List files with optional prefix.

### POST /files/delete
Delete a file.

### POST /files/move
Move/rename a file.

### POST /files/metadata
Get file metadata.

### POST /events/publish
Publish an event to Cloud Pub/Sub:
```typescript
await fetch(`${kernelUrl}/events/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'user.signed-up',
    data: { userId: '123' },
  }),
});
```

## Development

### Building the Plugin
```bash
pnpm --filter @stacksolo/plugin-gcp-kernel build
```

### Building the Service
```bash
cd plugins/gcp-kernel/service
npm install
npm run build
docker build -t gcp-kernel-service .
```

## Coding Practices

### Plugin Structure
The plugin follows the standard StackSolo plugin pattern:
```typescript
export const gcpKernelResource = defineResource({
  id: 'gcp-kernel:gcp_kernel',
  provider: 'gcp-kernel',
  // ...
});
```

### Service Code
The `service/` directory contains the actual running code:
- Uses Express for HTTP
- Firebase Admin SDK for auth validation
- Google Cloud Storage for file operations
- Cloud Pub/Sub for event publishing

### Plugin Services Export
The plugin exports a `services` array for local dev integration:
```typescript
services: [{
  name: 'gcp-kernel',
  image: 'ghcr.io/monkeybarrels/stacksolo-gcp-kernel:0.1.0',
  sourcePath: './service',
  ports: { http: 8080 },
  // ...
}]
```
This enables `stacksolo dev` to build and run the kernel from source.

### Key Differences from Regular Kernel

| Aspect | GCP Kernel | Regular Kernel |
|--------|-----------|----------------|
| Transport | HTTP only | HTTP + NATS |
| Events | Cloud Pub/Sub | NATS JetStream |
| File ops | HTTP endpoints | NATS request/reply |
| Min instances | 0 (scale to zero) | 1 (NATS needs uptime) |
| Config key | `gcpKernel` | `kernel` |
| Service name | `gcp-kernel` | `kernel` |

### Environment Variables
The service reads:
- `GCP_PROJECT_ID` - For Pub/Sub
- `FIREBASE_PROJECT_ID` - For auth token validation
- `GCS_BUCKET` - For file storage
- `PUBSUB_EVENTS_TOPIC` - Pub/Sub topic name
- `PORT` - HTTP port (default: 8080)

### Adding HTTP Endpoints
1. Create handler in `service/src/routes/`
2. Register route in `service/src/index.ts`
3. Update CLAUDE.md with endpoint docs

### CDKTF Resource
The CDKTF resource (`src/resources/gcp-kernel.ts`) generates:
- Service account with storage + pubsub permissions
- Cloud Run service
- Pub/Sub topic for events
- IAM bindings for invoker access
