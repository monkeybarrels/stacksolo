---
title: GCP Kernel Plugin
description: Shared infrastructure using GCP-native services
---

The GCP Kernel provides shared infrastructure services (auth, files, events) using GCP-native services instead of NATS.

## Quick Start

```json
{
  "project": {
    "gcpKernel": {
      "name": "gcp-kernel",
      "firebaseProjectId": "my-firebase-project",
      "storageBucket": "my-app-files"
    }
  }
}
```

## When to Use

- Prefer GCP Kernel when you want fully managed services and Pub/Sub for events
- Prefer NATS Kernel when you need real-time messaging and request/reply patterns

## Services

| Service | Protocol | Purpose |
|---------|----------|---------|
| Auth | HTTP | Firebase token validation |
| Files | HTTP | Signed URL generation |
| Events | Pub/Sub | Event publishing |

## Ports (Local Dev)

- **HTTP**: 8080

## Learn More

- [Source code](https://github.com/monkeybarrels/stacksolo/tree/main/plugins/gcp-kernel)
- [Kernel Plugin](/plugins/kernel/) - NATS-based alternative
