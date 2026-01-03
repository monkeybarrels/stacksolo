---
title: Kernel Plugin
description: Shared infrastructure services using NATS messaging
---

The Kernel provides shared infrastructure services (auth, files, events) for multi-application deployments using NATS.

## Quick Start

```json
{
  "project": {
    "kernel": {
      "name": "kernel",
      "firebaseProjectId": "my-firebase-project"
    }
  }
}
```

## Services

| Service | Protocol | Purpose |
|---------|----------|---------|
| Auth | HTTP | Firebase token validation |
| Files | NATS | Signed URL generation |
| Events | NATS | Event publishing |

## Ports (Local Dev)

- **HTTP**: 8090 (health, auth)
- **NATS**: 4222 (messaging)

## Usage

```typescript
import { env } from '@stacksolo/runtime';

// Auth validation
const response = await fetch(`${env.kernelUrl}/auth/validate`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Learn More

- [Source code](https://github.com/monkeybarrels/stacksolo/tree/main/plugins/kernel)
- [GCP Kernel](/plugins/gcp-kernel/) - GCP-native alternative
