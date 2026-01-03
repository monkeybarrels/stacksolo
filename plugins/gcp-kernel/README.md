# @stacksolo/plugin-gcp-kernel

A GCP-native kernel plugin for StackSolo that provides authentication, file storage, and event publishing using fully serverless GCP services.

## What is the GCP Kernel?

The GCP kernel is a shared infrastructure service that handles common operations for your apps. Unlike the regular kernel (which uses NATS), the GCP kernel uses native GCP services:

| Feature | GCP Kernel | Regular Kernel |
|---------|-----------|----------------|
| **Transport** | HTTP | HTTP + NATS |
| **Events** | Cloud Pub/Sub | NATS JetStream |
| **Deployment** | Cloud Run | Cloud Run + NATS |
| **Scaling** | Auto-scales to 0 | Needs min 1 instance |
| **Cost** | Pay-per-use | ~$44/mo always-on |

**The GCP kernel provides:**

1. **Auth** - Validates Firebase tokens (so you know who's logged in)
2. **Files** - Generates secure upload/download URLs for Google Cloud Storage
3. **Events** - Publishes events to Cloud Pub/Sub

---

## Quick Start

### Step 1: Add GCP kernel to your config

In your `stacksolo.config.json`:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",
    "plugins": [
      "@stacksolo/plugin-gcp-cdktf",
      "@stacksolo/plugin-gcp-kernel"
    ],

    "buckets": [
      { "name": "uploads" }
    ],

    "gcpKernel": {
      "name": "kernel",
      "firebaseProjectId": "my-gcp-project",
      "storageBucket": "uploads"
    },

    "networks": [{
      "name": "default",
      "containers": [{
        "name": "api",
        "env": {
          "KERNEL_URL": "@gcp-kernel/kernel.url",
          "KERNEL_TYPE": "gcp"
        }
      }]
    }]
  }
}
```

### Step 2: Deploy

```bash
stacksolo deploy
```

### Step 3: Use in your code

```typescript
// Validate a user's token
const response = await fetch(`${process.env.KERNEL_URL}/auth/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: userFirebaseToken }),
});

const { valid, uid, email } = await response.json();

if (valid) {
  console.log(`User ${uid} is logged in!`);
}
```

---

## Configuration Reference

Add this to your `stacksolo.config.json` under `project`:

```json
{
  "gcpKernel": {
    "name": "kernel",
    "firebaseProjectId": "your-firebase-project-id",
    "storageBucket": "your-gcs-bucket-name"
  }
}
```

### Required Fields

| Field | What it does | Example |
|-------|--------------|---------|
| `firebaseProjectId` | The Firebase project used for user authentication | `"my-app-prod"` |
| `storageBucket` | The GCS bucket for file uploads/downloads | `"my-app-uploads"` |

### Optional Fields

| Field | Default | What it does |
|-------|---------|--------------|
| `name` | `"gcp-kernel"` | Name used in references like `@gcp-kernel/kernel` |
| `minInstances` | `0` | Minimum instances (0 = scale to zero) |
| `memory` | `"512Mi"` | Memory for the service |

---

## How to Reference the GCP Kernel

In your container or function config, use these references:

| Reference | What you get | Example value |
|-----------|--------------|---------------|
| `@gcp-kernel/kernel.url` | Base URL of the kernel | `https://kernel-abc123.run.app` |

**Example:**

```json
{
  "containers": [{
    "name": "api",
    "env": {
      "KERNEL_URL": "@gcp-kernel/kernel.url",
      "KERNEL_TYPE": "gcp"
    }
  }]
}
```

---

## Using the Auth Service

The auth service validates Firebase ID tokens via HTTP.

### Code Example: Express Middleware

```typescript
// middleware/auth.ts

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const response = await fetch(`${process.env.KERNEL_URL}/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (!data.valid) {
      return res.status(401).json({ error: data.error });
    }

    req.user = {
      uid: data.uid,
      email: data.email,
    };

    next();
  } catch (error) {
    console.error('Auth validation failed:', error);
    return res.status(500).json({ error: 'Auth service unavailable' });
  }
}
```

### Auth API Reference

**Endpoint:** `POST /auth/validate`

**Request:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6..."
}
```

**Success Response (200):**
```json
{
  "valid": true,
  "uid": "abc123",
  "email": "user@example.com",
  "claims": { ... }
}
```

**Error Response (401):**
```json
{
  "valid": false,
  "error": "Token has expired",
  "code": "TOKEN_EXPIRED"
}
```

---

## Using the Files Service

The files service provides HTTP endpoints for file operations.

### Code Example: File Upload

**Backend:**

```typescript
app.post('/api/files/upload-url', requireAuth, async (req, res) => {
  const { filename, contentType } = req.body;
  const path = `users/${req.user.uid}/uploads/${Date.now()}-${filename}`;

  const response = await fetch(`${process.env.KERNEL_URL}/files/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, contentType }),
  });

  const result = await response.json();
  res.json(result);
});
```

**Frontend:**

```typescript
async function uploadFile(file: File, firebaseToken: string) {
  // Get signed upload URL
  const urlResponse = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
    }),
  });

  const { uploadUrl, path } = await urlResponse.json();

  // Upload directly to GCS
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  return path;
}
```

### Files API Reference (HTTP)

**POST /files/upload-url**

Request:
```json
{
  "path": "users/123/uploads/photo.jpg",
  "contentType": "image/jpeg"
}
```

Response:
```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "path": "users/123/uploads/photo.jpg",
  "expiresAt": "2024-01-01T12:00:00.000Z"
}
```

**POST /files/download-url**

Request:
```json
{
  "path": "users/123/uploads/photo.jpg"
}
```

Response:
```json
{
  "downloadUrl": "https://storage.googleapis.com/...",
  "path": "users/123/uploads/photo.jpg",
  "expiresAt": "2024-01-01T12:00:00.000Z"
}
```

**POST /files/list**

Request:
```json
{
  "prefix": "users/123/",
  "maxResults": 100
}
```

Response:
```json
{
  "files": [
    {
      "path": "users/123/photo.jpg",
      "size": 12345,
      "contentType": "image/jpeg",
      "created": "2024-01-01T10:00:00.000Z",
      "updated": "2024-01-01T10:00:00.000Z"
    }
  ],
  "nextPageToken": null
}
```

**POST /files/delete**

Request:
```json
{
  "path": "users/123/uploads/photo.jpg"
}
```

**POST /files/move**

Request:
```json
{
  "sourcePath": "users/123/old-photo.jpg",
  "destinationPath": "users/123/new-photo.jpg"
}
```

**POST /files/metadata**

Request:
```json
{
  "path": "users/123/uploads/photo.jpg"
}
```

---

## Using the Events Service

The events service publishes to Cloud Pub/Sub via HTTP.

### Code Example: Publishing Events

```typescript
async function publishEvent(type: string, data: any) {
  await fetch(`${process.env.KERNEL_URL}/events/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      data,
      metadata: {
        source: 'api-service',
        timestamp: new Date().toISOString(),
      },
    }),
  });
}

// Usage
await publishEvent('user.signed-up', { userId: '123', email: 'user@example.com' });
```

### Events API Reference

**POST /events/publish**

Request:
```json
{
  "type": "user.signed-up",
  "data": {
    "userId": "123",
    "email": "user@example.com"
  },
  "metadata": {
    "source": "api-service"
  }
}
```

Response:
```json
{
  "messageId": "1234567890",
  "published": true
}
```

---

## GCP Kernel vs Regular Kernel

Choose GCP Kernel when:
- You want to scale to zero
- You don't need real-time messaging
- You want lower costs for light usage
- You prefer fully managed services

Choose Regular Kernel when:
- You need real-time pub/sub (WebSocket-style)
- You have consistent traffic
- You need NATS features (request/reply, JetStream)

---

## Local Development

### Running with stacksolo dev

```bash
stacksolo dev
```

The GCP kernel will be built and run automatically if `gcpKernel` is in your config.

### Testing the endpoints

```bash
# Test health check
curl http://localhost:8080/health

# Test auth (requires Firebase token)
curl -X POST http://localhost:8080/auth/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"your-firebase-token"}'

# Test file upload URL
curl -X POST http://localhost:8080/files/upload-url \
  -H "Content-Type: application/json" \
  -d '{"path":"test.txt","contentType":"text/plain"}'
```

---

## Troubleshooting

### "Auth service unavailable"

**Problem:** Your app can't reach the kernel.

**Solution:**
1. Make sure `KERNEL_URL` is set correctly
2. Check if the kernel service is running: `curl $KERNEL_URL/health`

### "TOKEN_EXPIRED"

**Problem:** The Firebase token has expired.

**Solution:** Refresh the token in your frontend:
```typescript
const token = await firebase.auth().currentUser.getIdToken(true);
```

### File upload fails

**Common causes:**
1. **Wrong content type:** The `contentType` in your request must match the file
2. **URL expired:** Signed URLs expire after 1 hour
3. **Invalid path:** Paths can't start with `/` or contain `..`

---

## Summary

| What | How to use |
|------|------------|
| **Validate a user** | POST to `KERNEL_URL/auth/validate` |
| **Get upload URL** | POST to `KERNEL_URL/files/upload-url` |
| **Get download URL** | POST to `KERNEL_URL/files/download-url` |
| **List files** | POST to `KERNEL_URL/files/list` |
| **Delete file** | POST to `KERNEL_URL/files/delete` |
| **Move file** | POST to `KERNEL_URL/files/move` |
| **Get metadata** | POST to `KERNEL_URL/files/metadata` |
| **Publish event** | POST to `KERNEL_URL/events/publish` |
